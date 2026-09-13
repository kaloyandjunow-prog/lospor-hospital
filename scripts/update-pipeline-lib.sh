#!/bin/sh

# Shared strict state protocol for the host update agent.  State in
# update-private is root-only; update-agent.v2.json is the deliberately narrow,
# non-secret projection Status may read.

update_pipeline_init() {
  update_root="$1"
  update_appliance_home="$2"
  update_runtime="$update_appliance_home/.data/runtime/update"
  update_requests_dir="$update_runtime/requests"
  update_projection_dir="$update_runtime/state"
  update_private_dir="$update_appliance_home/.data/update-private"
  update_inflight_dir="$update_private_dir/inflight"
  update_prepared_dir="$update_private_dir/prepared"
  update_transition="$update_private_dir/transition.v2.tsv"
  update_journal="$update_private_dir/journal.v2.tsv"
  update_projection="$update_projection_dir/update-agent.v2.json"
  update_activation_lock="$update_appliance_home/.data/release-activation.lock"
  mkdir -p "$update_requests_dir" "$update_projection_dir" "$update_inflight_dir" "$update_prepared_dir"
  chmod 0700 "$update_private_dir" "$update_inflight_dir" "$update_prepared_dir" 2>/dev/null || return 1
}

update_now_epoch() { date -u +%s; }
update_now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# A rename is atomic but it is not durable until both the file data and the
# containing directory entry have reached disk. Every safety-critical state
# publication in this library goes through this helper so a power loss cannot
# turn a completed write into an older, plausible state after restart.
update_sync_path() {
  sync_path="$1"
  command -v sync >/dev/null 2>&1 || { echo UPDATE_DURABILITY_SYNC_FAILED >&2; return 1; }
  sync "$sync_path" >/dev/null 2>&1 && return 0
  # MSYS cannot fsync ordinary NTFS files. It is a maintainer test platform,
  # never a supported appliance host; Linux production must still fail closed.
  case "$(uname -s 2>/dev/null || echo unknown)" in MINGW*|MSYS*|CYGWIN*) return 0 ;; esac
  echo UPDATE_DURABILITY_SYNC_FAILED >&2
  return 1
}

update_durable_replace() {
  durable_temporary="$1"
  durable_target="$2"
  update_sync_path "$durable_temporary" || return 1
  mv "$durable_temporary" "$durable_target" || return 1
  update_sync_path "$durable_target" || return 1
  update_sync_path "$(dirname "$durable_target")" || return 1
}

# Convert a local maintenance-window opening into one unambiguous UTC instant.
# The caller has already validated the IANA zone and HH:MM value. Supplying the
# current epoch makes DST boundary behavior directly testable without changing
# the host clock.
update_next_window_opening() {
  window_timezone="$1"
  window_start_time="$2"
  window_now_epoch="${3:-$(update_now_epoch)}"
  window_local_day="$(TZ="$window_timezone" date -d "@$window_now_epoch" +%Y-%m-%d 2>/dev/null)" \
    || return 1
  window_candidate="$(TZ="$window_timezone" date -d "$window_local_day $window_start_time" +%s 2>/dev/null)" \
    || return 1
  if [ "$window_candidate" -le "$window_now_epoch" ]; then
    window_next_day="$(TZ="$window_timezone" date -d "$window_local_day +1 day" +%Y-%m-%d 2>/dev/null)" \
      || return 1
    window_candidate="$(TZ="$window_timezone" date -d "$window_next_day $window_start_time" +%s 2>/dev/null)" \
      || return 1
  fi
  date -u -d "@$window_candidate" +%Y-%m-%dT%H:%M:%SZ
}

update_valid_version() {
  [ "${#1}" -le 32 ] \
    && printf '%s\n' "$1" | grep -Eq '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
}

update_valid_sha() { printf '%s\n' "$1" | grep -Eq '^[a-f0-9]{64}$'; }
update_valid_epoch() {
  case "$1" in ''|*[!0-9]*) return 1 ;; esac
  [ "${#1}" -le 12 ] && [ "$1" -le 999999999999 ]
}

