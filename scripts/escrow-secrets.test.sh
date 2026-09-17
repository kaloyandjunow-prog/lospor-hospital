#!/bin/sh
set -eu

# losporctl secrets escrow: the copy leaves encrypted, is proven to decrypt to
# exactly the secrets in use before anything is recorded, lands where Go-live
# reads the acknowledgement, and never lands on the server's own disk.

source_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM

tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; [ ! -f "$work/out" ] || sed 's/^/    /' "$work/out" >&2; exit 1; }

# A release that finds its appliance home through .lospor-home, as installed.
release="$work/release"
home="$work/appliance"
mkdir -p "$release/scripts" "$home/secrets/api" "$work/usb"
for script in escrow-secrets.sh secrets-escrow-lib.sh installed-release-state.sh operator-locale.sh; do
  cp "$source_root/scripts/$script" "$release/scripts/"
done
ln -s "$home" "$release/.lospor-home"
printf 'HOSPITAL_CLINICAL_DOMAIN=hospital.test\n' > "$home/site.env"
cat > "$home/.env" <<'EOF'
HOSPITAL_PATIENT_HMAC_KEY=aGFzaC1rZXktdmFsdWU=
HOSPITAL_PATIENT_ENCRYPTION_KEY=ZW5jcnlwdGlvbi1rZXktdmFsdWU=
HOSPITAL_EXPORT_PSEUDONYM_KEY=cHNldWRvbnltLWtleS12YWx1ZQ==
EOF
printf 'POSTGRES_PASSWORD=very-secret\n' > "$home/secrets/appliance.env"
printf 'mfa-key-bytes\n' > "$home/secrets/api/mfa-encryption-key"
printf 'correct horse battery staple, twice over\n' > "$work/passphrase"

escrow() {
  env HOSPITAL_ESCROW_TEST_ONLY=1 LOSPOR_DEFAULT_LOCALE=en "$@" \
    sh "$release/scripts/escrow-secrets.sh" $escrow_args > "$work/out" 2>&1
}

# 1. The server's own disk is refused: a copy there dies with the server.
escrow_args="$work/usb --passphrase-file $work/passphrase"
if escrow; then fail "a destination on the server's own disk was accepted"; fi
grep -Fq "on this server's own disk" "$work/out" || fail "the same-disk refusal was not explained"
[ -z "$(ls -A "$work/usb")" ] && [ ! -e "$home/.secrets-escrowed.v1" ] || fail "something was written despite the refusal"
ok "a destination on the server's own disk is refused, and nothing is written"

# 2. The whole round trip.
escrow HOSPITAL_ESCROW_TEST_ALLOW_SAME_DEVICE=1 || fail "a valid escrow failed"
bundle="$(ls "$work/usb" | grep '^lospor-hospital-secrets-.*\.tar\.gz\.enc$')"
[ -n "$bundle" ] && [ -s "$work/usb/$bundle" ] || fail "no bundle was written"
(cd "$work/usb" && sha256sum -c --quiet "$bundle.sha256") || fail "the bundle's SHA-256 sidecar does not match"
if grep -aq "very-secret\|aGFzaC1rZXktdmFsdWU=" "$work/usb/$bundle"; then fail "the bundle is not encrypted"; fi
mkdir "$work/restored"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -pass "file:$work/passphrase" -in "$work/usb/$bundle" \
  | tar -xz -C "$work/restored" || fail "the documented restore command did not open the bundle"
for file in site.env .env secrets/appliance.env secrets/api/mfa-encryption-key; do
  cmp -s "$home/$file" "$work/restored/$file" || fail "restored $file differs from the one in use"
done
ok "the bundle is encrypted, matches its sidecar, and the documented command restores every secret"

