#!/usr/bin/env python3
"""The release dossier, on the appliance: checked against the signed lock and
shown in plain words.

    python3 scripts/release-dossier.py summary EVIDENCE LOCK
    python3 scripts/release-dossier.py project EVIDENCE LOCK STATE_DIR [--run ID --attempt N]

The dossier lives inside the security-evidence archive, which the caller has
already matched to release.lock, and the lock to the maintainer's signature.
This reads only that one member of the archive, never extracts anything, and
checks the dossier describes the same release, deployment, offline parts and
images as the lock. The build pipeline checks the rest of it byte for byte.

summary prints the plain lines. project prints them too and writes
release-dossier-<version>.v1.json for Status: counts, fixed words, dates and
public identifiers only.

Exit 0 verified, 1 invalid or does not match the lock, 2 wrong usage,
3 the archive has no dossier (a release published before 1.4.0).
"""

import json
import os
import re
import sys
import tarfile
import tempfile
from datetime import datetime, timezone

MEMBER = "release-evidence/release-dossier.json"
IMAGES = {"api", "browser", "caddy", "curl-worker", "migrate", "postgres", "pwa", "status", "tools", "web"}
VERSION = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")
SHA256 = re.compile(r"^[a-f0-9]{64}$")
COMMIT = re.compile(r"^[a-f0-9]{40}$")
DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MIGRATION = re.compile(r"^\d{14}_[a-z0-9_]{1,80}$")


class Invalid(Exception):
    pass


def require(condition, message):
    if not condition:
        raise Invalid(message)


