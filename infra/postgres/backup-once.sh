#!/bin/sh
set -eu

umask 077

script_dir="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
object_lib="${HOSPITAL_BACKUP_OBJECT_LIB:-/usr/local/bin/backup-object-lib.sh}"
[ -f "$object_lib" ] || object_lib="$script_dir/backup-object-lib.sh"
. "$object_lib"

backup_dir="${HOSPITAL_BACKUP_DIR:-/backups}"
signals_dir="${HOSPITAL_SIGNALS_DIR:-/signals}"
signal_file="$signals_dir/backup-status.v1.json"
io_mutation_lock="${HOSPITAL_IO_MUTATION_LOCK_FILE:-/run/lospor/io-mutation.lock}"
lock_dir="$backup_dir/.lospor-backup.lock"
lock_wait="${HOSPITAL_BACKUP_LOCK_WAIT_SECONDS:-60}"
deduplicate_window="${HOSPITAL_BACKUP_DEDUPLICATE_WINDOW_SECONDS:-300}"
reserve_bytes="${HOSPITAL_BACKUP_RESERVE_BYTES:-5368709120}"
space_multiplier="${HOSPITAL_BACKUP_SPACE_MULTIPLIER_PERCENT:-150}"
backup_kind="${HOSPITAL_BACKUP_KIND:-scheduled}"
lock_owned=0
run_temporary=""
final_object=""
object_committed=0
signal_temporary=""

case "$backup_kind" in scheduled|manual|pre-update|immutable|pre-restore) ;;
  *) backup_error BACKUP_KIND_INVALID; exit 2 ;;
esac
for numeric_setting in "$lock_wait" "$deduplicate_window" "$reserve_bytes" "$space_multiplier"; do
  backup_is_uint "$numeric_setting" || { backup_error BACKUP_POLICY_INVALID; exit 2; }
done
[ "$space_multiplier" -ge 100 ] || { backup_error BACKUP_POLICY_INVALID; exit 2; }
[ -d "$backup_dir" ] && [ -w "$backup_dir" ] && [ ! -L "$backup_dir" ] || {
  backup_error BACKUP_DIRECTORY_INVALID
  exit 2
}
[ -f "$io_mutation_lock" ] && [ ! -L "$io_mutation_lock" ] || {
  backup_error BACKUP_MAINTENANCE_LOCK_INVALID
  exit 2
}

now_epoch() {
  if [ -n "${HOSPITAL_BACKUP_NOW_EPOCH:-}" ]; then
    backup_is_uint "$HOSPITAL_BACKUP_NOW_EPOCH" || return 1
    printf '%s\n' "$HOSPITAL_BACKUP_NOW_EPOCH"
  else
    date -u +%s
  fi
}

utc_at() {
  date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ
}

release_lock() {
  [ "$lock_owned" -eq 1 ] || return 0
  lock_owner="$(sed -n '1p' "$lock_dir/owner" 2>/dev/null || true)"
  if [ -z "$lock_owner" ] || [ "$lock_owner" = "$lock_token" ]; then
    rm -f -- "$lock_dir/owner"
    rmdir "$lock_dir" 2>/dev/null || true
  fi
  lock_owned=0
}

cleanup() {
  release_lock
  [ -z "$signal_temporary" ] || rm -f -- "$signal_temporary"
  if [ -n "$run_temporary" ] && [ -e "$run_temporary" ]; then
    case "$run_temporary" in "$backup_dir"/.lospor-run-*.tmp.*) rm -rf -- "$run_temporary" ;; esac
  fi
  if [ "$object_committed" -eq 0 ] && [ -n "$final_object" ] && [ -e "$final_object" ]; then
    case "$final_object" in "$backup_dir"/lospor-*.backup) rm -rf -- "$final_object" ;; esac
  fi
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

write_status() {
  status_state="$1"
  status_code="$2"
  status_bytes="${3:-}"
  status_epoch="$(now_epoch)" || return 1
  status_at="$(utc_at "$status_epoch")" || return 1
  mkdir -p "$signals_dir" || return 1
  signal_temporary="$signals_dir/.backup-status.v1.json.tmp.$$"
  if [ -n "$status_bytes" ]; then
    status_extra=",\"artifactBytes\":${status_bytes},\"checksumAlgorithm\":\"sha256\""
  else
    status_extra=""
  fi
  printf '{"schemaVersion":1,"signalType":"backup","observedAt":"%s","state":"%s","resultCode":"%s"%s}\n' \
    "$status_at" "$status_state" "$status_code" "$status_extra" \
    > "$signal_temporary" || return 1
  chmod 644 "$signal_temporary" || return 1
  mv -f "$signal_temporary" "$signal_file" || return 1
  signal_temporary=""
}

