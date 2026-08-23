#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
. "$root/scripts/installed-release-state.sh"
if [ "${HOSPITAL_RELEASE_TRANSITION:-}" = 1 ]; then
  release_state_assert_verified_transition "$root"
else
  appliance_home="$(release_state_appliance_home "$root")"
  set +e
  release_state_apply "$appliance_home"
  release_state_result=$?
  set -e
  case "$release_state_result" in
    0) root="$state_release_root" ;;
    10) ;;
    *) exit "$release_state_result" ;;
  esac
fi
cd "$root"
. "$root/scripts/operator-locale.sh"
operator_locale_load "$root"

backup_kind=manual
lock_wait="${HOSPITAL_BACKUP_LOCK_WAIT_SECONDS:-120}"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --kind)
      [ "$#" -ge 2 ] || {
        operator_error "--kind requires a value." "--kind изисква стойност."
        exit 2
      }
      backup_kind="$2"
      shift 2
      ;;
    --wait-seconds)
      [ "$#" -ge 2 ] || {
        operator_error "--wait-seconds requires a value." "--wait-seconds изисква стойност."
        exit 2
      }
      lock_wait="$2"
      shift 2
      ;;
    *)
      operator_error \
        "Usage: scripts/backup-now.sh [--kind manual|pre-update|immutable|pre-restore] [--wait-seconds N]" \
        "Употреба: scripts/backup-now.sh [--kind manual|pre-update|immutable|pre-restore] [--wait-seconds N]"
      exit 2
      ;;
  esac
done
case "$backup_kind" in manual|pre-update|immutable|pre-restore) ;;
  *)
    operator_error "Invalid backup kind: $backup_kind" "Невалиден вид архив: $backup_kind"
    exit 2
    ;;
esac
case "$lock_wait" in
  ''|*[!0-9]*)
    operator_error \
      "Backup lock wait must be a non-negative integer." \
      "Изчакването за заключване на архива трябва да е неотрицателно цяло число."
    exit 2
    ;;
esac

[ -f .env ] || { operator_error "Hospital is not configured." "Болничната система не е конфигурирана."; exit 1; }
sh scripts/ensure-backup-configuration.sh >/dev/null

# Read only the values this wrapper needs. Sourcing a dotenv file executes it;
# an operator's unquoted value containing spaces must remain data, not become a
# host command during a backup.
env_value() {
  sed -n "s/^$1=//p" .env 2>/dev/null \
    | tail -n 1 | tr -d '\r' | sed 's/^"//; s/"$//'
}
[ -n "${HOSPITAL_BACKUP_MANIFEST_HMAC_KEY:-}" ] || HOSPITAL_BACKUP_MANIFEST_HMAC_KEY="$(env_value HOSPITAL_BACKUP_MANIFEST_HMAC_KEY)"
[ -n "${HOSPITAL_PATIENT_HMAC_KEY:-}" ] || HOSPITAL_PATIENT_HMAC_KEY="$(env_value HOSPITAL_PATIENT_HMAC_KEY)"
[ -n "${HOSPITAL_PATIENT_ENCRYPTION_KEY:-}" ] || HOSPITAL_PATIENT_ENCRYPTION_KEY="$(env_value HOSPITAL_PATIENT_ENCRYPTION_KEY)"
[ -n "${HOSPITAL_EXPORT_PSEUDONYM_KEY:-}" ] || HOSPITAL_EXPORT_PSEUDONYM_KEY="$(env_value HOSPITAL_EXPORT_PSEUDONYM_KEY)"
[ -n "${OMOP_PSEUDONYM_SALT:-}" ] || OMOP_PSEUDONYM_SALT="$(env_value OMOP_PSEUDONYM_SALT)"
[ -n "${HOSPITAL_CLINICAL_DOMAIN:-}" ] || HOSPITAL_CLINICAL_DOMAIN="$(env_value HOSPITAL_CLINICAL_DOMAIN)"
[ -n "${HOSPITAL_BACKUP_SITE_ID:-}" ] || HOSPITAL_BACKUP_SITE_ID="$(env_value HOSPITAL_BACKUP_SITE_ID)"
[ -n "${HOSPITAL_BACKUP_APPLIANCE_ID:-}" ] || HOSPITAL_BACKUP_APPLIANCE_ID="$(env_value HOSPITAL_BACKUP_APPLIANCE_ID)"
[ -n "${HOSPITAL_RELEASE:-}" ] || HOSPITAL_RELEASE="$(env_value HOSPITAL_RELEASE)"
[ -n "${HOSPITAL_EXCHANGE_CONTRACT_VERSION:-}" ] || HOSPITAL_EXCHANGE_CONTRACT_VERSION="$(env_value HOSPITAL_EXCHANGE_CONTRACT_VERSION)"
[ -n "${HOSPITAL_DATA_DICTIONARY_VERSION:-}" ] || HOSPITAL_DATA_DICTIONARY_VERSION="$(env_value HOSPITAL_DATA_DICTIONARY_VERSION)"

