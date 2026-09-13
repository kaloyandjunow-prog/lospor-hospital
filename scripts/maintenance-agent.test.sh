#!/bin/sh
set -eu

# The agent really chowns the request it consumes to root, so like the update
# agent suite this runs as root or through passwordless sudo.
if [ "$(id -u)" != 0 ]; then
  if sudo -n true 2>/dev/null; then
    exec sudo -n -E sh "$0" "$@"
  fi
  if [ "${HOSPITAL_REQUIRE_FULL_UPDATE_TESTS:-0}" = 1 ]; then
    printf 'Bail out! the maintenance agent needs root (or passwordless sudo) and HOSPITAL_REQUIRE_FULL_UPDATE_TESTS=1.\n'
    exit 1
  fi
  printf '1..0 # SKIP the maintenance agent suite needs root or passwordless sudo\n'
  exit 0
fi
command -v flock >/dev/null 2>&1 || { printf '1..0 # SKIP the maintenance agent suite needs flock\n'; exit 0; }

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM
tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { echo "FAIL: $1" >&2; [ ! -f "$work/out" ] || sed 's/^/    /' "$work/out" >&2; exit 1; }

site="$work/site"; home="$site/.lospor-home"; scripts="$site/scripts"
requests="$home/.data/runtime/update/requests"
state="$home/.data/runtime/update/state"
private="$home/.data/update-private"
mkdir -p "$scripts" "$work/zoneinfo/Europe"
: > "$work/zoneinfo/Europe/Sofia"
for name in installed-release-state.sh operator-locale.sh update-pipeline-lib.sh terminology-agent-lib.sh \
    site-config.sh maintenance-agent-lib.sh update-agent-loop.sh; do
  cp "$root/scripts/$name" "$scripts/$name"
done
for name in check-for-update.sh terminology-host-operation.sh; do printf '#!/bin/sh\nexit 0\n' > "$scripts/$name"; done
cat > "$scripts/backup-now.sh" <<'STUB'
#!/bin/sh
echo "backup-now${*:+ $*}" >> "$AGENT_CALLS"
exit "${BACKUP_EXIT:-0}"
STUB
cat > "$scripts/restore-backup.sh" <<'STUB'
#!/bin/sh
echo "restore-backup $*" >> "$AGENT_CALLS"
exit "${RESTORE_EXIT:-0}"
STUB
cat > "$scripts/offhost-copy.sh" <<'STUB'
#!/bin/sh
echo "offhost-copy $*" >> "$AGENT_CALLS"
exit "${OFFHOST_EXIT:-0}"
STUB
cat > "$scripts/host-os-maintenance.sh" <<'STUB'
#!/bin/sh
echo "host-os-maintenance $*" >> "$AGENT_CALLS"
exit "${HOST_OS_EXIT:-0}"
STUB
cat > "$scripts/losporctl.sh" <<'STUB'
#!/bin/sh
home="$(CDPATH= cd -- "$(dirname "$0")/../.lospor-home" && pwd -P)"
echo "losporctl $*" >> "$AGENT_CALLS"
[ "${BUNDLE_EXIT:-0}" = 0 ] || exit "$BUNDLE_EXIT"
mkdir -p "$home/.data/support"
printf '{"schemaVersion":1,"bundleType":"lospor-hospital-support","createdAt":"2026-09-13T08:30:00Z","release":"1.4.0"}\n' \
  > "$home/.data/support/lospor-support-20260913T083000Z.json"
