#!/bin/sh
set -eu

umask 077

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

restore_mode=temporary
case "${1:-}" in
  --in-place) restore_mode=in-place; shift ;;
  --temporary) shift ;;
esac
if [ "$#" -ne 1 ]; then
  operator_error \
    "Usage: scripts/restore-backup.sh [--temporary|--in-place] backups/lospor-...backup" \
    "Употреба: scripts/restore-backup.sh [--temporary|--in-place] backups/lospor-...backup"
  exit 2
fi
requested_artifact="$1"
case "$requested_artifact" in
  backups/lospor-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z-*.backup) ;;
  *)
    operator_error \
      "Restore accepts only a canonical backups/lospor-...backup path." \
      "Възстановяването приема само каноничен път backups/lospor-...backup."
    exit 2
    ;;
esac
case "$requested_artifact" in
  *../*|*/../*|*//*|*\\*) operator_error "Unsafe backup path." "Небезопасен път към архив."; exit 2 ;;
esac

[ -f .env ] || { operator_error "Hospital is not configured." "Болничната система не е конфигурирана."; exit 1; }
# `backups` here is a symlink on every real appliance: this script cd's to the
# release root above, and activate-verified-release.sh links that root's
# `backups` at the appliance home's directory. Refusing every symlink outright
# therefore refused every appliance -- the documented restore command failed
# immediately with "Hospital backup directory is missing or unsafe", both for
# the safe --temporary drill and for the --in-place emergency. Since
# rollback_policy is backup-required, restoring a verified backup is THE
# supported recovery from a failed update, so this made that recovery
# unreachable.
#
# The check's intent was to stop a planted symlink redirecting restore reads
# somewhere else. That intent is kept: the link is followed, but it must resolve
# to exactly this appliance's own backups directory.
restore_backups_target="$(CDPATH= cd -- backups 2>/dev/null && pwd -P)" || restore_backups_target=""
restore_backups_expected="$(CDPATH= cd -- "$appliance_home/backups" 2>/dev/null && pwd -P)" || restore_backups_expected=""
[ -d backups ] \
  && [ -n "$restore_backups_target" ] \
  && [ -n "$restore_backups_expected" ] \
  && [ "$restore_backups_target" = "$restore_backups_expected" ] \
  || { operator_error "Hospital backup directory is missing or unsafe." "Директорията за болнични архиви липсва или е небезопасна."; exit 1; }

backup_root="$(CDPATH= cd -- backups && pwd -P)" || exit 1
artifact_host="$root/$requested_artifact"
[ -d "$artifact_host" ] && [ ! -L "$artifact_host" ] || {
  operator_error \
    "Backup object is missing or is a symlink." \
    "Обектът на архива липсва или е символна връзка."
  exit 1
}
artifact_parent="$(CDPATH= cd -- "$(dirname "$artifact_host")" && pwd -P)" || exit 1
[ "$artifact_parent" = "$backup_root" ] || {
  operator_error \
    "Backup object is outside the approved directory." \
    "Обектът на архива е извън разрешената директория."
  exit 2
}
artifact_name="$(basename "$artifact_host")"
artifact_container="/backups/$artifact_name"

env_value() {
  sed -n "s/^$1=//p" .env 2>/dev/null \
    | tail -n 1 | tr -d '\r' | sed 's/^"//; s/"$//'
}
[ -n "${HOSPITAL_BACKUP_MANIFEST_HMAC_KEY:-}" ] || HOSPITAL_BACKUP_MANIFEST_HMAC_KEY="$(env_value HOSPITAL_BACKUP_MANIFEST_HMAC_KEY)"
[ -n "${HOSPITAL_PATIENT_HMAC_KEY:-}" ] || HOSPITAL_PATIENT_HMAC_KEY="$(env_value HOSPITAL_PATIENT_HMAC_KEY)"
[ -n "${HOSPITAL_PATIENT_ENCRYPTION_KEY:-}" ] || HOSPITAL_PATIENT_ENCRYPTION_KEY="$(env_value HOSPITAL_PATIENT_ENCRYPTION_KEY)"
[ -n "${HOSPITAL_EXPORT_PSEUDONYM_KEY:-}" ] || HOSPITAL_EXPORT_PSEUDONYM_KEY="$(env_value HOSPITAL_EXPORT_PSEUDONYM_KEY)"
[ -n "${OMOP_PSEUDONYM_SALT:-}" ] || OMOP_PSEUDONYM_SALT="$(env_value OMOP_PSEUDONYM_SALT)"
persisted_omop_pseudonym_salt_fingerprint="$(env_value HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT)"
[ -n "${HOSPITAL_POSTGRES_PASSWORD:-}" ] || HOSPITAL_POSTGRES_PASSWORD="$(env_value HOSPITAL_POSTGRES_PASSWORD)"
[ -n "${HOSPITAL_CLINICAL_DOMAIN:-}" ] || HOSPITAL_CLINICAL_DOMAIN="$(env_value HOSPITAL_CLINICAL_DOMAIN)"
[ -n "${HOSPITAL_BACKUP_SITE_ID:-}" ] || HOSPITAL_BACKUP_SITE_ID="$(env_value HOSPITAL_BACKUP_SITE_ID)"
[ -n "${HOSPITAL_BACKUP_APPLIANCE_ID:-}" ] || HOSPITAL_BACKUP_APPLIANCE_ID="$(env_value HOSPITAL_BACKUP_APPLIANCE_ID)"
[ -n "${HOSPITAL_RELEASE:-}" ] || HOSPITAL_RELEASE="$(env_value HOSPITAL_RELEASE)"
[ -n "${HOSPITAL_EXCHANGE_CONTRACT_VERSION:-}" ] || HOSPITAL_EXCHANGE_CONTRACT_VERSION="$(env_value HOSPITAL_EXCHANGE_CONTRACT_VERSION)"
[ -n "${HOSPITAL_DATA_DICTIONARY_VERSION:-}" ] || HOSPITAL_DATA_DICTIONARY_VERSION="$(env_value HOSPITAL_DATA_DICTIONARY_VERSION)"
[ -n "${HOSPITAL_RESTORE_DATABASE_RESERVE_BYTES:-}" ] || HOSPITAL_RESTORE_DATABASE_RESERVE_BYTES="$(env_value HOSPITAL_RESTORE_DATABASE_RESERVE_BYTES)"
[ -n "${HOSPITAL_RESTORE_SPACE_MULTIPLIER_PERCENT:-}" ] || HOSPITAL_RESTORE_SPACE_MULTIPLIER_PERCENT="$(env_value HOSPITAL_RESTORE_SPACE_MULTIPLIER_PERCENT)"

fingerprint_value() {
  [ -n "$1" ] || return 1
  printf 'sha256:%s\n' "$(printf '%s' "$1" | sha256sum | awk '{ print $1 }')"
}

[ -n "${HOSPITAL_BACKUP_MANIFEST_HMAC_KEY:-}" ] || {
  operator_error \
    "HOSPITAL_BACKUP_MANIFEST_HMAC_KEY is missing; authenticated restore is unavailable." \
    "HOSPITAL_BACKUP_MANIFEST_HMAC_KEY липсва; удостоверено възстановяване не е достъпно."
  exit 1
}
[ -s secrets/api/site-signing-public.pem ] || {
  operator_error \
    "Hospital site-signing public key is missing." \
    "Публичният ключ за подписване на болничния сайт липсва."
  exit 1
}
. "$root/scripts/external-ai-seal-key.sh"
. "$root/scripts/mfa-encryption-key.sh"
HOSPITAL_PATIENT_HMAC_KEY_FINGERPRINT="$(fingerprint_value "${HOSPITAL_PATIENT_HMAC_KEY:-}")" \
  || { operator_error "Patient HMAC key is missing." "HMAC ключът за пациентите липсва."; exit 1; }
HOSPITAL_PATIENT_ENCRYPTION_KEY_FINGERPRINT="$(fingerprint_value "${HOSPITAL_PATIENT_ENCRYPTION_KEY:-}")" \
  || { operator_error "Patient encryption key is missing." "Ключът за шифроване на пациентите липсва."; exit 1; }
HOSPITAL_EXPORT_PSEUDONYM_KEY_FINGERPRINT="$(fingerprint_value "${HOSPITAL_EXPORT_PSEUDONYM_KEY:-}")" \
  || { operator_error "Export pseudonym key is missing." "Ключът за псевдонимизиране при износ липсва."; exit 1; }
printf '%s\n' "${OMOP_PSEUDONYM_SALT:-}" | grep -Eq '^[0-9a-f]{64}$' || {
  operator_error \
    "OMOP_PSEUDONYM_SALT must be exactly 32 bytes encoded as lowercase hexadecimal." \
    "OMOP_PSEUDONYM_SALT трябва да бъде точно 32 байта, кодирани като шестнадесетични знаци с малки букви."
  exit 1
}
HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT="$(fingerprint_value "$OMOP_PSEUDONYM_SALT")"
[ "$persisted_omop_pseudonym_salt_fingerprint" = "$HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT" ] || {
  operator_error \
    "The OMOP pseudonym salt does not match this appliance backup identity; restore was not started." \
    "Солта за OMOP псевдоними не съответства на идентичността за архивиране на тази система; възстановяването не е стартирано."
  exit 1
}
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
  || { operator_error "External-AI seal key is missing or invalid." "Ключът за запечатване на външния ИИ липсва или е невалиден."; exit 1; }
HOSPITAL_MFA_ENCRYPTION_KEY_FINGERPRINT="$(mfa_encryption_key_fingerprint secrets/api/mfa-encryption-key)" \
  || { operator_error "Administrator MFA encryption key is missing or invalid." "Ключът за шифроване на администраторската MFA липсва или е невалиден."; exit 1; }

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
export HOSPITAL_BACKUP_SITE_ID HOSPITAL_BACKUP_APPLIANCE_ID HOSPITAL_APPLIANCE_RELEASE
export HOSPITAL_EXCHANGE_CONTRACT_VERSION HOSPITAL_DATA_DICTIONARY_VERSION
export HOSPITAL_PATIENT_HMAC_KEY_FINGERPRINT HOSPITAL_PATIENT_ENCRYPTION_KEY_FINGERPRINT
export HOSPITAL_EXPORT_PSEUDONYM_KEY_FINGERPRINT HOSPITAL_SITE_SIGNING_KEY_FINGERPRINT
export HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT
export HOSPITAL_EXTERNAL_AI_SEAL_KEY_FINGERPRINT
export HOSPITAL_MFA_ENCRYPTION_KEY_FINGERPRINT
export HOSPITAL_BACKUP_MANIFEST_HMAC_KEY

# Keep the proof variable defined for the read-only verify/temporary phases.
# It is populated only after the mandatory pre-restore safety snapshot and is
# checked again inside the database-switch boundary.
LOSPOR_RESTORE_CONFIRM=""
LOSPOR_RESTORE_DESTRUCTIVE_BOUNDARY_ACK=""
LOSPOR_RESTORE_SAFETY_SNAPSHOT_MANIFEST_SHA256=""
LOSPOR_RESTORE_BOUNDARY_MARKER=""
export LOSPOR_RESTORE_CONFIRM LOSPOR_RESTORE_DESTRUCTIVE_BOUNDARY_ACK
export LOSPOR_RESTORE_SAFETY_SNAPSHOT_MANIFEST_SHA256
export LOSPOR_RESTORE_BOUNDARY_MARKER

restore_tool() {
  MSYS_NO_PATHCONV=1 docker compose run --rm --interactive=false -T \
    -e HOSPITAL_BACKUP_SITE_ID \
    -e HOSPITAL_BACKUP_APPLIANCE_ID \
    -e HOSPITAL_APPLIANCE_RELEASE \
    -e HOSPITAL_EXCHANGE_CONTRACT_VERSION \
    -e HOSPITAL_DATA_DICTIONARY_VERSION \
    -e HOSPITAL_PATIENT_HMAC_KEY_FINGERPRINT \
    -e HOSPITAL_PATIENT_ENCRYPTION_KEY_FINGERPRINT \
    -e HOSPITAL_EXPORT_PSEUDONYM_KEY_FINGERPRINT \
    -e HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT \
    -e HOSPITAL_SITE_SIGNING_KEY_FINGERPRINT \
    -e HOSPITAL_EXTERNAL_AI_SEAL_KEY_FINGERPRINT \
    -e HOSPITAL_MFA_ENCRYPTION_KEY_FINGERPRINT \
    -e HOSPITAL_BACKUP_MANIFEST_HMAC_KEY \
    -e LOSPOR_RESTORE_CONFIRM \
    -e LOSPOR_RESTORE_DESTRUCTIVE_BOUNDARY_ACK \
    -e LOSPOR_RESTORE_SAFETY_SNAPSHOT_MANIFEST_SHA256 \
    -e LOSPOR_RESTORE_BOUNDARY_MARKER \
    --entrypoint /usr/local/bin/restore.sh backup "$@"
}

# VERIFY: no service is stopped and no database is created or renamed.
preflight_output="$(restore_tool verify "$artifact_container")" || {
  operator_error \
    "Restore preflight failed. Clinical services and the live database were not changed." \
    "Предварителната проверка за възстановяване се провали. Клиничните услуги и действащата база данни не са променени."
  exit 1
}
printf '%s\n' "$preflight_output" | grep -Fxq RESTORE_PREFLIGHT_OK \
  || {
    operator_error \
      "Restore preflight returned no success proof." \
      "Предварителната проверка за възстановяване не върна доказателство за успех."
    exit 1
  }
restore_site="$(printf '%s\n' "$preflight_output" | sed -n 's/^RESTORE_SITE_ID=//p')"
restore_completed="$(printf '%s\n' "$preflight_output" | sed -n 's/^RESTORE_COMPLETED_AT=//p')"
restore_completed_epoch="$(printf '%s\n' "$preflight_output" | sed -n 's/^RESTORE_COMPLETED_EPOCH=//p')"
restore_source_database_bytes="$(printf '%s\n' "$preflight_output" | sed -n 's/^RESTORE_SOURCE_DATABASE_BYTES=//p')"
restore_manifest_sha="$(printf '%s\n' "$preflight_output" | sed -n 's/^RESTORE_MANIFEST_SHA256=//p')"
[ "$(printf '%s\n' "$preflight_output" | grep -c '^RESTORE_SITE_ID=')" -eq 1 ] \
  && [ "$(printf '%s\n' "$preflight_output" | grep -c '^RESTORE_COMPLETED_AT=')" -eq 1 ] \
  && [ "$(printf '%s\n' "$preflight_output" | grep -c '^RESTORE_COMPLETED_EPOCH=')" -eq 1 ] \
  && [ "$(printf '%s\n' "$preflight_output" | grep -c '^RESTORE_SOURCE_DATABASE_BYTES=')" -eq 1 ] \
  && [ "$(printf '%s\n' "$preflight_output" | grep -c '^RESTORE_MANIFEST_SHA256=')" -eq 1 ] \
  && [ -n "$restore_site" ] && [ -n "$restore_completed" ] \
  || {
    operator_error \
      "Restore preflight metadata is ambiguous." \
      "Метаданните от предварителната проверка за възстановяване са нееднозначни."
    exit 1
  }
case "$restore_completed_epoch:$restore_source_database_bytes" in
  *[!0-9:]*)
    operator_error \
      "Restore completion or source-size metadata is invalid." \
      "Метаданните за завършването или размера на източника за възстановяване са невалидни."
    exit 1
    ;;
  *:0) operator_error "Restore source size is invalid." "Размерът на източника за възстановяване е невалиден."; exit 1 ;;
esac
[ "$restore_completed_epoch" -gt 0 ] \
  && printf '%s\n' "$restore_manifest_sha" | grep -Eq '^[0-9a-f]{64}$' || {
  operator_error \
    "Restore completion or manifest-digest metadata is invalid." \
    "Метаданните за завършването или хеша на манифеста за възстановяване са невалидни."
  exit 1
}

# A temporary database needs room alongside the live one. Check the actual
# PostgreSQL data volume before asking for confirmation or creating anything;
# free space in the separate backup bind mount is not relevant here.
HOSPITAL_RESTORE_DATABASE_RESERVE_BYTES="${HOSPITAL_RESTORE_DATABASE_RESERVE_BYTES:-5368709120}"
HOSPITAL_RESTORE_SPACE_MULTIPLIER_PERCENT="${HOSPITAL_RESTORE_SPACE_MULTIPLIER_PERCENT:-150}"
case "$HOSPITAL_RESTORE_DATABASE_RESERVE_BYTES:$HOSPITAL_RESTORE_SPACE_MULTIPLIER_PERCENT" in
  *[!0-9:]*) operator_error "Restore capacity policy is invalid." "Политиката за необходимото място при възстановяване е невалидна."; exit 2 ;;
esac
[ "$HOSPITAL_RESTORE_SPACE_MULTIPLIER_PERCENT" -ge 100 ] || {
  operator_error \
    "Restore capacity multiplier must be at least 100 percent." \
    "Множителят за необходимото място при възстановяване трябва да бъде поне 100 процента."
  exit 2
}
HOSPITAL_RESTORE_SOURCE_DATABASE_BYTES="$restore_source_database_bytes"
export HOSPITAL_RESTORE_DATABASE_RESERVE_BYTES HOSPITAL_RESTORE_SPACE_MULTIPLIER_PERCENT
export HOSPITAL_RESTORE_SOURCE_DATABASE_BYTES
if ! docker compose exec -T \
    -e HOSPITAL_RESTORE_DATABASE_RESERVE_BYTES \
    -e HOSPITAL_RESTORE_SPACE_MULTIPLIER_PERCENT \
    -e HOSPITAL_RESTORE_SOURCE_DATABASE_BYTES \
    postgres sh -c '
      set -eu
      database_bytes="$(psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="SELECT pg_database_size(current_database());")"
      available_kib="$(df -Pk "$PGDATA" | awk "NR > 1 { value=\$4 } END { print value }")"
      case "$database_bytes:$available_kib" in *[!0-9:]*) exit 2 ;; esac
      case "$HOSPITAL_RESTORE_SOURCE_DATABASE_BYTES" in *[!0-9]*|0) exit 2 ;; esac
      if [ "$HOSPITAL_RESTORE_SOURCE_DATABASE_BYTES" -gt "$database_bytes" ]; then
        database_bytes="$HOSPITAL_RESTORE_SOURCE_DATABASE_BYTES"
      fi
      available_bytes=$((available_kib * 1024))
      required_bytes=$((database_bytes * HOSPITAL_RESTORE_SPACE_MULTIPLIER_PERCENT / 100 + HOSPITAL_RESTORE_DATABASE_RESERVE_BYTES))
      [ "$available_bytes" -ge "$required_bytes" ]
    '; then
  operator_error \
    "Restore capacity preflight failed; clinical services and the live database were not changed." \
    "Предварителната проверка за свободно място се провали; клиничните услуги и действащата база данни не са променени."
  exit 1
fi

if [ "$restore_mode" = in-place ]; then
  required_confirmation="EMERGENCY RESTORE $restore_site $restore_completed"
else
  required_confirmation="TEMPORARY RESTORE $restore_site $restore_completed"
fi
if [ -z "${LOSPOR_RESTORE_CONFIRM_INPUT:-}" ]; then
  if [ -t 0 ]; then
    operator_eprintf 'Type exactly: %s\n> ' 'Въведете точно: %s\n> ' "$required_confirmation"
    IFS= read -r LOSPOR_RESTORE_CONFIRM_INPUT || exit 2
  else
    operator_error \
      "Set LOSPOR_RESTORE_CONFIRM_INPUT to the exact site-and-timestamp confirmation." \
      "Задайте LOSPOR_RESTORE_CONFIRM_INPUT с точното потвърждение за мястото и времето."
    exit 2
  fi
fi
[ "$LOSPOR_RESTORE_CONFIRM_INPUT" = "$required_confirmation" ] || {
  operator_error \
    "Typed confirmation did not match this site and backup timestamp." \
    "Въведеното потвърждение не съответства на това място и времето на архива."
  exit 2
}
LOSPOR_RESTORE_CONFIRM="$required_confirmation"
export LOSPOR_RESTORE_CONFIRM

journal_dir="$backup_root/.restore-journal"
[ ! -e "$journal_dir" ] || { [ -d "$journal_dir" ] && [ ! -L "$journal_dir" ]; } || {
  operator_error \
    "Restore journal directory is unsafe." \
    "Директорията на журнала за възстановяване е небезопасна."
  exit 1
}
mkdir -p "$journal_dir"
chmod 700 "$journal_dir"
journal_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
journal_file="$(mktemp "$journal_dir/restore-${journal_stamp}.XXXXXXXX.journal")" || {
  operator_error \
    "Restore journal could not be created." \
    "Журналът за възстановяване не можа да бъде създаден."
  exit 1
}
chmod 600 "$journal_file"
journal() {
  journal_phase="$1"
  journal_result="$2"
  printf '%s phase=%s result=%s object=%s mode=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$journal_phase" "$journal_result" "$artifact_name" "$restore_mode" \
    >> "$journal_file"
  sync -f "$journal_file" >/dev/null 2>&1 || {
    operator_error \
      "Restore journal could not be made durable; refusing to continue." \
      "Журналът за възстановяване не можа да бъде записан устойчиво; продължаването се отказва."
    return 1
  }
  sync -f "$journal_dir" >/dev/null 2>&1 || {
    operator_error \
      "Restore journal directory could not be made durable; refusing to continue." \
      "Директорията на журнала за възстановяване не можа да бъде записана устойчиво; продължаването се отказва."
    return 1
  }
}
journal VERIFY PASSED

database_suffix="$(date -u +%Y%m%d%H%M%S)_$$"
temporary_database="lospor_restore_$database_suffix"
previous_database="lospor_previous_$database_suffix"

# TEMPORARY: restore and migrate a separate database while the live clinical
# stack continues serving. Any error through validation leaves production
# untouched and the failed phase recorded.
# Every failure below this point is before the destructive boundary, so the
# isolated database is the only thing that was created and it must not outlive
# the attempt. docs/backup-restore.md promises "a failed attempt removes only
# that isolated database", and restore-hardening test 14 asserts it -- but the
# wrapper journalled the failure and exited without dropping anything, so each
# failed attempt left a full-size copy of the clinical database behind. During
# an incident, repeated attempts are exactly when free space matters.
# Guarded so it is safe to call twice: the explicit calls below keep their place
# in the journal ordering, and the trap installed with the database catches
# everything they miss.
temporary_database_present=0

discard_temporary_database() {
  [ "$temporary_database_present" -eq 1 ] || return 0
  temporary_database_present=0
  restore_tool discard-temporary "$artifact_container" "$temporary_database" >/dev/null 2>&1 || {
    operator_error \
      "The isolated restore database could not be removed; remove it manually." \
      "Изолираната база данни за възстановяване не можа да бъде премахната; премахнете я ръчно."
  }
}

# Naming each failure path was not enough. Seven pre-boundary exits reached
# `exit 1` without dropping anything -- the missing-password check sat between
# two paths that did -- and no trap covered the window at all, so a Ctrl-C
# during the migrate or validate step left a full-size copy of the clinical
# database behind. During an incident, repeated attempts are exactly when free
# space matters. The flag is cleared only where the database is deliberately
# kept or promoted.
temporary_database_exit() {
  temporary_exit_result=$?
  discard_temporary_database
  exit "$temporary_exit_result"
}

# Armed *before* the call, not after: a failed `temporary` can still have
# created the database before giving up, which is why the failure path below
# always dropped it. Arming first keeps that behaviour and extends it to a
# signal arriving mid-restore.
temporary_database_present=1
trap temporary_database_exit EXIT
trap 'exit 130' HUP INT TERM

if ! restore_tool temporary "$artifact_container" "$temporary_database"; then
  journal TEMPORARY FAILED
  discard_temporary_database
  operator_error \
    "Temporary restore failed; clinical services and the live database remain unchanged." \
    "Временното възстановяване се провали; клиничните услуги и действащата база данни остават непроменени."
  exit 1
fi
journal TEMPORARY PASSED

postgres_password="${HOSPITAL_POSTGRES_PASSWORD:-}"
[ -n "$postgres_password" ] || {
  journal RECONCILE FAILED
  operator_error "PostgreSQL password is missing." "Паролата за PostgreSQL липсва."
  exit 1
}
temporary_database_url="postgresql://lospor:${postgres_password}@postgres:5432/${temporary_database}"
if ! DATABASE_URL="$temporary_database_url" DIRECT_URL="$temporary_database_url" \
    docker compose run --rm --no-deps --interactive=false -T \
      -e DATABASE_URL -e DIRECT_URL migrate; then
  journal RECONCILE FAILED
  discard_temporary_database
  operator_error \
    "Migrations failed in the temporary database; the live database remains unchanged." \
    "Миграциите във временната база данни се провалиха; действащата база данни остава непроменена."
  exit 1
fi
if ! restore_tool validate "$artifact_container" "$temporary_database"; then
  journal RECONCILE FAILED
  discard_temporary_database
  operator_error \
    "Temporary database validation failed; the live database remains unchanged." \
    "Проверката на временната база данни се провали; действащата база данни остава непроменена."
  exit 1
fi
journal RECONCILE PASSED

if [ "$restore_mode" = temporary ]; then
  journal COMPLETE TEMPORARY_READY
  operator_printf \
    'Backup validated and migrated in temporary database: %s\n' \
    'Архивът е проверен и мигриран във временна база данни: %s\n' \
    "$temporary_database"
  operator_printf \
    'Clinical traffic and the live database were not changed. Journal: %s\n' \
    'Клиничният трафик и действащата база данни не са променени. Журнал: %s\n' \
    "$journal_file"
  # Deliberately kept: this mode exists to hand the operator a validated copy,
  # and its name was just printed to them.
  temporary_database_present=0
  exit 0
fi

# A verified safety snapshot is mandatory before the short emergency switch.
if ! sh scripts/backup-now.sh --kind pre-restore; then
  journal SAFETY_SNAPSHOT FAILED
  operator_error \
    "Current-database safety snapshot failed; refusing the emergency switch." \
    "Защитният архив на текущата база данни се провали; аварийното превключване се отказва."
  exit 1
fi
journal SAFETY_SNAPSHOT PASSED
safety_marker="$backup_root/.last-verified.v1"
[ -f "$safety_marker" ] && [ ! -L "$safety_marker" ] || {
  journal SAFETY_SNAPSHOT PROOF_MISSING
  operator_error \
    "Safety snapshot marker is missing; refusing the emergency switch." \
    "Маркерът на защитния архив липсва; аварийното превключване се отказва."
  exit 1
}
safety_object_name="$(sed -n 's/^objectName=//p' "$safety_marker")"
LOSPOR_RESTORE_SAFETY_SNAPSHOT_MANIFEST_SHA256="$(sed -n 's/^manifestSha256=//p' "$safety_marker")"
printf '%s\n' "$safety_object_name" | grep -Eq '^lospor-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{6,32}\.backup$' \
  && printf '%s\n' "$LOSPOR_RESTORE_SAFETY_SNAPSHOT_MANIFEST_SHA256" | grep -Eq '^[0-9a-f]{64}$' \
  && [ -f "$backup_root/$safety_object_name/.retain-pre-restore" ] \
  && [ ! -L "$backup_root/$safety_object_name/.retain-pre-restore" ] \
  && [ "$(sha256sum "$backup_root/$safety_object_name/manifest.json" | awk '{ print $1 }')" = "$LOSPOR_RESTORE_SAFETY_SNAPSHOT_MANIFEST_SHA256" ] || {
    journal SAFETY_SNAPSHOT PROOF_INVALID
    operator_error \
      "Safety snapshot proof is invalid; refusing the emergency switch." \
      "Доказателството за защитния архив е невалидно; аварийното превключване се отказва."
    exit 1
  }
export LOSPOR_RESTORE_SAFETY_SNAPSHOT_MANIFEST_SHA256

# Authenticate the newly captured live-database object before any outage. The
# inner switch repeats this check immediately before its durable boundary.
safety_preflight="$(restore_tool verify "/backups/$safety_object_name")" || {
  journal SAFETY_SNAPSHOT PREFLIGHT_FAILED
  operator_error \
    "Safety snapshot verification failed; clinical services remain available." \
    "Проверката на защитния архив се провали; клиничните услуги остават достъпни."
  exit 1
}
printf '%s\n' "$safety_preflight" | grep -Fxq RESTORE_PREFLIGHT_OK || {
  journal SAFETY_SNAPSHOT PREFLIGHT_INVALID
  operator_error \
    "Safety snapshot returned no verified preflight proof." \
    "Защитният архив не върна проверено доказателство от предварителната проверка."
  exit 1
}

boundary_token="$(printf '%s' "$(basename "$journal_file")" | sha256sum | awk '{ print substr($1, 1, 24) }')"
boundary_marker_name=".restore-boundary-${boundary_token}.started"
boundary_marker_host="$backup_root/$boundary_marker_name"
[ ! -e "$boundary_marker_host" ] && [ ! -L "$boundary_marker_host" ] || {
  journal DESTRUCTIVE_RESTORE BOUNDARY_MARKER_COLLISION
  operator_error \
    "Restore boundary marker collision; refusing the emergency switch." \
    "Конфликт в маркера на границата за възстановяване; аварийното превключване се отказва."
  exit 1
}
LOSPOR_RESTORE_BOUNDARY_MARKER="/backups/$boundary_marker_name"
export LOSPOR_RESTORE_BOUNDARY_MARKER

traffic_closed=0
destructive_started=0
restore_complete=0
restore_exit() {
  result=$?
  if [ "$destructive_started" -eq 0 ] \
      && { [ -e "$boundary_marker_host" ] || [ -L "$boundary_marker_host" ]; }; then
    destructive_started=1
  fi
  # This trap replaces the one installed with the isolated database and inherits
  # its duty. The durable boundary marker is the only trustworthy signal: while
  # it is absent the switch demonstrably has not begun, so the isolated database
  # is still only a copy and must go. Once it exists the operator inspects both
  # databases by hand and nothing here may drop either.
  [ "$destructive_started" -eq 1 ] || discard_temporary_database
  if [ "$restore_complete" -eq 0 ] && [ "$traffic_closed" -eq 1 ]; then
    if [ "$destructive_started" -eq 0 ]; then
      docker compose up -d api delivery-worker web pwa browser backup caddy >/dev/null 2>&1 || true
      journal DESTRUCTIVE_RESTORE REFUSED_PRE_BOUNDARY_REOPENED
      operator_error \
        "Restore failed before the database switch; the unchanged clinical stack was restarted." \
        "Възстановяването се провали преди превключването на базата данни; непроменените клинични услуги бяха рестартирани."
    else
      docker compose stop caddy api delivery-worker web pwa browser backup >/dev/null 2>&1 || true
      journal NEEDS_OPERATOR SWITCH_OR_HEALTH_FAILED
      operator_error \
        "NEEDS_OPERATOR: the database switch began, so clinical traffic remains closed." \
        "NEEDS_OPERATOR: превключването на базата данни е започнало, затова клиничният трафик остава спрян."
      operator_eprintf 'Inspect: %s\n' 'Проверете: %s\n' "$journal_file"
      operator_eprintf \
        'The preserved previous database is: %s\n' \
        'Запазената предишна база данни е: %s\n' \
        "$previous_database"
      operator_error \
        "Do not retry blindly. Verify both databases, then run the documented recovery procedure." \
        "Не опитвайте повторно на сляпо. Проверете и двете бази данни, след което изпълнете документираната процедура за възстановяване."
      operator_error \
        "Run from the appliance root to inspect the exact database-name state:" \
        "Изпълнете от основната директория на системата, за да проверите точното състояние на имената на базите данни:"
      printf '%s\n' "docker compose exec -T postgres psql --username=lospor --dbname=postgres --command=\"SELECT datname FROM pg_database WHERE datname IN ('lospor','$temporary_database','$previous_database') ORDER BY datname;\"" >&2
      operator_error \
        "Keep traffic closed while investigating:" \
        "Оставете трафика спрян по време на проверката:"
      printf '%s\n' "docker compose stop caddy api delivery-worker web pwa browser backup" >&2
    fi
  fi
  exit "$result"
}
trap restore_exit EXIT
trap 'exit 130' HUP INT TERM

journal QUIESCE STARTED
traffic_closed=1
docker compose stop caddy api delivery-worker web pwa browser backup
journal QUIESCE PASSED

# DESTRUCTIVE_RESTORE is the explicit boundary: the current database name is
# moved aside, never dropped, and the already validated temporary database is
# switched into its place.
journal DESTRUCTIVE_RESTORE PREFLIGHT
LOSPOR_RESTORE_DESTRUCTIVE_BOUNDARY_ACK=1
export LOSPOR_RESTORE_DESTRUCTIVE_BOUNDARY_ACK
restore_tool switch "$artifact_container" "$temporary_database" "$previous_database"
[ -d "$boundary_marker_host" ] && [ ! -L "$boundary_marker_host" ] \
  && [ -f "$boundary_marker_host/state" ] || {
    journal DESTRUCTIVE_RESTORE BOUNDARY_PROOF_MISSING
    operator_error \
      "Database switch returned without a durable boundary proof." \
      "Превключването на базата данни приключи без устойчиво доказателство за преминатата граница."
    exit 1
  }
destructive_started=1
journal DESTRUCTIVE_RESTORE PASSED

# The scheduler's freshness marker previously named the safety snapshot of the
# database that has just been moved aside. Rebind it to the authenticated source
# object now active in production. If that source is older than four hours, the
# restarted scheduler immediately captures the migrated/reconciled state.
source_manifest_host="$artifact_host/manifest.json"
[ -f "$source_manifest_host" ] && [ ! -L "$source_manifest_host" ] || {
  journal RECONCILE BACKUP_LINEAGE_FAILED
  operator_error \
    "Restore source manifest disappeared after the switch; traffic remains closed." \
    "Манифестът на източника за възстановяване изчезна след превключването; трафикът остава спрян."
  exit 1
}
source_manifest_sha="$(sha256sum "$source_manifest_host" | awk '{ print $1 }')"
[ "$source_manifest_sha" = "$restore_manifest_sha" ] || {
  journal RECONCILE BACKUP_LINEAGE_FAILED
  operator_error \
    "Restore source manifest changed after authenticated preflight; traffic remains closed." \
    "Манифестът на източника за възстановяване се промени след удостоверената предварителна проверка; трафикът остава спрян."
  exit 1
}
lineage_marker_tmp="$backup_root/.last-verified.v1.restore.$$"
if ! printf 'schemaVersion=1\ncompletedAtEpoch=%s\nobjectName=%s\nmanifestSha256=%s\n' \
    "$restore_completed_epoch" "$artifact_name" "$source_manifest_sha" > "$lineage_marker_tmp" \
    || ! chmod 600 "$lineage_marker_tmp" \
    || ! sync -f "$lineage_marker_tmp" >/dev/null 2>&1 \
    || ! mv -f "$lineage_marker_tmp" "$backup_root/.last-verified.v1" \
    || ! sync -f "$backup_root/.last-verified.v1" >/dev/null 2>&1 \
    || ! sync -f "$backup_root" >/dev/null 2>&1; then
  rm -f -- "$lineage_marker_tmp"
  journal RECONCILE BACKUP_LINEAGE_FAILED
  operator_error \
    "Restore backup lineage could not be made durable; traffic remains closed." \
    "Произходът на архива за възстановяване не можа да бъде записан устойчиво; трафикът остава спрян."
  exit 1
fi
journal RECONCILE BACKUP_LINEAGE_REBOUND

sh scripts/postgres-update-gate.sh postflight
docker compose --profile tools run --rm --interactive=false -T status-db-init
journal RECONCILE STATUS_DATABASE_READY

operator_say \
  "The restored database may contain an older appliance credential generation." \
  "Възстановената база данни може да съдържа по-старо поколение данни за достъп до системата."
operator_say \
  "Select an active ADMIN from the restored database to synchronize it with Status." \
  "Изберете активен ADMIN от възстановената база данни, за да я синхронизирате със Status."
sh scripts/appliance-operator.sh reconcile-restore
journal RECONCILE OPERATOR_SYNCHRONIZED

# Start the clinical containers while Caddy remains stopped, and prove their
# internal health from Status before reopening the public TLS endpoint.
docker compose up -d api delivery-worker web pwa browser backup
docker compose exec -T status node -e '
const checks = [
  ["api-live", "http://api:3002/health/live"],
  ["api-ready", "http://api:3002/health/ready"],
  ["web", "http://web:3000/login"],
  ["pwa", "http://pwa:8080/health"],
  ["browser", "http://browser:3003/login"],
];
Promise.all(checks.map(async ([name, url]) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`${name}:${response.status}`);
})).catch(error => { console.error(error.message); process.exit(1); });
'
journal HEALTH INTERNAL_PASSED

if ! preopen_doctor_output="$(./scripts/doctor.sh --restore-preopen)"; then
  journal HEALTH PREOPEN_DOCTOR_FAILED
  exit 1
fi
printf '%s\n' "$preopen_doctor_output"
printf '%s\n' "$preopen_doctor_output" | grep -Fxq RESTORE_PREOPEN_OK || {
  journal HEALTH PREOPEN_DOCTOR_PROOF_MISSING
  operator_error \
    "Restore pre-open doctor returned no exact success proof." \
    "Проверката преди отваряне след възстановяване не върна точно доказателство за успех."
  exit 1
}
journal HEALTH PREOPEN_DOCTOR_PASSED

docker compose up -d caddy
if ! ./scripts/doctor.sh; then
  journal HEALTH DOCTOR_FAILED
  exit 1
fi
journal HEALTH DOCTOR_PASSED
journal COMPLETE PASSED
restore_complete=1
traffic_closed=0
trap - EXIT HUP INT TERM
operator_printf \
  'Emergency restore completed. Previous database retained as: %s\n' \
  'Аварийното възстановяване приключи. Предишната база данни е запазена като: %s\n' \
  "$previous_database"
operator_printf 'Journal: %s\n' 'Журнал: %s\n' "$journal_file"
