#!/bin/sh

# The acknowledgement that this installation's secrets are escrowed off the
# appliance, written the same way by acknowledge-secrets-escrow.sh (the operator
# escrowed them by other means) and escrow-secrets.sh (LOSPOR wrote the copy).
#
# It lives in the appliance home, beside .env, where the host probe and doctor
# read it. It used to be written into the release directory the script ran
# from, which no reader looked at, and which the next update replaced.
#
# It records one-way fingerprints of the keys in use, never the keys, so a
# later change of keys shows the acknowledgement as stale.

escrow_fingerprint_of() {
  escrow_value="$(sed -n "s/^$2=//p" "$1/.env" 2>/dev/null | tail -n 1)"
  [ -n "$escrow_value" ] || { printf 'missing\n'; return 0; }
  printf 'sha256:%s\n' "$(printf '%s' "$escrow_value" | sha256sum | awk '{ print $1 }')"
}

# escrow_record_acknowledgement HOME [EXTRA_LINES]
escrow_record_acknowledgement() {
  escrow_home="$1"
  escrow_extra="${2:-}"
  escrow_marker="$escrow_home/.secrets-escrowed.v1"
  escrow_temporary="$escrow_marker.tmp.$$"
  {
    printf 'acknowledgedAtEpoch=%s\n' "$(date -u +%s)"
    printf 'acknowledgedBy=%s\n' "${SUDO_USER:-${USER:-unknown}}"
    printf 'patientHmacKeyFingerprint=%s\n' "$(escrow_fingerprint_of "$escrow_home" HOSPITAL_PATIENT_HMAC_KEY)"
    printf 'patientEncryptionKeyFingerprint=%s\n' "$(escrow_fingerprint_of "$escrow_home" HOSPITAL_PATIENT_ENCRYPTION_KEY)"
    printf 'exportPseudonymKeyFingerprint=%s\n' "$(escrow_fingerprint_of "$escrow_home" HOSPITAL_EXPORT_PSEUDONYM_KEY)"
    [ -z "$escrow_extra" ] || printf '%s\n' "$escrow_extra"
  } > "$escrow_temporary"
  chmod 0600 "$escrow_temporary"
  mv "$escrow_temporary" "$escrow_marker"
}

# The files an escrow copy holds: site.env, .env, advanced.env when present, and
# the whole secrets/ directory. Prints them, or fails when one that must exist
# does not.
escrow_entries() {
  for escrow_required in site.env .env secrets; do
    [ -e "$1/$escrow_required" ] && [ ! -L "$1/$escrow_required" ] || return 1
  done
  if [ -f "$1/advanced.env" ]; then printf 'site.env .env advanced.env secrets\n'; else printf 'site.env .env secrets\n'; fi
}

# Letters and digits that do not look alike, in six groups of five: about 147 bits.
escrow_passphrase_valid() {
  printf '%s\n' "$1" | grep -Eqx '[abcdefghjkmnpqrstuvwxyz23456789]{5}(-[abcdefghjkmnpqrstuvwxyz23456789]{5}){5}'
}

# escrow_write_bundle HOME PASSPHRASE_FILE OUTPUT WORK
#
# Archives the escrowed files, encrypts them to OUTPUT, and decrypts OUTPUT again
# to prove it opens to exactly what is running. The plaintext archive stays in
# WORK, which the caller keeps root-only beside the secrets and removes.
# Restore: openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -in BUNDLE | tar -xz
escrow_write_bundle() {
  escrow_list="$(escrow_entries "$1")" || return 1
  # shellcheck disable=SC2086
  tar -C "$1" -czf "$4/secrets.tar.gz" $escrow_list || return 1
  openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -salt -pass "file:$2" \
    -in "$4/secrets.tar.gz" -out "$3" || return 2
  sync
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -pass "file:$2" \
    -in "$3" -out "$4/check.tar.gz" 2>/dev/null \
    && cmp -s "$4/secrets.tar.gz" "$4/check.tar.gz" || return 3
  rm -f "$4/secrets.tar.gz" "$4/check.tar.gz"
}
