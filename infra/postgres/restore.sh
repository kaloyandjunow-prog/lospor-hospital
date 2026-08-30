#!/bin/sh
set -eu

umask 077

script_dir="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
object_lib="${HOSPITAL_BACKUP_OBJECT_LIB:-/usr/local/bin/backup-object-lib.sh}"
[ -f "$object_lib" ] || object_lib="$script_dir/backup-object-lib.sh"
. "$object_lib"

usage() {
  cat >&2 <<'EOF'
Usage:
  restore.sh verify /backups/lospor-...backup
  restore.sh temporary /backups/lospor-...backup TEMP_DATABASE
  restore.sh validate /backups/lospor-...backup TEMP_DATABASE
  restore.sh switch /backups/lospor-...backup TEMP_DATABASE PREVIOUS_DATABASE

The one-argument legacy form is deliberately unsupported: it dropped the live
database after checksum-only validation.
EOF
  exit 2
}

mode="${1:-}"
artifact="${2:-}"
case "$mode" in
  verify) [ "$#" -eq 2 ] || usage ;;
  temporary|validate) [ "$#" -eq 3 ] || usage ;;
  switch) [ "$#" -eq 4 ] || usage ;;
  *) usage ;;
esac

safe_database_name() {
  printf '%s\n' "$1" | grep -Eq '^lospor_(restore|previous)_[a-z0-9_]{6,40}$'
}

migration_metadata() {
  metadata_database="$1"
  metadata_file="$2"
  psql --host=postgres --username="$POSTGRES_USER" --dbname="$metadata_database" \
    --tuples-only --no-align --set=ON_ERROR_STOP=1 \
    --command="SELECT migration_name || ':' || checksum FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;" \
    > "$metadata_file"
}

schema_fingerprint() {
  schema_database="$1"
  schema_output="$2"
  schema_raw="${schema_output}.raw"
  pg_dump --host=postgres --username="$POSTGRES_USER" --dbname="$schema_database" \
    --schema-only --no-owner --no-privileges --file="$schema_raw" >/dev/null
  sed '/^\\restrict /d; /^\\unrestrict /d' "$schema_raw" > "$schema_output"
  rm -f -- "$schema_raw"
  printf 'sha256:%s\n' "$(sha256sum "$schema_output" | awk '{ print $1 }')"
}

# The schema fingerprint above hashes rendered DDL, and rendered DDL is NOT a
# fixed point across a dump/restore round trip. PostgreSQL stores an expression
# tree, not your SQL text: `BETWEEN 3 AND 64` becomes a *nested* AND node, which
# pg_dump renders with brackets, and reloading that dump re-parses and flattens
# it. So a live database built by migrations and the same database restored from
# its own backup differ by punctuation alone -- and validation refused the
# restore. Deterministically, on every appliance, on the one path that matters:
# rollback_policy=backup-required makes restoring a verified backup the only
# supported recovery from a failed update.
#
# Comparing catalog renderings instead does not help; pg_get_constraintdef()
# differs too, because the stored trees really are different shapes.
#
# So put both sides through the same parse-and-render. The restored database has
# already been reloaded once; this reloads the live schema into a throwaway
# schema-only database so its rendering is normalised the same way. Anything
# that is genuinely a different schema still differs; punctuation no longer does.
roundtrip_schema_fingerprint() {
  roundtrip_source="$1"
  roundtrip_output="$2"
  roundtrip_scratch="lospor_schemanorm_$$"
  roundtrip_dump="${roundtrip_output}.roundtrip.sql"

  pg_dump --host=postgres --username="$POSTGRES_USER" --dbname="$roundtrip_source" \
    --schema-only --no-owner --no-privileges --file="$roundtrip_dump" >/dev/null || return 1

  psql --host=postgres --username="$POSTGRES_USER" --dbname=postgres \
    --set=ON_ERROR_STOP=1 --command="DROP DATABASE IF EXISTS \"$roundtrip_scratch\";" >/dev/null 2>&1
  psql --host=postgres --username="$POSTGRES_USER" --dbname=postgres \
    --set=ON_ERROR_STOP=1 --command="CREATE DATABASE \"$roundtrip_scratch\";" >/dev/null || {
      rm -f -- "$roundtrip_dump"
      return 1
    }

  roundtrip_status=0
  psql --host=postgres --username="$POSTGRES_USER" --dbname="$roundtrip_scratch" \
    --set=ON_ERROR_STOP=1 --quiet --file="$roundtrip_dump" >/dev/null 2>&1 || roundtrip_status=1
  if [ "$roundtrip_status" -eq 0 ]; then
    schema_fingerprint "$roundtrip_scratch" "$roundtrip_output" || roundtrip_status=1
  fi

  # The scratch database is schema-only and disposable, but it must never
  # outlive this check -- a leaked copy is exactly the complaint against the
  # temporary-restore path.
  psql --host=postgres --username="$POSTGRES_USER" --dbname=postgres \
    --set=ON_ERROR_STOP=1 --command="DROP DATABASE IF EXISTS \"$roundtrip_scratch\";" >/dev/null 2>&1
  rm -f -- "$roundtrip_dump"
  return "$roundtrip_status"
}

