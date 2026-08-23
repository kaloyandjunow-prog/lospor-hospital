#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import io
import unittest
from contextlib import redirect_stderr
from pathlib import Path


SCRIPT = Path(__file__).resolve().with_name("support-url.py")
SPEC = importlib.util.spec_from_file_location("support_url", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SupportUrlTest(unittest.TestCase):
    def test_accepts_only_https_or_mailto(self) -> None:
        self.assertEqual(
            MODULE.canonical_support_url("https://help.hospital.example/tickets", "en"),
            "https://help.hospital.example/tickets",
        )
        self.assertEqual(
            MODULE.canonical_support_url("mailto:support@hospital.example?subject=ignored", "en"),
            "mailto:support@hospital.example",
        )
        self.assertEqual(MODULE.canonical_support_url("", "bg"), "")

    def test_rejects_unsafe_destinations(self) -> None:
        for value in (
            "http://help.hospital.example",
            "https://user:password@help.hospital.example",
            "javascript:alert(1)",
            "mailto:not-an-address",
            "mailto:support@hospital.example#hidden",
            "mailto:support@hospital.example%23hidden",
            "mailto:.support@hospital.example",
            "mailto:support@-hospital.example",
            "https://help.example\\@attacker.example",
            "https://help.example/ticket#$SECRET",
        ):
            with self.subTest(value=value), redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                MODULE.canonical_support_url(value, "en")


if __name__ == "__main__":
    unittest.main()