update_parse_request() {
  request_path="$1"
  expected_action="$2"
  [ -f "$request_path" ] && [ ! -L "$request_path" ] \
    || { echo UPDATE_REQUEST_UNSAFE >&2; return 1; }
  request_bytes="$(wc -c < "$request_path" | tr -d '[:space:]')" || return 1
  [ "$request_bytes" -ge 1 ] && [ "$request_bytes" -le 512 ] \
    || { echo UPDATE_REQUEST_OVERSIZED >&2; return 1; }
  [ "$(wc -l < "$request_path" | tr -d '[:space:]')" = 1 ] \
    || { echo UPDATE_REQUEST_MALFORMED >&2; return 1; }
  awk -F '\t' 'NR == 1 && NF == 6 { ok=1 } END { exit !ok }' "$request_path" \
    || { echo UPDATE_REQUEST_MALFORMED >&2; return 1; }
  request_tab="$(printf '\t')"
  IFS="$request_tab" read -r request_header request_action request_id \
    request_target_version request_created_epoch request_window request_extra < "$request_path" \
    || { echo UPDATE_REQUEST_MALFORMED >&2; return 1; }
  [ -z "${request_extra:-}" ] \
    && [ "$request_header" = LOSPOR-HOSPITAL-UPDATE-REQUEST-V2 ] \
    && [ "$request_action" = "$expected_action" ] \
    || { echo UPDATE_REQUEST_MALFORMED >&2; return 1; }
  printf '%s\n' "$request_id" | grep -Eq '^[a-f0-9]{32}$' \
    || { echo UPDATE_REQUEST_MALFORMED >&2; return 1; }
  update_valid_version "$request_target_version" \
    || { echo UPDATE_REQUEST_MALFORMED >&2; return 1; }
  update_valid_epoch "$request_created_epoch" \
    || { echo UPDATE_REQUEST_MALFORMED >&2; return 1; }
  case "$request_window" in scheduled|override|none) ;; *) echo UPDATE_REQUEST_MALFORMED >&2; return 1 ;; esac
  [ "$request_action" = apply ] || [ "$request_window" = none ] \
    || { echo UPDATE_REQUEST_MALFORMED >&2; return 1; }
  now="$(update_now_epoch)"
  max_age_days="${HOSPITAL_UPDATE_REQUEST_MAX_AGE_DAYS:-7}"
  case "$max_age_days" in ''|*[!0-9]*) echo UPDATE_REQUEST_POLICY_INVALID >&2; return 1 ;; esac
  [ "$max_age_days" -ge 1 ] && [ "$max_age_days" -le 30 ] \
    || { echo UPDATE_REQUEST_POLICY_INVALID >&2; return 1; }
  [ "$request_created_epoch" -le "$((now + 300))" ] \
    || { echo UPDATE_REQUEST_FUTURE >&2; return 1; }
  [ "$((now - request_created_epoch))" -le "$((max_age_days * 86400))" ] \
    || { echo UPDATE_REQUEST_EXPIRED >&2; return 1; }
  return 0
}

update_transition_write() {
  transition_phase="$1"; transition_action="$2"; transition_id="$3"
  transition_target="$4"; transition_code="${5:--}"; transition_lock="${6:--}"
  case "$transition_phase" in
    ACCEPTED|PREPARING|PREPARED|APPLYING|COMPLETED|FAILED|NEEDS_OPERATOR) ;;
    *) echo "Invalid update transition phase." >&2; return 1 ;;
  esac
  case "$transition_action" in prepare|apply|reconcile) ;; *) return 1 ;; esac
  printf '%s\n' "$transition_id" | grep -Eq '^(-|[a-f0-9]{32})$' || return 1
  [ "$transition_target" = - ] || update_valid_version "$transition_target" || return 1
  printf '%s\n' "$transition_code" | grep -Eq '^(-|[A-Z][A-Z0-9_]{2,63})$' || return 1
  [ "$transition_lock" = - ] || update_valid_sha "$transition_lock" || return 1
  transition_epoch="$(update_now_epoch)"
  transition_tmp="$update_transition.tmp.$$"
  transition_prior_umask="$(umask)"
  umask 077
  printf 'LOSPOR-HOSPITAL-UPDATE-TRANSITION-V2\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$transition_epoch" "$transition_phase" "$transition_action" "$transition_id" \
    "$transition_target" "$transition_code" "$transition_lock" > "$transition_tmp" \
    || { umask "$transition_prior_umask"; return 1; }
  chmod 0600 "$transition_tmp" || { umask "$transition_prior_umask"; return 1; }
  update_durable_replace "$transition_tmp" "$update_transition" || { umask "$transition_prior_umask"; return 1; }
  [ ! -L "$update_journal" ] && { [ ! -e "$update_journal" ] || [ -f "$update_journal" ]; } \
    || { umask "$transition_prior_umask"; echo UPDATE_STATE_UNSAFE >&2; return 1; }
  printf 'LOSPOR-HOSPITAL-UPDATE-JOURNAL-V2\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$transition_epoch" "$transition_phase" "$transition_action" "$transition_id" \
    "$transition_target" "$transition_code" "$transition_lock" >> "$update_journal" \
    || { umask "$transition_prior_umask"; return 1; }
  chmod 0600 "$update_journal" || { umask "$transition_prior_umask"; return 1; }
  umask "$transition_prior_umask"
  update_sync_path "$update_journal" || return 1
  update_sync_path "$(dirname "$update_journal")" || return 1
}

