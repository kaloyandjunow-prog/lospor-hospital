#!/bin/sh

# Root-side contract for Status maintenance intent: back up now, run a restore
# drill, and apply a change to the site settings Status may edit. Sourced after
# update-pipeline-lib.sh and site-config.sh, beside the terminology agent.
#
# Status names only a fixed action. A settings change also names the SHA-256 of
# the one proposal file Status wrote beside the request; the proposal is checked
# here against the site-settings contract and against the keys Status may
# change, whatever Status itself checked. Settings that change the address
# Status is reached at (names, certificate mode, ports) and the switch that opens
# every private network stay console-only.

MAINTENANCE_STATUS_KEYS="LOSPOR_DEFAULT_LOCALE ACME_EMAIL HOSPITAL_SUPPORT_URL HOSPITAL_RESEARCH_ALLOWED_CIDRS HOSPITAL_STATUS_ALLOWED_CIDRS AUTH_EMAIL_FROM AUTH_EMAIL_FROM_NAME HOSPITAL_UPDATE_SUPPLY_MODE HOSPITAL_UPDATE_WINDOW_START HOSPITAL_UPDATE_WINDOW_END HOSPITAL_UPDATE_TIMEZONE HOSPITAL_HOST_REBOOT_POLICY"

# A drill request is only meaningful now: one found hours later, after the agent
# was down, is refused rather than run at a moment nobody chose.
MAINTENANCE_REQUEST_MAX_AGE_SECONDS=900

maintenance_agent_init() {
  maintenance_agent_dir="$update_private_dir/maintenance"
  maintenance_inflight_dir="$maintenance_agent_dir/inflight"
  maintenance_terminal_dir="$maintenance_agent_dir/terminal"
  maintenance_transition="$maintenance_agent_dir/transition.v1.tsv"
  maintenance_journal="$maintenance_agent_dir/journal.v1.tsv"
  maintenance_drills="$maintenance_agent_dir/drills.v1.tsv"
  maintenance_projection="$update_projection_dir/maintenance-agent.v1.json"
  maintenance_site_projection="$update_projection_dir/site-config.v1.json"
  maintenance_request="$update_requests_dir/maintenance.request.v1.tsv"
  maintenance_proposal="$update_requests_dir/site-config.proposal.v1.env"
  maintenance_offhost_proposal="$update_requests_dir/offhost.proposal.v1.conf"
  maintenance_advanced_proposal="$update_requests_dir/advanced.proposal.v1.env"
  maintenance_escrow_proposal="$update_requests_dir/secrets-escrow.passphrase.v1"
  maintenance_escrow_bundle="$update_projection_dir/secrets-escrow.v1.enc"
  maintenance_escrow_offer="$update_projection_dir/secrets-escrow.v1.json"
  maintenance_reboot_stamp="$maintenance_agent_dir/last-scheduled-reboot"
  maintenance_inflight="$maintenance_inflight_dir/maintenance.request.v1.tsv"
  mkdir -p "$maintenance_agent_dir" "$maintenance_inflight_dir" "$maintenance_terminal_dir"
  chmod 0700 "$maintenance_agent_dir" "$maintenance_inflight_dir" "$maintenance_terminal_dir"
}

maintenance_valid_action() {
  case "$1" in backup|drill|config|advanced|offhost-config|offhost-test|offhost-drill|offhost-disable|os-update|os-reboot|support-bundle|rotate-credentials|secrets-escrow|secrets-escrow-delivered) return 0 ;; *) return 1 ;; esac
}

maintenance_valid_operator() {
  printf '%s\n' "$1" | grep -Eq '^status-operator-[a-f0-9]{16}$'
}

maintenance_valid_code() {
  printf '%s\n' "$1" | grep -Eq '^[A-Z][A-Z0-9_]{2,63}$'
}

maintenance_is_status_key() {
  case " $MAINTENANCE_STATUS_KEYS " in *" $1 "*) return 0 ;; esac
  return 1
}

# LOSPOR-HOSPITAL-MAINTENANCE-REQUEST-V1  action  id  argument  epoch  operator
maintenance_parse_request() {
  maintenance_request_path="$1"
  [ -f "$maintenance_request_path" ] && [ ! -L "$maintenance_request_path" ] \
    || { echo MAINTENANCE_REQUEST_UNSAFE >&2; return 1; }
  maintenance_request_bytes="$(wc -c < "$maintenance_request_path" | tr -d '[:space:]')" || return 1
  [ "$maintenance_request_bytes" -ge 1 ] && [ "$maintenance_request_bytes" -le 512 ] \
    && [ "$(wc -l < "$maintenance_request_path" | tr -d '[:space:]')" = 1 ] \
    && awk -F '\t' 'NR == 1 && NF == 6 { ok=1 } END { exit !(NR == 1 && ok) }' "$maintenance_request_path" \
    || { echo MAINTENANCE_REQUEST_MALFORMED >&2; return 1; }
  maintenance_tab="$(printf '\t')"
  IFS="$maintenance_tab" read -r maintenance_request_header maintenance_request_action \
    maintenance_request_id maintenance_request_argument maintenance_request_epoch \
    maintenance_request_operator maintenance_request_extra < "$maintenance_request_path" \
    || { echo MAINTENANCE_REQUEST_MALFORMED >&2; return 1; }
  [ -z "${maintenance_request_extra:-}" ] \
    && [ "$maintenance_request_header" = LOSPOR-HOSPITAL-MAINTENANCE-REQUEST-V1 ] \
    && maintenance_valid_action "$maintenance_request_action" \
    && printf '%s\n' "$maintenance_request_id" | grep -Eq '^[a-f0-9]{32}$' \
    && update_valid_epoch "$maintenance_request_epoch" \
    && maintenance_valid_operator "$maintenance_request_operator" \
    || { echo MAINTENANCE_REQUEST_MALFORMED >&2; return 1; }
  case "$maintenance_request_action" in
    config|advanced|offhost-config|secrets-escrow|secrets-escrow-delivered) printf '%s\n' "$maintenance_request_argument" | grep -Eq '^[a-f0-9]{64}$' \
      || { echo MAINTENANCE_REQUEST_MALFORMED >&2; return 1; } ;;
    *) [ "$maintenance_request_argument" = - ] || { echo MAINTENANCE_REQUEST_MALFORMED >&2; return 1; } ;;
  esac
  maintenance_request_now="$(update_now_epoch)"
  [ "$maintenance_request_epoch" -le "$((maintenance_request_now + 300))" ] \
    || { echo MAINTENANCE_REQUEST_FUTURE >&2; return 1; }
  [ "$((maintenance_request_now - maintenance_request_epoch))" -le "$MAINTENANCE_REQUEST_MAX_AGE_SECONDS" ] \
    || { echo MAINTENANCE_REQUEST_EXPIRED >&2; return 1; }
}