STUB
cat > "$scripts/apply-site-config.sh" <<'STUB'
#!/bin/sh
home="$(CDPATH= cd -- "$(dirname "$0")/../.lospor-home" && pwd -P)"
echo "apply-site-config $*" >> "$AGENT_CALLS"
cp "$home/site.env" "$AGENT_APPLIED"
if [ -f "$home/advanced.env" ]; then cp "$home/advanced.env" "$AGENT_APPLIED.advanced"; else rm -f "$AGENT_APPLIED.advanced"; fi
# A rollback of an advanced change restores the running values itself.
[ "${APPLY_RESTORES_ADVANCED:-0}" != 1 ] || cp "$(ls "$home"/.data/update-private/maintenance/advanced.env.before.*)" "$home/advanced.env"
# A rollback restores the running settings itself before it exits 1.
[ "${APPLY_RESTORES:-0}" != 1 ] || cp "$(ls "$home"/.data/update-private/maintenance/site.env.before.*)" "$home/site.env"
[ "${APPLY_BUSY:-0}" != 1 ] || echo UPDATE_MAINTENANCE_BUSY >&2
exit "${APPLY_EXIT:-0}"
STUB

site_env='LOSPOR_DEFAULT_LOCALE=en
HOSPITAL_CLINICAL_DOMAIN=clinical.example.org
HOSPITAL_TLS_MODE=local
HOSPITAL_RESEARCH_ALLOWED_CIDRS="10.20.30.0/24"
HOSPITAL_STATUS_ALLOWED_CIDRS="10.20.40.0/24"
HOSPITAL_SUPPORT_URL=
AUTH_EMAIL_FROM_NAME=LOSPOR'

reset_state() {
  rm -rf "$home" "$work/calls" "$work/applied"
  mkdir -p "$requests" "$state" "$home/backups"
  printf '%s\n' "$site_env" > "$home/site.env"
  chmod 600 "$home/site.env"
  : > "$work/calls"
}
now() { date -u +%s; }
operator=status-operator-0123456789abcdef
request() {
  printf 'LOSPOR-HOSPITAL-MAINTENANCE-REQUEST-V1\t%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "${4:-$(now)}" "$operator" \
    > "$requests/maintenance.request.v1.tsv"
}
run_agent() {
  env AGENT_CALLS="$work/calls" AGENT_APPLIED="$work/applied" HOSPITAL_UPDATE_AGENT_ONESHOT=1 \
    HOSPITAL_UPDATE_TEST_ONLY=1 HOSPITAL_UPDATE_TEST_ZONEINFO_ROOT="$work/zoneinfo" \
    HOSPITAL_UPDATE_AGENT_POLL_SECONDS=5 HOSPITAL_UPDATE_CHECK_INTERVAL_SECONDS=999999 \
    HOSPITAL_UPDATE_TIMEZONE=Europe/Sofia "$@" sh "$scripts/update-agent-loop.sh" > "$work/out" 2>&1 || true
}
projection() { cat "$state/maintenance-agent.v1.json"; }
code() { sed -n 's/.*"resultCode":"\([A-Z0-9_]*\)".*/\1/p' "$state/maintenance-agent.v1.json"; }
id1=11111111111111111111111111111111
id2=22222222222222222222222222222222

# 1. A backup request runs the backup once, and a replay of it runs nothing.
reset_state
request backup "$id1" -
run_agent
grep -qx 'backup-now' "$work/calls" || fail "a backup request did not run the backup"
[ "$(code)" = MAINTENANCE_BACKUP_COMPLETED ] || fail "a completed backup was not projected"
[ ! -e "$requests/maintenance.request.v1.tsv" ] || fail "the backup request was not consumed"
: > "$work/calls"
request backup "$id1" -
run_agent
[ ! -s "$work/calls" ] || fail "a replayed backup request ran again"
[ "$(code)" = MAINTENANCE_REQUEST_REPLAYED ] || fail "a replayed request was not refused as such"
ok "a backup request runs once, and its replay is refused"

# 2. A request found long after it was made is refused, not run.
reset_state
request backup "$id1" - "$(( $(now) - 3600 ))"
run_agent
[ ! -s "$work/calls" ] || fail "an hour-old request ran"
[ "$(code)" = MAINTENANCE_REQUEST_EXPIRED ] || fail "an hour-old request was not refused as expired"
ok "a request found an hour later is refused as expired"

