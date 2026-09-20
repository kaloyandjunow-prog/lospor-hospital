#!/bin/sh
set -eu

# Root host supervisor for the two deliberate update operations. Status writes
# only fixed-field intent; this agent independently resolves and authenticates
# all trusted release identities.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$root/scripts/installed-release-state.sh"
. "$root/scripts/update-pipeline-lib.sh"
appliance_home="$(release_state_appliance_home "$root")"
update_pipeline_init "$root" "$appliance_home"
. "$root/scripts/terminology-agent-lib.sh"
terminology_agent_init
. "$root/scripts/site-config.sh"
. "$root/scripts/secrets-escrow-lib.sh"
. "$root/scripts/maintenance-agent-lib.sh"
maintenance_agent_init
command -v flock >/dev/null 2>&1 || { echo UPDATE_AGENT_FLOCK_MISSING >&2; exit 2; }
agent_request_lock="$update_private_dir/request-agent.lock"
umask 077
[ ! -L "$agent_request_lock" ] \
  && { [ ! -e "$agent_request_lock" ] || [ -f "$agent_request_lock" ]; } \
  || { echo UPDATE_REQUEST_LOCK_UNSAFE >&2; exit 2; }
: >> "$agent_request_lock"
chmod 0600 "$agent_request_lock"
[ "$(stat -c %h "$agent_request_lock" 2>/dev/null || echo 0)" = 1 ] \
  || { echo UPDATE_REQUEST_LOCK_UNSAFE >&2; exit 2; }
if [ "${HOSPITAL_UPDATE_TEST_ONLY:-0}" != 1 ]; then
  [ "$(stat -c %u "$agent_request_lock" 2>/dev/null || echo -)" = 0 ] \
    && [ "$(stat -c %a "$agent_request_lock" 2>/dev/null || echo -)" = 600 ] \
    || { echo UPDATE_REQUEST_LOCK_UNSAFE >&2; exit 2; }
fi
update_sync_path "$agent_request_lock"
update_sync_path "$(dirname "$agent_request_lock")"
exec 9>"$agent_request_lock"

prepare_request="$update_requests_dir/prepare.request.v2.tsv"
apply_request="$update_requests_dir/apply.request.v2.tsv"
check_request="$update_requests_dir/check.request"
clock_stamp="$update_private_dir/agent-last-tick"
check_stamp="$update_private_dir/last-update-check"
terminology_inflight="$terminology_inflight_dir/terminology.request.v1.tsv"

poll="${HOSPITAL_UPDATE_AGENT_POLL_SECONDS:-15}"

# The update window and time zone are site settings, and the check interval an
# advanced setting. They are read from the
# appliance's compiled .env, not only from the environment systemd started this
# agent with: that file is written once at installation, and the agent cannot
# rewrite it (ProtectSystem=strict), so a window changed through site.env would
# otherwise never take effect. A change is noticed below and the agent exits for
# systemd to start it again with the new values.
site_window_value() {
  site_value=""
  if [ -f "$appliance_home/.env" ]; then
    site_value="$(sed -n "s/^$1=//p" "$appliance_home/.env" | tail -n 1 | tr -d '\r' | sed 's/^"//; s/"$//')"
  fi
  printf '%s\n' "${site_value:-$2}"
}
window_start="$(site_window_value HOSPITAL_UPDATE_WINDOW_START "${HOSPITAL_UPDATE_WINDOW_START:-20:00}")"
window_end="$(site_window_value HOSPITAL_UPDATE_WINDOW_END "${HOSPITAL_UPDATE_WINDOW_END:-06:00}")"
timezone="$(site_window_value HOSPITAL_UPDATE_TIMEZONE "${HOSPITAL_UPDATE_TIMEZONE:-Europe/Sofia}")"
check_interval="$(site_window_value HOSPITAL_UPDATE_CHECK_INTERVAL_SECONDS "${HOSPITAL_UPDATE_CHECK_INTERVAL_SECONDS:-86400}")"
site_window_settings() {
  printf '%s|%s|%s|%s\n' \
    "$(site_window_value HOSPITAL_UPDATE_WINDOW_START "${HOSPITAL_UPDATE_WINDOW_START:-20:00}")" \
    "$(site_window_value HOSPITAL_UPDATE_WINDOW_END "${HOSPITAL_UPDATE_WINDOW_END:-06:00}")" \
    "$(site_window_value HOSPITAL_UPDATE_TIMEZONE "${HOSPITAL_UPDATE_TIMEZONE:-Europe/Sofia}")" \
    "$(site_window_value HOSPITAL_UPDATE_CHECK_INTERVAL_SECONDS "${HOSPITAL_UPDATE_CHECK_INTERVAL_SECONDS:-86400}")"
}
started_window_settings="$(site_window_settings)"
zoneinfo_root=/usr/share/zoneinfo
if [ "${HOSPITAL_UPDATE_TEST_ONLY:-0}" = 1 ]; then
  zoneinfo_root="${HOSPITAL_UPDATE_TEST_ZONEINFO_ROOT:-$zoneinfo_root}"
