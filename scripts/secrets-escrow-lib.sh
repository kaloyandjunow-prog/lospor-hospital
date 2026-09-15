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