update_transition_read() {
  [ -f "$update_transition" ] && [ ! -L "$update_transition" ] || return 10
  [ "$(wc -l < "$update_transition" | tr -d '[:space:]')" = 1 ] || return 1
  awk -F '\t' 'NR == 1 && NF == 8 { ok=1 } END { exit !ok }' "$update_transition" || return 1
  transition_tab="$(printf '\t')"
  IFS="$transition_tab" read -r transition_header transition_epoch transition_phase \
    transition_action transition_id transition_target transition_code transition_lock \
    transition_extra < "$update_transition" || return 1
  [ -z "${transition_extra:-}" ] \
    && [ "$transition_header" = LOSPOR-HOSPITAL-UPDATE-TRANSITION-V2 ] || return 1
  update_valid_epoch "$transition_epoch" || return 1
  case "$transition_phase" in ACCEPTED|PREPARING|PREPARED|APPLYING|COMPLETED|FAILED|NEEDS_OPERATOR) ;; *) return 1 ;; esac
  case "$transition_action" in prepare|apply|reconcile) ;; *) return 1 ;; esac
  printf '%s\n' "$transition_id" | grep -Eq '^(-|[a-f0-9]{32})$' || return 1
  [ "$transition_target" = - ] || update_valid_version "$transition_target" || return 1
  printf '%s\n' "$transition_code" | grep -Eq '^(-|[A-Z][A-Z0-9_]{2,63})$' || return 1
  [ "$transition_lock" = - ] || update_valid_sha "$transition_lock" || return 1
}

update_projection_write() {
  projection_phase="$1"; projection_code="$2"; projection_target="${3:-}"
  projection_scheduled="${4:-}"; projection_prepared_version="${5:-}"
  projection_prepared_lock="${6:-}"; projection_rollback="${7:-}"
  case "$projection_phase" in idle|accepted|queued|preparing|prepared|applying|completed|failed|needs-operator) ;; *) return 1 ;; esac
  printf '%s\n' "$projection_code" | grep -Eq '^[A-Z][A-Z0-9_]{2,63}$' || return 1
  [ -z "$projection_target" ] || update_valid_version "$projection_target" || return 1
  [ -z "$projection_prepared_version" ] || update_valid_version "$projection_prepared_version" || return 1
  [ -z "$projection_prepared_lock" ] || update_valid_sha "$projection_prepared_lock" || return 1
  case "$projection_rollback" in ''|service-compatible|backup-required) ;; *) return 1 ;; esac
  if [ -n "$projection_scheduled" ]; then
    printf '%s\n' "$projection_scheduled" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' || return 1
  fi
  projection_tmp="$update_projection.tmp.$$"
  projection_prior_umask="$(umask)"
  umask 022
  {
    printf '{"schemaVersion":2,"signalType":"update-agent","observedAt":"%s","phase":"%s","resultCode":"%s"' \
      "$(update_now_iso)" "$projection_phase" "$projection_code"
    [ -z "$projection_target" ] || printf ',"targetVersion":"%s"' "$projection_target"
    [ -z "$projection_scheduled" ] || printf ',"scheduledFor":"%s"' "$projection_scheduled"
    [ -z "$projection_prepared_version" ] || printf ',"preparedVersion":"%s"' "$projection_prepared_version"
    [ -z "$projection_prepared_lock" ] || printf ',"preparedLockSha256":"%s"' "$projection_prepared_lock"
    [ -z "$projection_rollback" ] || printf ',"rollbackPolicy":"%s"' "$projection_rollback"
    printf '}\n'
  } > "$projection_tmp" || { umask "$projection_prior_umask"; return 1; }
  umask "$projection_prior_umask"
  chmod 0644 "$projection_tmp" || return 1
  update_durable_replace "$projection_tmp" "$update_projection"
}