fail_backup() {
  failure_code="$1"
  failure_exit="${2:-1}"
  write_status FAILURE "$failure_code" || true
  backup_error "$failure_code"
  exit "$failure_exit"
}

# Backups and release mutations share this persistent inode. The host update
# agent takes the same exclusive advisory lock before migrations or service
# replacement, while the backup container sees only this one writable bind
# mount rather than the appliance's whole private .data tree.
exec 8<> "$io_mutation_lock" || {
  backup_error BACKUP_MAINTENANCE_LOCK_INVALID
  exit 2
}
if ! flock -w "$lock_wait" 8; then
  # Contention is an expected deferred run, not the latest backup result. Do
  # not overwrite the status marker that describes the last completed run.
  backup_error BACKUP_MAINTENANCE_BUSY
  exit 75
fi

lock_token="$(now_epoch)-$$"
lock_started="$(now_epoch)"
lock_deadline=$((lock_started + lock_wait))
while ! mkdir "$lock_dir" 2>/dev/null; do
  lock_now="$(now_epoch)"
  if [ "$lock_now" -ge "$lock_deadline" ]; then
    # A contending caller is not the backup system's latest result. Do not
    # overwrite the marker owned by the process that is actually creating it.
    backup_error BACKUP_BUSY
    exit 75
  fi
  sleep 1
done
lock_owned=1
printf '%s\n' "$lock_token" > "$lock_dir/owner" || fail_backup BACKUP_LOCK_FAILED
chmod 600 "$lock_dir/owner" || fail_backup BACKUP_LOCK_FAILED

# A caller that arrived while another backup was running reuses that exact,
# newly authenticated recovery point instead of starting a second pg_dump. A
# verified-object scan covers the narrow crash window between manifest-last
# publication and freshness-marker replacement.
dedupe_now="$(now_epoch)"
dedupe_object=""
dedupe_marker_epoch=""
dedupe_verified=0
if [ "$backup_kind" != pre-restore ]; then
  if backup_read_last_verified; then
    dedupe_object="$backup_last_object"
    dedupe_marker_epoch="$backup_last_completed_epoch"
    if backup_verify_object "$dedupe_object" integrity \
        && [ "$backup_manifest_completed_epoch" = "$dedupe_marker_epoch" ]; then
      dedupe_verified=1
    fi
  fi
  if [ "$dedupe_verified" -eq 0 ] && backup_find_latest_verified; then
    dedupe_object="$backup_latest_object"
    dedupe_marker_epoch="$backup_latest_completed_epoch"
    if backup_verify_object "$dedupe_object" integrity \
        && [ "$backup_manifest_completed_epoch" = "$dedupe_marker_epoch" ]; then
      dedupe_verified=1
    fi
  fi
fi
if [ "$dedupe_verified" -eq 1 ]; then
  dedupe_age=$((dedupe_now - dedupe_marker_epoch))
  if [ "$dedupe_age" -ge 0 ] && [ "$dedupe_age" -le "$deduplicate_window" ]; then
    backup_pin_object "$dedupe_object" "$backup_kind" "$dedupe_now" \
      || fail_backup BACKUP_RETENTION_PIN_FAILED
    backup_write_last_verified "$dedupe_object" "$backup_manifest_completed_epoch" \
      || fail_backup BACKUP_MARKER_WRITE_FAILED
    write_status SUCCESS BACKUP_VERIFIED "$backup_manifest_dump_bytes" \
      || fail_backup BACKUP_SIGNAL_WRITE_FAILED
    printf '%s\n' BACKUP_REUSED_VERIFIED
    exit 0
  fi
fi

database_bytes="${HOSPITAL_BACKUP_DATABASE_BYTES_OVERRIDE:-}"
if [ -z "$database_bytes" ]; then
  database_bytes="$(psql --host=postgres --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
    --tuples-only --no-align --set=ON_ERROR_STOP=1 \
    --command="SELECT pg_database_size(current_database());" 2>/dev/null)" \
    || fail_backup BACKUP_DATABASE_SIZE_FAILED
fi
backup_is_uint "$database_bytes" || fail_backup BACKUP_DATABASE_SIZE_FAILED

