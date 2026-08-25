#!/bin/sh
# Shared, POSIX-shell backup-object validation. This file is sourced by the
# backup, retention, and restore entrypoints; it never performs an operation on
# a database by itself.

backup_error() {
  printf '%s\n' "$1" >&2
}

backup_is_uint() {
  case "${1:-}" in
    ''|*[!0-9]*) return 1 ;;
    *) return 0 ;;
  esac
}

backup_is_sha256() {
  [ "${#1}" -eq 64 ] || return 1
  case "$1" in *[!0-9a-f]*) return 1 ;; esac
}

backup_is_fingerprint() {
  case "$1" in
    sha256:*) backup_is_sha256 "${1#sha256:}" ;;
    *) return 1 ;;
  esac
}

backup_is_safe_value() {
  [ -n "$1" ] || return 1
  case "$1" in *[!A-Za-z0-9._:@+-]*) return 1 ;; esac
}

backup_hmac_file() {
  hmac_input="$1"
  hmac_key="${HOSPITAL_BACKUP_MANIFEST_HMAC_KEY:-}"
  [ "${#hmac_key}" -ge 32 ] || {
    backup_error BACKUP_MANIFEST_AUTH_KEY_INVALID
    return 1
  }
  command -v openssl >/dev/null 2>&1 || {
    backup_error BACKUP_MANIFEST_AUTH_TOOL_MISSING
    return 1
  }
  hmac_value="$(openssl dgst -sha256 -hmac "$hmac_key" "$hmac_input" 2>/dev/null \
    | awk '{ print $NF }')" || return 1
  backup_is_sha256 "$hmac_value" || return 1
  printf '%s\n' "$hmac_value"
}

backup_manifest_value() {
  manifest_file="$1"
  manifest_key="$2"
  manifest_count="$(grep -c "^  \"${manifest_key}\":" "$manifest_file" 2>/dev/null || true)"
  [ "$manifest_count" = 1 ] || return 1
  sed -n "s/^  \"${manifest_key}\":\"\([^\"]*\)\",\{0,1\}$/\1/p" "$manifest_file"
}

backup_manifest_number() {
  manifest_file="$1"
  manifest_key="$2"
  manifest_count="$(grep -c "^  \"${manifest_key}\":" "$manifest_file" 2>/dev/null || true)"
  [ "$manifest_count" = 1 ] || return 1
  sed -n "s/^  \"${manifest_key}\":\([0-9][0-9]*\),\{0,1\}$/\1/p" "$manifest_file"
}

backup_manifest_unsigned_copy() {
  signed_manifest="$1"
  unsigned_manifest="$2"
  manifest_lines="$(wc -l < "$signed_manifest" | tr -d '[:space:]')"
  backup_is_uint "$manifest_lines" && [ "$manifest_lines" -ge 5 ] || return 1
  hmac_line=$((manifest_lines - 1))
  previous_line=$((manifest_lines - 2))
  awk -v hmac_line="$hmac_line" -v previous_line="$previous_line" '
    NR == hmac_line { next }
    NR == previous_line { sub(/,$/, "") }
    { print }
  ' "$signed_manifest" > "$unsigned_manifest"
}