# LOSPOR-HOSPITAL-MAINTENANCE-TRANSITION-V1  epoch  phase  action  id  code  operator
maintenance_transition_write() {
  case "$1" in ACCEPTED|RUNNING|COMPLETED|FAILED|NEEDS_OPERATOR) ;; *) return 1 ;; esac
  [ "$2" = - ] || maintenance_valid_action "$2" || return 1
  [ "$3" = - ] || printf '%s\n' "$3" | grep -Eq '^[a-f0-9]{32}$' || return 1
  maintenance_valid_code "$4" || return 1
  [ "$5" = - ] || maintenance_valid_operator "$5" || return 1
  maintenance_write_tmp="$maintenance_transition.tmp.$$"
  umask 077
  printf 'LOSPOR-HOSPITAL-MAINTENANCE-TRANSITION-V1\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$(update_now_epoch)" "$1" "$2" "$3" "$4" "$5" > "$maintenance_write_tmp"
  chmod 0600 "$maintenance_write_tmp"
  update_durable_replace "$maintenance_write_tmp" "$maintenance_transition"
}

maintenance_transition_read() {
  [ -s "$maintenance_transition" ] || return 10
  [ -f "$maintenance_transition" ] && [ ! -L "$maintenance_transition" ] \
    && [ "$(wc -l < "$maintenance_transition" | tr -d '[:space:]')" = 1 ] \
    && awk -F '\t' 'NR == 1 && NF == 7 { ok=1 } END { exit !(NR == 1 && ok) }' "$maintenance_transition" \
    || return 1
  maintenance_tab="$(printf '\t')"
  IFS="$maintenance_tab" read -r maintenance_transition_header maintenance_transition_epoch \
    maintenance_transition_phase maintenance_transition_action maintenance_transition_id \
    maintenance_transition_code maintenance_transition_operator maintenance_transition_extra \
    < "$maintenance_transition" || return 1
  [ -z "${maintenance_transition_extra:-}" ] \
    && [ "$maintenance_transition_header" = LOSPOR-HOSPITAL-MAINTENANCE-TRANSITION-V1 ] \
    && update_valid_epoch "$maintenance_transition_epoch" \
    && case "$maintenance_transition_phase" in ACCEPTED|RUNNING|COMPLETED|FAILED|NEEDS_OPERATOR) true ;; *) false ;; esac \
    && { [ "$maintenance_transition_action" = - ] || maintenance_valid_action "$maintenance_transition_action"; } \
    && { [ "$maintenance_transition_id" = - ] || printf '%s\n' "$maintenance_transition_id" | grep -Eq '^[a-f0-9]{32}$'; } \
    && maintenance_valid_code "$maintenance_transition_code"
}

# A terminal result is recorded per request, so a replayed request is refused,
# and appended to the journal as provenance.
maintenance_terminal_write() {
  maintenance_transition_write "$@" || return 1
  if [ "$3" != - ]; then
    maintenance_terminal_tmp="$maintenance_terminal_dir/$3.tsv.tmp.$$"
    cp "$maintenance_transition" "$maintenance_terminal_tmp"
    chmod 0600 "$maintenance_terminal_tmp"
    update_durable_replace "$maintenance_terminal_tmp" "$maintenance_terminal_dir/$3.tsv" || return 1
  fi
  cat "$maintenance_transition" >> "$maintenance_journal"
  chmod 0600 "$maintenance_journal"
  update_sync_path "$maintenance_journal"
}

maintenance_request_seen_terminal() {
  maintenance_seen="$maintenance_terminal_dir/$1.tsv"
  [ -s "$maintenance_seen" ] && [ -f "$maintenance_seen" ] && [ ! -L "$maintenance_seen" ]
}

maintenance_projection_write() {
  maintenance_projection_phase="$1"
  maintenance_projection_code="$2"
  maintenance_projection_action="${3:--}"
  case "$maintenance_projection_phase" in idle|accepted|working|completed|failed|needs-operator) ;; *) return 1 ;; esac
  maintenance_valid_code "$maintenance_projection_code" || return 1
  maintenance_optional=""
  [ "$maintenance_projection_action" = - ] \
    || maintenance_optional=",\"lastAction\":\"$maintenance_projection_action\""
  # Evidence of the last ten drills: when, the result, and the backup object.
  # A backup object name is a timestamp and a random suffix, nothing clinical.
  maintenance_drill_json=""
  if [ -s "$maintenance_drills" ]; then
    maintenance_drill_json="$(tail -n 10 "$maintenance_drills" | awk -F '\t' '
      $1 == "LOSPOR-HOSPITAL-DRILL-EVIDENCE-V1" && $2 ~ /^20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]Z$/ \
        && ($3 == "passed" || $3 == "failed") && $4 ~ /^lospor-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]+\.backup$/ {
        printf "%s{\"completedAt\":\"%s\",\"result\":\"%s\",\"backup\":\"%s\"}", separator, $2, $3, $4
        separator = ","
      }')"
  fi
  maintenance_projection_tmp="$maintenance_projection.tmp.$$"
  umask 077
  printf '{"schemaVersion":1,"signalType":"maintenance-agent","observedAt":"%s","phase":"%s","resultCode":"%s"%s,"drills":[%s]}\n' \
    "$(update_now_iso)" "$maintenance_projection_phase" "$maintenance_projection_code" \
    "$maintenance_optional" "$maintenance_drill_json" > "$maintenance_projection_tmp"
  chmod 0644 "$maintenance_projection_tmp"
  update_durable_replace "$maintenance_projection_tmp" "$maintenance_projection"
}

maintenance_refresh_projection() {
  if maintenance_transition_read; then
    case "$maintenance_transition_phase" in
      ACCEPTED) maintenance_projection_write accepted "$maintenance_transition_code" "$maintenance_transition_action" ;;
      RUNNING) maintenance_projection_write working "$maintenance_transition_code" "$maintenance_transition_action" ;;
      COMPLETED) maintenance_projection_write completed "$maintenance_transition_code" "$maintenance_transition_action" ;;
      FAILED) maintenance_projection_write failed "$maintenance_transition_code" "$maintenance_transition_action" ;;
      NEEDS_OPERATOR) maintenance_projection_write needs-operator "$maintenance_transition_code" "$maintenance_transition_action" ;;
    esac
  else
    maintenance_transition_result=$?
    if [ "$maintenance_transition_result" -eq 10 ]; then
      maintenance_projection_write idle MAINTENANCE_AGENT_READY
    else
      maintenance_projection_write needs-operator MAINTENANCE_STATE_INVALID
    fi
  fi
}