# 3. A drill with no backup says so; with backups it drills the newest and keeps evidence.
reset_state
request drill "$id1" -
run_agent
[ "$(code)" = MAINTENANCE_DRILL_NO_BACKUP ] || fail "a drill with no backup was not refused as such"
reset_state
mkdir "$home/backups/lospor-20260912T232632Z-PcfT8hOm.backup" "$home/backups/lospor-20260913T072635Z-W3UVqwGn.backup"
request drill "$id1" -
run_agent
grep -qx 'restore-backup --drill backups/lospor-20260913T072635Z-W3UVqwGn.backup' "$work/calls" \
  || fail "the drill did not restore the newest backup with --drill"
[ "$(code)" = MAINTENANCE_DRILL_PASSED ] || fail "a passed drill was not projected"
request drill "$id2" -
RESTORE_EXIT=1 run_agent
[ "$(code)" = MAINTENANCE_DRILL_FAILED ] || fail "a failed drill was not projected"
python3 - "$state/maintenance-agent.v1.json" <<'PY' || fail "the drill evidence is not in the projection"
import json, sys
drills = json.load(open(sys.argv[1]))["drills"]
assert [d["result"] for d in drills] == ["passed", "failed"], drills
assert all(d["backup"] == "lospor-20260913T072635Z-W3UVqwGn.backup" for d in drills), drills
PY
ok "a drill restores the newest backup and keeps passed and failed evidence"

propose() {
  printf '%s\n' "$1" > "$requests/site-config.proposal.v1.env"
  request config "$2" "${3:-$(sha256sum "$requests/site-config.proposal.v1.env" | awk '{print $1}')}"
}
support_changed="$(printf '%s\n' "$site_env" | sed 's|^HOSPITAL_SUPPORT_URL=$|HOSPITAL_SUPPORT_URL=mailto:it@example.org|')"

# 4. A settings change Status may make is written to site.env and applied.
reset_state
propose "$support_changed" "$id1"
run_agent
grep -qx 'apply-site-config --yes' "$work/calls" || fail "the settings change was not applied"
grep -qx 'HOSPITAL_SUPPORT_URL=mailto:it@example.org' "$work/applied" || fail "apply did not see the proposed settings"
grep -qx 'HOSPITAL_SUPPORT_URL=mailto:it@example.org' "$home/site.env" || fail "the applied change did not stay in site.env"
[ "$(code)" = MAINTENANCE_CONFIG_APPLIED ] || fail "an applied change was not projected"
[ ! -e "$requests/site-config.proposal.v1.env" ] || fail "the proposal was left in the request directory"
ok "a settings change Status may make is applied through apply-site-config"

# 5-7. What Status may not change, a proposal that is not the one confirmed, and a secret are refused untouched.
refused() {
  description="$1"; expected="$2"
  run_agent
  [ ! -s "$work/calls" ] || fail "$description: apply ran"
  [ "$(cat "$home/site.env")" = "$site_env" ] || fail "$description: site.env changed"
  [ "$(code)" = "$expected" ] || fail "$description: expected $expected, got $(code)"
  ok "$description is refused and nothing changes"
}
reset_state
propose "$(printf '%s\n' "$site_env" | sed 's|clinical.example.org|other.example.org|')" "$id1"
refused "a change to the clinical name" MAINTENANCE_CONFIG_CONSOLE_ONLY
reset_state
propose "$support_changed" "$id1" "$(printf 'a%.0s' $(seq 64))"
refused "a proposal that is not the one confirmed" MAINTENANCE_CONFIG_PROPOSAL_MISMATCH
reset_state
propose "$(printf '%s\nHOSPITAL_POSTGRES_PASSWORD=typed\n' "$site_env")" "$id1"
refused "a proposal carrying a secret" MAINTENANCE_CONFIG_INVALID

