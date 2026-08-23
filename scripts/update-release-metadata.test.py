#!/usr/bin/env python3
import importlib.util
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("update-release-metadata.py")
SPEC = importlib.util.spec_from_file_location("update_release_metadata", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

VERSION = "1.2.0"
PREFIX = f"lospor-hospital-{VERSION}"
COMMIT = "a" * 40
LOCK = "b" * 64
SIG = "c" * 64


def release():
    names = [
        f"{PREFIX}-deployment.tar.gz", f"{PREFIX}-manifest.json",
        f"{PREFIX}-release.lock", f"{PREFIX}-release.lock.sha256",
        f"{PREFIX}-release.lock.sig", f"{PREFIX}-security-evidence.tar.gz",
        f"{PREFIX}-images.tar.gz.part-000",
    ]
    return {
        "id": 41, "tag_name": f"hospital-{VERSION}", "name": f"LOSPOR Hospital {VERSION}",
        "draft": False, "prerelease": False, "immutable": True, "target_commitish": COMMIT,
        "body": f"LOSPOR-HOSPITAL-PUBLICATION-V1 version={VERSION} commit={COMMIT} candidate=123/2 lock-sha256={LOCK} signature-sha256={SIG}\n\nNotes.",
        "assets": [
            {"id": index + 1, "name": name, "size": 100 + index, "state": "uploaded", "digest": f"sha256:{index:064x}"}
            for index, name in enumerate(names)
        ],
    }


class MetadataTests(unittest.TestCase):
    def parse(self, value):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory, "release.json")
            path.write_text(json.dumps(value), encoding="utf-8")
            output = StringIO()
            with redirect_stdout(output):
                MODULE.parse_release(str(path), VERSION, "kaloyandjunow-prog/lospor-hospital")
            return output.getvalue()

    def test_accepts_exact_immutable_publication(self):
        output = self.parse(release())
        self.assertIn(f"\t{COMMIT}\t123\t2\t{LOCK}\t{SIG}\t", output)
        self.assertEqual(output.count("\n"), 8)

    def test_rejects_draft_mutable_and_wrong_marker(self):
        for key, value in (("draft", True), ("immutable", False), ("body", "not a marker")):
            candidate = release(); candidate[key] = value
            with self.assertRaises(SystemExit): self.parse(candidate)

    def test_rejects_missing_extra_duplicate_and_gapped_assets(self):
        missing = release(); missing["assets"].pop()
        extra = release(); extra["assets"].append({"id": 99, "name": "evil", "size": 1, "state": "uploaded"})
        duplicate = release(); duplicate["assets"].append(dict(duplicate["assets"][0], id=98))
        gapped = release(); gapped["assets"].append({"id": 98, "name": f"{PREFIX}-images.tar.gz.part-002", "size": 1, "state": "uploaded"})
        for candidate in (missing, extra, duplicate, gapped):
            with self.assertRaises(SystemExit): self.parse(candidate)

    def test_rejects_unbounded_numeric_identities_and_asset_sizes(self):
        huge_release = release(); huge_release["id"] = 10 ** 30
        huge_asset = release(); huge_asset["assets"][0]["id"] = 10 ** 30
        huge_size = release(); huge_size["assets"][0]["size"] = 2_000_000_001
        for candidate in (huge_release, huge_asset, huge_size):
            with self.assertRaises(SystemExit): self.parse(candidate)

    def test_redirect_allowlist(self):
        good = "https://release-assets.githubusercontent.com/github-production-release-asset/123?sig=x"
        output = StringIO()
        with redirect_stdout(output): MODULE.validate_redirect(good)
        self.assertEqual(output.getvalue().strip(), good)
        for bad in (
            "http://release-assets.githubusercontent.com/github-production-release-asset/123",
            "https://evil.invalid/github-production-release-asset/123",
            "https://release-assets.githubusercontent.com/not-an-asset/123",
            "https://user@release-assets.githubusercontent.com/github-production-release-asset/123",
        ):
            with self.assertRaises(SystemExit): MODULE.validate_redirect(bad)


if __name__ == "__main__":
    unittest.main()
