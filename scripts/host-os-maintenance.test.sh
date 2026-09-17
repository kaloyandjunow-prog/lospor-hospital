#!/bin/sh
set -eu

command -v flock >/dev/null 2>&1 || { printf '1..0 # SKIP the host OS maintenance suite needs flock\n'; exit 0; }

source_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM
tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; [ ! -f "$work/out" ] || sed 's/^/    /' "$work/out" >&2; exit 1; }

home="$work/appliance"
fixture() {
  rm -rf "$home" "$work/bin" "$work/calls"
  mkdir -p "$home/scripts" "$home/.data/runtime/update/state" "$work/bin"
  for script in host-os-maintenance.sh installed-release-state.sh operator-locale.sh update-pipeline-lib.sh; do
    cp "$source_root/scripts/$script" "$home/scripts/"
  done
  : > "$home/.data/io-mutation.lock"
  chmod 600 "$home/.data/io-mutation.lock"
  for script in backup-now.sh doctor.sh; do
    printf '#!/bin/sh\necho "%s" >> "$CALLS"\nexit "${STUB_EXIT:-0}"\n' "$script" > "$home/scripts/$script"
  done
  for tool in apt-get docker; do
    printf '#!/bin/sh\necho "%s $*" >> "$CALLS"\nexit "${APT_EXIT:-0}"\n' "$tool" > "$work/bin/$tool"
  done
  cat > "$work/bin/unattended-upgrade" <<'STUB'
#!/bin/sh
echo "unattended-upgrade $*" >> "$CALLS"
[ -z "${UU_OUTPUT:-}" ] || echo "$UU_OUTPUT"
exit "${UU_EXIT:-0}"
STUB
  # systemctl runs a started unit the way systemd would: the same script with
  # the instance name as its argument. A restart is recorded, not performed.
  cat > "$work/bin/systemctl" <<'STUB'
#!/bin/sh
echo "systemctl $*" >> "$CALLS"
case "$*" in
  "start lospor-host-os-maintenance@security-update.service") sh "$HOST_OS_SCRIPT" security-update >/dev/null 2>&1 || true ;;
esac
exit 0
STUB
  chmod +x "$work/bin/"*
  : > "$work/calls"
}

run_os() {
  PATH="$work/bin:$PATH" CALLS="$work/calls" HOST_OS_SCRIPT="$home/scripts/host-os-maintenance.sh" \
    HOSPITAL_HOST_OS_TEST_ONLY=1 HOSPITAL_HOST_OS_TEST_ROOT="$work/root" HOSPITAL_HOST_OS_TEST_CALLS="$work/calls" \
    HOSPITAL_UPDATE_TEST_ONLY=1 LOSPOR_APPLIANCE_HOME="$home" LOSPOR_DEFAULT_LOCALE=en "$@" \
    sh "$home/scripts/host-os-maintenance.sh" $os_arguments > "$work/out" 2>&1
}
evidence() { awk -F '\t' '{ print $3 " " $4 }' "$home/.data/host-os/operations.v1.tsv" | tail -n 1; }

# 1. Security updates refresh the lists, run unattended-upgrades, and record it.
fixture
os_arguments=security-update
run_os env || fail "a security update failed"
[ "$(tr '\n' ';' < "$work/calls")" = 'apt-get update -q;unattended-upgrade ;' ] || fail "the update did not refresh and then run unattended-upgrades (got: $(tr '\n' ';' < "$work/calls"))"
[ "$(evidence)" = 'security-update passed' ] || fail "a passed security update was not recorded"
[ "$(stat -c %a "$home/.data/host-os")" = 700 ] && [ "$(stat -c %a "$home/.data/host-os/operations.v1.tsv")" = 600 ] || fail "the evidence is not private"
ok "security updates run through unattended-upgrades and are recorded"

# 2. Ubuntu's own nightly run holding the package lock is busy, not failed.
fixture
set +e; run_os env UU_EXIT=1 UU_OUTPUT='E: Could not get lock /var/lib/dpkg/lock-frontend'; result=$?; set -e
[ "$result" = 75 ] && [ "$(evidence)" = 'security-update busy' ] || fail "a held package lock was not reported as busy (exit $result)"
ok "a package lock held by Ubuntu's own update is reported as busy"

