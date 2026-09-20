#!/usr/bin/env python3
"""Strict, dependency-free parsing for the root update agent.

The shell agent deliberately delegates JSON to Python instead of approximating
it with sed.  Output is canonical TSV containing only validated, bounded fields;
no value from GitHub is ever evaluated as shell code or used as a path.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

VERSION = re.compile(r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\Z")
COMMIT = re.compile(r"[a-f0-9]{40}\Z")
SHA256 = re.compile(r"[a-f0-9]{64}\Z")
REPOSITORY = re.compile(r"[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}\Z")
ASSET = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,199}\Z")


def die(message: str) -> "NoReturn":
    print(message, file=sys.stderr)
    raise SystemExit(1)


def load_bounded(path: str) -> object:
    source = Path(path)
    if source.is_symlink() or not source.is_file():
        die("Release metadata is missing or is a symbolic link.")
    if source.stat().st_size > 2 * 1024 * 1024:
        die("Release metadata is oversized.")
    try:
        return json.loads(source.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        die("Release metadata is not valid UTF-8 JSON.")


def require_string(value: object, pattern: re.Pattern[str], label: str) -> str:
    if not isinstance(value, str) or not pattern.fullmatch(value):
        die(f"{label} is invalid.")
    return value


def expected_asset_names(version: str, actual: set[str]) -> list[str]:
    prefix = f"lospor-hospital-{version}"
    fixed = [
        f"{prefix}-deployment.tar.gz",
        f"{prefix}-manifest.json",
        f"{prefix}-release.lock",
        f"{prefix}-release.lock.sha256",
        f"{prefix}-release.lock.sig",
        f"{prefix}-security-evidence.tar.gz",
    ]
    parts: list[str] = []
    index = 0
    while True:
        candidate = f"{prefix}-images.tar.gz.part-{index:03d}"
        if candidate not in actual:
            break
        parts.append(candidate)
        index += 1
    if not parts:
        die("Published release has no offline image parts.")
    # The Windows kit rides along on the GitHub release but is not part of the
    # release the appliance installs: it is not in the manifest, not covered by
    # the lock, and never downloaded here. It was added to the published asset
    # set without being added to this closed list, so every release carrying it
    # failed as "an unexpected file" and no appliance could be updated online at
    # all -- 1.4.0 and 1.4.1 both, for the console path as well as the browser
    # one. Tolerated when present rather than required, because releases before
    # it exist and a release without it is still a valid release.
    optional = [name for name in (
        f"{prefix}-windows-kit.zip",
        f"{prefix}-windows-kit.zip.sha256",
    ) if name in actual]
    expected = fixed + parts
    if actual != set(expected) | set(optional):
        die("Published release asset list is missing, duplicated, or contains an unexpected file.")
    return expected


def parse_release(path: str, version: str, repository: str) -> None:
    require_string(version, VERSION, "Requested release version")
    require_string(repository, REPOSITORY, "Release repository")
    value = load_bounded(path)
    if not isinstance(value, dict):
        die("Release metadata must be an object.")
    tag = f"hospital-{version}"
    if value.get("tag_name") != tag or value.get("name") != f"LOSPOR Hospital {version}":
        die("Release tag or title does not match the requested version.")
    if value.get("draft") is not False or value.get("prerelease") is not False:
        die("Draft or prerelease metadata cannot be prepared.")
    if value.get("immutable") is not True:
        die("Release is not reported immutable by GitHub.")
    release_id = value.get("id")
    if (not isinstance(release_id, int) or isinstance(release_id, bool)
            or release_id < 1 or release_id > 9_999_999_999_999_999_999):
        die("Release identity is invalid.")
    body = value.get("body")
    if not isinstance(body, str) or len(body) > 20_000:
        die("Release publication marker is missing.")
    marker = body.splitlines()[0] if body else ""
    match = re.fullmatch(
        rf"LOSPOR-HOSPITAL-PUBLICATION-V1 version={re.escape(version)} "
        r"commit=([a-f0-9]{40}) candidate=([1-9][0-9]{0,19})/([1-9][0-9]{0,9}) "
        r"lock-sha256=([a-f0-9]{64}) signature-sha256=([a-f0-9]{64})",
        marker,
    )
    if not match:
        die("Release publication marker is malformed or names different evidence.")
    commit, run_id, run_attempt, lock_sha, signature_sha = match.groups()
    if value.get("target_commitish") != commit:
        die("Release target commit does not match its publication marker.")
    assets = value.get("assets")
    if not isinstance(assets, list) or not (7 <= len(assets) <= 1000):
        die("Release asset list is invalid.")
    records: dict[str, tuple[int, int, str]] = {}
    for asset in assets:
        if not isinstance(asset, dict):
            die("Release asset record is invalid.")
        name = require_string(asset.get("name"), ASSET, "Release asset name")
        asset_id = asset.get("id")
        size = asset.get("size")
        if (not isinstance(asset_id, int) or isinstance(asset_id, bool)
                or asset_id < 1 or asset_id > 9_999_999_999_999_999_999):
            die("Release asset identity is invalid.")
        if not isinstance(size, int) or isinstance(size, bool) or size < 1 or size > 2_000_000_000:
            die("Release asset size is invalid.")
        if asset.get("state") != "uploaded":
            die("Release contains an asset that did not finish uploading.")
        digest = asset.get("digest")
        if digest is not None and (not isinstance(digest, str) or not re.fullmatch(r"sha256:[a-f0-9]{64}", digest)):
            die("Release asset digest is invalid.")
        if name in records:
            die("Release contains a duplicate asset name.")
        records[name] = (asset_id, size, digest or "-")
    order = expected_asset_names(version, set(records))
    print("\t".join(("LOSPOR-HOSPITAL-RELEASE-METADATA-V1", version, tag, commit, run_id,
                     run_attempt, lock_sha, signature_sha, str(release_id), repository)))
    for name in order:
        asset_id, size, digest = records[name]
        print("\t".join(("asset", name, str(asset_id), str(size), digest)))


def validate_redirect(url: str) -> None:
    if len(url) > 8192 or any(character in url for character in "\r\n\t"):
        die("Release asset redirect is malformed.")
    parsed = urlsplit(url)
    if parsed.scheme != "https" or parsed.username is not None or parsed.password is not None:
        die("Release asset redirect is not an authenticated HTTPS target.")
    if parsed.port not in (None, 443):
        die("Release asset redirect uses an unexpected port.")
    if parsed.hostname not in {"objects.githubusercontent.com", "release-assets.githubusercontent.com"}:
        die("Release asset redirect left the approved GitHub asset origins.")
    if not re.match(r"^/github-production-release-asset(?:-[^/]+)?/", parsed.path):
        die("Release asset redirect left the approved GitHub asset path.")
    if parsed.fragment:
        die("Release asset redirect contains a fragment.")
    print(url)


def main(argv: list[str]) -> None:
    if len(argv) >= 2 and argv[1] == "parse-release" and len(argv) == 5:
        parse_release(argv[2], argv[3], argv[4])
        return
    if len(argv) == 3 and argv[1] == "validate-redirect":
        validate_redirect(argv[2])
        return
    die("Usage: update-release-metadata.py parse-release <json> <version> <owner/repo> | validate-redirect <url>")


if __name__ == "__main__":
    main(sys.argv)