# 8. A refused apply puts the running settings back; a rollback is reported as one.
reset_state
propose "$support_changed" "$id1"
APPLY_EXIT=1 run_agent
[ "$(cat "$home/site.env")" = "$site_env" ] || fail "a refused apply left the proposal in site.env"
[ "$(code)" = MAINTENANCE_CONFIG_REFUSED ] || fail "a refused apply was not projected as refused"
reset_state
propose "$support_changed" "$id1"
APPLY_EXIT=1 APPLY_BUSY=1 run_agent
[ "$(code)" = MAINTENANCE_BUSY ] || fail "a busy maintenance lock was not reported as busy"
reset_state
propose "$support_changed" "$id1"
APPLY_EXIT=1 APPLY_RESTORES=1 run_agent
[ "$(cat "$home/site.env")" = "$site_env" ] || fail "a rolled-back change did not end on the running settings"
[ "$(code)" = MAINTENANCE_CONFIG_ROLLED_BACK ] || fail "a rollback was not projected as one"
reset_state
propose "$support_changed" "$id1"
APPLY_EXIT=3 run_agent
grep -q '"phase":"needs-operator"' "$state/maintenance-agent.v1.json" \
  && [ "$(code)" = MAINTENANCE_CONFIG_RECOVERY_REQUIRED ] || fail "a failed rollback did not need an operator"
ok "refused, busy, rolled-back and unrecoverable applies are each reported truthfully"

# 8b. Off-host copies: a destination Status proposed is configured with exactly
#     its fixed fields, anything else is refused, and a busy lock is reported.
offhost_propose() {
  printf '%s' "$1" > "$requests/offhost.proposal.v1.conf"
  request offhost-config "$2" "$(sha256sum "$requests/offhost.proposal.v1.conf" | awk '{print $1}')"
}
reset_state
offhost_propose 'type=sftp
host=backup.hospital.test
port=2222
user=lospor
directory=lospor-backups
' "$id1"
run_agent
grep -qx 'offhost-copy configure sftp backup.hospital.test 2222 lospor lospor-backups' "$work/calls" \
  || fail "an SFTP destination was not configured with its exact fields"
[ "$(code)" = MAINTENANCE_OFFHOST_CONFIGURED ] || fail "a configured destination was not projected"
reset_state
offhost_propose 'type=mount
path=/mnt/lospor-backups
command=rm -rf /
' "$id1"
run_agent
[ ! -s "$work/calls" ] && [ "$(code)" = MAINTENANCE_CONFIG_PROPOSAL_MISMATCH ] || fail "a proposal with an extra field was acted on"
reset_state
request offhost-test "$id1" -
run_agent
grep -qx 'offhost-copy test' "$work/calls" && [ "$(code)" = MAINTENANCE_OFFHOST_TEST_PASSED ] || fail "a connection test was not run and reported"
reset_state
request offhost-drill "$id1" -
OFFHOST_EXIT=75 run_agent
[ "$(code)" = MAINTENANCE_BUSY ] || fail "a deferred off-host drill was not reported as busy"
reset_state
request offhost-drill "$id1" -
OFFHOST_EXIT=1 run_agent
[ "$(code)" = MAINTENANCE_OFFHOST_DRILL_FAILED ] || fail "a failed off-host drill was not reported"
reset_state
request offhost-disable "$id1" -
run_agent
grep -qx 'offhost-copy disable' "$work/calls" && [ "$(code)" = MAINTENANCE_OFFHOST_DISABLED ] || fail "turning off-host copies off was not run and reported"
reset_state
offhost_propose 'type=mount
path=/mnt/lospor-backups
' "$id1"
OFFHOST_EXIT=3 run_agent
[ "$(code)" = MAINTENANCE_OFFHOST_CUSTOM_HOOK ] || fail "a setup refused beside a custom script was not reported as such"
ok "off-host destinations, tests, drills and turning off requested from Status run with fixed fields only"

