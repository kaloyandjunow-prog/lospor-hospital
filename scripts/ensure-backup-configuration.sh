#!/bin/sh
set -eu

# Create or validate the stable, non-PHI identity and authentication material
# used by 1.2 backup manifests. Existing values are never silently replaced:
# changing one makes earlier recovery objects unverifiable or look as though
# they belong to a different appliance.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"
. "$root/scripts/operator-locale.sh"
operator_locale_load "$root"
umask 077

env_file="$root/.env"
[ -f "$env_file" ] || {
  operator_error \
    "Hospital is not configured; .env is missing." \
    "Болничната система не е конфигурирана; .env липсва."
  exit 1
}

env_value() {
  sed -n "s/^$1=//p" "$env_file" 2>/dev/null \
    | tail -n 1 | tr -d '\r' | sed 's/^"//; s/"$//'
}

# Backup identity and fingerprints are generated values, so they belong to
# secrets/appliance.env; .env is recompiled so the next read sees them.
. "$root/scripts/site-config.sh"
if [ -d "$root/.lospor-home" ]; then config_home="$(CDPATH= cd -- "$root/.lospor-home" && pwd -P)"; else config_home="$root"; fi
site_config_ensure_split "$config_home"

append_env() {
  site_config_set "$config_home/secrets/appliance.env" "$1" "$2"
  site_config_compile "$config_home"
}

require_or_append() {
  key="$1"
  expected="$2"
  existing="$(env_value "$key")"
  if [ -n "$existing" ]; then
    [ "$existing" = "$expected" ] || {
      operator_error \
        "$key does not match this appliance; refusing to replace it." \
        "$key не съответства на тази система; отказва се подмяната му."
      exit 1
    }
  else
    append_env "$key" "$expected"
  fi
}

safe_value() {
  [ -n "$1" ] && printf '%s\n' "$1" | grep -Eq '^[A-Za-z0-9._:@+-]+$'
}

fingerprint_value() {
  [ -n "$1" ] || return 1
  printf 'sha256:%s\n' "$(printf '%s' "$1" | sha256sum | awk '{ print $1 }')"
}

mkdir -p secrets/backup
chmod 700 secrets secrets/backup

# The copy under secrets/backup is the local recovery escrow. Hospital IT must
# copy it, with the other non-rotatable secrets, to its encrypted off-host
# escrow. It is intentionally not regenerated on update.
manifest_key="$(env_value HOSPITAL_BACKUP_MANIFEST_HMAC_KEY)"
escrow_file="secrets/backup/manifest-hmac-key"
escrow_key=""
[ ! -f "$escrow_file" ] || escrow_key="$(tr -d '\r\n' < "$escrow_file")"
if [ -n "$manifest_key" ] && [ -n "$escrow_key" ] && [ "$manifest_key" != "$escrow_key" ]; then
  operator_error \
    "The backup manifest authentication key and its local escrow disagree." \
    "Ключът за удостоверяване на манифеста на архива не съвпада с локалното му защитено копие."
  exit 1
fi
if [ -z "$manifest_key" ]; then
  if [ -n "$escrow_key" ]; then
    manifest_key="$escrow_key"
  else
    manifest_key="$(openssl rand -hex 32)"
  fi
  append_env HOSPITAL_BACKUP_MANIFEST_HMAC_KEY "$manifest_key"
fi
[ "${#manifest_key}" -ge 32 ] || {
  operator_error \
    "HOSPITAL_BACKUP_MANIFEST_HMAC_KEY must contain at least 32 characters." \
    "HOSPITAL_BACKUP_MANIFEST_HMAC_KEY трябва да съдържа поне 32 знака."
  exit 1
}
if [ -z "$escrow_key" ]; then
  printf '%s\n' "$manifest_key" > "$escrow_file"
fi
chmod 600 "$escrow_file" "$env_file"

