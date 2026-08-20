#!/bin/sh
set -eu

# Sign a release lock with the maintainer's release-signing key.
#
# Run by hand on the maintainer's own machine, at publication time -- never in
# a workflow. A key GitHub Actions can use sits in the same trust domain as the
# registry that workflow pushes to: whoever can publish images could then sign
# for them, and the signature would prove nothing the registry had not already
# asserted. release-workflow-contract-lib.mjs refuses any release workflow that
# so much as mentions signatures, so this cannot be quietly undone later.
#
# Sign at publication and not at candidate build: a candidate is a proposal and
# several are produced for one release, while a signature is the statement
# "this is the release I published". An abandoned candidate is never signed.
#
# The key arrives as PEM on standard input rather than as a path, so it is never
# written to disk in the working tree and cannot be left behind there.
#
#   printf '%s' "$RELEASE_SIGNING_KEY" | ./scripts/sign-release-lock.sh <release.lock>
#
# Writes <release.lock>.sig beside the lock.

lock="${1:-}"
[ -n "$lock" ] || { echo "Usage: ./scripts/sign-release-lock.sh <release.lock>" >&2; exit 2; }
command -v openssl >/dev/null 2>&1 || { echo "openssl is required." >&2; exit 2; }
test -s "$lock" || { echo "Release lock is missing or empty: $lock" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM
key="$work/signing.key"
umask 077
cat > "$key"
test -s "$key" || { echo "No signing key was supplied on standard input." >&2; exit 1; }

# An encrypted key cannot be used here, and must say so rather than hang.
# openssl would prompt for the passphrase, but standard input has already been
# consumed by the key itself, so the prompt blocks forever with no output. A
# release step that hangs silently is one that gets interrupted and skipped.
# Matched on a fragment rather than the whole PEM header. The full header is
# what verify-distribution-boundaries.mjs scans every tracked file for, so
# spelling it out here would make this script look like a committed key --
# and a guard that cries wolf is one somebody eventually adds an exception to.
if grep -q -- "-----BEGIN ENCRYPTED" "$key"; then
  echo "The supplied signing key is passphrase-encrypted, which cannot be read here." >&2
  echo >&2
  echo "Decrypt it to a file first, sign, then remove the decrypted copy:" >&2
  echo >&2
  echo "  openssl pkey -in <encrypted.key> -out /tmp/signing.key" >&2
  echo "  cat /tmp/signing.key | ./scripts/sign-release-lock.sh $lock" >&2
  echo "  shred -u /tmp/signing.key   # or rm, on a filesystem without shred" >&2
  exit 1
fi

openssl pkey -in "$key" -noout -passin pass: >/dev/null 2>&1 \
  || { echo "The supplied signing key is not a readable private key." >&2; exit 1; }

signature="$lock.sig"
# -rawin because Ed25519 signs the message, not a digest of it.
openssl pkeyutl -sign -inkey "$key" -passin pass: -rawin -in "$lock" -out "$signature" \
  || { echo "Signing failed." >&2; exit 1; }

# Verify what was just produced, with the public half derived from the same key.
# A signature that does not verify is worse than none: it is published, trusted
# by name, and fails only on the appliance that tries to install it.
public="$work/signing.pub"
openssl pkey -in "$key" -pubout -out "$public" 2>/dev/null
openssl pkeyutl -verify -pubin -inkey "$public" -rawin \
  -in "$lock" -sigfile "$signature" >/dev/null 2>&1 \
  || { echo "The signature just written does not verify; refusing to publish it." >&2; rm -f "$signature"; exit 1; }

echo "Signed $(basename "$lock") ($(wc -c < "$signature" | tr -d ' ') bytes)."
