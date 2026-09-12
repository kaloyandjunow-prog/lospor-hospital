#!/bin/sh
set -eu

# Pin the maintainer's release signing key to this appliance, once.
#
# Read this before changing anything here.
#
# A release carries a copy of the public key. Adopting that copy because it is
# present would be worthless: whoever tampered with the release supplies their
# own key alongside it, and every update afterwards verifies perfectly against
# the attacker's key. The appliance would be cryptographically certain it was
# being updated by whoever compromised it.
#
# So the copy in a release is never trusted on sight. It is trusted when a
# person confirms its fingerprint against a record that did not come from the
# download -- the same discipline the release-lock digest already follows, and
# the same one an SSH host key follows the first time you connect.
#
# The trade this makes is the point of the whole exercise: today an operator
# must obtain a fresh 64-character digest from the maintainer before every
# release. After pinning they obtain one fingerprint, once, and every future
# release verifies by itself.
#
#   ./scripts/pin-release-signing-key.sh <public-key.pem> [expected-fingerprint]
#
# With a key already pinned, the argument is compared and never adopted:
# identical is a silent success, different is a refusal that stops the install.
#
# Exit 0 pinned or already correct, 1 refused, 2 called wrongly, 3 nothing
# pinned and no fingerprint supplied.
#
# 3 is separate from 1 on purpose. "This site has not adopted signing" and "this
# key is not the one you were promised" are opposite situations: the first is a
# site running the older arrangement and must not stop an install, the second
# must stop everything. Collapsing them into one failure would either break
# every site that has not pinned, or teach an operator that a key warning is
# something installs print.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$root/scripts/installed-release-state.sh"

candidate_key="${1:-}"
expected_fingerprint="${2:-${HOSPITAL_RELEASE_SIGNING_FINGERPRINT:-}}"

[ -n "$candidate_key" ] || {
  echo "Usage: ./scripts/pin-release-signing-key.sh <public-key.pem> [expected-fingerprint]" >&2
  exit 2
}
command -v openssl >/dev/null 2>&1 || { echo "openssl is required." >&2; exit 2; }
test -s "$candidate_key" || { echo "Public key is missing or empty: $candidate_key" >&2; exit 1; }

appliance_home="$(release_state_appliance_home "$root")"
pinned_key="$appliance_home/secrets/release-signing-public.pem"

# Fingerprint the key material itself, not the file. Two PEM files can differ in
# whitespace, line endings or comments and hold the same key; a person comparing
# fingerprints must not be told two identical keys differ, or they learn to
# click past the warning.
#
# Carriage returns are stripped as well as newlines because some openssl builds
# emit base64 with CRLF. A trailing CR is invisible in every message printed
# here, and would make a correctly copied fingerprint compare unequal forever.
fingerprint_of() {
  openssl pkey -pubin -in "$1" -outform DER 2>/dev/null \
    | openssl dgst -sha256 -binary \
    | openssl base64 \
    | tr -d '\r\n='
}

candidate_fingerprint="SHA256:$(fingerprint_of "$candidate_key")"
[ "$candidate_fingerprint" != "SHA256:" ] || {
  echo "Not a readable public key: $candidate_key" >&2
  exit 1
}

if [ -s "$pinned_key" ]; then
  pinned_fingerprint="SHA256:$(fingerprint_of "$pinned_key")"
  if [ "$candidate_fingerprint" = "$pinned_fingerprint" ]; then
    exit 0
  fi
  echo "RELEASE SIGNING KEY HAS CHANGED." >&2
  echo >&2
  echo "  pinned on this appliance  $pinned_fingerprint" >&2
  echo "  offered by this release   $candidate_fingerprint" >&2
  echo >&2
  echo "This appliance will not adopt a new signing key from a release, because a" >&2
  echo "release that could install its own key could authenticate anything that" >&2
  echo "followed. Either this is not a genuine release, or the maintainer has" >&2
  echo "rotated the key and must tell you so through the channel you already use" >&2
  echo "for release fingerprints." >&2
  exit 1
fi

# Nothing pinned yet. This is the one moment a human is required.
if [ -z "$expected_fingerprint" ]; then
  echo "No release signing key is pinned, and no expected fingerprint was given." >&2
  echo >&2
  echo "  this release offers  $candidate_fingerprint" >&2
  echo >&2
  echo "Compare that against the fingerprint in your maintainer's install notice," >&2
  echo "which must not have arrived with this download, then re-run with:" >&2
  echo >&2
  echo "  HOSPITAL_RELEASE_SIGNING_FINGERPRINT=$candidate_fingerprint" >&2
  echo >&2
  echo "An appliance with no key pinned still installs and updates; it verifies" >&2
  echo "each release against the digest you are given every time instead." >&2
  exit 3
fi

# Accept the fingerprint with or without the SHA256: prefix, because an operator
# copying from a notice will include whatever the notice shows.
supplied="${expected_fingerprint#SHA256:}"
if [ "$supplied" != "${candidate_fingerprint#SHA256:}" ]; then
  echo "RELEASE SIGNING KEY DOES NOT MATCH THE FINGERPRINT YOU WERE GIVEN." >&2
  echo >&2
  echo "  expected  SHA256:$supplied" >&2
  echo "  offered   $candidate_fingerprint" >&2
  echo >&2
  echo "Stop. Do not install this release. Obtain the assets again from a trusted" >&2
  echo "copy and check with whoever published them." >&2
  exit 1
fi

umask 077
# Past this point the fingerprint has already been confirmed, so nothing that
# fails below says anything about the release. Storing the key is an ordinary
# file operation that can fail for ordinary reasons -- an unwritable secrets
# directory, a full disk -- and under `set -e` those failures left with status
# 1, the same status this script uses to refuse a key. The caller could not tell
# the two apart and told the operator their release might be tampered with. A
# distinct status and an explicit denial keep an operational fault operational.
mkdir -p "$appliance_home/secrets" 2>/dev/null || true
if ! { cp "$candidate_key" "$pinned_key.tmp.$$" \
  && chmod 644 "$pinned_key.tmp.$$" \
  && mv -f "$pinned_key.tmp.$$" "$pinned_key"; }; then
  rm -f "$pinned_key.tmp.$$" 2>/dev/null || true
  echo "COULD NOT STORE THE RELEASE SIGNING KEY." >&2
  echo >&2
  echo "The fingerprint matched. This is a file permission problem on this" >&2
  echo "appliance, not a problem with the release." >&2
  echo >&2
  echo "  cannot write  $pinned_key" >&2
  echo >&2
  echo "Check that $appliance_home/secrets is writable by the user running the" >&2
  echo "installation." >&2
  exit 5
fi
echo "Release signing key pinned: $candidate_fingerprint"
echo "Future releases verify against this key without a per-release digest."