release_not_newer() {
  backup_version="$1"
  current_version="$2"
  if printf '%s\n%s\n' "$backup_version" "$current_version" \
      | grep -Eqv '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    [ "$backup_version" = "$current_version" ]
    return
  fi
  awk -v backup="$backup_version" -v current="$current_version" 'BEGIN {
    split(backup, b, "."); split(current, c, ".")
    if (b[1] != c[1]) exit 1
    for (i = 1; i <= 3; i++) {
      if ((b[i] + 0) < (c[i] + 0)) exit 0
      if ((b[i] + 0) > (c[i] + 0)) exit 1
    }
    exit 0
  }'
}

preflight() {
  backup_verify_object "$artifact" full || {
    backup_error RESTORE_OBJECT_VERIFICATION_FAILED
    return 1
  }

  expected_site="${HOSPITAL_BACKUP_SITE_ID:-}"
  expected_appliance="${HOSPITAL_BACKUP_APPLIANCE_ID:-}"
  current_release="${HOSPITAL_APPLIANCE_RELEASE:-${HOSPITAL_RELEASE:-}}"
  current_exchange="${HOSPITAL_EXCHANGE_CONTRACT_VERSION:-}"
  current_dictionary="${HOSPITAL_DATA_DICTIONARY_VERSION:-}"
  expected_patient_hmac="${HOSPITAL_PATIENT_HMAC_KEY_FINGERPRINT:-}"
  expected_patient_encryption="${HOSPITAL_PATIENT_ENCRYPTION_KEY_FINGERPRINT:-}"
  expected_export_pseudonym="${HOSPITAL_EXPORT_PSEUDONYM_KEY_FINGERPRINT:-}"
  expected_omop_pseudonym_salt="${HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT:-}"
  expected_site_signing="${HOSPITAL_SITE_SIGNING_KEY_FINGERPRINT:-}"
  expected_external_ai_seal="${HOSPITAL_EXTERNAL_AI_SEAL_KEY_FINGERPRINT:-}"
  expected_administrator_mfa_key="${HOSPITAL_MFA_ENCRYPTION_KEY_FINGERPRINT:-}"
  for required_value in "$expected_site" "$expected_appliance" "$current_release" \
    "$current_exchange" "$current_dictionary"; do
    backup_is_safe_value "$required_value" || {
      backup_error RESTORE_LOCAL_COMPATIBILITY_METADATA_INVALID
      return 1
    }
  done
  for expected_fingerprint in "$expected_patient_hmac" "$expected_patient_encryption" \
    "$expected_export_pseudonym" "$expected_omop_pseudonym_salt" "$expected_site_signing" "$expected_external_ai_seal" \
    "$expected_administrator_mfa_key"; do
    backup_is_fingerprint "$expected_fingerprint" || {
      backup_error RESTORE_LOCAL_KEY_FINGERPRINT_INVALID
      return 1
    }
  done

  [ "$backup_manifest_site_id" = "$expected_site" ] || {
    backup_error RESTORE_SITE_MISMATCH
    return 1
  }
  [ "$backup_manifest_appliance_id" = "$expected_appliance" ] || {
    backup_error RESTORE_APPLIANCE_MISMATCH
    return 1
  }
  release_not_newer "$backup_manifest_release" "$current_release" || {
    backup_error RESTORE_RELEASE_INCOMPATIBLE
    return 1
  }
  [ "$backup_manifest_exchange_version" = "$current_exchange" ] \
    && [ "$backup_manifest_dictionary_version" = "$current_dictionary" ] || {
      backup_error RESTORE_DATA_CONTRACT_INCOMPATIBLE
      return 1
    }
  [ "$backup_manifest_patient_hmac_fingerprint" = "$expected_patient_hmac" ] || {
    backup_error RESTORE_PATIENT_HMAC_KEY_MISMATCH
    return 1
  }
  [ "$backup_manifest_patient_encryption_fingerprint" = "$expected_patient_encryption" ] || {
    backup_error RESTORE_PATIENT_ENCRYPTION_KEY_MISMATCH
    return 1
  }
  [ "$backup_manifest_export_pseudonym_fingerprint" = "$expected_export_pseudonym" ] || {
    backup_error RESTORE_EXPORT_PSEUDONYM_KEY_MISMATCH
    return 1
  }
  [ "$backup_manifest_omop_pseudonym_salt_fingerprint" = "$expected_omop_pseudonym_salt" ] || {
    backup_error RESTORE_OMOP_PSEUDONYM_SALT_MISMATCH
    return 1
  }
  [ "$backup_manifest_site_signing_fingerprint" = "$expected_site_signing" ] || {
    backup_error RESTORE_SITE_SIGNING_KEY_MISMATCH
    return 1
  }
  [ "$backup_manifest_external_ai_seal_fingerprint" = "$expected_external_ai_seal" ] || {
    backup_error RESTORE_EXTERNAL_AI_SEAL_KEY_MISMATCH
    return 1
  }
  [ "$backup_manifest_administrator_mfa_key_fingerprint" = "$expected_administrator_mfa_key" ] || {
    backup_error RESTORE_ADMINISTRATOR_MFA_KEY_MISMATCH
    return 1
  }

  server_version_num="$(psql --host=postgres --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
    --tuples-only --no-align --set=ON_ERROR_STOP=1 --command='SHOW server_version_num;' 2>/dev/null)" \
    || { backup_error RESTORE_POSTGRES_PREFLIGHT_FAILED; return 1; }
  backup_is_uint "$server_version_num" || { backup_error RESTORE_POSTGRES_PREFLIGHT_FAILED; return 1; }
  current_postgres_major=$((server_version_num / 10000))
  [ "$backup_manifest_postgres_major" -eq "$current_postgres_major" ] || {
    backup_error RESTORE_POSTGRES_MAJOR_INCOMPATIBLE
    return 1
  }

  current_migrations="$(mktemp "${TMPDIR:-/tmp}/lospor-current-migrations.XXXXXX")" || return 1
  if ! migration_metadata "$POSTGRES_DB" "$current_migrations"; then
    rm -f -- "$current_migrations"
    backup_error RESTORE_CURRENT_MIGRATIONS_UNAVAILABLE
    return 1
  fi
  current_migration_count="$(wc -l < "$current_migrations" | tr -d '[:space:]')"
  current_migration_fingerprint="sha256:$(sha256sum "$current_migrations" | awk '{ print $1 }')"
  rm -f -- "$current_migrations"
  [ "$backup_manifest_migration_count" -le "$current_migration_count" ] || {
    backup_error RESTORE_NEWER_SCHEMA_REFUSED
    return 1
  }
  if [ "$backup_manifest_migration_count" -eq "$current_migration_count" ] \
      && [ "$backup_manifest_migration_fingerprint" != "$current_migration_fingerprint" ]; then
    backup_error RESTORE_MIGRATION_HISTORY_MISMATCH
    return 1
  fi

  printf '%s\n' RESTORE_PREFLIGHT_OK
  printf 'RESTORE_SITE_ID=%s\n' "$backup_manifest_site_id"
  printf 'RESTORE_COMPLETED_AT=%s\n' "$backup_manifest_completed_at"
  printf 'RESTORE_COMPLETED_EPOCH=%s\n' "$backup_manifest_completed_epoch"
  printf 'RESTORE_SOURCE_DATABASE_BYTES=%s\n' "$backup_manifest_source_database_bytes"
  printf 'RESTORE_MIGRATION_COUNT=%s\n' "$backup_manifest_migration_count"
  printf 'RESTORE_MANIFEST_SHA256=%s\n' "$(sha256sum "$backup_verified_manifest" | awk '{ print $1 }')"
}

