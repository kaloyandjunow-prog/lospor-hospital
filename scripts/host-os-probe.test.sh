#!/bin/sh
set -eu

command -v python3 >/dev/null 2>&1 || { printf '1..0 # SKIP the host OS probe suite needs python3\n'; exit 0; }

source_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM
tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; [ ! -f "$work/out" ] || sed 's/^/    /' "$work/out" >&2; exit 1; }

home="$work/appliance"
host="$work/root"
now=1789290000
fixture() {
  rm -rf "$home" "$host" "$work/bin" "$work/calls"
  mkdir -p "$home/scripts" "$home/.data/host-os" "$host/etc" "$host/run" "$host/proc" "$host/var/lib/apt/lists" "$host/var/lib/dpkg" "$work/bin"
  cp "$source_root/scripts/host-os-probe.sh" "$source_root/scripts/update-pipeline-lib.sh" "$home/scripts/"
  printf 'PRETTY_NAME="Ubuntu 24.04.4 LTS"\nVERSION_ID="24.04"\n' > "$host/etc/os-release"
  printf 'cpu  1 2 3\nbtime 1788256800\n' > "$host/proc/stat"
  : > "$host/var/lib/dpkg/status"
  touch -d @$((now - 7200)) "$host/var/lib/dpkg/status" "$host/var/lib/apt/lists"
  printf 'HOSPITAL_HOST_REBOOT_POLICY=window\n' > "$home/.env"
  cat > "$work/bin/apt-get" <<'STUB'
#!/bin/sh
echo "apt-get $*" >> "$CALLS"
cat <<'LIST'
NOTE: This is only a simulation!
Inst openssl [3.0.13-0ubuntu3.4] (3.0.13-0ubuntu3.5 Ubuntu:24.04/noble-updates, Ubuntu:24.04/noble-security [amd64])
Inst libssl3t64 [3.0.13-0ubuntu3.4] (3.0.13-0ubuntu3.5 Ubuntu:24.04/noble-updates, Ubuntu:24.04/noble-security [amd64])
Inst vim-common [2:9.1.0016-1ubuntu7.8] (2:9.1.0016-1ubuntu7.9 Ubuntu:24.04/noble-updates [all])
Inst docker-ce [5:29.0.0-1~ubuntu.24.04~noble] (5:29.0.1-1~ubuntu.24.04~noble Docker CE:noble [amd64])
Inst libdrm-amdgpu1 (2.4.125-1ubuntu0.1~24.04.2 Ubuntu:24.04/noble-updates, Ubuntu:24.04/noble-security [amd64])
Conf openssl (3.0.13-0ubuntu3.5 Ubuntu:24.04/noble-updates, Ubuntu:24.04/noble-security [amd64])
LIST
STUB
  printf '#!/bin/sh\necho "value='"'"'1'"'"'"\n' > "$work/bin/apt-config"
  printf '#!/bin/sh\nexit 0\n' > "$work/bin/unattended-upgrade"
  cat > "$work/bin/systemctl" <<'STUB'
#!/bin/sh
case "$*" in
  "is-enabled apt-daily-upgrade.timer") echo enabled ;;
  *ExecMainExitTimestamp*) echo "Sun 2026-09-13 06:12:01 UTC" ;;
  *Result*) echo "${UPGRADE_RESULT:-success}" ;;
esac
STUB
  chmod +x "$work/bin/"*
  : > "$work/calls"
}
probe() {
  PATH="$work/bin:$PATH" CALLS="$work/calls" HOSPITAL_OBSERVABILITY_TEST_ONLY=1 HOSPITAL_HOST_OS_TEST_ROOT="$host" \
    HOSPITAL_OBSERVABILITY_NOW_EPOCH="$now" HOSPITAL_UPDATE_TEST_ONLY=1 "$@" \
    sh "$home/scripts/host-os-probe.sh" "$home" > "$work/out" 2>&1
}
signal="$home/.data/runtime/update/state/host-os.v1.json"