# The site settings Status shows, and which of them it may change. Written only
# when different, so an idle agent does not sync the disk every poll.
maintenance_site_projection_write() {
  maintenance_site="$update_appliance_home/site.env"
  [ -f "$maintenance_site" ] || return 0
  site_config_check_source "$maintenance_site" site 2>/dev/null || return 0
  maintenance_site_tmp="$maintenance_site_projection.tmp.$$"
  umask 077
  {
    printf '{"schemaVersion":1,"signalType":"site-config","settings":{'
    # Bounded by SITE_CONFIG_KEYS above and ADVANCED_CONFIG_KEYS below.
    maintenance_separator=""
    for maintenance_key in $SITE_CONFIG_KEYS; do
      grep -q "^$maintenance_key=" "$maintenance_site" || continue
      maintenance_value="$(site_config_value "$maintenance_site" "$maintenance_key")"
      maintenance_editable=false
      maintenance_is_status_key "$maintenance_key" && maintenance_editable=true
      maintenance_json="\"$maintenance_value\""
      # A value that cannot be shown faithfully as JSON is shown as null, and
      # Status then leaves the settings to the console rather than guess.
      case "$maintenance_value" in *'"'*|*'\'*) maintenance_json=null ;; esac
      printf '%s' "$maintenance_value" | LC_ALL=C grep -q '[[:cntrl:]]' && maintenance_json=null
      printf '%s"%s":{"value":%s,"editable":%s}' "$maintenance_separator" "$maintenance_key" "$maintenance_json" "$maintenance_editable"
      maintenance_separator=","
    done
    # Advanced settings: the value in effect, its limits and default, and whether
    # advanced.env overrides it. Whole numbers only, so nothing needs escaping.
    printf '},"advanced":{'
    maintenance_separator=""
    maintenance_advanced="$update_appliance_home/advanced.env"
    for maintenance_key in $ADVANCED_CONFIG_KEYS; do
      set -- $(site_config_advanced_limits "$maintenance_key")
      maintenance_value="$(site_config_value "$update_appliance_home/.env" "$maintenance_key")"
      case "$maintenance_value" in ''|*[!0-9]*) maintenance_value="$3" ;; esac
      maintenance_overridden=false
      grep -q "^$maintenance_key=" "$maintenance_advanced" 2>/dev/null && maintenance_overridden=true
      printf '%s"%s":{"value":%s,"minimum":%s,"maximum":%s,"default":%s,"overridden":%s}' \
        "$maintenance_separator" "$maintenance_key" "$maintenance_value" "$1" "$2" "$3" "$maintenance_overridden"
      maintenance_separator=","
    done
    printf '}}\n'
  } > "$maintenance_site_tmp"
  chmod 0644 "$maintenance_site_tmp"
  if [ -f "$maintenance_site_projection" ] && cmp -s "$maintenance_site_tmp" "$maintenance_site_projection"; then
    rm -f "$maintenance_site_tmp"
    return 0
  fi
  update_durable_replace "$maintenance_site_tmp" "$maintenance_site_projection"
}

maintenance_run_backup() {
  sh "$update_root/scripts/backup-now.sh" > "$maintenance_agent_dir/last-operation.log" 2>&1
}

maintenance_run_drill() {
  maintenance_drill_backup=""
  for maintenance_candidate in "$update_appliance_home"/backups/lospor-*.backup; do
    [ -d "$maintenance_candidate" ] && maintenance_drill_backup="${maintenance_candidate##*/}"
  done
  if [ -z "$maintenance_drill_backup" ]; then
    maintenance_operation_code=MAINTENANCE_DRILL_NO_BACKUP
    return 1
  fi
  maintenance_drill_result=passed
  sh "$update_root/scripts/restore-backup.sh" --drill "backups/$maintenance_drill_backup" \
    > "$maintenance_agent_dir/last-operation.log" 2>&1 || maintenance_drill_result=failed
  umask 077
  printf 'LOSPOR-HOSPITAL-DRILL-EVIDENCE-V1\t%s\t%s\t%s\t%s\t%s\n' "$(update_now_iso)" \
    "$maintenance_drill_result" "$maintenance_drill_backup" "$maintenance_request_id" \
    "$maintenance_request_operator" >> "$maintenance_drills"
  chmod 0600 "$maintenance_drills"
  update_sync_path "$maintenance_drills"
  [ "$maintenance_drill_result" = passed ]
}

