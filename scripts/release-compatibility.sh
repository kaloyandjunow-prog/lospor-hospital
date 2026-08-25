#!/bin/sh

# Strict parser for the compatibility policy shipped inside every deployment
# archive.  This file is authenticated indirectly by the deployment archive's
# release-lock checksum; it must never be sourced as shell code.

release_compatibility_read() {
  compatibility_path="$1"
  [ -f "$compatibility_path" ] && [ ! -L "$compatibility_path" ] \
    || { echo "Release compatibility metadata is missing or unsafe." >&2; return 1; }
  [ "$(wc -l < "$compatibility_path" | tr -d '[:space:]')" = 1 ] \
    || { echo "Release compatibility metadata must be exactly one line." >&2; return 1; }
  [ "$(wc -c < "$compatibility_path" | tr -d '[:space:]')" -le 512 ] \
    || { echo "Release compatibility metadata is oversized." >&2; return 1; }
  awk -F '\t' 'NR == 1 && NF == 7 { ok=1 } END { exit !ok }' "$compatibility_path" \
    || { echo "Release compatibility metadata has an unsupported shape." >&2; return 1; }
  compatibility_tab="$(printf '\t')"
  IFS="$compatibility_tab" read -r \
    compatibility_header compatibility_version compatibility_schema_min \
    compatibility_schema_max compatibility_rollback_policy \
    compatibility_proof_sha256 compatibility_rollback_window_days \
    compatibility_extra < "$compatibility_path" \
    || { echo "Release compatibility metadata is unreadable." >&2; return 1; }
  [ -z "${compatibility_extra:-}" ] \
    && [ "$compatibility_header" = LOSPOR-HOSPITAL-RELEASE-COMPATIBILITY-V1 ] \
    || { echo "Release compatibility metadata has an unsupported shape." >&2; return 1; }
  printf '%s\n' "$compatibility_version" \
    | grep -Eq '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' \
    || { echo "Release compatibility version is invalid." >&2; return 1; }
  for migration in "$compatibility_schema_min" "$compatibility_schema_max"; do
    printf '%s\n' "$migration" \
      | grep -Eq '^[0-9]{14}_[a-z0-9_]{1,80}$' \
      || { echo "Release compatibility schema boundary is invalid." >&2; return 1; }
  done
  compatibility_schema_min_epoch="${compatibility_schema_min%%_*}"
  compatibility_schema_max_epoch="${compatibility_schema_max%%_*}"
  [ "$compatibility_schema_min_epoch" -le "$compatibility_schema_max_epoch" ] \
    || { echo "Release compatibility schema range is reversed." >&2; return 1; }
  case "$compatibility_rollback_policy" in
    service-compatible)
      printf '%s\n' "$compatibility_proof_sha256" | grep -Eq '^[a-f0-9]{64}$' \
        || { echo "Service-compatible rollback requires an exact proof digest." >&2; return 1; }
      case "$compatibility_rollback_window_days" in
        ''|*[!0-9]*) echo "Rollback window is invalid." >&2; return 1 ;;
      esac
      [ "${#compatibility_rollback_window_days}" -le 3 ] \
        && [ "$compatibility_rollback_window_days" -ge 1 ] \
        && [ "$compatibility_rollback_window_days" -le 365 ] \
        || { echo "Service-compatible rollback requires a non-zero window." >&2; return 1; }
      ;;
    backup-required)
      [ "$compatibility_proof_sha256" = - ] \
        && [ "$compatibility_rollback_window_days" = 0 ] \
        || { echo "Backup-required releases cannot claim service-rollback evidence." >&2; return 1; }
      ;;
    *) echo "Release rollback policy is invalid." >&2; return 1 ;;
  esac
  return 0
}

release_compatibility_assert_version() {
  expected_compatibility_version="$1"
  [ "$compatibility_version" = "$expected_compatibility_version" ] \
    || { echo "Release compatibility metadata names a different version." >&2; return 1; }
}
