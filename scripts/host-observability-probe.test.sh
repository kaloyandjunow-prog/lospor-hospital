#!/bin/sh
set -eu

source_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
work="$(mktemp -d)"
cleanup_fixture() {
  if [ "${KEEP_HOST_OBSERVABILITY_FIXTURE:-0}" = 1 ]; then
    printf 'fixture retained: %s\n' "$work" >&2
  else
    rm -rf -- "$work"
  fi
}
trap cleanup_fixture EXIT HUP INT TERM
fixture="$work/release"
site="$work/site"
mock_bin="$work/bin"
mkdir -p "$fixture/scripts" "$fixture/infra/postgres" "$site/.data/runtime/update/state" \
  "$site/backups" "$site/secrets/backup" "$site/secrets/tls" \
  "$site/secrets/status" "$mock_bin"
cp "$source_root/scripts/host-observability-probe.sh" "$fixture/scripts/"
cp "$source_root/scripts/installed-release-state.sh" "$fixture/scripts/"
cp "$source_root/scripts/update-pipeline-lib.sh" "$fixture/scripts/"
cp "$source_root/infra/postgres/offhost-deferred.sh" "$fixture/infra/postgres/"

cat > "$mock_bin/docker" <<'MOCK'
#!/bin/sh
if [ "${1:-}" = info ]; then
  printf '%s\n' "${MOCK_DOCKER_ROOT:-/var/lib/docker-fixture}"
  exit 0
fi
if [ "${1:-}" = compose ] && [ "${2:-}" = ps ]; then
  for service in delivery-worker postgres status api backup pwa web browser caddy; do
    if [ "${MOCK_SERVICE_DEGRADED:-0}" = 1 ] && [ "$service" = caddy ]; then
      printf '%s|%s|%s\n' "$service" exited unhealthy
    else
      printf '%s|%s|%s\n' "$service" running healthy
    fi
  done
  exit 0
fi
exit 1
MOCK
cat > "$mock_bin/df" <<'MOCK'
#!/bin/sh
printf '%s\n' 'Filesystem 1024-blocks Used Available Capacity Mounted on'
printf '/dev/mock 400000000 100000000 %s %s%% /mock\n' \
  "${MOCK_DF_AVAILABLE:-300000000}" "${MOCK_DF_USED:-25}"
MOCK
cat > "$mock_bin/timedatectl" <<'MOCK'
#!/bin/sh
printf '%s\n' "${MOCK_CLOCK:-yes}"
MOCK
cat > "$mock_bin/systemctl" <<'MOCK'
#!/bin/sh
[ "${MOCK_AGENT_INACTIVE:-0}" != 1 ]
MOCK
cat > "$mock_bin/openssl" <<'MOCK'
#!/bin/sh
certificate_state() {
  certificate_file="$1"
  if grep -Fq 'research.fixture.invalid' "$certificate_file" 2>/dev/null; then
    printf '%s\n' "${MOCK_RESEARCH_CERTIFICATE:-${MOCK_CERTIFICATE:-valid}}"
  elif grep -Fq 'clinical.fixture.invalid' "$certificate_file" 2>/dev/null; then
    printf '%s\n' "${MOCK_CLINICAL_CERTIFICATE:-${MOCK_CERTIFICATE:-valid}}"
  elif grep -Fq 'fallback-certificate-fixture' "$certificate_file" 2>/dev/null; then
    printf '%s\n' "${MOCK_FALLBACK_CERTIFICATE:-${MOCK_CERTIFICATE:-valid}}"
  else
    printf '%s\n' "${MOCK_CERTIFICATE:-valid}"
  fi
}
if [ "${1:-}" = s_client ]; then
  server_name=""
  while [ "$#" -gt 0 ]; do
    if [ "$1" = -servername ]; then
      shift
      server_name="${1:-}"
      break
    fi
    shift
  done
  [ -n "$server_name" ] || exit 1
  printf 'certificate for %s\n' "$server_name"
  exit 0
fi
if [ "${1:-}" = x509 ] && printf ' %s ' "$*" | grep -Fq ' -outform PEM '; then
  certificate_input="$(cat)"
  [ -n "$certificate_input" ] || exit 1
  printf '%s\n' "$certificate_input"
  exit 0
fi
certificate_file=""
previous=""
for argument in "$@"; do
  if [ "$previous" = -in ]; then certificate_file="$argument"; break; fi
  previous="$argument"
