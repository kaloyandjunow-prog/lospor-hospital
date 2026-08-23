#!/usr/bin/env python3
"""Validate and canonicalize the optional clinician support destination."""

from __future__ import annotations

import argparse
import re
import sys
from typing import NoReturn
from urllib.parse import unquote, urlsplit, urlunsplit


EMAIL = re.compile(
    r"^[A-Za-z0-9.!#%&'*+/=?^_`{|}~-]+@"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$"
)


def safe_mailbox(address: str) -> bool:
    local = address.rsplit("@", maxsplit=1)[0]
    return (
        len(address) <= 320
        and EMAIL.fullmatch(address) is not None
        and not local.startswith(".")
        and not local.endswith(".")
        and ".." not in local
    )


def invalid(locale: str) -> NoReturn:
    message = (
        "Адресът за поддръжка трябва да е HTTPS адрес без вградена парола или mailto: имейл."
        if locale == "bg"
        else "The support destination must be an HTTPS URL without embedded credentials or a mailto: email address."
    )
    print(message, file=sys.stderr)
    raise SystemExit(1)


def canonical_support_url(value: str, locale: str) -> str:
    candidate = value.strip()
    if not candidate:
        return ""
    if (
        len(candidate) > 2_048
        or any(character.isspace() for character in candidate)
        or any(character in candidate for character in "\0\\$")
    ):
        invalid(locale)
    try:
        parsed = urlsplit(candidate)
        # Accessing port forces urllib to reject malformed/out-of-range values.
        _ = parsed.port
    except ValueError:
        invalid(locale)
    scheme = parsed.scheme.lower()
    if scheme == "https":
        if (
            not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.fragment
        ):
            invalid(locale)
        return urlunsplit(("https", parsed.netloc, parsed.path or "/", parsed.query, parsed.fragment))
    if scheme == "mailto" and not parsed.fragment:
        address = unquote(parsed.path).strip()
        if safe_mailbox(address):
            # Query content is intentionally removed. The client adds its
            # reviewed diagnostic body only after a deliberate user action.
            return f"mailto:{address}"
    invalid(locale)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--locale", choices=("bg", "en"), default="bg")
    parser.add_argument("value")
    arguments = parser.parse_args()
    print(canonical_support_url(arguments.value, arguments.locale))


if __name__ == "__main__":
    main()