update_descriptor_read() {
  descriptor_path="$1"
  [ -f "$descriptor_path" ] && [ ! -L "$descriptor_path" ] || return 1
  [ "$(wc -l < "$descriptor_path" | tr -d '[:space:]')" = 1 ] || return 1
  [ "$(wc -c < "$descriptor_path" | tr -d '[:space:]')" -le 2048 ] || return 1
  awk -F '\t' 'NR == 1 && NF == 17 { ok=1 } END { exit !ok }' "$descriptor_path" || return 1
  descriptor_tab="$(printf '\t')"
  IFS="$descriptor_tab" read -r descriptor_header descriptor_version descriptor_tag \
    descriptor_commit descriptor_candidate_run descriptor_candidate_attempt \
    descriptor_lock_sha descriptor_signature_sha descriptor_release_id descriptor_root \
    descriptor_prepared_epoch descriptor_installed_version descriptor_image_set_sha \
    descriptor_schema_min descriptor_schema_max descriptor_rollback_policy \
    descriptor_proof_sha descriptor_extra < "$descriptor_path" || return 1
  [ -z "${descriptor_extra:-}" ] \
    && [ "$descriptor_header" = LOSPOR-HOSPITAL-PREPARED-RELEASE-V2 ] || return 1
  update_valid_version "$descriptor_version" || return 1
  [ "$descriptor_tag" = "hospital-$descriptor_version" ] || return 1
  printf '%s\n' "$descriptor_commit" | grep -Eq '^[a-f0-9]{40}$' || return 1
  for numeric in "$descriptor_candidate_run" "$descriptor_candidate_attempt" "$descriptor_release_id" "$descriptor_prepared_epoch"; do
    case "$numeric" in ''|*[!0-9]*) return 1 ;; esac
  done
  update_valid_sha "$descriptor_lock_sha" || return 1
  update_valid_sha "$descriptor_signature_sha" || return 1
  update_valid_sha "$descriptor_image_set_sha" || return 1
  [ "$descriptor_installed_version" = - ] || update_valid_version "$descriptor_installed_version" || return 1
  expected_descriptor_root="$update_prepared_dir/$descriptor_version/assets"
  [ "$descriptor_root" = "$expected_descriptor_root" ] && [ -d "$descriptor_root" ] && [ ! -L "$descriptor_root" ] || return 1
  descriptor_lock="$descriptor_root/lospor-hospital-$descriptor_version-release.lock"
  descriptor_checksum="$descriptor_lock.sha256"
  [ -s "$descriptor_lock" ] && [ -s "$descriptor_checksum" ] && [ -s "$descriptor_lock.sig" ] || return 1
  [ "$(sha256sum "$descriptor_lock" | awk '{print $1}')" = "$descriptor_lock_sha" ] || return 1
  [ "$(sha256sum "$descriptor_lock.sig" | awk '{print $1}')" = "$descriptor_signature_sha" ] || return 1
  descriptor_actual_image_sha="$(awk -F '\t' '$1 == "image" { print }' "$descriptor_lock" | sha256sum | awk '{print $1}')"
  [ "$descriptor_actual_image_sha" = "$descriptor_image_set_sha" ] || return 1
  . "$update_root/scripts/release-compatibility.sh"
  compatibility_file="$update_prepared_dir/$descriptor_version/release-compatibility.tsv"
  release_compatibility_read "$compatibility_file" || return 1
  release_compatibility_assert_version "$descriptor_version" || return 1
  [ "$descriptor_schema_min" = "$compatibility_schema_min" ] \
    && [ "$descriptor_schema_max" = "$compatibility_schema_max" ] \
    && [ "$descriptor_rollback_policy" = "$compatibility_rollback_policy" ] \
    && [ "$descriptor_proof_sha" = "$compatibility_proof_sha256" ] || return 1
  return 0
}

update_descriptor_for_version() {
  update_valid_version "$1" || return 1
  update_descriptor_read "$update_prepared_dir/$1/prepared-release.v2.tsv"
}

