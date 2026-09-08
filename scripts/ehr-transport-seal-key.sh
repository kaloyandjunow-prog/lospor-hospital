#!/bin/sh
# Validate the API-only key that seals an EHR transport credential — the FHIR
# bearer token or OAuth2 client secret a site configures from Status. Only the
# raw-key SHA-256 fingerprint is returned; key bytes are never printed.
#
# The fingerprint is what makes a restore honest. The credential is sealed with
# this key and stored in the database, so restoring a database onto an appliance
# holding a different key leaves a credential that cannot be decrypted — and
# without a fingerprint to compare, nothing notices until the site's first
# delivery to their hospital system fails for a reason no one can see.

ehr_transport_seal_key_fingerprint() {
  ehr_key_file="$1"
  [ -f "$ehr_key_file" ] && [ ! -L "$ehr_key_file" ] && [ -s "$ehr_key_file" ] || return 1
  command -v openssl >/dev/null 2>&1 || return 1
  ehr_key_encoded="$(tr -d '\r\n' < "$ehr_key_file")"
  [ "${#ehr_key_encoded}" -eq 44 ] || return 1
  ehr_key_raw="$(mktemp "${TMPDIR:-/tmp}/lospor-ehr-transport-key.XXXXXX")" || return 1
  if ! printf '%s' "$ehr_key_encoded" \
      | openssl base64 -d -A -out "$ehr_key_raw" 2>/dev/null \
    || [ "$(wc -c < "$ehr_key_raw" | tr -d '[:space:]')" != 32 ] \
    || [ "$(openssl base64 -A -in "$ehr_key_raw")" != "$ehr_key_encoded" ]; then
    rm -f -- "$ehr_key_raw"
    return 1
  fi
  ehr_key_fingerprint="sha256:$(sha256sum "$ehr_key_raw" | awk '{ print $1 }')"
  rm -f -- "$ehr_key_raw"
  printf '%s\n' "$ehr_key_fingerprint"
}