available_bytes="${HOSPITAL_BACKUP_AVAILABLE_BYTES_OVERRIDE:-}"
if [ -z "$available_bytes" ]; then
  available_kib="$(df -Pk "$backup_dir" | awk 'NR > 1 { value=$4 } END { print value }')" \
    || fail_backup BACKUP_CAPACITY_CHECK_FAILED
  backup_is_uint "$available_kib" || fail_backup BACKUP_CAPACITY_CHECK_FAILED
  available_bytes=$((available_kib * 1024))
fi
backup_is_uint "$available_bytes" || fail_backup BACKUP_CAPACITY_CHECK_FAILED
estimated_dump_bytes=$((database_bytes * space_multiplier / 100))
required_bytes=$((estimated_dump_bytes + reserve_bytes))
if [ "$available_bytes" -lt "$required_bytes" ]; then
  fail_backup BACKUP_CAPACITY_REFUSED
fi

created_epoch="$(now_epoch)"
created_at="$(utc_at "$created_epoch")" || fail_backup BACKUP_CLOCK_INVALID
stamp="$(printf '%s' "$created_at" | tr -d ':-')"
run_temporary="$(mktemp -d "$backup_dir/.lospor-run-${stamp}.tmp.XXXXXXXX")" \
  || fail_backup BACKUP_TEMP_CREATE_FAILED
chmod 700 "$run_temporary" || fail_backup BACKUP_TEMP_CREATE_FAILED
random_suffix="${run_temporary##*.tmp.}"
printf '%s\n' "$random_suffix" | grep -Eq '^[A-Za-z0-9]{8}$' \
  || fail_backup BACKUP_RUN_ID_INVALID
run_id="${stamp}-${random_suffix}"
final_object="$backup_dir/lospor-${stamp}-${random_suffix}.backup"
[ ! -e "$final_object" ] || fail_backup ARTIFACT_FINALIZE_FAILED

dump_file="$run_temporary/database.dump"
schema_file="$run_temporary/.schema.sql"
migrations_file="$run_temporary/.migrations"
unsigned_manifest="$run_temporary/.manifest.unsigned.json"
pending_manifest="$run_temporary/manifest.pending"

if ! pg_dump --host=postgres --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
    --format=custom --compress=9 --no-owner --file="$dump_file"; then
  fail_backup PG_DUMP_FAILED
fi
if ! pg_dump --host=postgres --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
    --schema-only --no-owner --no-privileges --file="$schema_file"; then
  fail_backup BACKUP_SCHEMA_FINGERPRINT_FAILED
fi
# PostgreSQL 17 emits per-invocation random psql restriction tokens. They are a
# transport safety mechanism, not schema, and must not make the same schema
# produce a different compatibility fingerprint on every backup.
sed '/^\\restrict /d; /^\\unrestrict /d' "$schema_file" > "$schema_file.canonical" \
  || fail_backup BACKUP_SCHEMA_FINGERPRINT_FAILED
mv "$schema_file.canonical" "$schema_file" || fail_backup BACKUP_SCHEMA_FINGERPRINT_FAILED
if ! psql --host=postgres --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
    --tuples-only --no-align --set=ON_ERROR_STOP=1 \
    --command="SELECT migration_name || ':' || checksum FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;" \
    > "$migrations_file"; then
  fail_backup BACKUP_MIGRATION_FINGERPRINT_FAILED
fi
migration_count="$(wc -l < "$migrations_file" | tr -d '[:space:]')"
backup_is_uint "$migration_count" || fail_backup BACKUP_MIGRATION_FINGERPRINT_FAILED
migration_fingerprint="sha256:$(sha256sum "$migrations_file" | awk '{ print $1 }')"
schema_fingerprint="sha256:$(sha256sum "$schema_file" | awk '{ print $1 }')"

postgres_version_num="$(psql --host=postgres --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
  --tuples-only --no-align --set=ON_ERROR_STOP=1 --command='SHOW server_version_num;' 2>/dev/null)" \
  || fail_backup BACKUP_POSTGRES_VERSION_FAILED
backup_is_uint "$postgres_version_num" || fail_backup BACKUP_POSTGRES_VERSION_FAILED
postgres_major=$((postgres_version_num / 10000))
[ "$postgres_major" -gt 0 ] || fail_backup BACKUP_POSTGRES_VERSION_FAILED

dump_bytes="$(wc -c < "$dump_file" | tr -d '[:space:]')"
backup_is_uint "$dump_bytes" && [ "$dump_bytes" -gt 0 ] || fail_backup ARTIFACT_FINALIZE_FAILED
dump_sha256="$(sha256sum "$dump_file" | awk '{ print $1 }')" \
  || fail_backup CHECKSUM_FAILED
