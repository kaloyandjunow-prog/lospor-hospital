#!/bin/sh

# Root-side contract for Status terminology intent. This file is sourced only
# after update-pipeline-lib.sh so it can reuse the durable replacement helper,
# clock validation, and the appliance's persistent backup/update I/O lock.

terminology_agent_init() {
  terminology_state_dir="$update_appliance_home/.data/terminology"
  terminology_agent_dir="$update_private_dir/terminology"
  terminology_inflight_dir="$terminology_agent_dir/inflight"
  terminology_terminal_dir="$terminology_agent_dir/terminal"
  terminology_transition="$terminology_agent_dir/transition.v1.tsv"
  terminology_journal="$terminology_agent_dir/journal.v1.tsv"
  terminology_projection="$update_projection_dir/terminology-agent.v1.json"
  terminology_request="$update_requests_dir/terminology.request.v1.tsv"
  mkdir -p "$terminology_state_dir" "$terminology_agent_dir" \
    "$terminology_inflight_dir" "$terminology_terminal_dir"
  chmod 0700 "$terminology_state_dir" "$terminology_agent_dir" \
    "$terminology_inflight_dir" "$terminology_terminal_dir"
}

terminology_valid_action() {
  case "$1" in import|resume|rollback|finalize) return 0 ;; *) return 1 ;; esac
}

terminology_valid_package() {
  printf '%s\n' "$1" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
}

terminology_valid_operator() {
  printf '%s\n' "$1" | grep -Eq '^status-operator-[a-f0-9]{16}$'
}

terminology_parse_request() {
  terminology_request_path="$1"
  [ -f "$terminology_request_path" ] && [ ! -L "$terminology_request_path" ] \
    || { echo TERMINOLOGY_REQUEST_UNSAFE >&2; return 1; }
  terminology_request_bytes="$(wc -c < "$terminology_request_path" | tr -d '[:space:]')" || return 1
  [ "$terminology_request_bytes" -ge 1 ] && [ "$terminology_request_bytes" -le 512 ] \
    || { echo TERMINOLOGY_REQUEST_MALFORMED >&2; return 1; }
  [ "$(wc -l < "$terminology_request_path" | tr -d '[:space:]')" = 1 ] \
    && awk -F '\t' 'NR == 1 && NF == 6 { ok=1 } END { exit !(NR == 1 && ok) }' "$terminology_request_path" \
    || { echo TERMINOLOGY_REQUEST_MALFORMED >&2; return 1; }
  terminology_tab="$(printf '\t')"
  IFS="$terminology_tab" read -r terminology_request_header terminology_request_action \
    terminology_request_id terminology_request_package terminology_request_epoch \
    terminology_request_operator terminology_request_extra < "$terminology_request_path" \
    || { echo TERMINOLOGY_REQUEST_MALFORMED >&2; return 1; }
  [ -z "${terminology_request_extra:-}" ] \
    && [ "$terminology_request_header" = LOSPOR-HOSPITAL-TERMINOLOGY-REQUEST-V1 ] \
    && terminology_valid_action "$terminology_request_action" \
    && printf '%s\n' "$terminology_request_id" | grep -Eq '^[a-f0-9]{32}$' \
    && update_valid_epoch "$terminology_request_epoch" \
    && terminology_valid_operator "$terminology_request_operator" \
    || { echo TERMINOLOGY_REQUEST_MALFORMED >&2; return 1; }
  case "$terminology_request_action" in
    import|resume) terminology_valid_package "$terminology_request_package" \
      || { echo TERMINOLOGY_REQUEST_MALFORMED >&2; return 1; } ;;
    rollback|finalize) [ "$terminology_request_package" = - ] \
      || { echo TERMINOLOGY_REQUEST_MALFORMED >&2; return 1; } ;;
  esac
  terminology_request_max_age_days="${HOSPITAL_TERMINOLOGY_REQUEST_MAX_AGE_DAYS:-7}"
  case "$terminology_request_max_age_days" in ''|*[!0-9]*) echo TERMINOLOGY_REQUEST_POLICY_INVALID >&2; return 1 ;; esac
  [ "$terminology_request_max_age_days" -ge 1 ] && [ "$terminology_request_max_age_days" -le 30 ] \
    || { echo TERMINOLOGY_REQUEST_POLICY_INVALID >&2; return 1; }
  terminology_request_now="$(update_now_epoch)"
  [ "$terminology_request_epoch" -le "$((terminology_request_now + 300))" ] \
    || { echo TERMINOLOGY_REQUEST_FUTURE >&2; return 1; }
  [ "$((terminology_request_now - terminology_request_epoch))" \
      -le "$((terminology_request_max_age_days * 86400))" ] \
    || { echo TERMINOLOGY_REQUEST_EXPIRED >&2; return 1; }
}