# 1. Counts, fixed words and times only; security and Docker updates counted apart.
fixture
: > "$host/run/reboot-required"
touch -d @$((now - 3600)) "$host/run/reboot-required"
printf 'LOSPOR-HOSPITAL-HOST-OS-OPERATION-V1\t2026-09-13T07:00:00Z\tsecurity-update\tpassed\n' > "$home/.data/host-os/operations.v1.tsv"
probe env || fail "the probe failed"
python3 - "$signal" <<'PY' || fail "the signal is wrong"
import json, sys
signal = json.load(open(sys.argv[1]))
expected = {
    "schemaVersion": 1, "signalType": "host-os", "observedAt": "2026-09-13T09:00:00Z",
    "release": "24.04", "standardSupportEnds": "2029-04-30",
    "securityUpdates": 2, "otherUpdates": 2, "dockerUpdates": True,
    "updatesCheckedAt": "2026-09-13T07:00:00Z",
    "automaticUpdates": "enabled", "lastAutomaticRunAt": "2026-09-13T06:12:01Z", "lastAutomaticResult": "success",
    "rebootRequired": True, "rebootRequiredSince": "2026-09-13T08:00:00Z", "bootedAt": "2026-09-01T10:00:00Z",
    "rebootPolicy": "window",
    "lastOperation": {"action": "security-update", "result": "passed", "at": "2026-09-13T07:00:00Z"},
}
assert signal == expected, signal
PY
! grep -Eq 'openssl|docker-ce|vim|libdrm|noble' "$signal" || fail "a package or pocket name crossed into the signal"
grep -q 'Debug::NoLocking=true' "$work/calls" || fail "apt was not asked to simulate without taking the package lock"
ok "the signal carries counts, fixed words and times, never a package name"

# 2. apt is not asked again within 15 minutes unless the packages changed.
probe env HOSPITAL_OBSERVABILITY_NOW_EPOCH=$((now + 60)) || fail "the second probe failed"
[ "$(grep -c '' "$work/calls")" = 1 ] || fail "apt was simulated again within 15 minutes"
touch -d @$((now + 30)) "$host/var/lib/dpkg/status"
touch -d @$now "$home/.data/runtime/update/state/.host-os-updates.v1"
probe env HOSPITAL_OBSERVABILITY_NOW_EPOCH=$((now + 90)) || fail "the third probe failed"
[ "$(grep -c '' "$work/calls")" = 2 ] || fail "apt was not simulated again after the installed packages changed"
ok "apt is simulated at most every 15 minutes unless the packages changed"

# 3. Missing facts are null or unknown, never invented.
fixture
rm -f "$host/etc/os-release" "$work/bin/apt-config" "$work/bin/unattended-upgrade"
printf '#!/bin/sh\nexit 1\n' > "$work/bin/apt-get"; chmod +x "$work/bin/apt-get"
probe env UPGRADE_RESULT=exit-code || fail "the probe failed with missing facts"
python3 - "$signal" <<'PY' || fail "missing facts were invented"
import json, sys
signal = json.load(open(sys.argv[1]))
assert signal["release"] is None and signal["standardSupportEnds"] is None, signal
assert signal["securityUpdates"] is None and signal["dockerUpdates"] is None, signal
assert signal["lastAutomaticResult"] == "failed", signal
assert signal["rebootRequired"] is False and signal["rebootRequiredSince"] is None, signal
assert "lastOperation" not in signal, signal
PY
ok "missing facts are reported as unknown rather than guessed"

# 4. The host observability probe publishes it, and a failure there never costs
#    Status the appliance observation.
grep -Fq 'sh "$root/scripts/host-os-probe.sh" "$appliance_home" >/dev/null 2>&1 || true' "$source_root/scripts/host-observability-probe.sh" \
  || fail "the host observability probe does not run the Ubuntu probe, or lets its failure through"
ok "the host observability probe runs it without depending on it"

echo "host OS probe tests passed ($tests)"