# Apply the proposal Status wrote, checked here as if Status had checked nothing.
maintenance_run_config() {
  maintenance_site="$update_appliance_home/site.env"
  maintenance_candidate="$maintenance_agent_dir/proposal.$maintenance_request_id.env"
  rm -f "$maintenance_candidate"
  if [ ! -f "$maintenance_proposal" ] || [ -L "$maintenance_proposal" ] \
    || [ "$(stat -c %h "$maintenance_proposal" 2>/dev/null || echo 0)" != 1 ] \
    || [ "$(wc -c < "$maintenance_proposal" | tr -d '[:space:]')" -gt 8192 ]; then
    maintenance_operation_code=MAINTENANCE_CONFIG_PROPOSAL_UNSAFE
    return 1
  fi
  # Copy first, then hash the copy: the proposal directory is writable by Status.
  (umask 077; cp "$maintenance_proposal" "$maintenance_candidate")
  rm -f "$maintenance_proposal"
  [ "$(sha256sum "$maintenance_candidate" | awk '{print $1}')" = "$maintenance_request_argument" ] \
    || { rm -f "$maintenance_candidate"; maintenance_operation_code=MAINTENANCE_CONFIG_PROPOSAL_MISMATCH; return 1; }
  site_config_check_source "$maintenance_candidate" site >/dev/null 2>&1 \
    || { rm -f "$maintenance_candidate"; maintenance_operation_code=MAINTENANCE_CONFIG_INVALID; return 1; }
  for maintenance_key in $SITE_CONFIG_KEYS; do
    [ "$(site_config_value "$maintenance_candidate" "$maintenance_key")" = "$(site_config_value "$maintenance_site" "$maintenance_key")" ] \
      && [ "$(grep -c "^$maintenance_key=" "$maintenance_candidate")" = "$(grep -c "^$maintenance_key=" "$maintenance_site")" ] \
      && continue
    maintenance_is_status_key "$maintenance_key" && continue
    # The switch that opens every private network may be turned off from
    # Status, never on; the host still refuses a list that needs it.
    [ "$maintenance_key" = HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE ] \
      && [ -z "$(site_config_value "$maintenance_candidate" "$maintenance_key")" ] \
      && [ "$(grep -c "^$maintenance_key=" "$maintenance_candidate")" -le 1 ] && continue
    rm -f "$maintenance_candidate"
    maintenance_operation_code=MAINTENANCE_CONFIG_CONSOLE_ONLY
    return 1
  done
  maintenance_before="$maintenance_agent_dir/site.env.before.$maintenance_request_id"
  (umask 077; cp "$maintenance_site" "$maintenance_before")
  cp "$maintenance_candidate" "$maintenance_site.maintenance.$$"
  chmod 0600 "$maintenance_site.maintenance.$$"
  mv -f "$maintenance_site.maintenance.$$" "$maintenance_site"
  rm -f "$maintenance_candidate"
  maintenance_apply_result=0
  sh "$update_root/scripts/apply-site-config.sh" --yes > "$maintenance_agent_dir/last-operation.log" 2>&1 \
    || maintenance_apply_result=$?
  case "$maintenance_apply_result" in
    0) rm -f "$maintenance_before"; return 0 ;;
    3) maintenance_operation_code=MAINTENANCE_CONFIG_RECOVERY_REQUIRED; return 3 ;;
  esac
  # Refused before anything changed leaves the proposal in site.env: put the
  # running settings back. A rollback has already restored them itself.
  if cmp -s "$maintenance_site" "$maintenance_before"; then
    maintenance_operation_code=MAINTENANCE_CONFIG_ROLLED_BACK
  else
    cp "$maintenance_before" "$maintenance_site.maintenance.$$"
    chmod 0600 "$maintenance_site.maintenance.$$"
    mv -f "$maintenance_site.maintenance.$$" "$maintenance_site"
    maintenance_operation_code=MAINTENANCE_CONFIG_REFUSED
    grep -Fxq UPDATE_MAINTENANCE_BUSY "$maintenance_agent_dir/last-operation.log" 2>/dev/null \
      && maintenance_operation_code=MAINTENANCE_BUSY
  fi
  rm -f "$maintenance_before"
  return 1
}

# Apply the advanced settings Status proposed, checked here as if Status had
# checked nothing: only advanced keys, whole numbers, inside their limits. The
# proposal is the whole of advanced.env; one with no settings in it returns
# every value to the appliance's own.
maintenance_run_advanced() {
  maintenance_advanced="$update_appliance_home/advanced.env"
  maintenance_candidate="$maintenance_agent_dir/advanced-proposal.$maintenance_request_id.env"
  rm -f "$maintenance_candidate"
  if [ ! -f "$maintenance_advanced_proposal" ] || [ -L "$maintenance_advanced_proposal" ] \
    || [ "$(stat -c %h "$maintenance_advanced_proposal" 2>/dev/null || echo 0)" != 1 ] \
    || [ "$(wc -c < "$maintenance_advanced_proposal" | tr -d '[:space:]')" -gt 2048 ]; then
    maintenance_operation_code=MAINTENANCE_CONFIG_PROPOSAL_UNSAFE
    return 1
  fi
  (umask 077; cp "$maintenance_advanced_proposal" "$maintenance_candidate")
  rm -f "$maintenance_advanced_proposal"
  [ "$(sha256sum "$maintenance_candidate" | awk '{print $1}')" = "$maintenance_request_argument" ] \
    || { rm -f "$maintenance_candidate"; maintenance_operation_code=MAINTENANCE_CONFIG_PROPOSAL_MISMATCH; return 1; }
  site_config_check_advanced "$maintenance_candidate" >/dev/null 2>&1 \
    || { rm -f "$maintenance_candidate"; maintenance_operation_code=MAINTENANCE_ADVANCED_INVALID; return 1; }
  maintenance_before="$maintenance_agent_dir/advanced.env.before.$maintenance_request_id"
  rm -f "$maintenance_before"
  [ ! -f "$maintenance_advanced" ] || (umask 077; cp "$maintenance_advanced" "$maintenance_before")
  if grep -Eq '^[A-Z]' "$maintenance_candidate"; then
    grep -E '^[A-Z]' "$maintenance_candidate" > "$maintenance_advanced.maintenance.$$"
    chmod 0600 "$maintenance_advanced.maintenance.$$"
    mv -f "$maintenance_advanced.maintenance.$$" "$maintenance_advanced"
  else
    rm -f "$maintenance_advanced"
  fi
  rm -f "$maintenance_candidate"
  maintenance_apply_result=0
  sh "$update_root/scripts/apply-site-config.sh" --yes > "$maintenance_agent_dir/last-operation.log" 2>&1 \
    || maintenance_apply_result=$?
  case "$maintenance_apply_result" in
    0) rm -f "$maintenance_before"; return 0 ;;
    3) maintenance_operation_code=MAINTENANCE_CONFIG_RECOVERY_REQUIRED; return 3 ;;
  esac
  # A rollback has already put the running values back; a refusal before
  # anything changed leaves the proposal in place, so undo it here.
  if { [ -f "$maintenance_before" ] && cmp -s "$maintenance_advanced" "$maintenance_before"; } \
    || { [ ! -f "$maintenance_before" ] && [ ! -f "$maintenance_advanced" ]; }; then
    maintenance_operation_code=MAINTENANCE_CONFIG_ROLLED_BACK
  else
    if [ -f "$maintenance_before" ]; then
      cp "$maintenance_before" "$maintenance_advanced.maintenance.$$"
      chmod 0600 "$maintenance_advanced.maintenance.$$"
      mv -f "$maintenance_advanced.maintenance.$$" "$maintenance_advanced"
    else
      rm -f "$maintenance_advanced"
    fi
    maintenance_operation_code=MAINTENANCE_CONFIG_REFUSED
    grep -Fxq UPDATE_MAINTENANCE_BUSY "$maintenance_agent_dir/last-operation.log" 2>/dev/null \
      && maintenance_operation_code=MAINTENANCE_BUSY
  fi
  rm -f "$maintenance_before"
  return 1
}