case "$mode" in
  verify)
    preflight
    ;;

  temporary)
    target_database="$3"
    safe_database_name "$target_database" || { backup_error RESTORE_TEMP_DATABASE_INVALID; exit 2; }
    [ "$target_database" != "$POSTGRES_DB" ] || { backup_error RESTORE_TEMP_DATABASE_INVALID; exit 2; }
    preflight >/dev/null
    expected_confirmation="TEMPORARY RESTORE ${backup_manifest_site_id} ${backup_manifest_completed_at}"
    [ "${LOSPOR_RESTORE_CONFIRM:-}" = "$expected_confirmation" ] || {
      backup_error RESTORE_TYPED_CONFIRMATION_REQUIRED
      exit 2
    }
    database_exists="$(psql --host=postgres --username="$POSTGRES_USER" --dbname=postgres \
      --tuples-only --no-align --set=ON_ERROR_STOP=1 \
      --command="SELECT 1 FROM pg_database WHERE datname = '$target_database';")"
    [ -z "$database_exists" ] || { backup_error RESTORE_TEMP_DATABASE_EXISTS; exit 1; }
    createdb --host=postgres --username="$POSTGRES_USER" "$target_database"
    if ! pg_restore --host=postgres --username="$POSTGRES_USER" --dbname="$target_database" \
        --no-owner "$backup_verified_dump"; then
      dropdb --host=postgres --username="$POSTGRES_USER" --if-exists "$target_database" >/dev/null 2>&1 || true
      backup_error RESTORE_TEMPORARY_FAILED
      exit 1
    fi
    psql --host=postgres --username="$POSTGRES_USER" --dbname="$target_database" \
      --tuples-only --no-align --set=ON_ERROR_STOP=1 --command='SELECT 1;' >/dev/null
    printf 'TEMPORARY_RESTORE_READY=%s\n' "$target_database"
    ;;

  validate)
    target_database="$3"
    safe_database_name "$target_database" || { backup_error RESTORE_TEMP_DATABASE_INVALID; exit 2; }
    [ "$target_database" != "$POSTGRES_DB" ] || { backup_error RESTORE_TEMP_DATABASE_INVALID; exit 2; }
    preflight >/dev/null
    live_migrations="$(mktemp "${TMPDIR:-/tmp}/lospor-live-migrations.XXXXXX")"
    temp_migrations="$(mktemp "${TMPDIR:-/tmp}/lospor-temp-migrations.XXXXXX")"
    live_schema="$(mktemp "${TMPDIR:-/tmp}/lospor-live-schema.XXXXXX")"
    temp_schema="$(mktemp "${TMPDIR:-/tmp}/lospor-temp-schema.XXXXXX")"
    cleanup_validation() { rm -f -- "$live_migrations" "$temp_migrations" "$live_schema" "$temp_schema"; }
    trap cleanup_validation EXIT HUP INT TERM
    migration_metadata "$POSTGRES_DB" "$live_migrations" \
      && migration_metadata "$target_database" "$temp_migrations" \
      || { backup_error RESTORE_TEMP_MIGRATIONS_INVALID; exit 1; }
    live_migration_sha="$(sha256sum "$live_migrations" | awk '{ print $1 }')"
    temp_migration_sha="$(sha256sum "$temp_migrations" | awk '{ print $1 }')"
    [ "$live_migration_sha" = "$temp_migration_sha" ] || {
      backup_error RESTORE_TEMP_MIGRATIONS_INCOMPATIBLE
      exit 1
    }
    # Live goes through a round trip so it is rendered the same way the restored
    # database is; the restored one has already been reloaded once, so hashing it
    # directly is the matching side of the comparison.
    live_schema_fingerprint="$(roundtrip_schema_fingerprint "$POSTGRES_DB" "$live_schema")" || {
      backup_error RESTORE_TEMP_SCHEMA_UNVERIFIABLE
      exit 1
    }
    temp_schema_fingerprint="$(schema_fingerprint "$target_database" "$temp_schema")"
    [ "$live_schema_fingerprint" = "$temp_schema_fingerprint" ] || {
      backup_error RESTORE_TEMP_SCHEMA_INCOMPATIBLE
      exit 1
    }
    psql --host=postgres --username="$POSTGRES_USER" --dbname="$target_database" \
      --tuples-only --no-align --set=ON_ERROR_STOP=1 --command='SELECT 1;' >/dev/null
    printf 'RESTORE_TEMP_VALIDATED=%s\n' "$target_database"
    ;;

  switch)
    target_database="$3"
    previous_database="$4"
    safe_database_name "$target_database" && safe_database_name "$previous_database" \
      || { backup_error RESTORE_SWITCH_DATABASE_INVALID; exit 2; }
    case "$target_database:$previous_database" in
      lospor_restore_*:lospor_previous_*) ;;
      *) backup_error RESTORE_SWITCH_DATABASE_INVALID; exit 2 ;;
    esac
    [ "$target_database" != "$previous_database" ] \
      && [ "$target_database" != "$POSTGRES_DB" ] \
      && [ "$previous_database" != "$POSTGRES_DB" ] \
      || { backup_error RESTORE_SWITCH_DATABASE_INVALID; exit 2; }
    preflight >/dev/null
    sh "$0" validate "$artifact" "$target_database" >/dev/null
    expected_confirmation="EMERGENCY RESTORE ${backup_manifest_site_id} ${backup_manifest_completed_at}"
    [ "${LOSPOR_RESTORE_CONFIRM:-}" = "$expected_confirmation" ] \
      && [ "${LOSPOR_RESTORE_DESTRUCTIVE_BOUNDARY_ACK:-}" = 1 ] || {
        backup_error RESTORE_EMERGENCY_CONFIRMATION_REQUIRED
        exit 2
      }

    # The outer emergency path must have captured the current live database
    # after validating the requested restore object. A pre-restore snapshot is
    # never deduplicated, and its authenticated manifest digest is the proof
    # crossing this boundary.
    restore_site_id="$backup_manifest_site_id"
    restore_appliance_id="$backup_manifest_appliance_id"
    safety_proof="${LOSPOR_RESTORE_SAFETY_SNAPSHOT_MANIFEST_SHA256:-}"
    backup_is_sha256 "$safety_proof" || {
      backup_error RESTORE_SAFETY_SNAPSHOT_REQUIRED
      exit 2
    }
    backup_read_last_verified || { backup_error RESTORE_SAFETY_SNAPSHOT_INVALID; exit 1; }
    safety_marker_epoch="$backup_last_completed_epoch"
    safety_marker="${HOSPITAL_BACKUP_DIR:-/backups}/.last-verified.v1"
    safety_manifest_sha="$(sed -n 's/^manifestSha256=//p' "$safety_marker")"
    [ "$safety_manifest_sha" = "$safety_proof" ] \
      && [ -f "$backup_last_object/.retain-pre-restore" ] \
      && [ ! -L "$backup_last_object/.retain-pre-restore" ] || {
        backup_error RESTORE_SAFETY_SNAPSHOT_INVALID
        exit 1
      }
    safety_max_age="${HOSPITAL_RESTORE_SAFETY_SNAPSHOT_MAX_AGE_SECONDS:-900}"
    backup_is_uint "$safety_max_age" && [ "$safety_max_age" -gt 0 ] \
      || { backup_error RESTORE_SAFETY_SNAPSHOT_POLICY_INVALID; exit 2; }
    backup_verify_object "$backup_last_object" integrity \
      || { backup_error RESTORE_SAFETY_SNAPSHOT_INVALID; exit 1; }
    [ "$backup_manifest_completed_epoch" = "$safety_marker_epoch" ] || {
      backup_error RESTORE_SAFETY_SNAPSHOT_INVALID
      exit 1
    }
    safety_now="$(date -u +%s)"
    safety_age=$((safety_now - backup_manifest_completed_epoch))
    [ "$safety_age" -ge 0 ] && [ "$safety_age" -le "$safety_max_age" ] || {
      backup_error RESTORE_SAFETY_SNAPSHOT_STALE
      exit 1
    }
    [ "$backup_manifest_kind" = pre-restore ] \
      && [ "$backup_manifest_site_id" = "$restore_site_id" ] \
      && [ "$backup_manifest_appliance_id" = "$restore_appliance_id" ] || {
        backup_error RESTORE_SAFETY_SNAPSHOT_INVALID
        exit 1
      }

    # The outer wrapper distinguishes a validation refusal from an operation
    # that may already have renamed the live database by observing this shared,
    # durable marker. Validate its exact shared-volume location now, but do not
    # publish it until every read-only switch check below has passed.
    boundary_marker="${LOSPOR_RESTORE_BOUNDARY_MARKER:-}"
    boundary_root="${HOSPITAL_BACKUP_DIR:-/backups}"
    boundary_name="$(basename "$boundary_marker")"
    boundary_parent="$(dirname "$boundary_marker")"
    boundary_root_physical="$(CDPATH= cd -- "$boundary_root" && pwd -P)" \
      || { backup_error RESTORE_BOUNDARY_MARKER_INVALID; exit 2; }
    boundary_parent_physical="$(CDPATH= cd -- "$boundary_parent" && pwd -P)" \
      || { backup_error RESTORE_BOUNDARY_MARKER_INVALID; exit 2; }
    [ "$boundary_parent_physical" = "$boundary_root_physical" ] \
      && printf '%s\n' "$boundary_name" \
        | grep -Eq '^\.restore-boundary-[0-9a-f]{24}\.started$' || {
      backup_error RESTORE_BOUNDARY_MARKER_INVALID
      exit 2
    }

    target_exists="$(psql --host=postgres --username="$POSTGRES_USER" --dbname=postgres \
      --tuples-only --no-align --set=ON_ERROR_STOP=1 \
      --command="SELECT 1 FROM pg_database WHERE datname = '$target_database';")"
    previous_exists="$(psql --host=postgres --username="$POSTGRES_USER" --dbname=postgres \
      --tuples-only --no-align --set=ON_ERROR_STOP=1 \
      --command="SELECT 1 FROM pg_database WHERE datname = '$previous_database';")"
    [ "$target_exists" = 1 ] && [ -z "$previous_exists" ] || {
      backup_error RESTORE_SWITCH_DATABASE_STATE_INVALID
      exit 1
    }
    psql --host=postgres --username="$POSTGRES_USER" --dbname=postgres \
      --set=ON_ERROR_STOP=1 --command="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('$POSTGRES_DB', '$target_database') AND pid <> pg_backend_pid();" >/dev/null

    # `mkdir` is the atomic destructive-boundary declaration. Once it exists,
    # even a power loss or process kill is interpreted conservatively by the
    # host wrapper. The marker is made durable before the first ALTER DATABASE.
    if ! mkdir "$boundary_marker"; then
      backup_error RESTORE_BOUNDARY_MARKER_EXISTS
      exit 1
    fi
    chmod 700 "$boundary_marker" \
      || { backup_error RESTORE_BOUNDARY_MARKER_WRITE_FAILED; exit 1; }
    printf 'schemaVersion=1\nstartedAt=%s\ntargetDatabase=%s\npreviousDatabase=%s\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$target_database" "$previous_database" \
      > "$boundary_marker/state" \
      || { backup_error RESTORE_BOUNDARY_MARKER_WRITE_FAILED; exit 1; }
    chmod 600 "$boundary_marker/state" \
      && backup_sync_file "$boundary_marker/state" \
      && backup_sync_file "$boundary_marker" \
      && backup_sync_file "$boundary_root_physical" || {
      backup_error RESTORE_BOUNDARY_MARKER_WRITE_FAILED
      exit 1
    }
    psql --host=postgres --username="$POSTGRES_USER" --dbname=postgres \
      --set=ON_ERROR_STOP=1 --command="ALTER DATABASE \"$POSTGRES_DB\" RENAME TO \"$previous_database\";"
    if ! psql --host=postgres --username="$POSTGRES_USER" --dbname=postgres \
        --set=ON_ERROR_STOP=1 --command="ALTER DATABASE \"$target_database\" RENAME TO \"$POSTGRES_DB\";"; then
      psql --host=postgres --username="$POSTGRES_USER" --dbname=postgres \
        --set=ON_ERROR_STOP=1 --command="ALTER DATABASE \"$previous_database\" RENAME TO \"$POSTGRES_DB\";" \
        >/dev/null 2>&1 || true
      backup_error RESTORE_SWITCH_FAILED
      exit 1
    fi
    printf 'RESTORE_SWITCH_COMPLETE=%s\n' "$previous_database"
    ;;
esac