terminology_transition_write() {
  terminology_write_phase="$1"
  terminology_write_action="$2"
  terminology_write_id="$3"
  terminology_write_package="$4"
  terminology_write_code="$5"
  terminology_write_operator="$6"
  case "$terminology_write_phase" in IDLE|ACCEPTED|RUNNING|COMPLETED|FAILED|NEEDS_OPERATOR) ;; *) return 1 ;; esac
  [ "$terminology_write_action" = - ] || terminology_valid_action "$terminology_write_action" || return 1
  [ "$terminology_write_id" = - ] || printf '%s\n' "$terminology_write_id" | grep -Eq '^[a-f0-9]{32}$' || return 1
  [ "$terminology_write_package" = - ] || terminology_valid_package "$terminology_write_package" || return 1
  printf '%s\n' "$terminology_write_code" | grep -Eq '^[A-Z][A-Z0-9_]{2,63}$' || return 1
  [ "$terminology_write_operator" = - ] || terminology_valid_operator "$terminology_write_operator" || return 1
  terminology_write_epoch="$(update_now_epoch)"
  terminology_write_tmp="$terminology_transition.tmp.$$"
  umask 077
  printf 'LOSPOR-HOSPITAL-TERMINOLOGY-TRANSITION-V1\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$terminology_write_epoch" "$terminology_write_phase" "$terminology_write_action" \
    "$terminology_write_id" "$terminology_write_package" "$terminology_write_code" \
    "$terminology_write_operator" > "$terminology_write_tmp"
  chmod 0600 "$terminology_write_tmp"
  update_durable_replace "$terminology_write_tmp" "$terminology_transition"
}

terminology_transition_read() {
  [ -s "$terminology_transition" ] || return 10
  [ -f "$terminology_transition" ] && [ ! -L "$terminology_transition" ] \
    && [ "$(wc -l < "$terminology_transition" | tr -d '[:space:]')" = 1 ] \
    && awk -F '\t' 'NR == 1 && NF == 8 { ok=1 } END { exit !(NR == 1 && ok) }' "$terminology_transition" \
    || return 1
  terminology_tab="$(printf '\t')"
  IFS="$terminology_tab" read -r terminology_transition_header terminology_transition_epoch \
    terminology_transition_phase terminology_transition_action terminology_transition_id \
    terminology_transition_package terminology_transition_code terminology_transition_operator \
    terminology_transition_extra < "$terminology_transition" || return 1
  [ -z "${terminology_transition_extra:-}" ] \
    && [ "$terminology_transition_header" = LOSPOR-HOSPITAL-TERMINOLOGY-TRANSITION-V1 ] \
    && update_valid_epoch "$terminology_transition_epoch" \
    && case "$terminology_transition_phase" in IDLE|ACCEPTED|RUNNING|COMPLETED|FAILED|NEEDS_OPERATOR) true ;; *) false ;; esac \
    && { [ "$terminology_transition_action" = - ] || terminology_valid_action "$terminology_transition_action"; } \
    && { [ "$terminology_transition_id" = - ] || printf '%s\n' "$terminology_transition_id" | grep -Eq '^[a-f0-9]{32}$'; } \
    && { [ "$terminology_transition_package" = - ] || terminology_valid_package "$terminology_transition_package"; } \
    && printf '%s\n' "$terminology_transition_code" | grep -Eq '^[A-Z][A-Z0-9_]{2,63}$' \
    && { [ "$terminology_transition_operator" = - ] || terminology_valid_operator "$terminology_transition_operator"; }
}