# Rotate the ordinary credentials (sessions, workers, Status tokens and the
# database passwords) as one request: prepare, then commit. The rotation script
# overlaps old and new values, verifies, proves the old ones rejected and rolls
# back by itself; this reports which of those it ended on. A rotation left
# pending is never guessed at: it needs a person at the console.
maintenance_run_rotation() {
  maintenance_pending="$update_appliance_home/secrets/rotation/pending"
  if [ -e "$maintenance_pending" ]; then
    maintenance_operation_code=MAINTENANCE_ROTATION_ALREADY_PENDING
    return 3
  fi
  if ! sh "$update_root/scripts/rotate-operational-secrets.sh" prepare ordinary \
      > "$maintenance_agent_dir/last-operation.log" 2>&1; then
    if [ -e "$maintenance_pending" ]; then
      maintenance_operation_code=MAINTENANCE_ROTATION_RECOVERY_REQUIRED
      return 3
    fi
    maintenance_operation_code=MAINTENANCE_ROTATION_REFUSED
    grep -Fq UPDATE_MAINTENANCE_BUSY "$maintenance_agent_dir/last-operation.log" 2>/dev/null \
      && maintenance_operation_code=MAINTENANCE_BUSY
    return 1
  fi
  sh "$update_root/scripts/rotate-operational-secrets.sh" commit >> "$maintenance_agent_dir/last-operation.log" 2>&1 \
    && return 0
  if [ -e "$maintenance_pending" ]; then
    maintenance_operation_code=MAINTENANCE_ROTATION_RECOVERY_REQUIRED
    return 3
  fi
  maintenance_operation_code=MAINTENANCE_ROTATION_ROLLED_BACK
  return 1
}

# The privacy-safe support bundle losporctl writes, copied beside the other
# projections so Status can offer it as a download. It holds only allowlisted
# versions, states, times and check results.
maintenance_run_support_bundle() {
  sh "$update_root/scripts/losporctl.sh" support-bundle create > "$maintenance_agent_dir/last-operation.log" 2>&1 || return 1
  maintenance_bundle=""
  for maintenance_candidate in "$update_appliance_home"/.data/support/lospor-support-*.json; do
    [ -f "$maintenance_candidate" ] && [ ! -L "$maintenance_candidate" ] && maintenance_bundle="$maintenance_candidate"
  done
  [ -n "$maintenance_bundle" ] && [ "$(wc -c < "$maintenance_bundle" | tr -d '[:space:]')" -le 65536 ] || return 1
  cp "$maintenance_bundle" "$update_projection_dir/.support-bundle.v1.json.tmp.$$"
  chmod 0644 "$update_projection_dir/.support-bundle.v1.json.tmp.$$"
  update_durable_replace "$update_projection_dir/.support-bundle.v1.json.tmp.$$" "$update_projection_dir/support-bundle.v1.json"
}

# Ubuntu security updates run in their own systemd unit: this agent's sandbox
# keeps /usr and /etc read-only, which is right for everything else it does.
maintenance_run_os_update() {
  sh "$update_root/scripts/host-os-maintenance.sh" run-unit security-update \
    > "$maintenance_agent_dir/last-operation.log" 2>&1
}

# A restart is offered only after a fresh verified backup. The restart itself is
# started after the result is recorded, because it ends this agent too.
maintenance_run_os_reboot() {
  maintenance_run_backup || { maintenance_operation_code=MAINTENANCE_OS_REBOOT_BACKUP_FAILED; return 1; }
}

maintenance_start_reboot() {
  sh "$update_root/scripts/host-os-maintenance.sh" run-unit reboot-now \
    >> "$maintenance_agent_dir/last-operation.log" 2>&1 || true
}

# HOSPITAL_HOST_REBOOT_POLICY=window: when Ubuntu says a restart is needed, the
# agent takes a backup and restarts the server itself. The caller runs this only
# inside the update window and while no update is in progress; here it also
# waits for any maintenance request, and restarts at most once in 20 hours, so a
# restart that does not clear the flag cannot become a loop.
maintenance_scheduled_reboot() {
  maintenance_reboot_marker=/run/reboot-required
  [ "${HOSPITAL_UPDATE_TEST_ONLY:-0}" != 1 ] || maintenance_reboot_marker="${HOSPITAL_HOST_REBOOT_MARKER:-$maintenance_reboot_marker}"
  [ "$(site_config_value "$update_appliance_home/site.env" HOSPITAL_HOST_REBOOT_POLICY)" = window ] || return 1
  [ -e "$maintenance_reboot_marker" ] || return 1
  [ ! -e "$maintenance_request" ] && [ ! -e "$maintenance_inflight" ] || return 1
  if maintenance_transition_read; then
    case "$maintenance_transition_phase" in ACCEPTED|RUNNING|NEEDS_OPERATOR) return 1 ;; esac
  fi
  maintenance_now="$(update_now_epoch)"
  if [ -f "$maintenance_reboot_stamp" ]; then
    maintenance_last_reboot="$(cat "$maintenance_reboot_stamp" 2>/dev/null || echo 0)"
    update_valid_epoch "$maintenance_last_reboot" || maintenance_last_reboot=0
    [ "$((maintenance_now - maintenance_last_reboot))" -ge 72000 ] || return 1
  fi
  printf '%s\n' "$maintenance_now" > "$maintenance_reboot_stamp.tmp.$$"
  chmod 0600 "$maintenance_reboot_stamp.tmp.$$"
  update_durable_replace "$maintenance_reboot_stamp.tmp.$$" "$maintenance_reboot_stamp"
  maintenance_request_id="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
  maintenance_transition_write RUNNING os-reboot "$maintenance_request_id" MAINTENANCE_RUNNING -
  maintenance_projection_write working MAINTENANCE_RUNNING os-reboot
  if maintenance_run_backup; then
    maintenance_terminal_write COMPLETED os-reboot "$maintenance_request_id" MAINTENANCE_OS_REBOOT_SCHEDULED_STARTED -
    maintenance_projection_write completed MAINTENANCE_OS_REBOOT_SCHEDULED_STARTED os-reboot
    maintenance_start_reboot
  else
    maintenance_terminal_write FAILED os-reboot "$maintenance_request_id" MAINTENANCE_OS_REBOOT_BACKUP_FAILED -
    maintenance_projection_write failed MAINTENANCE_OS_REBOOT_BACKUP_FAILED os-reboot
  fi
  return 0
}

