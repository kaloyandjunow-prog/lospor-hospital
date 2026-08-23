#!/bin/sh
# Validate the API-only key that protects administrator TOTP seeds. Only the
# raw-key SHA-256 fingerprint is returned; key bytes are never printed.

mfa_encryption_key_fingerprint() {
  mfa_key_file="$1"
  [ -f "$mfa_key_file" ] && [ ! -L "$mfa_key_file" ] && [ -s "$mfa_key_file" ] || return 1
  command -v openssl >/dev/null 2>&1 || return 1
  mfa_key_encoded="$(tr -d '\r\n' < "$mfa_key_file")"
  [ "${#mfa_key_encoded}" -eq 44 ] || return 1
  mfa_key_raw="$(mktemp "${TMPDIR:-/tmp}/lospor-mfa-key.XXXXXX")" || return 1
  if ! printf '%s' "$mfa_key_encoded" \
      | openssl base64 -d -A -out "$mfa_key_raw" 2>/dev/null \
    || [ "$(wc -c < "$mfa_key_raw" | tr -d '[:space:]')" != 32 ] \
    || [ "$(openssl base64 -A -in "$mfa_key_raw")" != "$mfa_key_encoded" ]; then
    rm -f -- "$mfa_key_raw"
    return 1
  fi
  mfa_key_fingerprint="sha256:$(sha256sum "$mfa_key_raw" | awk '{ print $1 }')"
  rm -f -- "$mfa_key_raw"
  printf '%s\n' "$mfa_key_fingerprint"
}
