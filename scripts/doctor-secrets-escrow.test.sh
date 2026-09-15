#!/bin/sh
set -eu

# The escrow gate must be loud and must not be a gate.
#
# doctor.sh --install runs during activation and decides whether a candidate
# release is accepted. A fresh install has just generated its secrets and cannot
# have escrowed them yet, so making this a failure would refuse every first
# install -- the same shape as the first-install bug this appliance already
# shipped once. It mirrors the off-host backup acknowledgement instead: reported
# as critical, never fatal.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"

fail=0
check() {
  if [ "$1" = "$2" ]; then
    printf 'ok   %s\n' "$3"
  else
    printf 'FAIL %s (expected %s, got %s)\n' "$3" "$2" "$1"
    fail=1
  fi
}

# The gate's own shape, lifted out of doctor.sh so this exercises the real
# branch rather than a description of it.
gate_block="$(awk '/^if \[ ! -s "\$appliance_home\/\.secrets-escrowed\.v1" \]; then$/,/^fi$/' scripts/doctor.sh)"
[ -n "$gate_block" ] || { printf 'FAIL could not find the escrow gate in doctor.sh\n'; exit 1; }

case "$gate_block" in
  *"exit 1"*|*"exit 2"*)
    printf 'FAIL the escrow gate exits, which would refuse every first install\n'
    fail=1 ;;
  *) printf 'ok   the escrow gate does not exit\n' ;;
esac

case "$gate_block" in
  *operator_error*) printf 'ok   the escrow gate reports as an error\n' ;;
  *) printf 'FAIL the escrow gate does not report anything\n'; fail=1 ;;
esac

case "$gate_block" in
  *"losporctl secrets escrow"*)
    printf 'ok   the escrow gate names the command that resolves it\n' ;;
  *) printf 'FAIL the escrow gate does not say how to resolve it\n'; fail=1 ;;
esac

# The acknowledgement itself: refuses without the exact confirmation, records
# fingerprints and never the keys.
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT INT TERM
mkdir -p "$work/scripts"
cp scripts/acknowledge-secrets-escrow.sh scripts/secrets-escrow-lib.sh scripts/installed-release-state.sh "$work/scripts/"
cp scripts/operator-locale.sh "$work/scripts/" 2>/dev/null || true
mkdir -p "$work/locales" && cp -r locales/. "$work/locales/" 2>/dev/null || true
cat > "$work/.env" <<'EOF'
HOSPITAL_PATIENT_HMAC_KEY=aGFzaC1rZXktdmFsdWU=
HOSPITAL_PATIENT_ENCRYPTION_KEY=ZW5jcnlwdGlvbi1rZXktdmFsdWU=
HOSPITAL_EXPORT_PSEUDONYM_KEY=cHNldWRvbnltLWtleS12YWx1ZQ==
EOF

( cd "$work" && LOSPOR_ESCROW_CONFIRM_INPUT=no sh scripts/acknowledge-secrets-escrow.sh >/dev/null 2>&1 ) \
  && refused=0 || refused=1
check "$refused" 1 "an unconfirmed acknowledgement is refused"
[ ! -f "$work/.secrets-escrowed.v1" ] \
  && printf 'ok   nothing recorded when unconfirmed\n' \
  || { printf 'FAIL recorded despite no confirmation\n'; fail=1; }

( cd "$work" && LOSPOR_ESCROW_CONFIRM_INPUT=ESCROWED sh scripts/acknowledge-secrets-escrow.sh >/dev/null 2>&1 ) \
  && accepted=0 || accepted=1
check "$accepted" 0 "a confirmed acknowledgement is recorded"

if [ -s "$work/.secrets-escrowed.v1" ]; then
  printf 'ok   the marker exists\n'
  grep -q '^patientHmacKeyFingerprint=sha256:' "$work/.secrets-escrowed.v1" \
    && printf 'ok   the marker records a fingerprint\n' \
    || { printf 'FAIL no fingerprint recorded\n'; fail=1; }
  # The one thing this file must never contain.
  if grep -q 'aGFzaC1rZXktdmFsdWU=' "$work/.secrets-escrowed.v1"; then
    printf 'FAIL the marker contains a key\n'; fail=1
  else
    printf 'ok   the marker contains no key material\n'
  fi
else
  printf 'FAIL the marker was not written\n'; fail=1
fi

# Written to the appliance home the probe and doctor read, even when run from a
# release directory -- it used to land in the release, where nothing looked.
mkdir -p "$work/appliance" "$work/release/scripts"
cp "$work/.env" "$work/appliance/.env"
cp scripts/acknowledge-secrets-escrow.sh scripts/secrets-escrow-lib.sh scripts/installed-release-state.sh "$work/release/scripts/"
cp scripts/operator-locale.sh "$work/release/scripts/" 2>/dev/null || true
ln -s "$work/appliance" "$work/release/.lospor-home"
( cd "$work/release" && LOSPOR_ESCROW_CONFIRM_INPUT=ESCROWED sh scripts/acknowledge-secrets-escrow.sh >/dev/null 2>&1 ) || true
[ -s "$work/appliance/.secrets-escrowed.v1" ] && [ ! -e "$work/release/.secrets-escrowed.v1" ] \
  && printf 'ok   the acknowledgement lands in the appliance home, not the release\n' \
  || { printf 'FAIL the acknowledgement did not land in the appliance home\n'; fail=1; }

exit "$fail"