patient_hmac="$(env_value HOSPITAL_PATIENT_HMAC_KEY)"
patient_encryption="$(env_value HOSPITAL_PATIENT_ENCRYPTION_KEY)"
export_pseudonym="$(env_value HOSPITAL_EXPORT_PSEUDONYM_KEY)"
omop_pseudonym_salt="$(env_value OMOP_PSEUDONYM_SALT)"
external_ai_seal_file="secrets/api/external-ai-seal-key"
mfa_encryption_file="secrets/api/mfa-encryption-key"
ehr_transport_seal_file="secrets/api/ehr-transport-seal-key"
patient_hmac_fp="$(fingerprint_value "$patient_hmac")" \
  || { operator_error "HOSPITAL_PATIENT_HMAC_KEY is missing." "HOSPITAL_PATIENT_HMAC_KEY липсва."; exit 1; }
patient_encryption_fp="$(fingerprint_value "$patient_encryption")" \
  || { operator_error "HOSPITAL_PATIENT_ENCRYPTION_KEY is missing." "HOSPITAL_PATIENT_ENCRYPTION_KEY липсва."; exit 1; }
export_pseudonym_fp="$(fingerprint_value "$export_pseudonym")" \
  || { operator_error "HOSPITAL_EXPORT_PSEUDONYM_KEY is missing." "HOSPITAL_EXPORT_PSEUDONYM_KEY липсва."; exit 1; }
printf '%s\n' "$omop_pseudonym_salt" | grep -Eq '^[0-9a-f]{64}$' || {
  operator_error \
    "OMOP_PSEUDONYM_SALT must be exactly 32 bytes encoded as lowercase hexadecimal." \
    "OMOP_PSEUDONYM_SALT трябва да бъде точно 32 байта, кодирани като шестнадесетични знаци с малки букви."
  exit 1
}
omop_pseudonym_salt_fp="$(fingerprint_value "$omop_pseudonym_salt")"

[ -s "$external_ai_seal_file" ] && [ ! -L "$external_ai_seal_file" ] || {
  operator_error \
    "The external-AI seal key is missing or unsafe." \
    "Ключът за запечатване на външния ИИ липсва или е небезопасен."
  exit 1
}
external_ai_raw="$(mktemp "${TMPDIR:-/tmp}/lospor-external-ai-key.XXXXXX")"
external_ai_encoded="$(tr -d '\r\n' < "$external_ai_seal_file")"
[ "${#external_ai_encoded}" -eq 44 ] \
  && printf '%s' "$external_ai_encoded" | openssl base64 -d -A -out "$external_ai_raw" 2>/dev/null \
  && [ "$(wc -c < "$external_ai_raw" | tr -d '[:space:]')" = 32 ] \
  && [ "$(openssl base64 -A -in "$external_ai_raw")" = "$external_ai_encoded" ] || {
    rm -f -- "$external_ai_raw"
    operator_error \
      "The external-AI seal key is not canonical base64 for exactly 32 bytes." \
      "Ключът за запечатване на външния ИИ не е каноничен base64 за точно 32 байта."
    exit 1
  }
external_ai_seal_fp="sha256:$(sha256sum "$external_ai_raw" | awk '{ print $1 }')"
rm -f -- "$external_ai_raw"

. "$root/scripts/ehr-transport-seal-key.sh"
ehr_transport_seal_fp="$(ehr_transport_seal_key_fingerprint "$ehr_transport_seal_file")" || {
  operator_error \
    "The EHR transport seal key is missing or invalid." \
    "Ключът за запечатване на EHR транспорта липсва или е невалиден."
  exit 1
}

. "$root/scripts/mfa-encryption-key.sh"
mfa_encryption_fp="$(mfa_encryption_key_fingerprint "$mfa_encryption_file")" || {
  operator_error \
    "The administrator MFA encryption key is missing or invalid." \
    "Ключът за шифроване на администраторската MFA липсва или е невалиден."
  exit 1
}