def whole(value):
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def read_dossier(evidence):
    try:
        with tarfile.open(evidence, "r:gz") as archive:
            try:
                member = archive.getmember(MEMBER)
            except KeyError:
                return None
            require(member.isfile() and member.size <= 1024 * 1024, "the dossier entry is not a small regular file")
            return json.loads(archive.extractfile(member).read().decode("utf-8"))
    except (tarfile.TarError, OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise Invalid(f"the security evidence could not be read ({error.__class__.__name__})")


def read_lock(path):
    with open(path, encoding="utf-8") as handle:
        rows = [line.rstrip("\n").split("\t") for line in handle if line.strip()]
    releases = [row for row in rows if row[0] == "release"]
    require(len(releases) == 1 and len(releases[0]) >= 4, "the lock must have exactly one release line")
    artifacts = lambda role: [
        {"file": row[3], "bytes": int(row[4]), "sha256": row[5]}
        for row in rows if row[0] == "artifact" and len(row) >= 6 and row[1] == role
    ]
    images = sorted((row[1], row[2], row[3]) for row in rows if row[0] == "image" and len(row) >= 4)
    return {
        "version": releases[0][1], "tag": releases[0][2], "commit": releases[0][3],
        "deployment": artifacts("deployment"), "offline": artifacts("offline-part"), "images": images,
    }


def verify(dossier, lock, run=None, attempt=None):
    require(isinstance(dossier, dict) and dossier.get("schemaVersion") == 1
            and dossier.get("kind") == "lospor-hospital-release-dossier", "unsupported dossier")
    release = dossier.get("release") or {}
    require(VERSION.match(str(release.get("version", ""))) and release.get("tag") == f"hospital-{release.get('version')}"
            and COMMIT.match(str(release.get("commit", ""))), "the release identity is invalid")
    require((release["version"], release["tag"], release["commit"]) == (lock["version"], lock["tag"], lock["commit"]),
            f"it describes {release['tag']} at {release['commit']}, but the lock is {lock['tag']} at {lock['commit']}")
    build = dossier.get("build") or {}
    require(re.match(r"^[1-9]\d*$", str(build.get("runId", ""))) and whole(build.get("runAttempt")) and build["runAttempt"] >= 1
            and build.get("workflow") == ".github/workflows/release.yml"
            and build.get("runUrl") == f"https://github.com/{build.get('repository')}/actions/runs/{build.get('runId')}/attempts/{build.get('runAttempt')}",
            "the build provenance is invalid")
    if run is not None:
        require((build["runId"], build["runAttempt"]) == (str(run), int(attempt)),
                f"it was built by run {build['runId']} attempt {build['runAttempt']}, not run {run} attempt {attempt}")
    artifacts = dossier.get("artifacts") or {}
    require([artifacts.get("deployment")] == lock["deployment"], "its deployment archive is not the one in the lock")
    require(artifacts.get("offlineParts") == lock["offline"], "its offline parts are not the ones in the lock")
    images = dossier.get("images")
    require(isinstance(images, list) and len(images) == len(IMAGES) and {image.get("name") for image in images} == IMAGES,
            "it must name the ten release images")
    require(sorted((image["name"], image.get("reference"), image.get("digest")) for image in images) == lock["images"],
            "its images are not the ones in the lock")
    compatibility = dossier.get("compatibility") or {}
    require(compatibility.get("rollbackPolicy") in ("backup-required", "service-compatible")
            and whole(compatibility.get("rollbackWindowDays")) and MIGRATION.match(str(compatibility.get("schemaMaximum", ""))),
            "its compatibility is invalid")
    vulnerabilities = dossier.get("vulnerabilities") or {}
    require(whole(vulnerabilities.get("critical")) and whole(vulnerabilities.get("high")), "its vulnerability counts are invalid")
    exceptions = vulnerabilities.get("exceptions")
    require(isinstance(exceptions, list) and len(exceptions) <= 200 and all(
        isinstance(item, dict) and item.get("image") in IMAGES and DAY.match(str(item.get("expiresAt", "")))
        and re.match(r"^[A-Z][A-Z0-9-]{2,63}$", str(item.get("vulnerabilityId", ""))) for item in exceptions),
        "its vulnerability exceptions are invalid")
    sboms = (dossier.get("evidence") or {}).get("sboms")
    require(isinstance(sboms, list) and len(sboms) == len(IMAGES) and all(whole(item.get("components")) for item in sboms),
            "its software bills of materials are invalid")
    upstream = dossier.get("upstream")
    require(isinstance(upstream, dict) and all(
        re.match(r"^[A-Za-z][A-Za-z0-9-]{0,40}$", name) and re.match(r"^[0-9A-Za-z.+-]{1,40}$", str(source.get("version", "")))
        for name, source in upstream.items()), "its upstream versions are invalid")
    return dossier


def summary_lines(dossier, bulgarian):
    release, build, compatibility = dossier["release"], dossier["build"], dossier["compatibility"]
    vulnerabilities = dossier["vulnerabilities"]
    expiries = sorted(item["expiresAt"] for item in vulnerabilities["exceptions"])
    components = sum(item["components"] for item in dossier["evidence"]["sboms"])
    upstream = ", ".join(f"{name} {source['version']}" for name, source in dossier["upstream"].items())
    if bulgarian:
        return [
            f"LOSPOR Hospital {release['version']}, commit {release['commit']}",
            f"Изградена от {build['workflow']}, run {build['runId']} опит {build['runAttempt']} ({build['runUrl']})",
            f"{len(dossier['images'])} образа, всеки със списък на компонентите (общо {components})",
            f"Уязвимости: {vulnerabilities['critical']} критични, {vulnerabilities['high']} високи; "
            f"{len(vulnerabilities['exceptions'])} приети с изключение със срок" + (f" (първото изтича на {expiries[0]})" if expiries else ""),
            (f"Обновяване до нея: услугите могат да се върнат до {compatibility['rollbackWindowDays']} дни след миграцията"
             if compatibility["rollbackPolicy"] == "service-compatible"
             else "Обновяване до нея: връщане след миграцията изисква проверен архив"),
            f"Изградена от {upstream}",
        ]
    return [
        f"LOSPOR Hospital {release['version']}, commit {release['commit']}",
        f"Built by {build['workflow']}, run {build['runId']} attempt {build['runAttempt']} ({build['runUrl']})",
        f"{len(dossier['images'])} images, each with a software bill of materials ({components} components in all)",
        f"Vulnerabilities: {vulnerabilities['critical']} critical, {vulnerabilities['high']} high; "
        f"{len(vulnerabilities['exceptions'])} accepted with a dated exception" + (f" (first expires {expiries[0]})" if expiries else ""),
        (f"Updating to it: services can roll back for {compatibility['rollbackWindowDays']} day(s) after migration"
         if compatibility["rollbackPolicy"] == "service-compatible"
         else "Updating to it: a verified backup is required to go back after migration"),
        f"Built from {upstream}",
    ]


def projection(dossier):
    release, build, compatibility = dossier["release"], dossier["build"], dossier["compatibility"]
    vulnerabilities = dossier["vulnerabilities"]
    return {
        "schemaVersion": 1,
        "signalType": "release-dossier",
        "verifiedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "version": release["version"],
        "commit": release["commit"],
        "createdAt": release.get("createdAt"),
        "build": {"runId": build["runId"], "runAttempt": build["runAttempt"], "runUrl": build["runUrl"]},
        "images": len(dossier["images"]),
        "sbomComponents": sum(item["components"] for item in dossier["evidence"]["sboms"]),
        "vulnerabilities": {
            "critical": vulnerabilities["critical"],
            "high": vulnerabilities["high"],
            "exceptions": [
                {"image": item["image"], "vulnerabilityId": item["vulnerabilityId"], "expiresAt": item["expiresAt"]}
                for item in vulnerabilities["exceptions"][:50]
            ],
        },
        "compatibility": {
            "rollbackPolicy": compatibility["rollbackPolicy"],
            "rollbackWindowDays": compatibility["rollbackWindowDays"],
            "schemaMaximum": compatibility["schemaMaximum"],
        },
        "upstream": {name: source["version"] for name, source in dossier["upstream"].items()},
    }


def main(arguments):
    if len(arguments) < 3 or arguments[0] not in ("summary", "project"):
        print(__doc__.strip().split("\n\n")[1], file=sys.stderr)
        return 2
    command, evidence, lock_path = arguments[:3]
    rest = arguments[3:]
    state_dir = None
    if command == "project":
        if not rest:
            return main([])
        state_dir, rest = rest[0], rest[1:]
    run = attempt = None
    if rest:
        if len(rest) != 4 or rest[0] != "--run" or rest[2] != "--attempt":
            return main([])
        run, attempt = rest[1], rest[3]
    bulgarian = os.environ.get("LOSPOR_OPERATOR_LOCALE", "bg") != "en"
    try:
        dossier = read_dossier(evidence)
        if dossier is None:
            return 3
        verify(dossier, read_lock(lock_path), run, attempt)
    except (Invalid, OSError, ValueError) as error:
        print(f"RELEASE_DOSSIER_INVALID: {error}", file=sys.stderr)
        return 1
    for line in summary_lines(dossier, bulgarian):
        print(f"  {line}")
    if state_dir is not None:
        document = projection(dossier)
        target = os.path.join(state_dir, f"release-dossier-{document['version']}.v1.json")
        handle, temporary = tempfile.mkstemp(dir=state_dir, prefix=".release-dossier.", suffix=".tmp")
        with os.fdopen(handle, "w", encoding="utf-8") as output:
            json.dump(document, output, separators=(",", ":"))
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary, 0o644)
        os.replace(temporary, target)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