done
[ -n "$certificate_file" ] || exit 1
state="$(certificate_state "$certificate_file")"
case " $* " in
  *' -checkend 0 '*) [ "$state" != expired ] ;;
  *' -checkend 2592000 '*) [ "$state" = valid ] ;;
  *) exit 1 ;;
esac
MOCK
chmod +x "$mock_bin"/*

now="$(date -u -d '2026-08-22T12:00:00Z' +%s)"
fresh=$((now - 3600))
fresh_iso="$(date -u -d "@$fresh" +%Y-%m-%dT%H:%M:%SZ)"
agent_epoch=$((now - 60))
agent_iso="$(date -u -d "@$agent_epoch" +%Y-%m-%dT%H:%M:%SZ)"
object=lospor-20260822T110000Z-abcdef123456.backup
sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

cat > "$site/.env" <<'EOF'
HOSPITAL_UPDATE_SUPPLY_MODE=connected
HOSPITAL_TLS_MODE=operator
HOSPITAL_CLINICAL_DOMAIN=clinical.fixture.invalid
HOSPITAL_RESEARCH_DOMAIN=research.fixture.invalid
HOSPITAL_HTTPS_PORT=443
EOF
printf '%s\n' "$object fixture" > "$site/secrets/backup/offhost-copy"
chmod 0700 "$site/secrets/backup/offhost-copy"
printf '%s\n' certificate-fixture > "$site/secrets/tls/fullchain.pem"
printf '%s\n' fallback-certificate-fixture > "$site/secrets/status/fallback-cert.pem"
cat > "$site/backups/.last-verified.v1" <<EOF
schemaVersion=1
completedAtEpoch=$fresh
objectName=$object
manifestSha256=$sha
EOF
cat > "$site/backups/.last-offhost-verified.v1" <<EOF
schemaVersion=1
acknowledgedAtEpoch=$fresh
objectName=$object
manifestSha256=$sha
EOF
cat > "$site/.data/runtime/update/state/update-agent-installation.v1.json" <<EOF
{"schemaVersion":1,"signalType":"update-agent-installation","observedAt":"$fresh_iso","mode":"agent"}
EOF
cat > "$site/.data/runtime/update/state/update-agent.v2.json" <<EOF
{"schemaVersion":2,"signalType":"update-agent","observedAt":"$agent_iso","phase":"idle","resultCode":"UPDATE_AGENT_READY"}
EOF

run_probe() {
  PATH="$mock_bin:$PATH" HOSPITAL_OBSERVABILITY_TEST_ONLY=1 \
    HOSPITAL_OBSERVABILITY_NOW_EPOCH="$now" LOSPOR_APPLIANCE_HOME="$site" \
    sh "$fixture/scripts/host-observability-probe.sh" >/dev/null
}

assert_signal() {
  node - "$site/.data/runtime/update/state/host-observability.v2.json" "$@" <<'JS'
const fs = require("node:fs")
const [path, ...pairs] = process.argv.slice(2)
const raw = fs.readFileSync(path, "utf8")
const value = JSON.parse(raw)
const expectedKeys = [
  "schemaVersion", "signalType", "observedAt", "storage", "clock", "backup",
  "offHostBackup", "keyEscrow", "updateAgent", "certificate", "services", "updateSupply",
  "restoreLock", "activationLock",
].sort()
if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expectedKeys)) throw new Error("unexpected signal keys")
if (value.schemaVersion !== 2 || value.signalType !== "host-observability") throw new Error("wrong signal identity")
for (const pair of pairs) {
  const separator = pair.indexOf("=")
  const key = pair.slice(0, separator)
  const expected = pair.slice(separator + 1)
  if (value[key] !== expected) throw new Error(`${key}: got ${value[key]}, expected ${expected}`)
}
for (const forbidden of [
  "/var/", "fixture.invalid", "10.0.", "patient", "case", "userId", "secret",
]) {
  if (raw.includes(forbidden)) throw new Error(`forbidden signal text: ${forbidden}`)
}
if (Buffer.byteLength(raw) >= 4096) throw new Error("oversized signal")
JS
}

run_probe
assert_signal storage=ok clock=synchronized backup=fresh offHostBackup=acknowledged \
  updateAgent=healthy certificate=valid services=healthy updateSupply=connected \
  restoreLock=clear activationLock=clear
printf 'ok 1 - a healthy connected host publishes only the exact allowlisted v2 enums\n'

# The monitoring check must accept exactly what the probe writes. The probe
# once gained keyEscrow without the check learning it, so every real signal was
# rejected as invalid while both suites, each with its own fixture, stayed green.
# The probe ran on a fixed test clock; only the timestamp is refreshed so the
# check's freshness window does not mask a schema mismatch.
sed "s/\"observedAt\":\"[^\"]*\"/\"observedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"/" \
  "$site/.data/runtime/update/state/host-observability.v2.json" > "$work/checked-signal.json"
HOSPITAL_OBSERVABILITY_CHECK_TEST_ONLY=1 \
  LOSPOR_HOST_OBSERVABILITY_SIGNAL="$work/checked-signal.json" \
  python3 "$source_root/scripts/check-host-observability.py" > "$work/check-output" || true
if grep -Fq HOST_OBSERVABILITY_INVALID "$work/check-output"; then
  echo "the monitoring check rejected the probe's own signal" >&2
  exit 1
fi
grep -Eq '^LOSPOR HOST (OK|WARNING|CRITICAL) - ' "$work/check-output"
printf 'ok 2 - the monitoring check accepts the signal the probe actually writes\n'

# Offline supply is a route of its own, not a degraded connected one.
sed -i 's/HOSPITAL_UPDATE_SUPPLY_MODE=connected/HOSPITAL_UPDATE_SUPPLY_MODE=offline/' "$site/.env"
run_probe
assert_signal updateSupply=offline
printf 'ok 3 - offline update supply is projected as its own route\n'

# Exercise every degraded host input without allowing any raw command output
# into the signal. A newer local backup makes the old off-host acknowledgement
# explicitly pending.
new_object=lospor-20260822T115000Z-fedcba654321.backup
new_sha=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
cat > "$site/backups/.last-verified.v1" <<EOF
schemaVersion=1
completedAtEpoch=$fresh
objectName=$new_object
manifestSha256=$new_sha
EOF
PATH="$mock_bin:$PATH" HOSPITAL_OBSERVABILITY_TEST_ONLY=1 \
  HOSPITAL_OBSERVABILITY_NOW_EPOCH="$now" LOSPOR_APPLIANCE_HOME="$site" \
  MOCK_DF_AVAILABLE=9000000 MOCK_DF_USED=96 MOCK_CLOCK=no MOCK_AGENT_INACTIVE=1 \
  MOCK_CERTIFICATE=expired MOCK_SERVICE_DEGRADED=1 \
  sh "$fixture/scripts/host-observability-probe.sh" >/dev/null
assert_signal storage=critical clock=unsynchronized offHostBackup=pending updateAgent=stale \
  certificate=expired services=degraded
printf 'ok 4 - critical host conditions project fixed failure enums only\n'

# An unexpected marker key invalidates the whole marker. Its text never reaches
# Status, and the signal remains syntactically valid.
printf 'unexpected=patient-123\n' >> "$site/backups/.last-verified.v1"
run_probe
assert_signal backup=invalid
printf 'ok 5 - malformed evidence fails closed without forwarding arbitrary marker text\n'

# Public certificate monitoring must inspect both virtual hosts. The research
# identity is deliberately near expiry while the clinical identity and the
# independent Status fallback certificate remain valid; the aggregate signal
# must still report the research warning.
sed -i 's/HOSPITAL_TLS_MODE=operator/HOSPITAL_TLS_MODE=acme/' "$site/.env"
PATH="$mock_bin:$PATH" HOSPITAL_OBSERVABILITY_TEST_ONLY=1 \
  HOSPITAL_OBSERVABILITY_NOW_EPOCH="$now" LOSPOR_APPLIANCE_HOME="$site" \
  MOCK_CLINICAL_CERTIFICATE=valid MOCK_RESEARCH_CERTIFICATE=expiring \
  MOCK_FALLBACK_CERTIFICATE=valid \
  sh "$fixture/scripts/host-observability-probe.sh" >/dev/null
assert_signal certificate=expiring
printf 'ok 6 - certificate health aggregates both public SNI identities and the Status fallback\n'

# Caddy's local test CA uses short-lived, automatically renewed leaves. A leaf
# inside the public 30-day warning window is normal in local mode, but an
# already expired leaf is still an outage.
sed -i 's/HOSPITAL_TLS_MODE=acme/HOSPITAL_TLS_MODE=local/' "$site/.env"
PATH="$mock_bin:$PATH" HOSPITAL_OBSERVABILITY_TEST_ONLY=1 \
  HOSPITAL_OBSERVABILITY_NOW_EPOCH="$now" LOSPOR_APPLIANCE_HOME="$site" \
  MOCK_CLINICAL_CERTIFICATE=expiring MOCK_RESEARCH_CERTIFICATE=expiring \
  MOCK_FALLBACK_CERTIFICATE=valid \
  sh "$fixture/scripts/host-observability-probe.sh" >/dev/null
assert_signal certificate=valid
printf 'ok 7 - local Caddy leaf lifetime is not mistaken for an expiry incident\n'

# A new fallback file is not a green result until the listener reload has been
# fingerprint-verified. The marker content itself never crosses the boundary.
printf '1\n' > "$site/.data/runtime/status-fallback-certificate.reload-required"
run_probe
assert_signal certificate=unknown
rm -f "$site/.data/runtime/status-fallback-certificate.reload-required"
printf 'ok 7 - pending or unverified Status certificate reload fails closed as unknown\n'

# The release lock crosses the boundary only as a fixed presence enum. Unsafe
# lock objects never become a path or diagnostic string in the projection.
mkdir "$site/.data/release-activation.lock"
chmod 0700 "$site/.data/release-activation.lock"
run_probe
assert_signal activationLock=present
rmdir "$site/.data/release-activation.lock"
printf '%s\n' unsafe > "$site/.data/release-activation.lock"
run_probe
assert_signal activationLock=invalid
rm -f "$site/.data/release-activation.lock"
printf 'ok 8 - activation lock presence and unsafe objects are projected as fixed enums\n'

# A journal that did not reach a safe terminal state remains visible, while a
# completed temporary validation is clear because it never crossed the
# destructive boundary.
restore_journal_dir="$site/backups/.restore-journal"
mkdir "$restore_journal_dir"
chmod 0700 "$restore_journal_dir"
restore_journal="$restore_journal_dir/restore-20260822T120000Z.ABCDEF12.journal"
printf '%s\n' \
  '2026-08-22T12:00:00Z phase=VERIFY result=PASSED object=lospor-20260822T110000Z-abcdef123456.backup mode=temporary' \
  > "$restore_journal"
chmod 0600 "$restore_journal"
run_probe
assert_signal restoreLock=present
printf '%s\n' \
  '2026-08-22T12:00:01Z phase=COMPLETE result=TEMPORARY_READY object=lospor-20260822T110000Z-abcdef123456.backup mode=temporary' \
  >> "$restore_journal"
run_probe
assert_signal restoreLock=clear
printf 'ok 9 - unfinished and safely completed temporary restore journals remain distinguishable\n'

# Arbitrary journal content invalidates the lock field but is never forwarded.
printf '%s\n' 'patient=patient-123 path=/var/lib/private' > "$restore_journal"
run_probe
assert_signal restoreLock=invalid
rm -f "$restore_journal"
printf 'ok 10 - malformed restore evidence fails closed without exposing its content\n'

# A completed in-place restore is clear only when its exact durable boundary
# marker is present and structurally safe.
restore_journal_name=restore-20260822T120100Z.ZYXWVU98.journal
restore_journal="$restore_journal_dir/$restore_journal_name"
printf '%s\n' \
  '2026-08-22T12:01:00Z phase=VERIFY result=PASSED object=lospor-20260822T110000Z-abcdef123456.backup mode=in-place' \
  '2026-08-22T12:01:01Z phase=COMPLETE result=PASSED object=lospor-20260822T110000Z-abcdef123456.backup mode=in-place' \
  > "$restore_journal"
chmod 0600 "$restore_journal"
restore_token="$(printf '%s' "$restore_journal_name" | sha256sum | awk '{ print substr($1, 1, 24) }')"
restore_boundary="$site/backups/.restore-boundary-$restore_token.started"
mkdir "$restore_boundary"
chmod 0700 "$restore_boundary"
cat > "$restore_boundary/state" <<'EOF'
schemaVersion=1
startedAt=2026-08-22T12:01:00Z
targetDatabase=lospor_restore_20260822120100_123
previousDatabase=lospor_previous_20260822120100_123
EOF
chmod 0600 "$restore_boundary/state"
run_probe
assert_signal restoreLock=clear
rm -f "$restore_boundary/state"
run_probe
assert_signal restoreLock=invalid
rm -f "$restore_journal"
rmdir "$restore_boundary" "$restore_journal_dir"
printf 'ok 11 - in-place completion requires its exact safe durable boundary evidence\n'

# An unexplained durable boundary marker is never inferred healthy.
mkdir "$site/backups/.restore-boundary-aaaaaaaaaaaaaaaaaaaaaaaa.started"
chmod 0700 "$site/backups/.restore-boundary-aaaaaaaaaaaaaaaaaaaaaaaa.started"
printf '%s\n' \
  'schemaVersion=1' \
  'startedAt=2026-08-22T12:01:00Z' \
  'targetDatabase=lospor_restore_20260822120100_123' \
  'previousDatabase=lospor_previous_20260822120100_123' \
  > "$site/backups/.restore-boundary-aaaaaaaaaaaaaaaaaaaaaaaa.started/state"
chmod 0600 "$site/backups/.restore-boundary-aaaaaaaaaaaaaaaaaaaaaaaa.started/state"
run_probe
assert_signal restoreLock=invalid
rm -f "$site/backups/.restore-boundary-aaaaaaaaaaaaaaaaaaaaaaaa.started/state"
rmdir "$site/backups/.restore-boundary-aaaaaaaaaaaaaaaaaaaaaaaa.started"
printf 'ok 12 - orphaned destructive-boundary evidence is invalid, never clear\n'

# A restore drill completes without crossing the destructive boundary and
# removes its copy. Its journal once read as invalid, so every passed drill
# turned the appliance into recovery-required.
mkdir "$restore_journal_dir"
chmod 0700 "$restore_journal_dir"
restore_journal="$restore_journal_dir/restore-20260822T120200Z.DRILL123.journal"
printf '%s\n' \
  '2026-08-22T12:02:00Z phase=VERIFY result=PASSED object=lospor-20260822T110000Z-abcdef123456.backup mode=drill' \
  '2026-08-22T12:02:10Z phase=RECONCILE result=PASSED object=lospor-20260822T110000Z-abcdef123456.backup mode=drill' \
  > "$restore_journal"
chmod 0600 "$restore_journal"
run_probe
assert_signal restoreLock=present
printf '%s\n' '2026-08-22T12:02:11Z phase=COMPLETE result=DRILL_PASSED object=lospor-20260822T110000Z-abcdef123456.backup mode=drill' >> "$restore_journal"
run_probe
assert_signal restoreLock=clear
rm -f "$restore_journal"
rmdir "$restore_journal_dir"
printf 'ok 12b - a running drill is present and a passed drill is clear\n'

# The host-side off-host adapter keeps the container hook deferred and
# acknowledges copies itself; its configuration counts as configured.
cp "$fixture/infra/postgres/offhost-deferred.sh" "$site/secrets/backup/offhost-copy"
run_probe
assert_signal offHostBackup=not-configured
printf 'LOSPOR-HOSPITAL-OFFHOST-V1\ntype=mount\npath=/mnt/lospor-backups\n' > "$site/secrets/backup/offhost.v1.conf"
chmod 0600 "$site/secrets/backup/offhost.v1.conf"
run_probe
assert_signal offHostBackup=acknowledged
printf 'ok 12c - a configured host-side off-host adapter is reported, not hidden behind the deferred hook\n'

# An escrow acknowledgement older than the off-host encryption key does not
# describe it: without that key no off-host copy can be read.
printf 'patientHmacKeyFingerprint=sha256:fixture\n' > "$site/.secrets-escrowed.v1"
touch -d '2026-08-01T00:00:00Z' "$site/.secrets-escrowed.v1"
openssl rand -hex 32 > "$site/secrets/backup/offhost-encryption.key"
run_probe
assert_signal keyEscrow=stale
touch "$site/.secrets-escrowed.v1"
run_probe
assert_signal keyEscrow=acknowledged
rm -f "$site/.secrets-escrowed.v1" "$site/secrets/backup/offhost-encryption.key" "$site/secrets/backup/offhost.v1.conf"
printf 'ok 12d - an escrow acknowledgement older than the off-host key is stale\n'

service="$source_root/infra/systemd/lospor-host-observability.service"
timer="$source_root/infra/systemd/lospor-host-observability.timer"
grep -Fxq 'Type=oneshot' "$service"
grep -Fxq 'ProtectSystem=strict' "$service"
grep -Fxq 'ReadWritePaths=/opt/lospor-hospital/.data/runtime/update/state' "$service"
grep -Fxq 'NoNewPrivileges=yes' "$service"
grep -Fxq 'OnUnitActiveSec=60s' "$timer"
grep -Fxq 'Persistent=true' "$timer"
! grep -Eq 'DockerRootDir|\.sock.*ReadWritePaths|Environment=.*(TOKEN|PASSWORD|SECRET)' "$service" "$timer"
printf 'ok 13 - the host probe timer is narrow, persistent, and writes only the projection directory\n'

installer="$source_root/scripts/install-host-observability.sh"
grep -Fq 'systemd-analyze verify' "$installer"
grep -Fq 'systemctl enable --now lospor-host-observability.timer' "$installer"
grep -Fq 'systemctl start lospor-host-observability.service' "$installer"
grep -Fq 'host-observability.v2.json' "$installer"
agent_line="$(grep -n 'install-update-agent.sh' "$source_root/scripts/install.sh" | tail -n 1 | cut -d: -f1)"
monitor_line="$(grep -n 'install-host-observability.sh' "$source_root/scripts/install.sh" | tail -n 1 | cut -d: -f1)"
[ -n "$agent_line" ] && [ -n "$monitor_line" ] && [ "$monitor_line" -gt "$agent_line" ]
printf 'ok 14 - installation verifies the monitor after recording the update-agent mode\n'

# Both installers hard-require $home/current before they will run, but a real
# first install (never the test/dev branch above) does not get that symlink
# from activation until after install.sh returns success. Without install.sh
# creating it first itself, a first install with the default update mode
# could never complete: the exact bug this test guards against regressing.
installer_source="$source_root/scripts/install.sh"
symlink_line="$(grep -n 'ln -s "\$root" "\$real_appliance_home/current"' "$installer_source" | tail -n 1 | cut -d: -f1)"
real_agent_line="$(grep -n 'sh \./scripts/install-update-agent\.sh' "$installer_source" | tail -n 1 | cut -d: -f1)"
real_monitor_line="$(grep -n 'sh \./scripts/install-host-observability\.sh' "$installer_source" | tail -n 1 | cut -d: -f1)"
[ -n "$symlink_line" ] && [ -n "$real_agent_line" ] && [ -n "$real_monitor_line" ] \
  && [ "$real_agent_line" -gt "$symlink_line" ] && [ "$real_monitor_line" -gt "$symlink_line" ]
grep -Fq 'Refusing to replace an unexpected current path before it is meant to exist' "$installer_source"
printf 'ok 15 - a real first install creates current before either host integration runs\n'

# The terminology package folders Status offers: direct folders holding a
# manifest.json, by safe name only, never a link and never anything inside.
mkdir -p "$site/reference-data/omop-2026.08" "$site/reference-data/no-manifest" "$site/reference-data/elsewhere" "$site/reference-data/bad name"
: > "$site/reference-data/omop-2026.08/manifest.json"
: > "$site/reference-data/elsewhere/manifest.json"
: > "$site/reference-data/bad name/manifest.json"
ln -s "$site/reference-data/elsewhere" "$site/reference-data/linked-package"
run_probe
packages_signal="$site/.data/runtime/update/state/terminology-packages.v1.json"
node - "$packages_signal" <<'JS'
const fs = require("node:fs")
const value = JSON.parse(fs.readFileSync(process.argv[2], "utf8"))
if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(["observedAt", "packages", "schemaVersion", "signalType"])) throw new Error("unexpected keys")
if (value.schemaVersion !== 1 || value.signalType !== "terminology-packages") throw new Error("wrong identity")
if (JSON.stringify(value.packages) !== JSON.stringify(["elsewhere", "omop-2026.08"])) throw new Error("packages: " + JSON.stringify(value.packages))
JS
rm -rf "$site/reference-data"
run_probe
grep -Fq '"packages":[]' "$packages_signal"
printf 'ok 16 - package folders with a manifest are listed by safe name, without links or folders lacking one\n'

echo 'host observability probe tests passed (16)'