site_public_key="secrets/api/site-signing-public.pem"
[ -s "$site_public_key" ] || {
  operator_error \
    "The Hospital site-signing public key is missing." \
    "Публичният ключ за подписване на болничния сайт липсва."
  exit 1
}
site_signing_der="$(mktemp "${TMPDIR:-/tmp}/lospor-site-signing.XXXXXX")"
trap 'rm -f -- "$site_signing_der"' EXIT HUP INT TERM
openssl pkey -pubin -in "$site_public_key" -outform DER -out "$site_signing_der" 2>/dev/null || {
  operator_error \
    "The Hospital site-signing public key is invalid." \
    "Публичният ключ за подписване на болничния сайт е невалиден."
  exit 1
}
site_signing_fp="sha256:$(sha256sum "$site_signing_der" | awk '{ print $1 }')"
rm -f -- "$site_signing_der"
trap - EXIT HUP INT TERM

require_or_append HOSPITAL_PATIENT_HMAC_KEY_FINGERPRINT "$patient_hmac_fp"
require_or_append HOSPITAL_PATIENT_ENCRYPTION_KEY_FINGERPRINT "$patient_encryption_fp"
require_or_append HOSPITAL_EXPORT_PSEUDONYM_KEY_FINGERPRINT "$export_pseudonym_fp"
require_or_append HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT "$omop_pseudonym_salt_fp"
require_or_append HOSPITAL_SITE_SIGNING_KEY_FINGERPRINT "$site_signing_fp"
require_or_append HOSPITAL_EXTERNAL_AI_SEAL_KEY_FINGERPRINT "$external_ai_seal_fp"
require_or_append HOSPITAL_MFA_ENCRYPTION_KEY_FINGERPRINT "$mfa_encryption_fp"
require_or_append HOSPITAL_EHR_TRANSPORT_SEAL_KEY_FINGERPRINT "$ehr_transport_seal_fp"

site_id="$(env_value HOSPITAL_BACKUP_SITE_ID)"
if [ -z "$site_id" ]; then
  site_id="$(env_value HOSPITAL_CLINICAL_DOMAIN)"
  safe_value "$site_id" || {
    operator_error \
      "HOSPITAL_CLINICAL_DOMAIN cannot be used as a backup site identity." \
      "HOSPITAL_CLINICAL_DOMAIN не може да се използва като идентификатор на мястото за архивиране."
    exit 1
  }
  append_env HOSPITAL_BACKUP_SITE_ID "$site_id"
fi
safe_value "$site_id" || { operator_error "HOSPITAL_BACKUP_SITE_ID is invalid." "HOSPITAL_BACKUP_SITE_ID е невалиден."; exit 1; }

appliance_id="$(env_value HOSPITAL_BACKUP_APPLIANCE_ID)"
if [ -z "$appliance_id" ]; then
  appliance_id="appliance-$(printf '%s:%s' "$site_id" "$site_signing_fp" \
    | sha256sum | awk '{ print substr($1, 1, 24) }')"
  append_env HOSPITAL_BACKUP_APPLIANCE_ID "$appliance_id"
fi
safe_value "$appliance_id" || { operator_error "HOSPITAL_BACKUP_APPLIANCE_ID is invalid." "HOSPITAL_BACKUP_APPLIANCE_ID е невалиден."; exit 1; }

# The hook is an operator-owned executable mounted into the backup container.
# The generated default explicitly defers (exit 75), so a local backup can be
# green without falsely claiming that an off-host system acknowledged it.
hook_file="secrets/backup/offhost-copy"
if [ ! -e "$hook_file" ]; then
  cp infra/postgres/offhost-deferred.sh "$hook_file"
  chmod 700 "$hook_file"
fi
[ -f "$hook_file" ] && [ ! -L "$hook_file" ] || {
  operator_error \
    "The off-host backup hook must be a regular file, not a symlink." \
    "Механизмът за външно копиране на архива трябва да е обикновен файл, а не символна връзка."
  exit 1
}
chmod 700 "$hook_file"

operator_say \
  "Backup authentication and appliance identity are ready." \
  "Удостоверяването на архивите и идентичността на системата са готови."