terminology_terminal_write() {
  terminology_terminal_phase="$1"
  terminology_terminal_action="$2"
  terminology_terminal_id="$3"
  terminology_terminal_package="$4"
  terminology_terminal_code="$5"
  terminology_terminal_operator="$6"
  terminology_transition_write "$terminology_terminal_phase" "$terminology_terminal_action" \
    "$terminology_terminal_id" "$terminology_terminal_package" "$terminology_terminal_code" \
    "$terminology_terminal_operator" || return 1
  terminology_terminal="$terminology_terminal_dir/$terminology_terminal_id.tsv"
  terminology_terminal_tmp="$terminology_terminal.tmp.$$"
  cp "$terminology_transition" "$terminology_terminal_tmp"
  chmod 0600 "$terminology_terminal_tmp"
  update_durable_replace "$terminology_terminal_tmp" "$terminology_terminal" || return 1
  # Append-only human provenance. Replay protection uses the individually
  # durable marker above, so a torn audit append can never authorize a retry.
  cat "$terminology_transition" >> "$terminology_journal"
  chmod 0600 "$terminology_journal"
  update_sync_path "$terminology_journal"
}

terminology_request_seen_terminal() {
  terminology_seen="$terminology_terminal_dir/$1.tsv"
  [ -s "$terminology_seen" ] && [ -f "$terminology_seen" ] && [ ! -L "$terminology_seen" ] \
    && [ "$(stat -c %h "$terminology_seen" 2>/dev/null || echo 0)" = 1 ]
}

terminology_active_read() {
  terminology_active_present=0
  terminology_active_rollback=false
  terminology_active_file="$terminology_state_dir/active.tsv"
  [ -e "$terminology_active_file" ] || return 10
  [ -s "$terminology_active_file" ] && [ -f "$terminology_active_file" ] && [ ! -L "$terminology_active_file" ] \
    && [ "$(wc -l < "$terminology_active_file" | tr -d '[:space:]')" = 1 ] \
    && awk -F '\t' 'NR == 1 && NF == 8 { ok=1 } END { exit !(NR == 1 && ok) }' "$terminology_active_file" \
    || return 1
  terminology_tab="$(printf '\t')"
  IFS="$terminology_tab" read -r terminology_active_header terminology_active_sha \
    terminology_active_package_id terminology_active_version terminology_active_at \
    terminology_active_operator terminology_active_previous terminology_active_run \
    terminology_active_extra < "$terminology_active_file" || return 1
  [ -z "${terminology_active_extra:-}" ] \
    && [ "$terminology_active_header" = LOSPOR-HOSPITAL-TERMINOLOGY-V1 ] \
    && printf '%s\n' "$terminology_active_sha" | grep -Eq '^[a-f0-9]{64}$' \
    && printf '%s\n' "$terminology_active_package_id" | grep -Eq '^[a-z0-9][a-z0-9._-]{2,79}$' \
    && printf '%s\n' "$terminology_active_version" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$' \
    && printf '%s\n' "$terminology_active_at" | grep -Eq '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' \
    && { [ "$terminology_active_previous" = - ] \
      || printf '%s\n' "$terminology_active_previous" | grep -Eq '^lospor_previous_[A-Za-z0-9_]{1,63}$'; } \
    || return 1
  terminology_active_present=1
  [ "$terminology_active_previous" = - ] || terminology_active_rollback=true
}

terminology_pending_read() {
  terminology_pending_phase=""
  terminology_pending_file="$terminology_state_dir/pending.tsv"
  [ -e "$terminology_pending_file" ] || return 10
  [ -s "$terminology_pending_file" ] && [ -f "$terminology_pending_file" ] && [ ! -L "$terminology_pending_file" ] \
    && [ "$(wc -l < "$terminology_pending_file" | tr -d '[:space:]')" = 1 ] \
    && awk -F '\t' 'NR == 1 && NF == 6 { ok=1 } END { exit !(NR == 1 && ok) }' "$terminology_pending_file" \
    || return 1
  terminology_tab="$(printf '\t')"
  IFS="$terminology_tab" read -r terminology_pending_header terminology_pending_sha \
    terminology_pending_stage terminology_pending_previous terminology_pending_phase \
    terminology_pending_run terminology_pending_extra < "$terminology_pending_file" || return 1
  [ -z "${terminology_pending_extra:-}" ] \
    && [ "$terminology_pending_header" = LOSPOR-HOSPITAL-TERMINOLOGY-PENDING-V1 ] \
    && printf '%s\n' "$terminology_pending_sha" | grep -Eq '^[a-f0-9]{64}$' \
    && case "$terminology_pending_phase" in verified|staged|importing|validated|activating) true ;; *) false ;; esac
}