fingerprint_value() {
  [ -n "$1" ] || return 1
  printf 'sha256:%s\n' "$(printf '%s' "$1" | sha256sum | awk '{ print $1 }')"
}

[ -n "${HOSPITAL_BACKUP_MANIFEST_HMAC_KEY:-}" ] || {
  operator_error \
    "HOSPITAL_BACKUP_MANIFEST_HMAC_KEY is missing; refusing an unauthenticated backup." \
    "HOSPITAL_BACKUP_MANIFEST_HMAC_KEY липсва; отказва се архив без удостоверяване."
  exit 1
}
[ -s secrets/api/site-signing-public.pem ] || {
  operator_error \
    "The Hospital site-signing public key is missing." \
    "Публичният ключ за подписване на болничния сайт липсва."
  exit 1
}
. "$root/scripts/external-ai-seal-key.sh"
. "$root/scripts/mfa-encryption-key.sh"

HOSPITAL_PATIENT_HMAC_KEY_FINGERPRINT="$(fingerprint_value "${HOSPITAL_PATIENT_HMAC_KEY:-}")" \
  || { operator_error "The patient HMAC key is missing." "HMAC ключът за пациентите липсва."; exit 1; }
HOSPITAL_PATIENT_ENCRYPTION_KEY_FINGERPRINT="$(fingerprint_value "${HOSPITAL_PATIENT_ENCRYPTION_KEY:-}")" \
  || { operator_error "The patient encryption key is missing." "Ключът за шифроване на пациентите липсва."; exit 1; }
HOSPITAL_EXPORT_PSEUDONYM_KEY_FINGERPRINT="$(fingerprint_value "${HOSPITAL_EXPORT_PSEUDONYM_KEY:-}")" \
  || { operator_error "The export pseudonym key is missing." "Ключът за псевдонимизиране при износ липсва."; exit 1; }
printf '%s\n' "${OMOP_PSEUDONYM_SALT:-}" | grep -Eq '^[0-9a-f]{64}$' || {
  operator_error \
    "OMOP_PSEUDONYM_SALT must be exactly 32 bytes encoded as lowercase hexadecimal." \
    "OMOP_PSEUDONYM_SALT трябва да бъде точно 32 байта, кодирани като шестнадесетични знаци с малки букви."
  exit 1
}
HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT="$(fingerprint_value "$OMOP_PSEUDONYM_SALT")"
site_signing_der="$(mktemp "${TMPDIR:-/tmp}/lospor-site-signing.XXXXXX")"
trap 'rm -f -- "$site_signing_der"' EXIT HUP INT TERM
openssl pkey -pubin -in secrets/api/site-signing-public.pem \
  -outform DER -out "$site_signing_der" 2>/dev/null || {
    operator_error \
      "The Hospital site-signing public key is invalid." \
      "Публичният ключ за подписване на болничния сайт е невалиден."
    exit 1
  }
HOSPITAL_SITE_SIGNING_KEY_FINGERPRINT="sha256:$(sha256sum "$site_signing_der" | awk '{ print $1 }')"
rm -f -- "$site_signing_der"
trap - EXIT HUP INT TERM
HOSPITAL_EXTERNAL_AI_SEAL_KEY_FINGERPRINT="$(external_ai_seal_key_fingerprint secrets/api/external-ai-seal-key)" \
  || { operator_error "The external-AI seal key is missing or invalid." "Ключът за запечатване на външния ИИ липсва или е невалиден."; exit 1; }
HOSPITAL_MFA_ENCRYPTION_KEY_FINGERPRINT="$(mfa_encryption_key_fingerprint secrets/api/mfa-encryption-key)" \
  || { operator_error "The administrator MFA encryption key is missing or invalid." "Ключът за шифроване на администраторската MFA липсва или е невалиден."; exit 1; }