marker="$home/.secrets-escrowed.v1"
[ -s "$marker" ] && [ ! -e "$release/.secrets-escrowed.v1" ] || fail "the acknowledgement is not in the appliance home"
grep -qx "method=losporctl-secrets-escrow" "$marker" || fail "the acknowledgement does not say how it was made"
grep -qx "escrowBundle=$bundle" "$marker" || fail "the acknowledgement does not name the bundle"
grep -qx "patientHmacKeyFingerprint=sha256:$(printf '%s' 'aGFzaC1rZXktdmFsdWU=' | sha256sum | awk '{print $1}')" "$marker" \
  || fail "the acknowledgement does not fingerprint the key in use"
if grep -q "aGFzaC1rZXktdmFsdWU=\|very-secret" "$marker"; then fail "the acknowledgement contains key material"; fi
[ -z "$(find "$home" -maxdepth 1 -name '.escrow-work.*')" ] || fail "the plaintext working copy was left behind"
ok "the acknowledgement lands in the appliance home with fingerprints only, and no plaintext is left"

# 3. A wrong passphrase opens nothing.
printf 'not the passphrase at all, sorry\n' > "$work/wrong"
if openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -pass "file:$work/wrong" -in "$work/usb/$bundle" 2>/dev/null | tar -xz -C "$work/restored" 2>/dev/null; then
  fail "a wrong passphrase opened the bundle"
fi
ok "a wrong passphrase opens nothing"

# 4. No terminal and no passphrase file: nothing to show a new passphrase on.
rm -f "$marker"
escrow_args="$work/usb"
if escrow HOSPITAL_ESCROW_TEST_ALLOW_SAME_DEVICE=1 < /dev/null; then fail "a generated passphrase was used with no terminal to show it"; fi
grep -Fq "No terminal to show a new passphrase" "$work/out" || fail "the missing terminal was not explained"
[ ! -e "$marker" ] || fail "an acknowledgement was recorded without a usable copy"
ok "a generated passphrase needs a terminal to be shown on"

# 5. Refusals that must record nothing.
before="$(ls "$work/usb" | wc -l | tr -d ' ')"
printf 'short\n' > "$work/short"
escrow_args="$work/usb --passphrase-file $work/short"
if escrow HOSPITAL_ESCROW_TEST_ALLOW_SAME_DEVICE=1; then fail "a short passphrase was accepted"; fi
escrow_args="relative/usb --passphrase-file $work/passphrase"
if escrow HOSPITAL_ESCROW_TEST_ALLOW_SAME_DEVICE=1; then fail "a relative destination was accepted"; fi
escrow_args="$work/missing --passphrase-file $work/passphrase"
if escrow HOSPITAL_ESCROW_TEST_ALLOW_SAME_DEVICE=1; then fail "a missing destination was accepted"; fi
ln -s "$work/usb" "$work/usb-link"
escrow_args="$work/usb-link --passphrase-file $work/passphrase"
if escrow HOSPITAL_ESCROW_TEST_ALLOW_SAME_DEVICE=1; then fail "a symlinked destination was accepted"; fi
mv "$home/secrets" "$home/secrets.away"
escrow_args="$work/usb --passphrase-file $work/passphrase"
if escrow HOSPITAL_ESCROW_TEST_ALLOW_SAME_DEVICE=1; then fail "an incomplete set of secrets was escrowed"; fi
mv "$home/secrets.away" "$home/secrets"
[ "$(ls "$work/usb" | wc -l | tr -d ' ')" = "$before" ] && [ ! -e "$marker" ] || fail "a refused escrow wrote something"
ok "a short passphrase, a relative, missing or symlinked destination, and missing secrets are refused"

# 6. losporctl offers it and passes the arguments through.
grep -q '^  secrets escrow DIRECTORY ' "$source_root/scripts/losporctl.sh" || fail "losporctl help does not list secrets escrow"
grep -q 'run escrow-secrets.sh "\$@"' "$source_root/scripts/losporctl.sh" || fail "losporctl does not run escrow-secrets.sh"
ok "losporctl secrets escrow runs this script"

echo "escrow-secrets tests passed ($tests)"