fi
for value in "$poll" "$check_interval"; do
  case "$value" in ''|*[!0-9]*) echo UPDATE_AGENT_INTERVAL_INVALID >&2; exit 2 ;; esac
done
[ "$poll" -ge 5 ] || { echo UPDATE_AGENT_INTERVAL_INVALID >&2; exit 2; }
[ "$poll" -le 3600 ] \
  && [ "$check_interval" -ge 300 ] && [ "$check_interval" -le 2678400 ] \
  || { echo UPDATE_AGENT_INTERVAL_INVALID >&2; exit 2; }
for value in "$window_start" "$window_end"; do
  printf '%s\n' "$value" | grep -Eq '^([01][0-9]|2[0-3]):[0-5][0-9]$' \
    || { echo UPDATE_WINDOW_INVALID >&2; exit 2; }
done
printf '%s\n' "$timezone" | grep -Eq '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+)+$' \
  && [ -f "$zoneinfo_root/$timezone" ] && [ ! -L "$zoneinfo_root/$timezone" ] \
  || { echo UPDATE_TIMEZONE_INVALID >&2; exit 2; }

started_from="$(readlink "$appliance_home/current" 2>/dev/null || echo unknown)"

clock_went_backwards() {
  [ -f "$clock_stamp" ] || return 1
  last="$(cat "$clock_stamp" 2>/dev/null || echo 0)"
  update_valid_epoch "$last" || return 1
  [ "$last" -gt "$(( $(update_now_epoch) + 60 ))" ]
}

write_epoch_stamp() {
  stamp_target="$1"
  stamp_temporary="$stamp_target.tmp.$$"
  update_now_epoch > "$stamp_temporary"
  chmod 0600 "$stamp_temporary"
  update_durable_replace "$stamp_temporary" "$stamp_target"
}

minutes_of() { printf '%s' "$1" | awk -F: '{print ($1 * 60) + $2}'; }
inside_window() {
  now_minutes="$(TZ="$timezone" date +%H:%M | awk -F: '{print ($1 * 60) + $2}')"
  start="$(minutes_of "$window_start")"; end="$(minutes_of "$window_end")"
  if [ "$start" -le "$end" ]; then
    [ "$now_minutes" -ge "$start" ] && [ "$now_minutes" -lt "$end" ]
  else
    [ "$now_minutes" -ge "$start" ] || [ "$now_minutes" -lt "$end" ]
  fi
}

next_window_opening() {
  update_next_window_opening "$timezone" "$window_start" "$(update_now_epoch)" \
    || { echo UPDATE_TIMEZONE_CALCULATION_FAILED >&2; return 1; }
}

request_seen_terminal() {
  [ -f "$update_journal" ] || return 1
  awk -F '\t' -v id="$1" '$1 == "LOSPOR-HOSPITAL-UPDATE-JOURNAL-V2" && $5 == id && ($3 == "COMPLETED" || $3 == "FAILED" || $3 == "NEEDS_OPERATOR") { found=1 } END { exit !found }' "$update_journal"
}

# A terminal result must not erase the identity of an independently prepared
# release.  Status needs that identity (especially its rollback policy) to keep
# showing the exact safe Apply target and the backup-required warning after an
# unrelated malformed/replayed request or after a restart.
terminal_projection() {
  terminal_phase="$1"; terminal_code="$2"; terminal_target="${3:-}"
  if update_latest_descriptor; then
    update_projection_write "$terminal_phase" "$terminal_code" "$terminal_target" "" \
      "$descriptor_version" "$descriptor_lock_sha" "$descriptor_rollback_policy"
  else
    update_projection_write "$terminal_phase" "$terminal_code" "$terminal_target"
  fi
}