update_latest_descriptor() {
  descriptor_count=0
  descriptor_selected=""
  for descriptor_candidate in "$update_prepared_dir"/*/prepared-release.v2.tsv; do
    [ -e "$descriptor_candidate" ] || continue
    update_descriptor_read "$descriptor_candidate" || continue
    descriptor_count=$((descriptor_count + 1))
    descriptor_selected="$descriptor_candidate"
  done
  [ "$descriptor_count" -eq 1 ] || return 1
  update_descriptor_read "$descriptor_selected"
}

update_remove_prepared_version() {
  remove_prepared_version="$1"
  update_valid_version "$remove_prepared_version" || return 1
  remove_prepared_root="$update_prepared_dir/$remove_prepared_version"
  [ ! -e "$remove_prepared_root" ] && return 0
  [ -d "$remove_prepared_root" ] && [ ! -L "$remove_prepared_root" ] || return 1
  case "$remove_prepared_root" in "$update_prepared_dir/"*) rm -rf "$remove_prepared_root" ;; *) return 1 ;; esac
  update_sync_path "$update_prepared_dir"
}

update_io_lock_acquire() {
  update_io_lock="$update_appliance_home/.data/io-mutation.lock"
  update_io_owner="$update_io_lock.owner.v1.tsv"
  update_io_purpose="${1:-update}"
  printf '%s\n' "$update_io_purpose" | grep -Eq '^[a-z][a-z0-9-]{1,31}$' \
    || { echo UPDATE_MAINTENANCE_LOCK_INVALID >&2; return 1; }
  command -v flock >/dev/null 2>&1 \
    || { echo UPDATE_MAINTENANCE_LOCK_UNAVAILABLE >&2; return 1; }
  [ -f "$update_io_lock" ] && [ ! -L "$update_io_lock" ] \
    && [ "$(stat -c %h "$update_io_lock" 2>/dev/null || echo 0)" = 1 ] \
    || { echo UPDATE_MAINTENANCE_LOCK_INVALID >&2; return 1; }
  if [ "${HOSPITAL_UPDATE_TEST_ONLY:-0}" != 1 ]; then
    [ "$(stat -c %u "$update_io_lock" 2>/dev/null || echo -)" = 0 ] \
      && [ "$(stat -c %a "$update_io_lock" 2>/dev/null || echo -)" = 600 ] \
      || { echo UPDATE_MAINTENANCE_LOCK_INVALID >&2; return 1; }
  fi
  exec 8>>"$update_io_lock" \
    || { echo UPDATE_MAINTENANCE_LOCK_UNAVAILABLE >&2; return 1; }
  if ! flock -n 8; then
    exec 8>&-
    echo UPDATE_MAINTENANCE_BUSY >&2
    return 1
  fi
  update_io_owner_token="$(update_now_epoch)-$$-$update_io_purpose"
  update_io_owner_tmp="$update_io_owner.tmp.$$"
  update_io_prior_umask="$(umask)"
  umask 077
  if ! printf 'LOSPOR-HOSPITAL-IO-MUTATION-OWNER-V1\t%s\t%s\t%s\t%s\n' \
      "$(update_now_epoch)" "$$" "$update_io_purpose" "$update_io_owner_token" \
      > "$update_io_owner_tmp" \
    || ! chmod 0600 "$update_io_owner_tmp" \
    || ! update_durable_replace "$update_io_owner_tmp" "$update_io_owner"; then
    umask "$update_io_prior_umask"
    rm -f "$update_io_owner_tmp" 2>/dev/null || true
    flock -u 8 2>/dev/null || true
    exec 8>&-
    update_io_lock=""
    echo UPDATE_MAINTENANCE_LOCK_UNAVAILABLE >&2
    return 1
  fi
  umask "$update_io_prior_umask"
}

update_io_lock_release() {
  [ -n "${update_io_lock:-}" ] || return 0
  if [ -f "${update_io_owner:-}" ] && [ ! -L "$update_io_owner" ] \
    && awk -F '\t' -v token="${update_io_owner_token:-__missing__}" \
      'NR == 1 && NF == 5 && $1 == "LOSPOR-HOSPITAL-IO-MUTATION-OWNER-V1" && $5 == token { ok=1 } END { exit !(NR == 1 && ok) }' \
      "$update_io_owner" 2>/dev/null; then
    if rm -f "$update_io_owner" 2>/dev/null; then
      update_sync_path "$(dirname "$update_io_owner")" 2>/dev/null || true
    fi
  fi
  flock -u 8 2>/dev/null || true
  exec 8>&-
  update_io_lock=""
  update_io_owner=""
  update_io_owner_token=""
}