# Set up off-host copies from the destination Status proposed. The proposal is
# a handful of fixed keys; offhost-copy.sh validates each value again.
maintenance_run_offhost_config() {
  maintenance_candidate="$maintenance_agent_dir/offhost-proposal.$maintenance_request_id.conf"
  if [ ! -f "$maintenance_offhost_proposal" ] || [ -L "$maintenance_offhost_proposal" ] \
    || [ "$(stat -c %h "$maintenance_offhost_proposal" 2>/dev/null || echo 0)" != 1 ] \
    || [ "$(wc -c < "$maintenance_offhost_proposal" | tr -d '[:space:]')" -gt 512 ]; then
    maintenance_operation_code=MAINTENANCE_CONFIG_PROPOSAL_UNSAFE
    return 1
  fi
  (umask 077; cp "$maintenance_offhost_proposal" "$maintenance_candidate")
  rm -f "$maintenance_offhost_proposal"
  maintenance_offhost_valid=1
  [ "$(sha256sum "$maintenance_candidate" | awk '{print $1}')" = "$maintenance_request_argument" ] || maintenance_offhost_valid=0
  maintenance_offhost_value() { sed -n "s/^$1=//p" "$maintenance_candidate"; }
  maintenance_offhost_type="$(maintenance_offhost_value type)"
  case "$maintenance_offhost_type" in
    mount) maintenance_offhost_keys="type path" ;;
    sftp) maintenance_offhost_keys="type host port user directory" ;;
    *) maintenance_offhost_valid=0; maintenance_offhost_keys="" ;;
  esac
  [ "$(grep -c '' "$maintenance_candidate")" = "$(printf '%s\n' $maintenance_offhost_keys | grep -c '')" ] || maintenance_offhost_valid=0
  for maintenance_offhost_key in $maintenance_offhost_keys; do
    [ "$(grep -c "^$maintenance_offhost_key=" "$maintenance_candidate")" = 1 ] || maintenance_offhost_valid=0
  done
  if [ "$maintenance_offhost_valid" -eq 0 ]; then
    rm -f "$maintenance_candidate"
    maintenance_operation_code=MAINTENANCE_CONFIG_PROPOSAL_MISMATCH
    return 1
  fi
  if [ "$maintenance_offhost_type" = mount ]; then
    set -- mount "$(maintenance_offhost_value path)"
  else
    set -- sftp "$(maintenance_offhost_value host)" "$(maintenance_offhost_value port)" \
      "$(maintenance_offhost_value user)" "$(maintenance_offhost_value directory)"
  fi
  rm -f "$maintenance_candidate"
  sh "$update_root/scripts/offhost-copy.sh" configure "$@" > "$maintenance_agent_dir/last-operation.log" 2>&1
}

# The secrets escrow copy Status offers as a download. Status generates the
# passphrase, shows it once, and leaves it here as a root-readable proposal
# named by its digest; this writes the same encrypted copy losporctl secrets
# escrow writes, proves it opens, and offers it beside the other projections,
# readable by the Status user only. The acknowledgement Go-live checks is
# recorded when Status reports the file downloaded (secrets-escrow-delivered),
# and the copy is then removed. One not downloaded is removed after 30 minutes.
# At most three copies are written in 24 hours, whatever Status allows.
MAINTENANCE_ESCROW_OFFER_SECONDS=1800
MAINTENANCE_ESCROW_DAILY_LIMIT=3
MAINTENANCE_STATUS_UID=1001

maintenance_escrow_remove_offer() {
  rm -f "$maintenance_escrow_bundle" "$maintenance_escrow_offer"
}

maintenance_run_secrets_escrow() {
  maintenance_candidate="$maintenance_agent_dir/escrow-passphrase.$maintenance_request_id"
  if [ ! -f "$maintenance_escrow_proposal" ] || [ -L "$maintenance_escrow_proposal" ] \
    || [ "$(stat -c %h "$maintenance_escrow_proposal" 2>/dev/null || echo 0)" != 1 ] \
    || [ "$(wc -c < "$maintenance_escrow_proposal" | tr -d '[:space:]')" -gt 64 ]; then
    rm -f "$maintenance_escrow_proposal"
    maintenance_operation_code=MAINTENANCE_CONFIG_PROPOSAL_UNSAFE
    return 1
  fi
  (umask 077; cp "$maintenance_escrow_proposal" "$maintenance_candidate")
  rm -f "$maintenance_escrow_proposal"
  if [ "$(sha256sum "$maintenance_candidate" | awk '{print $1}')" != "$maintenance_request_argument" ] \
    || [ "$(grep -c '' "$maintenance_candidate")" != 1 ] \
    || ! escrow_passphrase_valid "$(cat "$maintenance_candidate")"; then
    rm -f "$maintenance_candidate"
    maintenance_operation_code=MAINTENANCE_CONFIG_PROPOSAL_MISMATCH
    return 1
  fi
  maintenance_since=$(( $(update_now_epoch) - 86400 ))
  maintenance_escrows="$(awk -F '\t' -v since="$maintenance_since" \
    '$1 == "LOSPOR-HOSPITAL-MAINTENANCE-TRANSITION-V1" && $3 == "COMPLETED" && $4 == "secrets-escrow" && $2 >= since { n++ } END { print n + 0 }' \
    "$maintenance_journal" 2>/dev/null || echo 0)"
  if [ "$maintenance_escrows" -ge "$MAINTENANCE_ESCROW_DAILY_LIMIT" ]; then
    rm -f "$maintenance_candidate"
    maintenance_operation_code=MAINTENANCE_ESCROW_DAILY_LIMIT
    return 1
  fi
  maintenance_escrow_remove_offer
  maintenance_work="$(mktemp -d "$update_appliance_home/.escrow-work.XXXXXX")"
  chmod 0700 "$maintenance_work"
  maintenance_escrow_tmp="$update_projection_dir/.secrets-escrow.v1.enc.tmp.$$"
  maintenance_escrow_written=0
  (umask 077; escrow_write_bundle "$update_appliance_home" "$maintenance_candidate" \
    "$maintenance_escrow_tmp" "$maintenance_work") || maintenance_escrow_written=$?
  rm -rf "$maintenance_work" "$maintenance_candidate"
  if [ "$maintenance_escrow_written" -ne 0 ] \
    || ! chown "$MAINTENANCE_STATUS_UID:$MAINTENANCE_STATUS_UID" "$maintenance_escrow_tmp" \
    || ! chmod 0600 "$maintenance_escrow_tmp"; then
    rm -f "$maintenance_escrow_tmp"
    maintenance_operation_code=MAINTENANCE_ESCROW_FAILED
    return 1
  fi
  maintenance_escrow_sha="$(sha256sum "$maintenance_escrow_tmp" | awk '{print $1}')"
  maintenance_escrow_bytes="$(wc -c < "$maintenance_escrow_tmp" | tr -d '[:space:]')"
  update_durable_replace "$maintenance_escrow_tmp" "$maintenance_escrow_bundle" || return 1
  maintenance_escrow_offer_tmp="$maintenance_escrow_offer.tmp.$$"
  printf '{"schemaVersion":1,"signalType":"secrets-escrow","createdAt":"%s","fileName":"lospor-hospital-secrets-%s.tar.gz.enc","sha256":"%s","bytes":%s,"operatorRef":"%s"}\n' \
    "$(update_now_iso)" "$(date -u +%Y%m%dT%H%M%SZ)" "$maintenance_escrow_sha" "$maintenance_escrow_bytes" \
    "$maintenance_request_operator" > "$maintenance_escrow_offer_tmp"
  chmod 0644 "$maintenance_escrow_offer_tmp"
  update_durable_replace "$maintenance_escrow_offer_tmp" "$maintenance_escrow_offer"
}

