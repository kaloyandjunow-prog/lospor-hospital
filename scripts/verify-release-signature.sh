#!/bin/sh
set -eu

# Verify that a release lock was signed by the key this appliance already
# trusts.
#
# Why this exists. Everything about a release is authenticated by the SHA-256 of
# its lock, and until now that digest had to reach the operator by a route the
# registry does not control -- an email, a phone call, a printed sheet. That is
# what scripts/check-for-update.sh means when it says the registry "is
# deliberately not trusted to supply both the images and the fingerprint that
# authenticates them". Fetching both from one origin proves nothing: whoever
# tampered with the first can adjust the second to match.
#
# A signature replaces the operator as the second route. The private half never
# leaves the maintainer, and the public half was installed on this appliance
# once, before any of these releases existed. A compromised registry can serve
# any bytes it likes and still cannot produce a signature over them.
#
# So this is what makes an unattended download safe. It does not replace the
# operator-supplied digest for a manual install -- that path still asks -- it
# removes the need for a human to be present for the automatic one.
#
#   ./scripts/verify-release-signature.sh <release.lock> <release.lock.sig> <public-key.pem>
#
# Exit 0 verified, 1 refused, 2 called wrongly.

lock="${1:-}"
signature="${2:-}"
public_key="${3:-}"

if [ -z "$lock" ] || [ -z "$signature" ] || [ -z "$public_key" ]; then
  echo "Usage: ./scripts/verify-release-signature.sh <release.lock> <release.lock.sig> <public-key.pem>" >&2
  exit 2
fi

for command_name in openssl basename wc tr; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "$command_name is required." >&2; exit 2; }
done

test -s "$lock" || { echo "Release lock is missing or empty: $lock" >&2; exit 1; }
test -s "$signature" || { echo "Release signature is missing or empty: $signature" >&2; exit 1; }
test -s "$public_key" || {
  echo "No release signing key is installed at: $public_key" >&2
  echo "An appliance cannot check a signature against a key it does not have." >&2
  exit 1
}

# The signature must be named for the file it covers. Without this a signature
# over some other release verifies happily against that release's bytes, and the
# only thing wrong is which file the operator thinks they are installing.
lock_name="$(basename "$lock")"
signature_name="$(basename "$signature")"
test "$signature_name" = "$lock_name.sig" || {
  echo "Release signature must be named $lock_name.sig, not $signature_name." >&2
  exit 1
}
signature_bytes="$(wc -c < "$signature" | tr -d '[:space:]')"
test "$signature_bytes" = 64 || {
  echo "Release signature must contain exactly 64 raw Ed25519 bytes, not $signature_bytes." >&2
  exit 1
}

# Ed25519 signs the message itself rather than a digest of it, so -rawin is
# required; without it openssl signs the bytes as though they were already a
# hash and the result verifies against nothing.
if openssl pkeyutl -verify -pubin -inkey "$public_key" -rawin \
  -in "$lock" -sigfile "$signature" >/dev/null 2>&1; then
  echo "Release signature verified against $(basename "$public_key")."
  exit 0
fi

echo "RELEASE SIGNATURE DOES NOT VERIFY." >&2
echo >&2
echo "  lock       $lock" >&2
echo "  signature  $signature" >&2
echo "  key        $public_key" >&2
echo >&2
echo "Do not install this release. Either it is not the release this maintainer" >&2
echo "published, or it was signed with a different key. Obtain the assets again" >&2
echo "from a trusted copy before doing anything else." >&2
exit 1
