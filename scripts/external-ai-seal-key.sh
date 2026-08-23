#!/bin/sh
# Shared validation for the dedicated external-AI credential seal key. The
# function prints only a raw-key SHA-256 fingerprint; it never prints key bytes
# or the base64 source.

external_ai_seal_key_fingerprint() {
  external_ai_key_file="$1"
  [ -f "$external_ai_key_file" ] && [ ! -L "$external_ai_key_file" ] \
    && [ -s "$external_ai_key_file" ] || return 1
  command -v openssl >/dev/null 2>&1 || return 1
  external_ai_key_encoded="$(tr -d '\r\n' < "$external_ai_key_file")"
  [ "${#external_ai_key_encoded}" -eq 44 ] || return 1
  external_ai_key_raw="$(mktemp "${TMPDIR:-/tmp}/lospor-external-ai-key.XXXXXX")" \
    || return 1
  if ! printf '%s' "$external_ai_key_encoded" \
      | openssl base64 -d -A -out "$external_ai_key_raw" 2>/dev/null \
    || [ "$(wc -c < "$external_ai_key_raw" | tr -d '[:space:]')" != 32 ] \
    || [ "$(openssl base64 -A -in "$external_ai_key_raw")" != "$external_ai_key_encoded" ]; then
    rm -f -- "$external_ai_key_raw"
    return 1
  fi
  external_ai_key_fingerprint="sha256:$(sha256sum "$external_ai_key_raw" | awk '{ print $1 }')"
  rm -f -- "$external_ai_key_raw"
  printf '%s\n' "$external_ai_key_fingerprint"
}