package_version="$(sed -n 's/^  "version": "\([^"]*\)",$/\1/p' package.json | head -n 1)"
exchange_version="$(awk '
  /"exchangeContract"[[:space:]]*:/ { in_contract=1; next }
  in_contract && /"version"[[:space:]]*:/ {
    value=$0
    sub(/^.*"version"[[:space:]]*:[[:space:]]*"/, "", value)
    sub(/".*$/, "", value)
    print value
    exit
  }
' UPSTREAM_VERSIONS.json)"
[ -n "$package_version" ] && [ -n "$exchange_version" ] || {
  operator_error \
    "Release compatibility metadata is missing." \
    "Метаданните за съвместимост на версията липсват."
  exit 1
}
HOSPITAL_BACKUP_SITE_ID="${HOSPITAL_BACKUP_SITE_ID:-${HOSPITAL_CLINICAL_DOMAIN:-}}"
[ -n "$HOSPITAL_BACKUP_SITE_ID" ] || { operator_error "HOSPITAL_BACKUP_SITE_ID is missing." "HOSPITAL_BACKUP_SITE_ID липсва."; exit 1; }
if [ -z "${HOSPITAL_BACKUP_APPLIANCE_ID:-}" ]; then
  HOSPITAL_BACKUP_APPLIANCE_ID="appliance-$(printf '%s:%s' "$HOSPITAL_BACKUP_SITE_ID" "$HOSPITAL_SITE_SIGNING_KEY_FINGERPRINT" \
    | sha256sum | awk '{ print substr($1, 1, 24) }')"
fi
HOSPITAL_APPLIANCE_RELEASE="${HOSPITAL_RELEASE:-$package_version}"
HOSPITAL_EXCHANGE_CONTRACT_VERSION="${HOSPITAL_EXCHANGE_CONTRACT_VERSION:-$exchange_version}"
HOSPITAL_DATA_DICTIONARY_VERSION="${HOSPITAL_DATA_DICTIONARY_VERSION:-$exchange_version}"
HOSPITAL_BACKUP_TOOL_VERSION="$package_version"
HOSPITAL_BACKUP_KIND="$backup_kind"
HOSPITAL_BACKUP_LOCK_WAIT_SECONDS="$lock_wait"
export HOSPITAL_BACKUP_SITE_ID HOSPITAL_BACKUP_APPLIANCE_ID
export HOSPITAL_APPLIANCE_RELEASE HOSPITAL_EXCHANGE_CONTRACT_VERSION
export HOSPITAL_DATA_DICTIONARY_VERSION HOSPITAL_BACKUP_TOOL_VERSION
export HOSPITAL_BACKUP_KIND HOSPITAL_BACKUP_LOCK_WAIT_SECONDS
export HOSPITAL_PATIENT_HMAC_KEY_FINGERPRINT
export HOSPITAL_PATIENT_ENCRYPTION_KEY_FINGERPRINT
export HOSPITAL_EXPORT_PSEUDONYM_KEY_FINGERPRINT
export HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT
export HOSPITAL_SITE_SIGNING_KEY_FINGERPRINT HOSPITAL_BACKUP_MANIFEST_HMAC_KEY
export HOSPITAL_EXTERNAL_AI_SEAL_KEY_FINGERPRINT
export HOSPITAL_MFA_ENCRYPTION_KEY_FINGERPRINT

# Git Bash on Windows otherwise rewrites this container path to a host path.
MSYS_NO_PATHCONV=1 docker compose run --rm --interactive=false -T \
  -e HOSPITAL_BACKUP_SITE_ID \
  -e HOSPITAL_BACKUP_APPLIANCE_ID \
  -e HOSPITAL_APPLIANCE_RELEASE \
  -e HOSPITAL_EXCHANGE_CONTRACT_VERSION \
  -e HOSPITAL_DATA_DICTIONARY_VERSION \
  -e HOSPITAL_BACKUP_TOOL_VERSION \
  -e HOSPITAL_BACKUP_KIND \
  -e HOSPITAL_BACKUP_LOCK_WAIT_SECONDS \
  -e HOSPITAL_PATIENT_HMAC_KEY_FINGERPRINT \
  -e HOSPITAL_PATIENT_ENCRYPTION_KEY_FINGERPRINT \
  -e HOSPITAL_EXPORT_PSEUDONYM_KEY_FINGERPRINT \
  -e HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT \
  -e HOSPITAL_SITE_SIGNING_KEY_FINGERPRINT \
  -e HOSPITAL_EXTERNAL_AI_SEAL_KEY_FINGERPRINT \
  -e HOSPITAL_MFA_ENCRYPTION_KEY_FINGERPRINT \
  -e HOSPITAL_BACKUP_MANIFEST_HMAC_KEY \
  --entrypoint /bin/sh backup /usr/local/bin/backup-cycle.sh
