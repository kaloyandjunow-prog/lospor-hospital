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
  "$site/backups" "$site/secrets/backup" "$site/secrets/registry" "$site/secrets/tls" \
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
cat > "$mock_bin/stat" <<'MOCK'
#!/bin/sh
if [ "${1:-}" = -c ]; then
  format="${2:-}"; target="${3:-}"
  case "$target" in
    */secrets/registry/*)
      case "$format" in
        %u) printf '0\n'; exit 0 ;;
        %h)
          case "$target" in
            */ghcr-token) printf '%s\n' "${MOCK_GHCR_LINKS:-1}" ;;
            *) printf '1\n' ;;
          esac
          exit 0
          ;;
        %a)
          case "$target" in
            */github-release-token) printf '%s\n' "${MOCK_GITHUB_MODE:-600}" ;;
            *) printf '600\n' ;;
          esac
          exit 0
          ;;
      esac
      ;;
  esac
fi
exec /usr/bin/stat "$@"
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
printf '%s\n' github_release_token_1234567890 > "$site/secrets/registry/github-release-token"
printf '%s\n' hospital-reader > "$site/secrets/registry/ghcr-user"
printf '%s\n' ghcr_read_token_123456789012345 > "$site/secrets/registry/ghcr-token"
chmod 0600 "$site/secrets/registry/github-release-token" \
  "$site/secrets/registry/ghcr-user" "$site/secrets/registry/ghcr-token"

run_probe() {
  PATH="$mock_bin:$PATH" HOSPITAL_OBSERVABILITY_TEST_ONLY=1 \
    HOSPITAL_OBSERVABILITY_NOW_EPOCH="$now" LOSPOR_APPLIANCE_HOME="$site" \
    MOCK_GITHUB_MODE="${MOCK_GITHUB_MODE:-600}" \
    MOCK_GHCR_LINKS="${MOCK_GHCR_LINKS:-1}" \
    sh "$fixture/scripts/host-observability-probe.sh" >/dev/null
}

assert_signal() {
  node - "$site/.data/runtime/update/state/host-observability.v1.json" "$@" <<'JS'
const fs = require("node:fs")
const [path, ...pairs] = process.argv.slice(2)
const raw = fs.readFileSync(path, "utf8")
const value = JSON.parse(raw)
const expectedKeys = [
  "schemaVersion", "signalType", "observedAt", "storage", "clock", "backup",
  "offHostBackup", "updateAgent", "certificate", "services", "updateSupply",
  "restoreLock", "activationLock", "githubReleaseCredential", "ghcrCredential",
].sort()
if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expectedKeys)) throw new Error("unexpected signal keys")
if (value.schemaVersion !== 1 || value.signalType !== "host-observability") throw new Error("wrong signal identity")
for (const pair of pairs) {
  const separator = pair.indexOf("=")
  const key = pair.slice(0, separator)
  const expected = pair.slice(separator + 1)
  if (value[key] !== expected) throw new Error(`${key}: got ${value[key]}, expected ${expected}`)
}
for (const forbidden of [
  "/var/", "fixture.invalid", "10.0.", "patient", "case", "userId", "secret",
  "github_release_token", "ghcr_read_token", "hospital-reader",
]) {
  if (raw.includes(forbidden)) throw new Error(`forbidden signal text: ${forbidden}`)
}
if (Buffer.byteLength(raw) >= 4096) throw new Error("oversized signal")
JS
}

run_probe
assert_signal storage=ok clock=synchronized backup=fresh offHostBackup=acknowledged \
  updateAgent=healthy certificate=valid services=healthy updateSupply=connected \
  restoreLock=clear activationLock=clear \
  githubReleaseCredential=configured ghcrCredential=configured
printf 'ok 1 - a healthy connected host publishes only the exact allowlisted v1 enums\n'

# Wrong mode and a symlink are both refused. The probe reports only "missing",
# never which validation failed or any part of the protected value.
chmod 0644 "$site/secrets/registry/github-release-token"
MOCK_GITHUB_MODE=644 MOCK_GHCR_LINKS=2 run_probe
assert_signal updateSupply=connected githubReleaseCredential=missing ghcrCredential=missing
printf 'ok 2 - connected readiness rejects non-0600 and linked credential files without exposing values\n'

# Offline supply never requires, reads or reports registry credentials.
sed -i 's/HOSPITAL_UPDATE_SUPPLY_MODE=connected/HOSPITAL_UPDATE_SUPPLY_MODE=offline/' "$site/.env"
run_probe
assert_signal updateSupply=offline githubReleaseCredential=not-required ghcrCredential=not-required
printf 'ok 3 - offline update supply remains credential-free\n'

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
grep -Fq 'host-observability.v1.json' "$installer"
agent_line="$(grep -n 'install-update-agent.sh' "$source_root/scripts/install.sh" | tail -n 1 | cut -d: -f1)"
monitor_line="$(grep -n 'install-host-observability.sh' "$source_root/scripts/install.sh" | tail -n 1 | cut -d: -f1)"
[ -n "$agent_line" ] && [ -n "$monitor_line" ] && [ "$monitor_line" -gt "$agent_line" ]
printf 'ok 14 - installation verifies the monitor after recording the update-agent mode\n'

echo 'host observability probe tests passed (14)'