# 9. Status sees every site setting and which ones it may change.
reset_state
run_agent
python3 - "$state/site-config.v1.json" <<'PY' || fail "the site-settings projection is wrong"
import json, sys
settings = json.load(open(sys.argv[1]))["settings"]
assert settings["HOSPITAL_STATUS_ALLOWED_CIDRS"] == {"value": "10.20.40.0/24", "editable": True}, settings
assert settings["HOSPITAL_CLINICAL_DOMAIN"] == {"value": "clinical.example.org", "editable": False}, settings
assert settings["HOSPITAL_SUPPORT_URL"] == {"value": "", "editable": True}, settings
PY
ok "Status is shown every site setting and which it may change"

# 10. A settings change interrupted part way needs a person; a backup does not.
reset_state
mkdir -p "$private/maintenance"
printf 'LOSPOR-HOSPITAL-MAINTENANCE-TRANSITION-V1\t%s\tRUNNING\tconfig\t%s\tMAINTENANCE_RUNNING\t%s\n' "$(now)" "$id1" "$operator" \
  > "$private/maintenance/transition.v1.tsv"
run_agent
[ "$(code)" = MAINTENANCE_CONFIG_INTERRUPTED ] && grep -q '"phase":"needs-operator"' "$state/maintenance-agent.v1.json" \
  || fail "an interrupted settings change did not need an operator"
reset_state
mkdir -p "$private/maintenance"
printf 'LOSPOR-HOSPITAL-MAINTENANCE-TRANSITION-V1\t%s\tRUNNING\tbackup\t%s\tMAINTENANCE_RUNNING\t%s\n' "$(now)" "$id1" "$operator" \
  > "$private/maintenance/transition.v1.tsv"
run_agent
[ "$(code)" = MAINTENANCE_INTERRUPTED ] && grep -q '"phase":"failed"' "$state/maintenance-agent.v1.json" \
  || fail "an interrupted backup was not simply reported as failed"
ok "an interrupted settings change needs a person, an interrupted backup does not"

# 11. The update window comes from the appliance's settings, and a change restarts the agent.
reset_state
printf 'HOSPITAL_UPDATE_WINDOW_START=01:00\nHOSPITAL_UPDATE_WINDOW_END=02:00\n' > "$home/.env"
env AGENT_CALLS="$work/calls" HOSPITAL_UPDATE_TEST_ONLY=1 HOSPITAL_UPDATE_TEST_ZONEINFO_ROOT="$work/zoneinfo" \
  HOSPITAL_UPDATE_AGENT_POLL_SECONDS=5 HOSPITAL_UPDATE_CHECK_INTERVAL_SECONDS=999999 \
  HOSPITAL_UPDATE_TIMEZONE=Europe/Sofia HOSPITAL_UPDATE_WINDOW_START=20:00 HOSPITAL_UPDATE_WINDOW_END=06:00 \
  sh "$scripts/update-agent-loop.sh" > "$work/out" 2>&1 &
agent_pid=$!
sleep 2
printf 'HOSPITAL_UPDATE_WINDOW_START=03:00\nHOSPITAL_UPDATE_WINDOW_END=04:00\n' > "$home/.env"
waited=0
while kill -0 "$agent_pid" 2>/dev/null && [ "$waited" -lt 20 ]; do sleep 1; waited=$((waited + 1)); done
if kill -0 "$agent_pid" 2>/dev/null; then kill "$agent_pid"; fail "the agent kept running with an outdated update window"; fi
wait "$agent_pid" || fail "the agent did not exit cleanly for a restart after the window changed"
ok "a changed update window makes the agent exit so systemd starts it with the new window"

