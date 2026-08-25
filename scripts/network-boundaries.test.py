#!/usr/bin/env python3
import importlib.util
import pathlib
import unittest


MODULE_PATH = pathlib.Path(__file__).with_name("network-boundaries.py")
SPEC = importlib.util.spec_from_file_location("network_boundaries", MODULE_PATH)
assert SPEC and SPEC.loader
network_boundaries = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(network_boundaries)


class NetworkBoundaryTests(unittest.TestCase):
    def test_canonicalizes_ipv4_ipv6_and_duplicates(self):
        self.assertEqual(
            network_boundaries.canonicalize([
                "fd00:1234::7/64, 10.20.30.7/24 10.20.30.0/24",
            ]),
            "10.20.30.0/24 fd00:1234::/64",
        )

    def test_rejects_empty_malformed_and_worldwide(self):
        for values in ([], ["not-a-network"], ["0.0.0.0/0"], ["::/0"]):
            with self.subTest(values=values), self.assertRaises(network_boundaries.BoundaryError):
                network_boundaries.canonicalize(values)

    def test_rejects_the_old_all_private_placeholder(self):
        with self.assertRaisesRegex(network_boundaries.BoundaryError, "all-rfc1918"):
            network_boundaries.canonicalize([
                "192.168.0.0/16 10.0.0.0/8 172.16.0.0/12",
            ])

    def test_explicit_unsafe_override_is_narrow(self):
        self.assertEqual(
            network_boundaries.canonicalize(
                ["192.168.0.0/16 10.0.0.0/8 172.16.0.0/12"],
                allow_all_rfc1918=True,
            ),
            "10.0.0.0/8 172.16.0.0/12 192.168.0.0/16",
        )
        with self.assertRaises(network_boundaries.BoundaryError):
            network_boundaries.canonicalize(["0.0.0.0/0"], allow_all_rfc1918=True)


if __name__ == "__main__":
    unittest.main()