# The authenticated format is intentionally closed: accepting arbitrary JSON
# members would let an external tool place PHI or secret material into an
# otherwise valid manifest. The unreleased 1.2 format contains exactly these
# 31 flat fields, including every key needed to reopen protected database data.
backup_manifest_shape_allowed() {
  shape_manifest="$1"
  [ "$(wc -l < "$shape_manifest" | tr -d '[:space:]')" = 33 ] \
    && [ "$(sed -n '1p' "$shape_manifest")" = '{' ] \
    && [ "$(sed -n '33p' "$shape_manifest")" = '}' ] \
    && [ "$(sed -n '2,32p' "$shape_manifest" \
      | grep -Ec '^  "[A-Za-z][A-Za-z0-9]*":("[^"]*"|[0-9]+),?$')" = 31 ] \
    && [ "$(sed -n '2,31p' "$shape_manifest" \
      | grep -Ec '^  "[A-Za-z][A-Za-z0-9]*":("[^"]*"|[0-9]+),$')" = 30 ] \
    && printf '%s\n' "$(sed -n '32p' "$shape_manifest")" \
      | grep -Eq '^  "manifestHmacSha256":"[0-9a-f]{64}"$' \
    || return 1
  sed -n '2,32s/^  "\([A-Za-z][A-Za-z0-9]*\)":.*$/\1/p' "$shape_manifest" \
    | while IFS= read -r shape_key; do
        case "$shape_key" in
          schemaVersion|objectType|toolVersion|runId|kind|siteId|applianceId|hospitalRelease|exchangeContractVersion|dataDictionaryVersion|postgresMajor|migrationCount|migrationFingerprint|schemaFingerprint|patientHmacKeyFingerprint|patientEncryptionKeyFingerprint|exportPseudonymKeyFingerprint|omopPseudonymSaltFingerprint|siteSigningKeyFingerprint|externalAiSealKeyFingerprint|administratorMfaKeyFingerprint|manifestAuthKeyFingerprint|createdAt|createdAtEpoch|completedAt|completedAtEpoch|dumpFile|sourceDatabaseBytes|dumpBytes|dumpSha256|manifestHmacSha256) ;;
          *) exit 1 ;;
        esac
      done
}

backup_canonical_object() {
  requested_object="$1"
  backup_root="${HOSPITAL_BACKUP_DIR:-/backups}"
  [ -d "$backup_root" ] && [ ! -L "$backup_root" ] || return 1
  [ -d "$requested_object" ] && [ ! -L "$requested_object" ] || return 1

  object_name="$(basename "$requested_object")"
  printf '%s\n' "$object_name" \
    | grep -Eq '^lospor-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{6,32}\.backup$' \
    || return 1

  root_physical="$(CDPATH= cd -- "$backup_root" && pwd -P)" || return 1
  parent_physical="$(CDPATH= cd -- "$(dirname "$requested_object")" && pwd -P)" || return 1
  [ "$root_physical" = "$parent_physical" ] || return 1
  printf '%s/%s\n' "$root_physical" "$object_name"
}

