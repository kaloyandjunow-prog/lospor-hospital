#!/usr/bin/env python3
"""Validate and canonicalize Hospital network-boundary CIDR lists.

The guided installer and the change workflow both use this helper.  Keeping the
parser in one place matters: Caddy accepts a surprisingly broad set of address
tokens, while an operator needs a deterministic statement of the exact
networks that will be admitted.
"""

from __future__ import annotations

import argparse
import ipaddress
import re
import sys


PLACEHOLDER_RFC1918 = {
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
}
WORLD_NETWORKS = {
    ipaddress.ip_network("0.0.0.0/0"),
    ipaddress.ip_network("::/0"),
}


class BoundaryError(ValueError):
    """A boundary cannot be used safely."""


def canonicalize(raw_values: list[str], *, allow_all_rfc1918: bool = False) -> str:
    tokens: list[str] = []
    for raw in raw_values:
        tokens.extend(part for part in re.split(r"[\s,]+", raw.strip()) if part)
    if not tokens:
        raise BoundaryError("empty")

    networks: set[ipaddress.IPv4Network | ipaddress.IPv6Network] = set()
    for token in tokens:
        try:
            network = ipaddress.ip_network(token, strict=False)
        except ValueError as exc:
            raise BoundaryError(f"malformed:{token}") from exc
        if network in WORLD_NETWORKS:
            raise BoundaryError(f"world:{network}")
        networks.add(network)

    if PLACEHOLDER_RFC1918.issubset(networks) and not allow_all_rfc1918:
        raise BoundaryError("all-rfc1918")

    ordered = sorted(
        networks,
        key=lambda network: (
            network.version,
            int(network.network_address),
            network.prefixlen,
        ),
    )
    return " ".join(str(network) for network in ordered)


def localized_error(code: str, locale: str) -> str:
    detail = code.split(":", 1)[1] if ":" in code else ""
    kind = code.split(":", 1)[0]
    messages = {
        "en": {
            "empty": "At least one exact CIDR network is required.",
            "malformed": f"Invalid CIDR network: {detail}",
            "world": f"A world-wide network is forbidden: {detail}",
            "all-rfc1918": (
                "The three all-RFC1918 ranges are a placeholder, not an exact "
                "hospital boundary. Use the real Research or management networks."
            ),
        },
        "bg": {
            "empty": "Необходима е поне една точна мрежа във формат CIDR.",
            "malformed": f"Невалидна мрежа във формат CIDR: {detail}",
            "world": f"Не се допуска мрежа, обхващаща целия интернет: {detail}",
            "all-rfc1918": (
                "Трите общи RFC1918 диапазона са пример, а не точна болнична "
                "граница. Въведете реалните мрежи за Research или управление."
            ),
        },
    }
    return messages[locale].get(kind, code)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--locale", choices=("bg", "en"), default="bg")
    parser.add_argument("--allow-all-rfc1918", action="store_true")
    parser.add_argument("values", nargs="*")
    args = parser.parse_args()
    try:
        print(canonicalize(args.values, allow_all_rfc1918=args.allow_all_rfc1918))
    except BoundaryError as exc:
        print(localized_error(str(exc), args.locale), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