reject_request() {
  reject_code="$1"
  update_transition_write FAILED reconcile - - "$reject_code" -
  terminal_projection failed "$reject_code"
}

process_consumed() {
  consumed="$1"; action="$2"
  if ! update_parse_request "$consumed" "$action"; then
    code="$(update_parse_request "$consumed" "$action" 2>&1 >/dev/null || true)"
    case "$code" in UPDATE_REQUEST_*) ;; *) code=UPDATE_REQUEST_MALFORMED ;; esac
    reject_request "$code"
    rm -f "$consumed"
    return 0
  fi
  if request_seen_terminal "$request_id"; then
    update_transition_write FAILED "$action" "$request_id" "$request_target_version" UPDATE_REQUEST_REPLAYED -
    terminal_projection failed UPDATE_REQUEST_REPLAYED "$request_target_version"
    rm -f "$consumed"
    return 0
  fi
  update_transition_write ACCEPTED "$action" "$request_id" "$request_target_version" UPDATE_ACCEPTED -
  update_projection_write accepted UPDATE_ACCEPTED "$request_target_version"

  if [ "$action" = apply ] && [ "$request_window" != override ] && ! inside_window; then
    scheduled="$(next_window_opening)" || {
      update_transition_write NEEDS_OPERATOR apply "$request_id" "$request_target_version" UPDATE_TIMEZONE_CALCULATION_FAILED -
      terminal_projection needs-operator UPDATE_TIMEZONE_CALCULATION_FAILED "$request_target_version"
      return 0
    }
    update_transition_write ACCEPTED apply "$request_id" "$request_target_version" UPDATE_QUEUED -
    update_projection_write queued UPDATE_QUEUED "$request_target_version" "$scheduled"
    return 0
  fi

  if [ "$action" = prepare ]; then
    set +e
    sh "$root/scripts/prepare-verified-release.sh" "$request_target_version" "$request_id" \
      > "$update_private_dir/last-prepare.log" 2>&1
    result=$?
    set -e
    if [ "$result" -ne 0 ]; then
      update_transition_write FAILED prepare "$request_id" "$request_target_version" UPDATE_PREPARE_FAILED -
      terminal_projection failed UPDATE_PREPARE_FAILED "$request_target_version"
    fi
  else
    set +e
    sh "$root/scripts/apply-prepared-release.sh" "$request_target_version" "$request_id"
    result=$?
    set -e
    # apply-prepared-release writes the exact terminal state. Do not overwrite
    # NEEDS_OPERATOR with a generic failure and never retry an ambiguous apply.
  fi
  rm -f "$consumed"
}

consume_pending() {
  pending="$1"; action="$2"
  [ -e "$pending" ] || return 1
  [ -f "$pending" ] && [ ! -L "$pending" ] || {
    reject_request UPDATE_REQUEST_UNSAFE
    rm -f "$pending" 2>/dev/null || true
    return 0
  }
  # Status publishes with link(2) and immediately removes its temporary name.
  # That creates a legitimate, tiny nlink=2 interval. Wait a bounded 500 ms for
  # it to settle, then reject a persistent/malicious alias without consuming it.
  link_attempt=0
  while [ "$(stat -c %h "$pending" 2>/dev/null || echo 0)" != 1 ] \
    && [ "$link_attempt" -lt 10 ]; do
    link_attempt=$((link_attempt + 1))
    sleep 0.05
  done
  [ -f "$pending" ] && [ ! -L "$pending" ] \
    && [ "$(stat -c %h "$pending" 2>/dev/null || echo 0)" = 1 ] || {
    reject_request UPDATE_REQUEST_UNSAFE
    rm -f "$pending" 2>/dev/null || true
    return 0
  }
  consumed="$update_inflight_dir/$action.request.v2.tsv"
  [ ! -e "$consumed" ] || {
    update_transition_write NEEDS_OPERATOR reconcile - - UPDATE_INFLIGHT_CONFLICT -
    terminal_projection needs-operator UPDATE_INFLIGHT_CONFLICT
    return 0
  }
  mv "$pending" "$consumed" || return 0
  chown 0:0 "$consumed" && chmod 0600 "$consumed" || {
    update_transition_write NEEDS_OPERATOR reconcile - - UPDATE_INFLIGHT_OWNERSHIP_FAILED -
    terminal_projection needs-operator UPDATE_INFLIGHT_OWNERSHIP_FAILED
    return 0
  }
  process_consumed "$consumed" "$action"
  return 0
}