# Validate and authenticate one complete recovery object. On success, the
# privacy-safe manifest fields are exported as backup_manifest_* variables.
# The optional second argument is `full`, which additionally asks pg_restore to
# parse the custom-format archive. Retention uses `integrity` to avoid reading
# every archive twice merely to decide what may be removed.
backup_verify_object() {
  verify_requested="$1"
  verify_level="${2:-integrity}"
  verify_object="$(backup_canonical_object "$verify_requested")" || {
    backup_error BACKUP_OBJECT_PATH_INVALID
    return 1
  }
  verify_manifest="$verify_object/manifest.json"
  verify_dump="$verify_object/database.dump"
  [ -f "$verify_manifest" ] && [ ! -L "$verify_manifest" ] \
    && [ -f "$verify_dump" ] && [ ! -L "$verify_dump" ] || {
      backup_error BACKUP_OBJECT_INCOMPLETE
      return 1
    }
  backup_manifest_shape_allowed "$verify_manifest" || {
    backup_error BACKUP_MANIFEST_SCHEMA_CLOSED
    return 1
  }

  backup_manifest_schema_version="$(backup_manifest_number "$verify_manifest" schemaVersion)" || return 1
  backup_manifest_object_type="$(backup_manifest_value "$verify_manifest" objectType)" || return 1
  backup_manifest_tool_version="$(backup_manifest_value "$verify_manifest" toolVersion)" || return 1
  backup_manifest_run_id="$(backup_manifest_value "$verify_manifest" runId)" || return 1
  backup_manifest_kind="$(backup_manifest_value "$verify_manifest" kind)" || return 1
  backup_manifest_site_id="$(backup_manifest_value "$verify_manifest" siteId)" || return 1
  backup_manifest_appliance_id="$(backup_manifest_value "$verify_manifest" applianceId)" || return 1
  backup_manifest_release="$(backup_manifest_value "$verify_manifest" hospitalRelease)" || return 1
  backup_manifest_exchange_version="$(backup_manifest_value "$verify_manifest" exchangeContractVersion)" || return 1
  backup_manifest_dictionary_version="$(backup_manifest_value "$verify_manifest" dataDictionaryVersion)" || return 1
  backup_manifest_postgres_major="$(backup_manifest_number "$verify_manifest" postgresMajor)" || return 1
  backup_manifest_migration_count="$(backup_manifest_number "$verify_manifest" migrationCount)" || return 1
  backup_manifest_migration_fingerprint="$(backup_manifest_value "$verify_manifest" migrationFingerprint)" || return 1
  backup_manifest_schema_fingerprint="$(backup_manifest_value "$verify_manifest" schemaFingerprint)" || return 1
  backup_manifest_patient_hmac_fingerprint="$(backup_manifest_value "$verify_manifest" patientHmacKeyFingerprint)" || return 1
  backup_manifest_patient_encryption_fingerprint="$(backup_manifest_value "$verify_manifest" patientEncryptionKeyFingerprint)" || return 1
  backup_manifest_export_pseudonym_fingerprint="$(backup_manifest_value "$verify_manifest" exportPseudonymKeyFingerprint)" || return 1
  backup_manifest_omop_pseudonym_salt_fingerprint="$(backup_manifest_value "$verify_manifest" omopPseudonymSaltFingerprint)" || return 1
  backup_manifest_site_signing_fingerprint="$(backup_manifest_value "$verify_manifest" siteSigningKeyFingerprint)" || return 1
  backup_manifest_external_ai_seal_fingerprint="$(backup_manifest_value "$verify_manifest" externalAiSealKeyFingerprint)" || return 1
  backup_manifest_administrator_mfa_key_fingerprint="$(backup_manifest_value "$verify_manifest" administratorMfaKeyFingerprint)" || return 1
  backup_manifest_auth_key_fingerprint="$(backup_manifest_value "$verify_manifest" manifestAuthKeyFingerprint)" || return 1
  backup_manifest_created_at="$(backup_manifest_value "$verify_manifest" createdAt)" || return 1
  backup_manifest_created_epoch="$(backup_manifest_number "$verify_manifest" createdAtEpoch)" || return 1
  backup_manifest_completed_at="$(backup_manifest_value "$verify_manifest" completedAt)" || return 1
  backup_manifest_completed_epoch="$(backup_manifest_number "$verify_manifest" completedAtEpoch)" || return 1
  backup_manifest_dump_file="$(backup_manifest_value "$verify_manifest" dumpFile)" || return 1
  backup_manifest_source_database_bytes="$(backup_manifest_number "$verify_manifest" sourceDatabaseBytes)" || return 1
  backup_manifest_dump_bytes="$(backup_manifest_number "$verify_manifest" dumpBytes)" || return 1
  backup_manifest_dump_sha256="$(backup_manifest_value "$verify_manifest" dumpSha256)" || return 1
  backup_manifest_hmac="$(backup_manifest_value "$verify_manifest" manifestHmacSha256)" || return 1

  [ "$backup_manifest_schema_version" = 1 ] \
    && [ "$backup_manifest_object_type" = lospor-postgresql-logical-backup ] \
    && [ "$backup_manifest_dump_file" = database.dump ] \
    && backup_is_safe_value "$backup_manifest_tool_version" \
    && backup_is_safe_value "$backup_manifest_run_id" \
    && backup_is_safe_value "$backup_manifest_site_id" \
    && backup_is_safe_value "$backup_manifest_appliance_id" \
    && backup_is_safe_value "$backup_manifest_release" \
    && backup_is_safe_value "$backup_manifest_exchange_version" \
    && backup_is_safe_value "$backup_manifest_dictionary_version" \
    && backup_is_uint "$backup_manifest_postgres_major" \
    && backup_is_uint "$backup_manifest_migration_count" \
    && backup_is_uint "$backup_manifest_created_epoch" \
    && backup_is_uint "$backup_manifest_completed_epoch" \
    && backup_is_uint "$backup_manifest_source_database_bytes" \
    && [ "$backup_manifest_source_database_bytes" -gt 0 ] \
    && backup_is_uint "$backup_manifest_dump_bytes" \
    && [ "$backup_manifest_dump_bytes" -gt 0 ] \
    && [ "$backup_manifest_completed_epoch" -ge "$backup_manifest_created_epoch" ] \
    && backup_is_fingerprint "$backup_manifest_migration_fingerprint" \
    && backup_is_fingerprint "$backup_manifest_schema_fingerprint" \
    && backup_is_fingerprint "$backup_manifest_patient_hmac_fingerprint" \
    && backup_is_fingerprint "$backup_manifest_patient_encryption_fingerprint" \
    && backup_is_fingerprint "$backup_manifest_export_pseudonym_fingerprint" \
    && backup_is_fingerprint "$backup_manifest_omop_pseudonym_salt_fingerprint" \
    && backup_is_fingerprint "$backup_manifest_site_signing_fingerprint" \
    && backup_is_fingerprint "$backup_manifest_external_ai_seal_fingerprint" \
    && backup_is_fingerprint "$backup_manifest_administrator_mfa_key_fingerprint" \
    && backup_is_fingerprint "$backup_manifest_auth_key_fingerprint" \
    && backup_is_sha256 "$backup_manifest_dump_sha256" \
    && backup_is_sha256 "$backup_manifest_hmac" || {
      backup_error BACKUP_MANIFEST_INVALID
      return 1
    }
  case "$backup_manifest_kind" in scheduled|manual|pre-update|immutable|pre-restore) ;; *)
    backup_error BACKUP_MANIFEST_INVALID
    return 1
  esac
  printf '%s\n' "$backup_manifest_created_at" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' \
    && printf '%s\n' "$backup_manifest_completed_at" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' || {
      backup_error BACKUP_MANIFEST_INVALID
      return 1
    }

  computed_auth_fingerprint="sha256:$(printf '%s' "${HOSPITAL_BACKUP_MANIFEST_HMAC_KEY:-}" | sha256sum | awk '{ print $1 }')" || return 1
  [ "$computed_auth_fingerprint" = "$backup_manifest_auth_key_fingerprint" ] || {
    backup_error BACKUP_MANIFEST_AUTH_KEY_MISMATCH
    return 1
  }

  unsigned_copy="$(mktemp "${TMPDIR:-/tmp}/lospor-manifest-unsigned.XXXXXX")" || return 1
  if ! backup_manifest_unsigned_copy "$verify_manifest" "$unsigned_copy"; then
    rm -f -- "$unsigned_copy"
    backup_error BACKUP_MANIFEST_INVALID
    return 1
  fi
  computed_hmac="$(backup_hmac_file "$unsigned_copy")" || {
    rm -f -- "$unsigned_copy"
    backup_error BACKUP_MANIFEST_AUTH_FAILED
    return 1
  }
  rm -f -- "$unsigned_copy"
  [ "$computed_hmac" = "$backup_manifest_hmac" ] || {
    backup_error BACKUP_MANIFEST_AUTH_FAILED
    return 1
  }

  actual_bytes="$(wc -c < "$verify_dump" | tr -d '[:space:]')"
  actual_sha256="$(sha256sum "$verify_dump" 2>/dev/null | awk '{ print $1 }')" || return 1
  [ "$actual_bytes" = "$backup_manifest_dump_bytes" ] \
    && [ "$actual_sha256" = "$backup_manifest_dump_sha256" ] || {
      backup_error BACKUP_DUMP_INTEGRITY_FAILED
      return 1
    }

  if [ "$verify_level" = full ]; then
    pg_restore --list "$verify_dump" >/dev/null 2>&1 || {
      backup_error BACKUP_DUMP_CATALOG_INVALID
      return 1
    }
  elif [ "$verify_level" != integrity ]; then
    backup_error BACKUP_VERIFY_LEVEL_INVALID
    return 1
  fi

  backup_verified_object="$verify_object"
  backup_verified_manifest="$verify_manifest"
  backup_verified_dump="$verify_dump"
}

