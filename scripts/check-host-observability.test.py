#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
CHECK = ROOT / "scripts" / "check-host-observability.py"


def observed_at(offset_seconds: int = 0) -> str:
    value = datetime.now(timezone.utc) + timedelta(seconds=offset_seconds)
    return value.strftime("%Y-%m-%dT%H:%M:%SZ")


def healthy(**overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "schemaVersion": 2,
        "signalType": "host-observability",
        "observedAt": observed_at(),
        "storage": "ok",
        "clock": "synchronized",
        "backup": "fresh",
        "offHostBackup": "acknowledged",
        "keyEscrow": "acknowledged",
        "updateAgent": "healthy",
        "certificate": "valid",
        "services": "healthy",
        "restoreLock": "clear",
        "activationLock": "clear",
        "updateSupply": "connected",
    }
    value.update(overrides)
    return value


class HostCheckTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)
        self.signal = self.directory / "host-observability.v2.json"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def write(self, value: dict[str, object] | str) -> None:
        text = value if isinstance(value, str) else json.dumps(value, separators=(",", ":"))
        self.signal.write_text(text + "\n", encoding="utf-8")
        self.signal.chmod(0o600)

    def run_check(self, signal: Path | None = None) -> subprocess.CompletedProcess[str]:
        environment = os.environ.copy()
        environment.update({
            "HOSPITAL_OBSERVABILITY_CHECK_TEST_ONLY": "1",
            "LOSPOR_HOST_OBSERVABILITY_SIGNAL": str(signal or self.signal),
        })
        return subprocess.run(
            [sys.executable, str(CHECK)],
            text=True,
            capture_output=True,
            check=False,
            env=environment,
        )

    def test_healthy_projection_is_ok(self) -> None:
        self.write(healthy())
        result = self.run_check()
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "LOSPOR HOST OK - HOST_OBSERVABILITY_HEALTHY\n")
        self.assertEqual(result.stderr, "")

    def test_fixed_warnings_are_nagios_warning(self) -> None:
        self.write(healthy(storage="low", restoreLock="present"))
        result = self.run_check()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(
            result.stdout,
            "LOSPOR HOST WARNING - HOST_RESTORE_LOCK_PRESENT,HOST_STORAGE_LOW\n",
        )

    def test_known_failure_is_nagios_critical(self) -> None:
        self.write(healthy(services="degraded", activationLock="present"))
        result = self.run_check()
        self.assertEqual(result.returncode, 2)
        self.assertEqual(
            result.stdout,
            "LOSPOR HOST CRITICAL - HOST_ACTIVATION_LOCK_PRESENT,HOST_SERVICES_DEGRADED\n",
        )

    def test_key_escrow_is_graded_like_status(self) -> None:
        for escrow, code, expected in [
            ("missing", "KEY_ESCROW_MISSING", 1),
            ("stale", "KEY_ESCROW_STALE", 2),
            ("invalid", "KEY_ESCROW_EVIDENCE_INVALID", 2),
        ]:
            with self.subTest(escrow=escrow):
                self.write(healthy(keyEscrow=escrow))
                result = self.run_check()
                self.assertEqual(result.returncode, expected)
                self.assertIn(code, result.stdout)

    def test_previous_schema_with_credential_fields_is_rejected(self) -> None:
        legacy = healthy(schemaVersion=1, githubReleaseCredential="configured", ghcrCredential="configured")
        legacy.pop("keyEscrow")
        self.write(legacy)
        self.assertEqual(self.run_check().returncode, 3)

    def test_stale_future_and_unknown_enum_fail_closed(self) -> None:
        # Comfortably outside the 180s stale and 300s future windows rather than
        # one second past them. The future variant used +301, which the checker
        # rejects only while `now - observedAt < -300` -- so it required the
        # write, the subprocess spawn and Python's startup to finish inside one
        # second, and observed_at truncates to whole seconds on top of that. On a
        # loaded runner the margin vanished, the projection was accepted, and the
        # test failed asserting 3 but getting 0. The stale variant never had the
        # problem, because latency only makes an old observation older.
        #
        # Testing the exact boundary would need an injectable clock; this asserts
        # the behaviour, not the arithmetic of one second.
        variants = [
            healthy(observedAt=observed_at(-900)),
            healthy(observedAt=observed_at(900)),
            healthy(restoreLock="quiet"),
            healthy(updateSupply="sideways"),
        ]
        for value in variants:
            with self.subTest(value=value):
                self.write(value)
                result = self.run_check()
                self.assertEqual(result.returncode, 3)
                self.assertEqual(
                    result.stdout,
                    "LOSPOR HOST UNKNOWN - HOST_OBSERVABILITY_INVALID\n",
                )

    def test_extra_duplicate_and_arbitrary_content_never_reaches_output(self) -> None:
        extra = healthy(patientId="patient-123", path="/var/lib/private")
        duplicate = json.dumps(healthy(), separators=(",", ":"))
        duplicate = duplicate[:-1] + ',"storage":"critical"}'
        for value in [extra, duplicate, "patient=patient-123 path=/var/lib/private"]:
            with self.subTest(value=value):
                self.write(value)
                result = self.run_check()
                self.assertEqual(result.returncode, 3)
                self.assertEqual(
                    result.stdout,
                    "LOSPOR HOST UNKNOWN - HOST_OBSERVABILITY_INVALID\n",
                )
                self.assertNotIn("patient", result.stdout.lower())
                self.assertNotIn("/var/", result.stdout)

    def test_missing_hardlinked_and_symlinked_projection_are_unknown(self) -> None:
        missing = self.directory / "missing.json"
        self.assertEqual(self.run_check(missing).returncode, 3)

        self.write(healthy())
        hardlink = self.directory / "hardlink.json"
        try:
            os.link(self.signal, hardlink)
        except OSError as error:
            self.skipTest(f"hard links unavailable: {error}")
        self.assertEqual(self.run_check().returncode, 3)
        hardlink.unlink()

        symlink = self.directory / "symlink.json"
        try:
            symlink.symlink_to(self.signal)
        except OSError:
            return
        self.assertEqual(self.run_check(symlink).returncode, 3)


if __name__ == "__main__":
    unittest.main(verbosity=2)