terminology_failure_code() {
  terminology_failed_action="$1"
  if grep -Fxq UPDATE_MAINTENANCE_BUSY "$terminology_agent_dir/last-operation.log" 2>/dev/null; then
    printf '%s\n' TERMINOLOGY_MAINTENANCE_BUSY
    return
  fi
  case "$terminology_failed_action" in
    import) printf '%s\n' TERMINOLOGY_IMPORT_FAILED ;;
    resume) printf '%s\n' TERMINOLOGY_RESUME_FAILED ;;
    rollback) printf '%s\n' TERMINOLOGY_ROLLBACK_FAILED ;;
    finalize) printf '%s\n' TERMINOLOGY_FINALIZE_FAILED ;;
  esac
}

process_terminology_consumed() {
  terminology_consumed="$1"
  if ! terminology_parse_request "$terminology_consumed"; then
    terminology_code="$(terminology_parse_request "$terminology_consumed" 2>&1 >/dev/null || true)"
    case "$terminology_code" in TERMINOLOGY_REQUEST_*) ;; *) terminology_code=TERMINOLOGY_REQUEST_MALFORMED ;; esac
    terminology_transition_write FAILED - - - "$terminology_code" -
    terminology_projection_write failed "$terminology_code"
    rm -f "$terminology_consumed"
    return 0
  fi
  if terminology_request_seen_terminal "$terminology_request_id"; then
    terminology_transition_write FAILED "$terminology_request_action" "$terminology_request_id" \
      "$terminology_request_package" TERMINOLOGY_REQUEST_REPLAYED "$terminology_request_operator"
    terminology_projection_write failed TERMINOLOGY_REQUEST_REPLAYED \
      "$terminology_request_action" "$terminology_request_package"
    rm -f "$terminology_consumed"
    return 0
  fi
  # Do not silently chain terminology mutation behind a release request that
  # was already present when this request was accepted. The operator must see
  # and deliberately retry one maintenance operation after the other.
  if [ -e "$prepare_request" ] || [ -e "$apply_request" ] \
    || [ -e "$update_inflight_dir/prepare.request.v2.tsv" ] \
    || [ -e "$update_inflight_dir/apply.request.v2.tsv" ]; then
    terminology_terminal_write FAILED "$terminology_request_action" "$terminology_request_id" \
      "$terminology_request_package" TERMINOLOGY_MAINTENANCE_BUSY "$terminology_request_operator"
    terminology_projection_write failed TERMINOLOGY_MAINTENANCE_BUSY \
      "$terminology_request_action" "$terminology_request_package"
    rm -f "$terminology_consumed"
    return 0
  fi
  terminology_transition_write ACCEPTED "$terminology_request_action" "$terminology_request_id" \
    "$terminology_request_package" TERMINOLOGY_REQUEST_ACCEPTED "$terminology_request_operator"
  terminology_projection_write accepted TERMINOLOGY_REQUEST_ACCEPTED \
    "$terminology_request_action" "$terminology_request_package"
  case "$terminology_request_action" in
    import) terminology_running_code=TERMINOLOGY_IMPORT_RUNNING ;;
    resume) terminology_running_code=TERMINOLOGY_RESUME_RUNNING ;;
    rollback) terminology_running_code=TERMINOLOGY_ROLLBACK_RUNNING ;;
    finalize) terminology_running_code=TERMINOLOGY_FINALIZE_RUNNING ;;
  esac
  terminology_transition_write RUNNING "$terminology_request_action" "$terminology_request_id" \
    "$terminology_request_package" "$terminology_running_code" "$terminology_request_operator"
  terminology_projection_write working "$terminology_running_code" \
    "$terminology_request_action" "$terminology_request_package"
  set +e
  sh "$root/scripts/terminology-host-operation.sh" "$terminology_request_action" \
    "$terminology_request_package" "$terminology_request_operator" \
    > "$terminology_agent_dir/last-operation.log" 2>&1
  terminology_result=$?
  set -e
  chmod 0600 "$terminology_agent_dir/last-operation.log" 2>/dev/null || true
  if [ "$terminology_result" -eq 0 ]; then
    case "$terminology_request_action" in
      import) terminology_code=TERMINOLOGY_IMPORT_COMPLETED ;;
      resume) terminology_code=TERMINOLOGY_RESUME_COMPLETED ;;
      rollback) terminology_code=TERMINOLOGY_ROLLBACK_COMPLETED ;;
      finalize) terminology_code=TERMINOLOGY_FINALIZE_COMPLETED ;;
    esac
    terminology_terminal_write COMPLETED "$terminology_request_action" "$terminology_request_id" \
      "$terminology_request_package" "$terminology_code" "$terminology_request_operator"
    terminology_projection_write completed "$terminology_code" \
      "$terminology_request_action" "$terminology_request_package"
  else
    terminology_code="$(terminology_failure_code "$terminology_request_action")"
    terminology_terminal_write FAILED "$terminology_request_action" "$terminology_request_id" \
      "$terminology_request_package" "$terminology_code" "$terminology_request_operator"
    terminology_projection_write failed "$terminology_code" \
      "$terminology_request_action" "$terminology_request_package"
  fi
  rm -f "$terminology_consumed"
}