backup_read_last_verified() {
  backup_root="${HOSPITAL_BACKUP_DIR:-/backups}"
  marker="$backup_root/.last-verified.v1"
  [ -f "$marker" ] && [ ! -L "$marker" ] || return 1
  marker_version="$(sed -n 's/^schemaVersion=//p' "$marker")"
  marker_epoch="$(sed -n 's/^completedAtEpoch=//p' "$marker")"
  marker_object="$(sed -n 's/^objectName=//p' "$marker")"
  marker_manifest_sha="$(sed -n 's/^manifestSha256=//p' "$marker")"
  [ "$marker_version" = 1 ] && backup_is_uint "$marker_epoch" \
    && backup_is_sha256 "$marker_manifest_sha" || return 1
  printf '%s\n' "$marker_object" \
    | grep -Eq '^lospor-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{6,32}\.backup$' || return 1
  marker_manifest="$backup_root/$marker_object/manifest.json"
  [ -f "$marker_manifest" ] && [ ! -L "$marker_manifest" ] || return 1
  actual_marker_sha="$(sha256sum "$marker_manifest" 2>/dev/null | awk '{ print $1 }')" || return 1
  [ "$actual_marker_sha" = "$marker_manifest_sha" ] || return 1
  backup_last_completed_epoch="$marker_epoch"
  backup_last_object="$backup_root/$marker_object"
}