# 3. The shared maintenance lock is respected: nothing is installed beside a backup.
fixture
exec 7>>"$home/.data/io-mutation.lock"
flock -n 7
set +e; run_os env; result=$?; set -e
flock -u 7; exec 7>&-
[ "$result" = 75 ] && [ ! -s "$work/calls" ] && [ "$(evidence)" = 'security-update busy' ] || fail "security updates ran while the maintenance lock was held (exit $result)"
ok "nothing is installed while another maintenance operation holds the lock"

# 4. The agent's unit call reads its result back from the evidence.
fixture
os_arguments="run-unit security-update"
run_os env || fail "a passed security update through the unit was not reported as passed"
grep -qx 'systemctl start lospor-host-os-maintenance@security-update.service' "$work/calls" || fail "the unit was not started"
fixture
set +e; run_os env UU_EXIT=1; result=$?; set -e
[ "$result" = 1 ] || fail "a failed security update through the unit did not fail (exit $result)"
ok "a security update through the unit reports the result it recorded"

# 5. A restart at the console backs up first, is recorded, and never follows a failed backup.
fixture
os_arguments=reboot
run_os env || fail "a restart failed"
[ "$(tr '\n' ';' < "$work/calls")" = 'backup-now.sh;reboot;' ] && [ "$(evidence)" = 'reboot started' ] || fail "a restart did not back up first and record itself (got: $(tr '\n' ';' < "$work/calls"))"
fixture
set +e; run_os env STUB_EXIT=1; result=$?; set -e
[ "$result" = 1 ] && ! grep -qx reboot "$work/calls" && [ "$(evidence)" = 'reboot failed' ] || fail "the server restarted after its backup failed (exit $result)"
fixture
os_arguments="run-unit reboot-now"
run_os env || fail "starting the restart unit failed"
grep -qx 'systemctl start --no-block lospor-host-os-maintenance@reboot-now.service' "$work/calls" || fail "the restart unit was not started without waiting"
ok "a restart backs up first, is recorded, and never follows a failed backup"

# 6. A full upgrade backs up, installs, brings the services back and checks them.
fixture
os_arguments=upgrade
run_os env || fail "an upgrade failed"
[ "$(tr '\n' ';' < "$work/calls")" = 'backup-now.sh;apt-get update -q;apt-get -y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold upgrade;docker compose up -d --wait --wait-timeout 300;doctor.sh;' ] \
  || fail "the upgrade did not run in order (got: $(tr '\n' ';' < "$work/calls"))"
[ "$(evidence)" = 'upgrade passed' ] || fail "a passed upgrade was not recorded"
ok "a full upgrade backs up, installs, restarts the services and runs doctor"

# 7. Anything but the fixed actions is wrong usage and does nothing.
for os_arguments in "rm -rf" "run-unit upgrade" "run-unit" ""; do
  fixture
  set +e; run_os env; result=$?; set -e
  [ "$result" = 2 ] && [ ! -s "$work/calls" ] || fail "\"$os_arguments\" was not refused as wrong usage (exit $result)"
done
ok "only the fixed actions and unit instances are accepted"

# 8. state explains the probe's signal in plain words.
if command -v python3 >/dev/null 2>&1; then
  fixture
  printf '%s\n' '{"schemaVersion":1,"signalType":"host-os","observedAt":"2026-09-13T09:00:00Z","release":"24.04","standardSupportEnds":"2029-04-30","securityUpdates":3,"otherUpdates":7,"dockerUpdates":true,"updatesCheckedAt":null,"automaticUpdates":"enabled","lastAutomaticRunAt":"2026-09-13T06:00:00Z","lastAutomaticResult":"success","rebootRequired":true,"rebootRequiredSince":"2026-09-12T06:00:00Z","bootedAt":"2026-09-01T10:00:00Z","rebootPolicy":"manual"}' \
    > "$home/.data/runtime/update/state/host-os.v1.json"
  os_arguments=state
  run_os env || fail "state failed"
  for line in 'Ubuntu 24.04, standard support until 2029-04-30' 'Security updates waiting: 3 (other updates: 7)' \
      'A restart is needed since 2026-09-12T06:00:00Z; restart policy: manual'; do
    grep -Fqx "$line" "$work/out" || fail "state did not say: $line"
  done
  grep -Fq 'sudo losporctl host upgrade' "$work/out" || fail "state did not name the Docker upgrade command"
  ok "state explains Ubuntu's state in plain words"
fi

echo "host OS maintenance tests passed ($tests)"