consume_terminology_pending() {
  [ -e "$terminology_request" ] || return 1
  [ -f "$terminology_request" ] && [ ! -L "$terminology_request" ] || {
    terminology_transition_write FAILED - - - TERMINOLOGY_REQUEST_UNSAFE -
    terminology_projection_write failed TERMINOLOGY_REQUEST_UNSAFE
    rm -f "$terminology_request" 2>/dev/null || true
    return 0
  }
  terminology_link_attempt=0
  while [ "$(stat -c %h "$terminology_request" 2>/dev/null || echo 0)" != 1 ] \
    && [ "$terminology_link_attempt" -lt 10 ]; do
    terminology_link_attempt=$((terminology_link_attempt + 1))
    sleep 0.05
  done
  [ -f "$terminology_request" ] && [ ! -L "$terminology_request" ] \
    && [ "$(stat -c %h "$terminology_request" 2>/dev/null || echo 0)" = 1 ] || {
    terminology_transition_write FAILED - - - TERMINOLOGY_REQUEST_UNSAFE -
    terminology_projection_write failed TERMINOLOGY_REQUEST_UNSAFE
    rm -f "$terminology_request" 2>/dev/null || true
    return 0
  }
  [ ! -e "$terminology_inflight" ] || {
    terminology_transition_write NEEDS_OPERATOR - - - TERMINOLOGY_INFLIGHT_CONFLICT -
    terminology_projection_write needs-operator TERMINOLOGY_INFLIGHT_CONFLICT
    return 0
  }
  mv "$terminology_request" "$terminology_inflight" || return 0
  chown 0:0 "$terminology_inflight" && chmod 0600 "$terminology_inflight" || {
    terminology_transition_write NEEDS_OPERATOR - - - TERMINOLOGY_INFLIGHT_CONFLICT -
    terminology_projection_write needs-operator TERMINOLOGY_INFLIGHT_CONFLICT
    return 0
  }
  process_terminology_consumed "$terminology_inflight"
  return 0
}

reconcile_terminology_startup() {
  if terminology_transition_read; then
    case "$terminology_transition_phase" in
      RUNNING)
        # The child may have crossed a database rename before the host stopped.
        # Never infer, retry, or remove the evidence automatically.
        terminology_terminal_write NEEDS_OPERATOR "$terminology_transition_action" \
          "$terminology_transition_id" "$terminology_transition_package" \
          TERMINOLOGY_AMBIGUOUS_OPERATION "$terminology_transition_operator"
        terminology_projection_write needs-operator TERMINOLOGY_AMBIGUOUS_OPERATION \
          "$terminology_transition_action" "$terminology_transition_package"
        ;;
      ACCEPTED)
        if [ -f "$terminology_inflight" ]; then
          process_terminology_consumed "$terminology_inflight"
        else
          terminology_terminal_write NEEDS_OPERATOR "$terminology_transition_action" \
            "$terminology_transition_id" "$terminology_transition_package" \
            TERMINOLOGY_INFLIGHT_CONFLICT "$terminology_transition_operator"
          terminology_projection_write needs-operator TERMINOLOGY_INFLIGHT_CONFLICT \
            "$terminology_transition_action" "$terminology_transition_package"
        fi
        ;;
      *) terminology_refresh_projection ;;
    esac
  else
    terminology_transition_result=$?
    if [ "$terminology_transition_result" -eq 10 ]; then
      if [ -e "$terminology_inflight" ]; then
        terminology_transition_write NEEDS_OPERATOR - - - TERMINOLOGY_INFLIGHT_CONFLICT -
        terminology_projection_write needs-operator TERMINOLOGY_INFLIGHT_CONFLICT
      else
        terminology_projection_write idle TERMINOLOGY_AGENT_READY
      fi
    else
      terminology_projection_write needs-operator TERMINOLOGY_STATE_INVALID
    fi
  fi
}

