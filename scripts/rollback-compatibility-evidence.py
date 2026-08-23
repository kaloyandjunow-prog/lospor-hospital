#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

VERSION = re.compile(r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\Z")
SHA = re.compile(r"[a-f0-9]{64}\Z")
MIGRATION = re.compile(r"[0-9]{14}_[a-z0-9_]{1,80}\Z")
REQUIRED_CHECKS = {
    "previous-api-live", "previous-api-ready", "previous-web-smoke",
    "previous-pwa-smoke", "clinical-read", "clinical-write", "doctor",
}


def fail(message: str) -> "NoReturn":
    print(message, file=sys.stderr)
    raise SystemExit(1)


def verify(path: str, version: str, schema: str) -> None:
    source = Path(path)
    if not source.is_file() or source.is_symlink() or source.stat().st_size > 32_768:
        fail("Rollback compatibility evidence is missing, unsafe, or oversized.")
    try:
        value = json.loads(source.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        fail("Rollback compatibility evidence is invalid JSON.")
    if not isinstance(value, dict) or set(value) != {
        "schemaVersion", "releaseVersion", "previousVersion", "previousLockSha256",
        "newSchemaMigration", "testedAt", "checks",
    }:
        fail("Rollback compatibility evidence has an unsupported schema.")
    if value["schemaVersion"] != 1 or value["releaseVersion"] != version \
            or value["newSchemaMigration"] != schema:
        fail("Rollback evidence names a different release or schema.")
    if not isinstance(value["previousVersion"], str) or not VERSION.fullmatch(value["previousVersion"]):
        fail("Rollback evidence previous version is invalid.")
    if not isinstance(value["previousLockSha256"], str) or not SHA.fullmatch(value["previousLockSha256"]):
        fail("Rollback evidence previous lock is invalid.")
    tested_at = value["testedAt"]
    if not isinstance(tested_at, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z", tested_at):
        fail("Rollback evidence timestamp is invalid.")
    checks = value["checks"]
    if not isinstance(checks, list) or len(checks) != len(REQUIRED_CHECKS) or set(checks) != REQUIRED_CHECKS \
            or any(not isinstance(item, str) for item in checks):
        fail("Rollback evidence does not contain the exact old-app/new-schema gates.")


if len(sys.argv) != 4:
    fail("Usage: rollback-compatibility-evidence.py <evidence.json> <release-version> <schema-max>")
if not VERSION.fullmatch(sys.argv[2]) or not MIGRATION.fullmatch(sys.argv[3]):
    fail("Expected rollback evidence identity is invalid.")
verify(sys.argv[1], sys.argv[2], sys.argv[3])