maintenance_run_secrets_escrow_delivered() {
  if [ ! -f "$maintenance_escrow_bundle" ] || [ ! -f "$maintenance_escrow_offer" ] \
    || [ "$(sha256sum "$maintenance_escrow_bundle" | awk '{print $1}')" != "$maintenance_request_argument" ] \
    || ! grep -Fq "\"sha256\":\"$maintenance_request_argument\"" "$maintenance_escrow_offer"; then
    maintenance_operation_code=MAINTENANCE_ESCROW_NOT_OFFERED
    return 1
  fi
  maintenance_escrow_name="$(sed -n 's/.*"fileName":"\(lospor-hospital-secrets-[0-9TZ]*\.tar\.gz\.enc\)".*/\1/p' "$maintenance_escrow_offer")"
  (
    SUDO_USER="$maintenance_request_operator"
    escrow_record_acknowledgement "$update_appliance_home" "method=status-download
escrowBundle=$maintenance_escrow_name
escrowBundleSha256=$maintenance_request_argument"
  ) || return 1
  maintenance_escrow_remove_offer
}

# Called every poll: a copy nobody downloaded does not stay on offer.
maintenance_escrow_expire() {
  [ -e "$maintenance_escrow_bundle" ] || [ -e "$maintenance_escrow_offer" ] || return 0
  maintenance_escrow_age_from="$(stat -c %Y "$maintenance_escrow_offer" 2>/dev/null || echo 0)"
  [ "$(( $(update_now_epoch) - maintenance_escrow_age_from ))" -lt "$MAINTENANCE_ESCROW_OFFER_SECONDS" ] \
    || maintenance_escrow_remove_offer
}

maintenance_process_consumed() {
  maintenance_consumed="$1"
  if ! maintenance_parse_request "$maintenance_consumed"; then
    maintenance_code="$(maintenance_parse_request "$maintenance_consumed" 2>&1 >/dev/null || true)"
    case "$maintenance_code" in MAINTENANCE_REQUEST_*) ;; *) maintenance_code=MAINTENANCE_REQUEST_MALFORMED ;; esac
    maintenance_terminal_write FAILED - - "$maintenance_code" -
    maintenance_projection_write failed "$maintenance_code"
    rm -f "$maintenance_consumed"
    return 0
  fi
  if maintenance_request_seen_terminal "$maintenance_request_id"; then
    maintenance_transition_write FAILED "$maintenance_request_action" "$maintenance_request_id" \
      MAINTENANCE_REQUEST_REPLAYED "$maintenance_request_operator"
    maintenance_projection_write failed MAINTENANCE_REQUEST_REPLAYED "$maintenance_request_action"
    rm -f "$maintenance_consumed"
    return 0
  fi
  maintenance_transition_write RUNNING "$maintenance_request_action" "$maintenance_request_id" \
    MAINTENANCE_RUNNING "$maintenance_request_operator"
  maintenance_projection_write working MAINTENANCE_RUNNING "$maintenance_request_action"
  maintenance_operation_code=""
  maintenance_result=0
  set +e
  case "$maintenance_request_action" in
    backup) maintenance_run_backup ;;
    drill) maintenance_run_drill ;;
    config) maintenance_run_config ;;
    advanced) maintenance_run_advanced ;;
    os-update) maintenance_run_os_update ;;
    support-bundle) maintenance_run_support_bundle ;;
    rotate-credentials) maintenance_run_rotation ;;
    secrets-escrow) maintenance_run_secrets_escrow ;;
    secrets-escrow-delivered) maintenance_run_secrets_escrow_delivered ;;
    os-reboot) maintenance_run_os_reboot ;;
    offhost-config) maintenance_run_offhost_config ;;
    offhost-test) sh "$update_root/scripts/offhost-copy.sh" test > "$maintenance_agent_dir/last-operation.log" 2>&1 ;;
    offhost-drill) sh "$update_root/scripts/offhost-copy.sh" drill > "$maintenance_agent_dir/last-operation.log" 2>&1 ;;
    offhost-disable) sh "$update_root/scripts/offhost-copy.sh" disable > "$maintenance_agent_dir/last-operation.log" 2>&1 ;;
  esac
  maintenance_result=$?
  set -e
  chmod 0600 "$maintenance_agent_dir/last-operation.log" 2>/dev/null || true
  maintenance_phase=COMPLETED
  case "$maintenance_request_action:$maintenance_result" in
    backup:0) maintenance_code=MAINTENANCE_BACKUP_COMPLETED ;;
    drill:0) maintenance_code=MAINTENANCE_DRILL_PASSED ;;
    config:0) maintenance_code=MAINTENANCE_CONFIG_APPLIED ;;
    config:3|advanced:3|rotate-credentials:3) maintenance_phase=NEEDS_OPERATOR; maintenance_code="$maintenance_operation_code" ;;
    rotate-credentials:0) maintenance_code=MAINTENANCE_ROTATION_COMMITTED ;;
    advanced:0) maintenance_code=MAINTENANCE_ADVANCED_APPLIED ;;
    os-update:0) maintenance_code=MAINTENANCE_OS_UPDATED ;;
    os-update:75) maintenance_phase=FAILED; maintenance_code=MAINTENANCE_BUSY ;;
    os-reboot:0) maintenance_code=MAINTENANCE_OS_REBOOT_STARTED ;;
    support-bundle:0) maintenance_code=MAINTENANCE_SUPPORT_BUNDLE_CREATED ;;
    secrets-escrow:0) maintenance_code=MAINTENANCE_ESCROW_READY ;;
    secrets-escrow-delivered:0) maintenance_code=MAINTENANCE_ESCROW_RECORDED ;;
    offhost-config:0) maintenance_code=MAINTENANCE_OFFHOST_CONFIGURED ;;
    offhost-test:0) maintenance_code=MAINTENANCE_OFFHOST_TEST_PASSED ;;
    offhost-drill:0) maintenance_code=MAINTENANCE_OFFHOST_DRILL_PASSED ;;
    offhost-disable:0) maintenance_code=MAINTENANCE_OFFHOST_DISABLED ;;
    offhost-test:75|offhost-drill:75) maintenance_phase=FAILED; maintenance_code=MAINTENANCE_BUSY ;;
    offhost-config:3) maintenance_phase=FAILED; maintenance_code=MAINTENANCE_OFFHOST_CUSTOM_HOOK ;;
    *)
      maintenance_phase=FAILED
      maintenance_code="$maintenance_operation_code"
      if [ -z "$maintenance_code" ]; then
        case "$maintenance_request_action" in
          backup) maintenance_code=MAINTENANCE_BACKUP_FAILED ;;
          drill) maintenance_code=MAINTENANCE_DRILL_FAILED ;;
          config|advanced) maintenance_code=MAINTENANCE_CONFIG_REFUSED ;;
          os-update) maintenance_code=MAINTENANCE_OS_UPDATE_FAILED ;;
          support-bundle) maintenance_code=MAINTENANCE_SUPPORT_BUNDLE_FAILED ;;
          secrets-escrow) maintenance_code=MAINTENANCE_ESCROW_FAILED ;;
          secrets-escrow-delivered) maintenance_code=MAINTENANCE_ESCROW_NOT_OFFERED ;;
          rotate-credentials) maintenance_code=MAINTENANCE_ROTATION_REFUSED ;;
          os-reboot) maintenance_code=MAINTENANCE_OS_REBOOT_BACKUP_FAILED ;;
          offhost-config) maintenance_code=MAINTENANCE_OFFHOST_CONFIG_REFUSED ;;
          offhost-test) maintenance_code=MAINTENANCE_OFFHOST_TEST_FAILED ;;
          offhost-drill) maintenance_code=MAINTENANCE_OFFHOST_DRILL_FAILED ;;
          offhost-disable) maintenance_code=MAINTENANCE_OFFHOST_DISABLE_FAILED ;;
        esac
        grep -Fxq UPDATE_MAINTENANCE_BUSY "$maintenance_agent_dir/last-operation.log" 2>/dev/null \
          && maintenance_code=MAINTENANCE_BUSY
      fi
      ;;
  esac
  maintenance_terminal_write "$maintenance_phase" "$maintenance_request_action" "$maintenance_request_id" \
    "$maintenance_code" "$maintenance_request_operator"
  case "$maintenance_phase" in
    COMPLETED) maintenance_projection_write completed "$maintenance_code" "$maintenance_request_action" ;;
    FAILED) maintenance_projection_write failed "$maintenance_code" "$maintenance_request_action" ;;
    NEEDS_OPERATOR) maintenance_projection_write needs-operator "$maintenance_code" "$maintenance_request_action" ;;
  esac
  rm -f "$maintenance_consumed"
  [ "$maintenance_code" != MAINTENANCE_OS_REBOOT_STARTED ] || maintenance_start_reboot
}