terminology_projection_write() {
  terminology_projection_phase="$1"
  terminology_projection_code="$2"
  terminology_projection_action="${3:--}"
  terminology_projection_package="${4:--}"
  case "$terminology_projection_phase" in idle|accepted|working|completed|failed|needs-operator) ;; *) return 1 ;; esac
  printf '%s\n' "$terminology_projection_code" | grep -Eq '^[A-Z][A-Z0-9_]{2,63}$' || return 1
  if terminology_active_read; then terminology_active_result=0; else terminology_active_result=$?; fi
  if terminology_pending_read; then terminology_pending_result=0; else terminology_pending_result=$?; fi
  if [ "$terminology_active_result" -ne 0 ] && [ "$terminology_active_result" -ne 10 ]; then
    terminology_projection_phase=needs-operator
    terminology_projection_code=TERMINOLOGY_STATE_INVALID
    terminology_active_present=0
    terminology_active_rollback=false
  fi
  if [ "$terminology_pending_result" -ne 0 ] && [ "$terminology_pending_result" -ne 10 ]; then
    terminology_projection_phase=needs-operator
    terminology_projection_code=TERMINOLOGY_STATE_INVALID
    terminology_pending_phase=""
  fi
  terminology_projection_tmp="$terminology_projection.tmp.$$"
  terminology_projection_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  terminology_optional=""
  if [ "$terminology_projection_action" != - ]; then
    terminology_optional="$terminology_optional,\"lastAction\":\"$terminology_projection_action\""
  fi
  if [ -n "$terminology_pending_phase" ]; then
    terminology_optional="$terminology_optional,\"pendingPhase\":\"$terminology_pending_phase\""
  fi
  if [ "${terminology_active_present:-0}" -eq 1 ]; then
    terminology_optional="$terminology_optional,\"packageId\":\"$terminology_active_package_id\",\"packageVersion\":\"$terminology_active_version\",\"activatedAt\":\"$terminology_active_at\",\"manifestSha256\":\"$terminology_active_sha\""
  fi
  umask 077
  printf '{"schemaVersion":1,"signalType":"terminology-agent","observedAt":"%s","phase":"%s","resultCode":"%s","rollbackAvailable":%s%s}\n' \
    "$terminology_projection_at" "$terminology_projection_phase" "$terminology_projection_code" \
    "${terminology_active_rollback:-false}" "$terminology_optional" > "$terminology_projection_tmp"
  chmod 0644 "$terminology_projection_tmp"
  update_durable_replace "$terminology_projection_tmp" "$terminology_projection"
}

terminology_refresh_projection() {
  if terminology_transition_read; then
    case "$terminology_transition_phase" in
      IDLE) terminology_projection_write idle "$terminology_transition_code" ;;
      ACCEPTED) terminology_projection_write accepted "$terminology_transition_code" \
        "$terminology_transition_action" "$terminology_transition_package" ;;
      RUNNING) terminology_projection_write working "$terminology_transition_code" \
        "$terminology_transition_action" "$terminology_transition_package" ;;
      COMPLETED) terminology_projection_write completed "$terminology_transition_code" \
        "$terminology_transition_action" "$terminology_transition_package" ;;
      FAILED) terminology_projection_write failed "$terminology_transition_code" \
        "$terminology_transition_action" "$terminology_transition_package" ;;
      NEEDS_OPERATOR) terminology_projection_write needs-operator "$terminology_transition_code" \
        "$terminology_transition_action" "$terminology_transition_package" ;;
    esac
  else
    terminology_transition_result=$?
    if [ "$terminology_transition_result" -eq 10 ]; then
      terminology_projection_write idle TERMINOLOGY_AGENT_READY
    else
      terminology_projection_write needs-operator TERMINOLOGY_STATE_INVALID
    fi
  fi
}
