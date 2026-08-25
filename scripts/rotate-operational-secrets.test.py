#!/usr/bin/env python3
from __future__ import annotations

import ast
import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().with_name("rotate-operational-secrets.py")


class OperationalSecretRotationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="lospor-secret-rotation-")
        self.root = Path(self.temporary.name)
        (self.root / "secrets" / "status").mkdir(parents=True, mode=0o700)
        (self.root / ".data").mkdir(mode=0o700)
        self.old = {
            "HOSPITAL_POSTGRES_PASSWORD": "1" * 64,
            "LOSPOR_AUTH_SECRET": "2" * 96,
            "HOSPITAL_WORKER_TOKEN": "3" * 64,
            "RESEARCH_EXPORT_WORKER_SECRET": "4" * 64,
            "CRON_SECRET": "5" * 64,
            "OPTION_LIBRARY_SNAPSHOT_SECRET": "6" * 64,
        }
        env_lines = [
            "LOSPOR_DEFAULT_LOCALE=en",
            *(f"{key}={value}" for key, value in self.old.items()),
            "HOSPITAL_OPERATIONAL_SECRET_GENERATION=1",
        ]
        self.env_path = self.root / ".env"
        self.env_path.write_text("\n".join(env_lines) + "\n", encoding="utf-8")
        self.env_path.chmod(0o600)
        self.old_status = {}
        for index, name in enumerate((
            "snapshot-token", "account-control-token", "api-event-token", "db-probe-password",
        ), start=7):
            value = str(index) * 64
            self.old_status[name] = value
            path = self.root / "secrets" / "status" / name
            path.write_text(value + "\n", encoding="utf-8")
            path.chmod(0o600)
        event = self.root / "secrets" / "status" / "event-tokens.json"
        event.write_text(json.dumps({"api": self.old_status["api-event-token"]}) + "\n", encoding="utf-8")
        event.chmod(0o600)
        self.docker_log = self.root / "docker.jsonl"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def run_command(
        self,
        *arguments: str,
        fail_label: str | None = None,
        fail_point: str | None = None,
        locale: str | None = None,
    ) -> subprocess.CompletedProcess[str]:
        environment = {
            **os.environ,
            "HOSPITAL_SECRET_ROTATION_TEST_ONLY": "1",
            "HOSPITAL_SECRET_ROTATION_ROOT": str(self.root),
            "HOSPITAL_SECRET_ROTATION_DOCKER_LOG": str(self.docker_log),
            "PYTHONIOENCODING": "utf-8",
        }
        if fail_label:
            environment["HOSPITAL_SECRET_ROTATION_TEST_FAIL_LABEL"] = fail_label
        if fail_point:
            environment["HOSPITAL_SECRET_ROTATION_TEST_FAIL_POINT"] = fail_point
        if locale:
            environment["LOSPOR_OPERATOR_LOCALE"] = locale
        return subprocess.run(
            [sys.executable, str(SCRIPT), *arguments],
            text=True,
            encoding="utf-8",
            capture_output=True,
            env=environment,
            check=False,
        )

    def env_values(self) -> dict[str, str]:
        return dict(
            line.split("=", 1)
            for line in self.env_path.read_text(encoding="utf-8").splitlines()
            if line and not line.startswith("#")
        )

    def assert_no_secret_output(self, result: subprocess.CompletedProcess[str], values: list[str]) -> None:
        output = result.stdout + result.stderr
        for value in values:
            self.assertNotIn(value, output)

    def test_usage_and_failures_follow_operator_locale_without_translating_scope_tokens(self) -> None:
        bulgarian_usage = self.run_command(locale="bg")
        english_usage = self.run_command(locale="en")
        self.assertEqual(bulgarian_usage.returncode, 2)
        self.assertEqual(english_usage.returncode, 2)
        self.assertIn("Употреба:", bulgarian_usage.stderr)
        self.assertNotIn("Usage:", bulgarian_usage.stderr)
        self.assertIn("Usage:", english_usage.stderr)
        stable_scopes = "sessions|workers|status-tokens|database|ordinary"
        self.assertIn(stable_scopes, bulgarian_usage.stderr)
        self.assertIn(stable_scopes, english_usage.stderr)

        bulgarian_error = self.run_command("prepare", "not-a-scope", locale="bg")
        english_error = self.run_command("prepare", "not-a-scope", locale="en")
        self.assertNotEqual(bulgarian_error.returncode, 0)
        self.assertNotEqual(english_error.returncode, 0)
        self.assertIn("Непознат обхват", bulgarian_error.stderr)
        self.assertNotIn("Unknown rotation scope", bulgarian_error.stderr)
        self.assertIn("Unknown rotation scope", english_error.stderr)

    def test_every_rotation_error_has_bulgarian_and_english_text(self) -> None:
        tree = ast.parse(SCRIPT.read_text(encoding="utf-8"))
        calls = [
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "RotationError"
        ]
        self.assertGreater(len(calls), 30)
        for call in calls:
            self.assertEqual(len(call.args), 2, f"RotationError at line {call.lineno} is not bilingual")

    def test_ordinary_prepare_commit_is_two_phase_and_retires_overlap(self) -> None:
        before = self.env_path.read_bytes()
        prepared = self.run_command("prepare", "ordinary")
        self.assertEqual(prepared.returncode, 0, prepared.stderr)
        self.assertEqual(self.env_path.read_bytes(), before)
        pending = self.root / "secrets" / "rotation" / "pending"
        self.assertTrue(pending.is_dir())
        new_values = [path.read_text(encoding="utf-8").strip() for path in (pending / "new").iterdir()]
        new_values.extend(
            path.read_text(encoding="utf-8").strip()
            for path in (pending / "status-new").iterdir()
        )
        self.assert_no_secret_output(prepared, [*self.old.values(), *self.old_status.values(), *new_values])

        state = self.run_command("state")
        self.assertEqual(state.returncode, 0, state.stderr)
        self.assertIn("generation=2", state.stdout)
        self.assert_no_secret_output(state, [*self.old.values(), *self.old_status.values(), *new_values])

        committed = self.run_command("commit")
        self.assertEqual(committed.returncode, 0, committed.stderr)
        values = self.env_values()
        self.assertEqual(values["HOSPITAL_OPERATIONAL_SECRET_GENERATION"], "2")
        for key, old in self.old.items():
            self.assertNotEqual(values[key], old)
        for key in (
            "HOSPITAL_WORKER_TOKEN_PREVIOUS",
            "RESEARCH_EXPORT_WORKER_SECRET_PREVIOUS",
            "CRON_SECRET_PREVIOUS",
            "OPTION_LIBRARY_SNAPSHOT_SECRET_PREVIOUS",
        ):
            self.assertNotIn(key, values)
        for name, old in self.old_status.items():
            source = self.root / "secrets" / "status" / name
            self.assertNotEqual(source.read_text(encoding="utf-8").strip(), old)
            self.assertFalse((source.parent / f"{name}.previous").exists())
        event = json.loads((self.root / "secrets" / "status" / "event-tokens.json").read_text(encoding="utf-8"))
        self.assertEqual(set(event), {"api"})
        self.assertFalse(pending.exists())
        self.assert_no_secret_output(committed, [*self.old.values(), *self.old_status.values(), *new_values])

        audit = (self.root / ".data" / "security" / "secret-rotations.v1.jsonl").read_text(encoding="utf-8")
        for value in [*self.old.values(), *self.old_status.values(), *new_values]:
            self.assertNotIn(value, audit)
        phases = [json.loads(line)["phase"] for line in audit.splitlines()]
        self.assertIn("PREPARED", phases)
        self.assertIn("OVERLAP", phases)
        self.assertIn("COMMITTED", phases)
        if os.name != "nt":
            mode = stat.S_IMODE((self.root / ".data" / "security" / "secret-rotations.v1.jsonl").stat().st_mode)
            self.assertEqual(mode, 0o600)

    def test_failed_commit_automatically_restores_the_exact_prior_environment(self) -> None:
        before = self.env_path.read_bytes()
        prepared = self.run_command("prepare", "workers")
        self.assertEqual(prepared.returncode, 0, prepared.stderr)
        pending = self.root / "secrets" / "rotation" / "pending"
        new_values = [path.read_text(encoding="utf-8").strip() for path in (pending / "new").iterdir()]
        failed = self.run_command(
            "commit",
            fail_label="recreate and wait for appliance services",
        )
        self.assertNotEqual(failed.returncode, 0)
        self.assertIn("prior credentials were restored", failed.stderr)
        self.assertEqual(self.env_path.read_bytes(), before)
        self.assertFalse(pending.exists())
        self.assert_no_secret_output(failed, [*self.old.values(), *new_values])
        phases = [
            json.loads(line)["phase"]
            for line in (self.root / ".data" / "security" / "secret-rotations.v1.jsonl")
            .read_text(encoding="utf-8").splitlines()
        ]
        self.assertEqual(phases[-1], "ROLLED_BACK")

    def test_protected_environment_hardlink_is_refused(self) -> None:
        alias = self.root / "env-alias"
        try:
            os.link(self.env_path, alias)
        except OSError:
            self.skipTest("hard links are unavailable")
        result = self.run_command("state")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("single regular file", result.stderr)
        self.assert_no_secret_output(result, list(self.old.values()))

    def test_failed_prepare_publication_removes_the_unannounced_transaction(self) -> None:
        before = self.env_path.read_bytes()
        result = self.run_command(
            "prepare",
            "workers",
            fail_point="after publishing prepared transaction",
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.env_path.read_bytes(), before)
        self.assertFalse((self.root / "secrets" / "rotation" / "pending").exists())
        self.assert_no_secret_output(result, list(self.old.values()))

    def test_cleanup_failure_never_rolls_back_a_verified_commit(self) -> None:
        prepared = self.run_command("prepare", "sessions")
        self.assertEqual(prepared.returncode, 0, prepared.stderr)
        pending = self.root / "secrets" / "rotation" / "pending"
        replacement = (pending / "new" / "LOSPOR_AUTH_SECRET").read_text(encoding="utf-8").strip()

        committed = self.run_command(
            "commit",
            fail_point="before removing committed residue",
        )
        self.assertNotEqual(committed.returncode, 0)
        self.assertIn("committed and verified", committed.stderr)
        self.assertEqual(self.env_values()["LOSPOR_AUTH_SECRET"], replacement)
        self.assertFalse(pending.exists())
        residues = list((self.root / "secrets" / "rotation").glob(".committed-*"))
        self.assertEqual(len(residues), 1)
        self.assertEqual(json.loads((residues[0] / "metadata.json").read_text())["phase"], "COMMITTED")

        state = self.run_command("state")
        self.assertEqual(state.returncode, 0, state.stderr)
        self.assertIn("need cleanup", state.stdout)

        cleaned = self.run_command("cleanup")
        self.assertEqual(cleaned.returncode, 0, cleaned.stderr)
        self.assertFalse(residues[0].exists())
        self.assertEqual(self.env_values()["LOSPOR_AUTH_SECRET"], replacement)
        self.assert_no_secret_output(committed, [*self.old.values(), replacement])
        self.assert_no_secret_output(cleaned, [*self.old.values(), replacement])


if __name__ == "__main__":
    unittest.main()