maintenance_consume_pending() {
  [ -e "$maintenance_request" ] || return 1
  maintenance_link_attempt=0
  while [ -f "$maintenance_request" ] && [ ! -L "$maintenance_request" ] \
    && [ "$(stat -c %h "$maintenance_request" 2>/dev/null || echo 0)" != 1 ] \
    && [ "$maintenance_link_attempt" -lt 10 ]; do
    maintenance_link_attempt=$((maintenance_link_attempt + 1))
    sleep 0.05
  done
  [ -f "$maintenance_request" ] && [ ! -L "$maintenance_request" ] \
    && [ "$(stat -c %h "$maintenance_request" 2>/dev/null || echo 0)" = 1 ] || {
    maintenance_terminal_write FAILED - - MAINTENANCE_REQUEST_UNSAFE -
    maintenance_projection_write failed MAINTENANCE_REQUEST_UNSAFE
    rm -f "$maintenance_request" 2>/dev/null || true
    return 0
  }
  [ ! -e "$maintenance_inflight" ] || {
    maintenance_terminal_write NEEDS_OPERATOR - - MAINTENANCE_INFLIGHT_CONFLICT -
    maintenance_projection_write needs-operator MAINTENANCE_INFLIGHT_CONFLICT
    return 0
  }
  mv "$maintenance_request" "$maintenance_inflight" || return 0
  chown 0:0 "$maintenance_inflight" && chmod 0600 "$maintenance_inflight" || {
    maintenance_terminal_write NEEDS_OPERATOR - - MAINTENANCE_INFLIGHT_CONFLICT -
    maintenance_projection_write needs-operator MAINTENANCE_INFLIGHT_CONFLICT
    return 0
  }
  maintenance_process_consumed "$maintenance_inflight"
  return 0
}

# A request still RUNNING at startup was interrupted part way. A backup or a
# drill changes nothing clinical and can simply be asked for again; a settings
# change may have stopped between writing .env and restarting, so a person looks.
maintenance_reconcile_startup() {
  if maintenance_transition_read; then
    if [ "$maintenance_transition_phase" = RUNNING ]; then
      if [ "$maintenance_transition_action" = rotate-credentials ]; then
        # A rotation stopped part way may have moved some services to new values.
        maintenance_terminal_write NEEDS_OPERATOR rotate-credentials "$maintenance_transition_id" \
          MAINTENANCE_ROTATION_INTERRUPTED "$maintenance_transition_operator"
      elif [ "$maintenance_transition_action" = config ] || [ "$maintenance_transition_action" = advanced ]; then
        maintenance_terminal_write NEEDS_OPERATOR config "$maintenance_transition_id" \
          MAINTENANCE_CONFIG_INTERRUPTED "$maintenance_transition_operator"
      else
        maintenance_terminal_write FAILED "$maintenance_transition_action" "$maintenance_transition_id" \
          MAINTENANCE_INTERRUPTED "$maintenance_transition_operator"
      fi
      rm -f "$maintenance_inflight"
    fi
  fi
  maintenance_refresh_projection
}
