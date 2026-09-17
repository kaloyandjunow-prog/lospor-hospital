#!/usr/bin/env python3
"""Privacy-safe Nagios-style check for the fixed host-observability projection."""

from __future__ import annotations

import json
import os
import re
import stat
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

OK = 0
WARNING = 1
CRITICAL = 2
UNKNOWN = 3

DEFAULT_SIGNAL = Path(
    "/opt/lospor-hospital/.data/runtime/update/state/host-observability.v2.json"
)
MAX_BYTES = 4096
MAX_AGE_SECONDS = 180
MAX_FUTURE_SECONDS = 300
ISO_UTC = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$")

EXPECTED_KEYS = {
    "schemaVersion",
    "signalType",
    "observedAt",
    "storage",
    "clock",
    "backup",
    "offHostBackup",
    "keyEscrow",
    "updateAgent",
    "certificate",
    "services",
    "restoreLock",
    "activationLock",
    "updateSupply",
}

ENUMS = {
    "storage": {"ok", "low", "critical", "unknown"},
    "clock": {"synchronized", "unsynchronized", "unknown"},
    "backup": {"fresh", "aging", "overdue", "missing", "invalid"},
    "offHostBackup": {
        "acknowledged",
        "aging",
        "pending",
        "overdue",
        "missing",
        "invalid",
        "not-configured",
    },
    "keyEscrow": {"acknowledged", "stale", "missing", "invalid"},
    "updateAgent": {"healthy", "stale", "not-installed", "unknown"},
    "certificate": {"valid", "expiring", "expired", "missing", "unknown"},
    "services": {"healthy", "degraded", "unknown"},
    "restoreLock": {"clear", "present", "invalid"},
    "activationLock": {"clear", "present", "invalid"},
    "updateSupply": {"connected", "offline", "invalid"},
}


class ProjectionInvalid(Exception):
    pass


def _object_without_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ProjectionInvalid("duplicate key")
        result[key] = value
    return result


def _signal_path() -> tuple[Path, bool]:
    test_only = os.environ.get("HOSPITAL_OBSERVABILITY_CHECK_TEST_ONLY") == "1"
    if not test_only:
        return DEFAULT_SIGNAL, False
    supplied = os.environ.get("LOSPOR_HOST_OBSERVABILITY_SIGNAL", "")
    if not supplied:
        raise ProjectionInvalid("test signal missing")
    return Path(supplied), True


def _read_projection(path: Path, test_only: bool) -> dict[str, Any]:
    before = os.lstat(path)
    if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
        raise ProjectionInvalid("unsafe signal")
    if before.st_size < 1 or before.st_size > MAX_BYTES:
        raise ProjectionInvalid("unsafe signal size")
    if not test_only and (before.st_uid != 0 or before.st_mode & 0o022):
        raise ProjectionInvalid("unsafe signal ownership")

    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path, flags)
    try:
        opened = os.fstat(descriptor)
        if (
            not stat.S_ISREG(opened.st_mode)
            or opened.st_nlink != 1
            or opened.st_dev != before.st_dev
            or opened.st_ino != before.st_ino
        ):
            raise ProjectionInvalid("signal changed")
        raw = os.read(descriptor, MAX_BYTES + 1)
        if len(raw) < 1 or len(raw) > MAX_BYTES or os.read(descriptor, 1):
            raise ProjectionInvalid("unsafe signal size")
    finally:
        os.close(descriptor)

    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=_object_without_duplicates)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ProjectionInvalid("invalid JSON") from error
    if not isinstance(value, dict) or set(value) != EXPECTED_KEYS:
        raise ProjectionInvalid("unexpected schema")
    if type(value["schemaVersion"]) is not int or value["schemaVersion"] != 2:
        raise ProjectionInvalid("unexpected schema")
    if value["signalType"] != "host-observability":
        raise ProjectionInvalid("unexpected signal type")
    for key, allowed in ENUMS.items():
        if type(value[key]) is not str or value[key] not in allowed:
            raise ProjectionInvalid("unexpected enum")

    observed = value["observedAt"]
    if type(observed) is not str or not ISO_UTC.fullmatch(observed):
        raise ProjectionInvalid("invalid observation time")
    try:
        observed_at = datetime.strptime(observed, "%Y-%m-%dT%H:%M:%SZ").replace(
            tzinfo=timezone.utc
        )
    except ValueError as error:
        raise ProjectionInvalid("invalid observation time") from error
    age = (datetime.now(timezone.utc) - observed_at).total_seconds()
    if age < -MAX_FUTURE_SECONDS:
        raise ProjectionInvalid("future observation")
    if age > MAX_AGE_SECONDS:
        raise ProjectionInvalid("stale observation")
    return value