reconcile_startup() {
  if [ -e "$update_activation_lock" ]; then
    update_transition_write NEEDS_OPERATOR reconcile - - UPDATE_ACTIVATION_LOCK_PRESENT -
    terminal_projection needs-operator UPDATE_ACTIVATION_LOCK_PRESENT
    return 0
  fi
  if update_transition_read; then
    case "$transition_phase" in
      APPLYING)
        update_transition_write NEEDS_OPERATOR reconcile "$transition_id" "$transition_target" UPDATE_AMBIGUOUS_APPLY -
        terminal_projection needs-operator UPDATE_AMBIGUOUS_APPLY "$transition_target"
        return 0
        ;;
      PREPARING|ACCEPTED)
        for pair in "prepare:$update_inflight_dir/prepare.request.v2.tsv" "apply:$update_inflight_dir/apply.request.v2.tsv"; do
          action="${pair%%:*}"; consumed="${pair#*:}"
          [ -f "$consumed" ] || continue
          process_consumed "$consumed" "$action"
          return 0
        done
        update_transition_write NEEDS_OPERATOR reconcile "$transition_id" "$transition_target" UPDATE_INFLIGHT_MISSING -
        terminal_projection needs-operator UPDATE_INFLIGHT_MISSING "$transition_target"
        return 0
        ;;
      PREPARED)
        if update_latest_descriptor; then
          update_projection_write prepared UPDATE_PREPARED "$descriptor_version" "" \
            "$descriptor_version" "$descriptor_lock_sha" "$descriptor_rollback_policy"
        else
          update_transition_write NEEDS_OPERATOR reconcile "$transition_id" "$transition_target" UPDATE_PREPARED_DESCRIPTOR_INVALID -
          terminal_projection needs-operator UPDATE_PREPARED_DESCRIPTOR_INVALID "$transition_target"
        fi
        ;;
      NEEDS_OPERATOR) terminal_projection needs-operator "$transition_code" "${transition_target#-}" ;;
      FAILED) terminal_projection failed "$transition_code" "${transition_target#-}" ;;
      COMPLETED) update_projection_write completed "$transition_code" "${transition_target#-}" ;;
    esac
  else
    transition_result=$?
    if [ "$transition_result" -ne 10 ]; then
      terminal_projection needs-operator UPDATE_STATE_CORRUPT
      return 0
    fi
    for orphan in "$update_inflight_dir"/*.request.v2.tsv; do
      [ -e "$orphan" ] || continue
      update_transition_write NEEDS_OPERATOR reconcile - - UPDATE_ORPHANED_INFLIGHT -
      terminal_projection needs-operator UPDATE_ORPHANED_INFLIGHT
      return 0
    done
  fi
}

check_due() {
  [ -f "$check_stamp" ] || return 0
  last="$(cat "$check_stamp" 2>/dev/null || echo 0)"
  update_valid_epoch "$last" || return 0
  [ "$(( $(update_now_epoch) - last ))" -ge "$check_interval" ]
}

run_check() {
  write_epoch_stamp "$check_stamp"
  set +e
  sh "$root/scripts/check-for-update.sh" --quiet >/dev/null 2>&1
  set -e
}

if ! flock -w "$poll" 9; then
  echo UPDATE_REQUEST_LOCK_TIMEOUT >&2
  exit 1
fi
reconcile_startup
reconcile_terminology_startup
maintenance_reconcile_startup
flock -u 9
while true; do
  if clock_went_backwards; then
    update_transition_write NEEDS_OPERATOR reconcile - - UPDATE_AGENT_CLOCK_BACKWARDS -
    terminal_projection needs-operator UPDATE_AGENT_CLOCK_BACKWARDS
    exit 1
  fi
  write_epoch_stamp "$clock_stamp"

  current_now="$(readlink "$appliance_home/current" 2>/dev/null || echo unknown)"
  if [ "$current_now" != "$started_from" ]; then exit 0; fi
  if [ "$(site_window_settings)" != "$started_window_settings" ]; then exit 0; fi

  if ! flock -w "$poll" 9; then
    terminal_projection needs-operator UPDATE_REQUEST_LOCK_TIMEOUT
    [ "${HOSPITAL_UPDATE_AGENT_ONESHOT:-0}" != 1 ] || exit 1
    sleep "$poll"
    continue
  fi
  if [ -e "$update_activation_lock" ]; then
    update_transition_write NEEDS_OPERATOR reconcile - - UPDATE_ACTIVATION_LOCK_PRESENT -
    terminal_projection needs-operator UPDATE_ACTIVATION_LOCK_PRESENT
  else
    handled=0
    consume_terminology_pending && handled=1 || true
    [ "$handled" -eq 1 ] || { maintenance_consume_pending && handled=1 || true; }
    [ "$handled" -eq 1 ] || { consume_pending "$prepare_request" prepare && handled=1 || true; }
    [ "$handled" -eq 1 ] || { consume_pending "$apply_request" apply && handled=1 || true; }
    if [ "$handled" -eq 0 ] && [ -f "$update_inflight_dir/apply.request.v2.tsv" ]; then
      process_consumed "$update_inflight_dir/apply.request.v2.tsv" apply
      handled=1
    fi
    if [ "$handled" -eq 0 ]; then
      if update_transition_read; then
        case "$transition_phase" in
          PREPARED)
            if update_latest_descriptor; then
              update_projection_write prepared UPDATE_PREPARED "$descriptor_version" "" \
                "$descriptor_version" "$descriptor_lock_sha" "$descriptor_rollback_policy"
            else
              update_transition_write NEEDS_OPERATOR reconcile "$transition_id" "$transition_target" UPDATE_PREPARED_DESCRIPTOR_INVALID -
              terminal_projection needs-operator UPDATE_PREPARED_DESCRIPTOR_INVALID "${transition_target#-}"
            fi
            ;;
          FAILED) terminal_projection failed "$transition_code" "${transition_target#-}" ;;
          COMPLETED) update_projection_write completed "$transition_code" "${transition_target#-}" ;;
          NEEDS_OPERATOR) terminal_projection needs-operator "$transition_code" "${transition_target#-}" ;;
          ACCEPTED) update_projection_write accepted "$transition_code" "${transition_target#-}" ;;
          PREPARING) update_projection_write preparing "$transition_code" "${transition_target#-}" ;;
          APPLYING) terminal_projection needs-operator UPDATE_AMBIGUOUS_APPLY "${transition_target#-}" ;;
        esac
      else
        transition_result=$?
        if [ "$transition_result" -ne 10 ]; then
          terminal_projection needs-operator UPDATE_STATE_CORRUPT
        elif update_latest_descriptor; then
          update_projection_write prepared UPDATE_PREPARED "$descriptor_version" "" \
            "$descriptor_version" "$descriptor_lock_sha" "$descriptor_rollback_policy"
        else
          update_projection_write idle UPDATE_AGENT_READY
        fi
      fi
    fi
    # A restart Ubuntu asked for, when the site chose to have it done in the
    # window: never beside an update that is queued, preparing or applying.
    if [ "$handled" -eq 0 ] && inside_window; then
      update_busy=0
      if update_transition_read; then
        case "$transition_phase" in ACCEPTED|PREPARING|APPLYING) update_busy=1 ;; esac
      fi
      [ "$update_busy" -eq 1 ] || maintenance_scheduled_reboot || true
    fi
  fi
  terminology_refresh_projection
  # Every poll, not only at startup. Status treats a maintenance projection
  # older than ten minutes as a dead agent and withdraws every browser control
  # that needs one -- updates, site settings, escrow, backups. Writing this
  # only from maintenance_reconcile_startup meant a healthy idle agent went
  # stale ten minutes after it started and stayed that way, so the browser
  # route worked for ten minutes per restart and then silently stopped. The
  # terminology projection on the line above was already refreshed here; this
  # one was not, and nothing noticed because both are written correctly while
  # an action is actually running.
  maintenance_refresh_projection
  maintenance_site_projection_write || true
  maintenance_escrow_expire || true
  flock -u 9

  if [ -e "$check_request" ]; then rm -f "$check_request"; rm -f "$check_stamp"; fi
  if check_due; then run_check; fi
  [ "${HOSPITAL_UPDATE_AGENT_ONESHOT:-0}" != 1 ] || exit 0
  sleep "$poll"
done