backup_is_sha256 "$dump_sha256" || fail_backup CHECKSUM_FAILED
pg_restore --list "$dump_file" >/dev/null 2>&1 || fail_backup BACKUP_DUMP_CATALOG_INVALID

site_id="${HOSPITAL_BACKUP_SITE_ID:-}"
appliance_id="${HOSPITAL_BACKUP_APPLIANCE_ID:-}"
hospital_release="${HOSPITAL_APPLIANCE_RELEASE:-${HOSPITAL_RELEASE:-source}}"
exchange_version="${HOSPITAL_EXCHANGE_CONTRACT_VERSION:-}"
dictionary_version="${HOSPITAL_DATA_DICTIONARY_VERSION:-}"
tool_version="${HOSPITAL_BACKUP_TOOL_VERSION:-source}"
patient_hmac_fingerprint="${HOSPITAL_PATIENT_HMAC_KEY_FINGERPRINT:-}"
patient_encryption_fingerprint="${HOSPITAL_PATIENT_ENCRYPTION_KEY_FINGERPRINT:-}"
export_pseudonym_fingerprint="${HOSPITAL_EXPORT_PSEUDONYM_KEY_FINGERPRINT:-}"
omop_pseudonym_salt_fingerprint="${HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT:-}"
site_signing_fingerprint="${HOSPITAL_SITE_SIGNING_KEY_FINGERPRINT:-}"
external_ai_seal_fingerprint="${HOSPITAL_EXTERNAL_AI_SEAL_KEY_FINGERPRINT:-}"
administrator_mfa_key_fingerprint="${HOSPITAL_MFA_ENCRYPTION_KEY_FINGERPRINT:-}"
manifest_hmac_key="${HOSPITAL_BACKUP_MANIFEST_HMAC_KEY:-}"
auth_fingerprint="sha256:$(printf '%s' "$manifest_hmac_key" | sha256sum | awk '{ print $1 }')"

for safe_value in "$site_id" "$appliance_id" "$hospital_release" "$exchange_version" "$dictionary_version" "$tool_version"; do
  backup_is_safe_value "$safe_value" || fail_backup BACKUP_COMPATIBILITY_METADATA_INVALID
done
for fingerprint in "$patient_hmac_fingerprint" "$patient_encryption_fingerprint" \
  "$export_pseudonym_fingerprint" "$omop_pseudonym_salt_fingerprint" "$site_signing_fingerprint" \
  "$external_ai_seal_fingerprint" "$administrator_mfa_key_fingerprint" "$auth_fingerprint"; do
  backup_is_fingerprint "$fingerprint" || fail_backup BACKUP_KEY_FINGERPRINT_INVALID
done
[ "${#manifest_hmac_key}" -ge 32 ] || fail_backup BACKUP_MANIFEST_AUTH_KEY_INVALID

completed_epoch="$(now_epoch)"
completed_at="$(utc_at "$completed_epoch")" || fail_backup BACKUP_CLOCK_INVALID
cat > "$unsigned_manifest" <<EOF
{
  "schemaVersion":1,
  "objectType":"lospor-postgresql-logical-backup",
  "toolVersion":"$tool_version",
  "runId":"$run_id",
  "kind":"$backup_kind",
  "siteId":"$site_id",
  "applianceId":"$appliance_id",
  "hospitalRelease":"$hospital_release",
  "exchangeContractVersion":"$exchange_version",
  "dataDictionaryVersion":"$dictionary_version",
  "postgresMajor":$postgres_major,
  "migrationCount":$migration_count,
  "migrationFingerprint":"$migration_fingerprint",
  "schemaFingerprint":"$schema_fingerprint",
  "patientHmacKeyFingerprint":"$patient_hmac_fingerprint",
  "patientEncryptionKeyFingerprint":"$patient_encryption_fingerprint",
  "exportPseudonymKeyFingerprint":"$export_pseudonym_fingerprint",
  "omopPseudonymSaltFingerprint":"$omop_pseudonym_salt_fingerprint",
  "siteSigningKeyFingerprint":"$site_signing_fingerprint",
  "externalAiSealKeyFingerprint":"$external_ai_seal_fingerprint",
  "administratorMfaKeyFingerprint":"$administrator_mfa_key_fingerprint",
  "manifestAuthKeyFingerprint":"$auth_fingerprint",
  "createdAt":"$created_at",
  "createdAtEpoch":$created_epoch,
  "completedAt":"$completed_at",
  "completedAtEpoch":$completed_epoch,
  "dumpFile":"database.dump",
  "sourceDatabaseBytes":$database_bytes,
  "dumpBytes":$dump_bytes,
  "dumpSha256":"$dump_sha256"
}
EOF
manifest_hmac="$(backup_hmac_file "$unsigned_manifest")" \
  || fail_backup BACKUP_MANIFEST_AUTH_FAILED