# 12. Advanced settings: only advanced keys inside their limits are written and
#     applied; an empty proposal returns every value to its default; a refused
#     apply puts the running values back.
advanced_propose() {
  printf '%s' "$1" > "$requests/advanced.proposal.v1.env"
  request advanced "$2" "$(sha256sum "$requests/advanced.proposal.v1.env" | awk '{print $1}')"
}
reset_state
advanced_propose '# Advanced settings proposed from Status.
HOSPITAL_BACKUP_INTERVAL_SECONDS=7200
' "$id1"
run_agent
grep -qx 'apply-site-config --yes' "$work/calls" || fail "an advanced change was not applied"
[ "$(cat "$work/applied.advanced")" = 'HOSPITAL_BACKUP_INTERVAL_SECONDS=7200' ] || fail "apply did not see exactly the advanced values"
[ "$(code)" = MAINTENANCE_ADVANCED_APPLIED ] || fail "an applied advanced change was not projected"
advanced_propose '# Advanced settings proposed from Status.
' "$id2"
run_agent
[ ! -e "$home/advanced.env" ] && [ ! -e "$work/applied.advanced" ] || fail "an empty proposal did not return every value to its default"
reset_state
advanced_propose 'HOSPITAL_BACKUP_INTERVAL_SECONDS=86400
' "$id1"
run_agent
[ ! -s "$work/calls" ] && [ ! -e "$home/advanced.env" ] && [ "$(code)" = MAINTENANCE_ADVANCED_INVALID ] || fail "a value past its limit was acted on"
reset_state
advanced_propose 'CRON_SECRET=1234567890
' "$id1"
run_agent
[ ! -s "$work/calls" ] && [ "$(code)" = MAINTENANCE_ADVANCED_INVALID ] || fail "a secret in an advanced proposal was acted on"
reset_state
printf 'HOSPITAL_BACKUP_DAILY_POINTS=21\n' > "$home/advanced.env"
advanced_propose 'HOSPITAL_BACKUP_DAILY_POINTS=30
' "$id1"
APPLY_EXIT=1 run_agent
[ "$(cat "$home/advanced.env")" = 'HOSPITAL_BACKUP_DAILY_POINTS=21' ] && [ "$(code)" = MAINTENANCE_CONFIG_REFUSED ] || fail "a refused advanced apply did not put the running values back"
reset_state
printf 'HOSPITAL_BACKUP_DAILY_POINTS=21\n' > "$home/advanced.env"
advanced_propose 'HOSPITAL_BACKUP_DAILY_POINTS=30
' "$id1"
APPLY_EXIT=1 APPLY_RESTORES_ADVANCED=1 run_agent
[ "$(cat "$home/advanced.env")" = 'HOSPITAL_BACKUP_DAILY_POINTS=21' ] && [ "$(code)" = MAINTENANCE_CONFIG_ROLLED_BACK ] || fail "a rolled-back advanced change was not reported as one"
ok "advanced settings are applied only inside their limits, and put back when refused"

# 13. Status sees each advanced value with its limits and default.
reset_state
printf 'HOSPITAL_BACKUP_INTERVAL_SECONDS=7200\n' > "$home/.env"
printf 'HOSPITAL_BACKUP_INTERVAL_SECONDS=7200\n' > "$home/advanced.env"
run_agent
python3 - "$state/site-config.v1.json" <<'PY' || fail "the advanced projection is wrong"
import json, sys
advanced = json.load(open(sys.argv[1]))["advanced"]
assert advanced["HOSPITAL_BACKUP_INTERVAL_SECONDS"] == {"value": 7200, "minimum": 3600, "maximum": 14400, "default": 14400, "overridden": True}, advanced
assert advanced["HOSPITAL_BACKUP_DAILY_POINTS"] == {"value": 14, "minimum": 14, "maximum": 90, "default": 14, "overridden": False}, advanced
assert len(advanced) == 10, advanced
PY
ok "Status is shown each advanced value with its limits, default and whether it is changed"