# Recover the newest authenticated manifest-last object when a crash happened
# after object publication but before `.last-verified.v1` was replaced. This is
# intentionally a fallback path; the normal marker avoids scanning every dump.
backup_find_latest_verified() {
  latest_root="${HOSPITAL_BACKUP_DIR:-/backups}"
  latest_epoch=""
  latest_object=""
  for latest_candidate in "$latest_root"/lospor-*.backup; do
    [ -e "$latest_candidate" ] || continue
    if backup_verify_object "$latest_candidate" integrity; then
      if [ -z "$latest_epoch" ] || [ "$backup_manifest_completed_epoch" -gt "$latest_epoch" ]; then
        latest_epoch="$backup_manifest_completed_epoch"
        latest_object="$backup_verified_object"
      fi
    fi
  done
  [ -n "$latest_object" ] || return 1
  backup_latest_completed_epoch="$latest_epoch"
  backup_latest_object="$latest_object"
}

backup_write_last_verified() {
  marker_object_requested="$1"
  marker_completed_epoch="$2"
  backup_is_uint "$marker_completed_epoch" || return 1
  marker_object_canonical="$(backup_canonical_object "$marker_object_requested")" || return 1
  marker_object_name="$(basename "$marker_object_canonical")"
  marker_manifest="$marker_object_canonical/manifest.json"
  [ -f "$marker_manifest" ] && [ ! -L "$marker_manifest" ] || return 1
  marker_manifest_epoch="$(backup_manifest_number "$marker_manifest" completedAtEpoch)" || return 1
  [ "$marker_manifest_epoch" = "$marker_completed_epoch" ] || return 1
  marker_manifest_sha="$(sha256sum "$marker_manifest" 2>/dev/null | awk '{ print $1 }')" || return 1
  backup_is_sha256 "$marker_manifest_sha" || return 1
  marker_root="${HOSPITAL_BACKUP_DIR:-/backups}"
  marker_tmp="$marker_root/.last-verified.v1.tmp.$$"
  if ! printf 'schemaVersion=1\ncompletedAtEpoch=%s\nobjectName=%s\nmanifestSha256=%s\n' \
      "$marker_completed_epoch" "$marker_object_name" "$marker_manifest_sha" > "$marker_tmp" \
      || ! chmod 600 "$marker_tmp" \
      || ! backup_sync_file "$marker_tmp" \
      || ! mv -f "$marker_tmp" "$marker_root/.last-verified.v1" \
      || ! backup_sync_file "$marker_root/.last-verified.v1" \
      || ! backup_sync_file "$marker_root"; then
    rm -f -- "$marker_tmp"
    return 1
  fi
}

backup_pin_object() {
  pin_object="$1"
  pin_kind="$2"
  pin_epoch="$3"
  case "$pin_kind" in pre-update|immutable|pre-restore) ;; *) return 0 ;; esac
  backup_is_uint "$pin_epoch" || return 1
  pin_tmp="$pin_object/.retain-${pin_kind}.tmp.$$"
  pin_final="$pin_object/.retain-${pin_kind}"
  printf 'schemaVersion=1\nkind=%s\nrequestedAtEpoch=%s\n' "$pin_kind" "$pin_epoch" > "$pin_tmp" \
    && chmod 600 "$pin_tmp" \
    && backup_sync_file "$pin_tmp" \
    && mv -f "$pin_tmp" "$pin_final" \
    && backup_sync_file "$pin_final" \
    && backup_sync_file "$pin_object"
}

backup_sync_file() {
  sync -f "$1" >/dev/null 2>&1
}
