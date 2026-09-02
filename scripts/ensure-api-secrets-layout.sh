#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"

umask 077
mkdir -p secrets/api
chmod 700 secrets/api

env_has_external_ai_fingerprint=0
if [ -f .env ] && grep -Eq '^HOSPITAL_EXTERNAL_AI_SEAL_KEY_FINGERPRINT=sha256:[0-9a-f]{64}$' .env; then
  env_has_external_ai_fingerprint=1
fi
external_ai_seal_key="secrets/api/external-ai-seal-key"
if [ ! -s "$external_ai_seal_key" ]; then
  [ "$env_has_external_ai_fingerprint" -eq 0 ] || {
    echo "The external-AI seal key is missing; refusing to replace an established appliance key." >&2
    exit 1
  }
  command -v openssl >/dev/null 2>&1 || {
    echo "OpenSSL is required to provision the external-AI seal key." >&2
    exit 1
  }
  openssl rand -base64 32 | tr -d '\n' > "$external_ai_seal_key"
  printf '\n' >> "$external_ai_seal_key"
fi
chmod 600 "$external_ai_seal_key"

# The EHR adapter seal key, back-filled the same way.
#
# generate-secrets.sh runs at install only, so without this every appliance
# that upgrades into a release carrying the adapter would have no key and no
# way to configure a transport — the feature would work on new installs and be
# quietly unavailable on every existing one.
env_has_ehr_transport_fingerprint=0
if [ -f .env ] && grep -Eq '^HOSPITAL_EHR_TRANSPORT_SEAL_KEY_FINGERPRINT=sha256:[0-9a-f]{64}$' .env; then
  env_has_ehr_transport_fingerprint=1
fi
ehr_transport_seal_key="secrets/api/ehr-transport-seal-key"
if [ ! -s "$ehr_transport_seal_key" ]; then
  # A recorded fingerprint means this appliance already had a key, and every
  # transport credential in its database is sealed with it. Minting a fresh one
  # would not restore access, it would make the loss permanent and silent.
  [ "$env_has_ehr_transport_fingerprint" -eq 0 ] || {
    echo "The EHR transport seal key is missing; refusing to replace an established appliance key." >&2
    exit 1
  }
  command -v openssl >/dev/null 2>&1 || {
    echo "OpenSSL is required to provision the EHR transport seal key." >&2
    exit 1
  }
  openssl rand -base64 32 | tr -d '\n' > "$ehr_transport_seal_key"
  printf '\n' >> "$ehr_transport_seal_key"
fi
chmod 600 "$ehr_transport_seal_key"

# Canonical standard base64 for exactly 32 bytes, as for the keys above.
# Rejecting alternate encodings is what keeps the backup fingerprint
# deterministic: the same key spelled two ways would fingerprint two ways, and a
# restore would refuse a key that is in fact correct.
ehr_transport_raw="$(mktemp "${TMPDIR:-/tmp}/lospor-ehr-transport-key.XXXXXX")"
trap 'rm -f -- "$ehr_transport_raw"' EXIT HUP INT TERM
ehr_transport_encoded="$(tr -d '\r\n' < "$ehr_transport_seal_key")"
[ "${#ehr_transport_encoded}" -eq 44 ] \
  && printf '%s' "$ehr_transport_encoded" | openssl base64 -d -A -out "$ehr_transport_raw" 2>/dev/null \
  && [ "$(wc -c < "$ehr_transport_raw" | tr -d '[:space:]')" = 32 ] \
  && [ "$(openssl base64 -A -in "$ehr_transport_raw")" = "$ehr_transport_encoded" ] || {
    echo "The EHR transport seal key is not canonical base64 for exactly 32 bytes." >&2
    exit 1
  }
rm -f -- "$ehr_transport_raw"
trap - EXIT HUP INT TERM

# Canonical standard base64 for exactly 32 bytes. Rejecting alternate text
# encodings keeps the escrow and raw-byte backup fingerprint deterministic.
external_ai_raw="$(mktemp "${TMPDIR:-/tmp}/lospor-external-ai-key.XXXXXX")"
trap 'rm -f -- "$external_ai_raw"' EXIT HUP INT TERM
external_ai_encoded="$(tr -d '\r\n' < "$external_ai_seal_key")"
[ "${#external_ai_encoded}" -eq 44 ] \
  && printf '%s' "$external_ai_encoded" | openssl base64 -d -A -out "$external_ai_raw" 2>/dev/null \
  && [ "$(wc -c < "$external_ai_raw" | tr -d '[:space:]')" = 32 ] \
  && [ "$(openssl base64 -A -in "$external_ai_raw")" = "$external_ai_encoded" ] || {
    echo "The external-AI seal key is not canonical base64 for exactly 32 bytes." >&2
    exit 1
  }
rm -f -- "$external_ai_raw"
trap - EXIT HUP INT TERM

env_has_mfa_fingerprint=0
if [ -f .env ] && grep -Eq '^HOSPITAL_MFA_ENCRYPTION_KEY_FINGERPRINT=sha256:[0-9a-f]{64}$' .env; then
  env_has_mfa_fingerprint=1
fi
mfa_encryption_key="secrets/api/mfa-encryption-key"
if [ ! -s "$mfa_encryption_key" ]; then
  [ "$env_has_mfa_fingerprint" -eq 0 ] || {
    echo "The administrator MFA encryption key is missing; refusing to replace an established appliance key." >&2
    exit 1
  }
  command -v openssl >/dev/null 2>&1 || {
    echo "OpenSSL is required to provision the administrator MFA encryption key." >&2
    exit 1
  }
  openssl rand -base64 32 | tr -d '\n' > "$mfa_encryption_key"
  printf '\n' >> "$mfa_encryption_key"
fi
chmod 600 "$mfa_encryption_key"

mfa_raw="$(mktemp "${TMPDIR:-/tmp}/lospor-mfa-key.XXXXXX")"
trap 'rm -f -- "$mfa_raw"' EXIT HUP INT TERM
mfa_encoded="$(tr -d '\r\n' < "$mfa_encryption_key")"
[ "${#mfa_encoded}" -eq 44 ] \
  && printf '%s' "$mfa_encoded" | openssl base64 -d -A -out "$mfa_raw" 2>/dev/null \
  && [ "$(wc -c < "$mfa_raw" | tr -d '[:space:]')" = 32 ] \
  && [ "$(openssl base64 -A -in "$mfa_raw")" = "$mfa_encoded" ] || {
    echo "The administrator MFA encryption key is not canonical base64 for exactly 32 bytes." >&2
    exit 1
  }
rm -f -- "$mfa_raw"
trap - EXIT HUP INT TERM

# One-time migration for appliances created before Status existed. Move only
# the exact API/Central allowlist; never copy Status credentials into this
# directory. Existing files in the destination win so an upgrade cannot
# silently replace a newer certificate.
for name in \
  site-signing-private.pem \
  site-signing-public.pem \
  site-client-key.pem \
  site-client.csr \
  site-client-cert.pem \
  central-ca.pem
do
  if [ -e "secrets/$name" ] && [ ! -e "secrets/api/$name" ]; then
    mv "secrets/$name" "secrets/api/$name"
  fi
done