def _evaluate(value: dict[str, Any]) -> tuple[int, list[str]]:
    warnings: list[str] = []
    criticals: list[str] = []
    unknowns: list[str] = []

    def classify(state: str, mapping: dict[str, tuple[int, str]]) -> None:
        result = mapping.get(state)
        if result is None or result[0] == OK:
            return
        severity, code = result
        if severity == WARNING:
            warnings.append(code)
        elif severity == CRITICAL:
            criticals.append(code)
        else:
            unknowns.append(code)

    classify(value["storage"], {
        "ok": (OK, "HOST_STORAGE_OK"),
        "low": (WARNING, "HOST_STORAGE_LOW"),
        "critical": (CRITICAL, "HOST_STORAGE_CRITICAL"),
        "unknown": (UNKNOWN, "HOST_STORAGE_UNKNOWN"),
    })
    classify(value["clock"], {
        "synchronized": (OK, "HOST_CLOCK_SYNCHRONIZED"),
        "unsynchronized": (CRITICAL, "HOST_CLOCK_UNSYNCHRONIZED"),
        "unknown": (UNKNOWN, "HOST_CLOCK_UNKNOWN"),
    })
    classify(value["backup"], {
        "fresh": (OK, "HOST_BACKUP_FRESH"),
        "aging": (WARNING, "HOST_BACKUP_AGING"),
        "overdue": (CRITICAL, "HOST_BACKUP_OVERDUE"),
        "missing": (UNKNOWN, "HOST_BACKUP_MISSING"),
        "invalid": (CRITICAL, "HOST_BACKUP_EVIDENCE_INVALID"),
    })
    classify(value["offHostBackup"], {
        "acknowledged": (OK, "OFFHOST_BACKUP_ACKNOWLEDGED"),
        "aging": (WARNING, "OFFHOST_BACKUP_AGING"),
        "pending": (WARNING, "OFFHOST_BACKUP_PENDING"),
        "overdue": (CRITICAL, "OFFHOST_BACKUP_OVERDUE"),
        "missing": (WARNING, "OFFHOST_BACKUP_MISSING"),
        "invalid": (CRITICAL, "OFFHOST_BACKUP_EVIDENCE_INVALID"),
        "not-configured": (WARNING, "OFFHOST_BACKUP_NOT_CONFIGURED"),
    })
    classify(value["keyEscrow"], {
        "acknowledged": (OK, "KEY_ESCROW_ACKNOWLEDGED"),
        "stale": (CRITICAL, "KEY_ESCROW_STALE"),
        "missing": (WARNING, "KEY_ESCROW_MISSING"),
        "invalid": (CRITICAL, "KEY_ESCROW_EVIDENCE_INVALID"),
    })
    classify(value["updateAgent"], {
        "healthy": (OK, "HOST_UPDATE_AGENT_HEALTHY"),
        "stale": (WARNING, "HOST_UPDATE_AGENT_STALE"),
        "not-installed": (WARNING, "HOST_UPDATE_AGENT_CONSOLE_ONLY"),
        "unknown": (UNKNOWN, "HOST_UPDATE_AGENT_UNKNOWN"),
    })
    classify(value["certificate"], {
        "valid": (OK, "HOST_CERTIFICATE_VALID"),
        "expiring": (WARNING, "HOST_CERTIFICATE_EXPIRING"),
        "expired": (CRITICAL, "HOST_CERTIFICATE_EXPIRED"),
        "missing": (CRITICAL, "HOST_CERTIFICATE_MISSING"),
        "unknown": (UNKNOWN, "HOST_CERTIFICATE_UNKNOWN"),
    })
    classify(value["services"], {
        "healthy": (OK, "HOST_SERVICES_HEALTHY"),
        "degraded": (CRITICAL, "HOST_SERVICES_DEGRADED"),
        "unknown": (UNKNOWN, "HOST_SERVICES_UNKNOWN"),
    })
    classify(value["restoreLock"], {
        "clear": (OK, "HOST_RESTORE_LOCK_CLEAR"),
        "present": (WARNING, "HOST_RESTORE_LOCK_PRESENT"),
        "invalid": (CRITICAL, "HOST_RESTORE_LOCK_INVALID"),
    })
    classify(value["activationLock"], {
        "clear": (OK, "HOST_ACTIVATION_LOCK_CLEAR"),
        "present": (CRITICAL, "HOST_ACTIVATION_LOCK_PRESENT"),
        "invalid": (CRITICAL, "HOST_ACTIVATION_LOCK_INVALID"),
    })

    classify(value["updateSupply"], {
        "connected": (OK, "UPDATE_SUPPLY_CONNECTED"),
        "offline": (OK, "UPDATE_SUPPLY_OFFLINE"),
        "invalid": (CRITICAL, "UPDATE_SUPPLY_MODE_INVALID"),
    })

    if criticals:
        return CRITICAL, sorted(set(criticals))
    if unknowns:
        return UNKNOWN, sorted(set(unknowns))
    if warnings:
        return WARNING, sorted(set(warnings))
    return OK, []


def main() -> int:
    try:
        path, test_only = _signal_path()
        projection = _read_projection(path, test_only)
    except (OSError, ProjectionInvalid):
        print("LOSPOR HOST UNKNOWN - HOST_OBSERVABILITY_INVALID")
        return UNKNOWN

    severity, codes = _evaluate(projection)
    if severity == OK:
        print("LOSPOR HOST OK - HOST_OBSERVABILITY_HEALTHY")
    elif severity == WARNING:
        print(f"LOSPOR HOST WARNING - {','.join(codes)}")
    elif severity == CRITICAL:
        print(f"LOSPOR HOST CRITICAL - {','.join(codes)}")
    else:
        print(f"LOSPOR HOST UNKNOWN - {','.join(codes)}")
    return severity


if __name__ == "__main__":
    raise SystemExit(main())