# 14. Ubuntu: security updates run through their unit; a restart takes a backup
#     first, is recorded, and only then is started.
reset_state
request os-update "$id1" -
run_agent
grep -qx 'host-os-maintenance run-unit security-update' "$work/calls" && [ "$(code)" = MAINTENANCE_OS_UPDATED ] || fail "security updates were not run and reported"
reset_state
request os-update "$id1" -
HOST_OS_EXIT=75 run_agent
[ "$(code)" = MAINTENANCE_BUSY ] || fail "busy security updates were not reported as busy"
reset_state
request os-update "$id1" -
HOST_OS_EXIT=1 run_agent
[ "$(code)" = MAINTENANCE_OS_UPDATE_FAILED ] || fail "failed security updates were not reported"
reset_state
request os-reboot "$id1" -
run_agent
[ "$(tr '\n' ';' < "$work/calls")" = 'backup-now;host-os-maintenance run-unit reboot-now;' ] \
  || fail "a restart did not back up first and then restart (got: $(tr '\n' ';' < "$work/calls"))"
[ "$(code)" = MAINTENANCE_OS_REBOOT_STARTED ] || fail "a started restart was not recorded before it began"
reset_state
request os-reboot "$id1" -
BACKUP_EXIT=1 run_agent
! grep -q 'reboot-now' "$work/calls" && [ "$(code)" = MAINTENANCE_OS_REBOOT_BACKUP_FAILED ] || fail "the server restarted after its backup failed"
ok "Ubuntu updates run through their unit, and a restart happens only after a backup"

# 15. With the window policy the agent restarts by itself when Ubuntu asks, in
#     the window, at most once in 20 hours, and never under the manual policy.
reboot_agent() {
  run_agent HOSPITAL_UPDATE_WINDOW_START=00:00 HOSPITAL_UPDATE_WINDOW_END=23:59 HOSPITAL_HOST_REBOOT_MARKER="$work/reboot-required" "$@"
}
reset_state
: > "$work/reboot-required"
reboot_agent
! grep -q 'reboot-now' "$work/calls" || fail "the manual policy restarted the server"
printf 'HOSPITAL_HOST_REBOOT_POLICY=window\n' >> "$home/site.env"
reboot_agent
grep -qx 'host-os-maintenance run-unit reboot-now' "$work/calls" && grep -qx 'backup-now' "$work/calls" || fail "the window policy did not back up and restart"
[ "$(code)" = MAINTENANCE_OS_REBOOT_SCHEDULED_STARTED ] || fail "the scheduled restart was not recorded"
: > "$work/calls"
reboot_agent
[ ! -s "$work/calls" ] || fail "a second restart ran within 20 hours"
rm -f "$work/reboot-required" "$private/maintenance/last-scheduled-reboot"
reboot_agent
[ ! -s "$work/calls" ] || fail "the server restarted without Ubuntu asking"
ok "the window policy restarts once when Ubuntu asks, and the manual policy never does"

# 16. A support bundle requested from Status is written by losporctl and copied
#     beside the projections for Status to offer; a failure is reported.
reset_state
request support-bundle "$id1" -
run_agent
grep -qx 'losporctl support-bundle create' "$work/calls" || fail "the support bundle was not written through losporctl"
grep -q '"bundleType":"lospor-hospital-support"' "$state/support-bundle.v1.json" || fail "the support bundle was not offered to Status"
[ "$(stat -c %a "$state/support-bundle.v1.json")" = 644 ] || fail "Status cannot read the offered support bundle"
[ "$(code)" = MAINTENANCE_SUPPORT_BUNDLE_CREATED ] || fail "a written support bundle was not reported"
reset_state
request support-bundle "$id1" -
BUNDLE_EXIT=1 run_agent
[ ! -e "$state/support-bundle.v1.json" ] && [ "$(code)" = MAINTENANCE_SUPPORT_BUNDLE_FAILED ] || fail "a failed support bundle was not reported"
ok "a support bundle requested from Status is written and offered, and a failure is reported"

echo "maintenance agent tests passed ($tests)"