sed '$d' "$unsigned_manifest" | sed '$s/$/,/' > "$pending_manifest" \
  || fail_backup BACKUP_MANIFEST_FINALIZE_FAILED
printf '  "manifestHmacSha256":"%s"\n}\n' "$manifest_hmac" >> "$pending_manifest" \
  || fail_backup BACKUP_MANIFEST_FINALIZE_FAILED
rm -f -- "$unsigned_manifest" "$schema_file" "$migrations_file"
chmod 600 "$dump_file" "$pending_manifest" || fail_backup ARTIFACT_FINALIZE_FAILED
backup_sync_file "$dump_file" || fail_backup BACKUP_FSYNC_FAILED
backup_sync_file "$pending_manifest" || fail_backup BACKUP_FSYNC_FAILED
backup_sync_file "$run_temporary" || fail_backup BACKUP_FSYNC_FAILED

if ! mv "$run_temporary" "$final_object"; then
  fail_backup ARTIFACT_FINALIZE_FAILED
fi
run_temporary=""
backup_sync_file "$backup_dir" || fail_backup BACKUP_FSYNC_FAILED
# The manifest is the discovery/commit record and is deliberately made visible
# only after the dump and its containing directory are durable.
mv "$final_object/manifest.pending" "$final_object/manifest.json" \
  || fail_backup BACKUP_MANIFEST_FINALIZE_FAILED
backup_sync_file "$final_object/manifest.json" || fail_backup BACKUP_FSYNC_FAILED
backup_sync_file "$final_object" || fail_backup BACKUP_FSYNC_FAILED
backup_sync_file "$backup_dir" || fail_backup BACKUP_FSYNC_FAILED

backup_verify_object "$final_object" full || fail_backup BACKUP_PUBLISHED_VERIFY_FAILED
backup_pin_object "$final_object" "$backup_kind" "$completed_epoch" \
  || fail_backup BACKUP_RETENTION_PIN_FAILED
object_committed=1

backup_write_last_verified "$final_object" "$completed_epoch" \
  || fail_backup BACKUP_MARKER_WRITE_FAILED
manifest_sha256="$(sha256sum "$final_object/manifest.json" | awk '{ print $1 }')"

write_status SUCCESS BACKUP_VERIFIED "$dump_bytes" || {
  backup_error BACKUP_SIGNAL_WRITE_FAILED
  exit 1
}
release_lock

# Off-host software receives only the recovery-object path. Exit 0 means the
# exact object is durably acknowledged; 75 means explicitly deferred. Any
# other code is a failed copy, but cannot invalidate the already verified local
# recovery point.
offhost_hook="${HOSPITAL_BACKUP_OFFHOST_HOOK:-}"
if [ -n "$offhost_hook" ]; then
  case "$offhost_hook" in /*) ;; *) backup_error OFFHOST_HOOK_INVALID; printf '%s\n' BACKUP_VERIFIED; exit 0 ;; esac
  if [ ! -x "$offhost_hook" ]; then
    backup_error OFFHOST_HOOK_INVALID
  else
    set +e
    "$offhost_hook" "$final_object"
    offhost_result=$?
    set -e
    case "$offhost_result" in
      0)
        offhost_marker="$backup_dir/.last-offhost-verified.v1.tmp.$$"
        printf 'schemaVersion=1\nacknowledgedAtEpoch=%s\nobjectName=%s\nmanifestSha256=%s\n' \
          "$(now_epoch)" "$(basename "$final_object")" "$manifest_sha256" > "$offhost_marker" \
          && chmod 600 "$offhost_marker" \
          && backup_sync_file "$offhost_marker" \
          && mv -f "$offhost_marker" "$backup_dir/.last-offhost-verified.v1" \
          && backup_sync_file "$backup_dir/.last-offhost-verified.v1" \
          && backup_sync_file "$backup_dir" \
          || backup_error OFFHOST_ACK_MARKER_FAILED
        ;;
      75) backup_error OFFHOST_COPY_DEFERRED ;;
      *) backup_error OFFHOST_COPY_FAILED ;;
    esac
  fi
fi

printf '%s\n' BACKUP_VERIFIED
