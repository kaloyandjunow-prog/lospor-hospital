#!/bin/sh
set -eu

source_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM
tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; [ ! -f "$work/out" ] || sed 's/^/    /' "$work/out" >&2; exit 1; }

home="$work/appliance"
secret="$(printf 'k%.0s' $(seq 64))"
healthy_signal='{"schemaVersion":2,"signalType":"host-observability","observedAt":"2026-09-13T08:00:00Z","storage":"ok","clock":"synchronized","backup":"fresh","offHostBackup":"acknowledged","keyEscrow":"acknowledged","updateAgent":"healthy","certificate":"valid","services":"healthy","restoreLock":"clear","activationLock":"clear","updateSupply":"connected"}'

fixture() {
  rm -rf "$home" "$work/bin" "$work/calls"
  mkdir -p "$home/scripts" "$home/.data/runtime/update/state" "$home/backups" "$work/bin"
  for script in losporctl.sh installed-release-state.sh operator-locale.sh; do
    cp "$source_root/scripts/$script" "$home/scripts/"
  done
  # Every script losporctl orchestrates is replaced by one that records how it
  # was called, so the test proves the mapping and nothing else.
  for script in doctor.sh backup-now.sh restore-backup.sh check-for-update.sh prepare-verified-release.sh \
      apply-prepared-release.sh load-offline.sh recover-release-activation.sh apply-site-config.sh \
      appliance-operator.sh rotate-operational-secrets.sh; do
    printf '#!/bin/sh\necho "%s${*:+ $*}" >> "$CALLS"\nexit "${STUB_EXIT:-0}"\n' "$script" > "$home/scripts/$script"
  done
  printf '#!/bin/sh\nprintf "%%s\\n" "$PROBE_SIGNAL" > "%s"\n' "$home/.data/runtime/update/state/host-observability.v2.json" \
    > "$home/scripts/host-observability-probe.sh"
  cat > "$work/bin/docker" <<'STUB'
#!/bin/sh
case "$*" in
  "version --format {{.Server.Version}}") echo 29.0.1 ;;
  "compose version --short") echo 2.39.1 ;;
  "compose ps"*) printf 'api|running|healthy\nweb|running on clinical.example.org|\npostgres|running|healthy\n' ;;
esac
STUB
  chmod +x "$work/bin/docker"
  printf 'LOSPOR_DEFAULT_LOCALE=en\nHOSPITAL_CLINICAL_DOMAIN=clinical.example.org\nHOSPITAL_SUPPORT_URL=mailto:it@example.org\n' > "$home/site.env"
  { cat "$home/site.env"; printf 'HOSPITAL_POSTGRES_PASSWORD=%s\n' "$secret"; } > "$home/.env"
  release="$home/.data/releases/1.4.0/lospor-hospital-1.4.0"
  mkdir -p "$release/.release"
  : > "$release/compose.yaml"; : > "$release/compose.release.yaml"
  printf 'release\t1.4.0\n' > "$release/.release/release.lock"
  (cd "$release/.release" && sha256sum release.lock > release.lock.sha256)
  printf 'LOSPOR-HOSPITAL-INSTALLED-RELEASE-V1\t1.4.0\t.data/releases/1.4.0/lospor-hospital-1.4.0\t%s\n' \
    "$(sha256sum "$release/.release/release.lock" | awk '{print $1}')" > "$home/.data/installed-release.tsv"
  : > "$work/calls"
}

ctl() {
  PATH="$work/bin:$PATH" CALLS="$work/calls" PROBE_SIGNAL="${PROBE_SIGNAL:-$healthy_signal}" \
    HOSPITAL_LOSPORCTL_TEST_ONLY="${TEST_ONLY:-1}" LOSPOR_DEFAULT_LOCALE="${LOCALE:-en}" \
    sh "$home/scripts/losporctl.sh" "$@" > "$work/out" 2>&1 < /dev/null
}
called() { grep -qxF "$1" "$work/calls" || fail "expected the call: $1 (got: $(tr '\n' ';' < "$work/calls"))"; }

# 1. Usage names every family in both languages; an unknown family is wrong usage.
fixture
ctl help || fail "help failed"
for family in status check backup support-bundle update config accounts secrets; do
  grep -q "^  $family" "$work/out" || fail "English usage does not name $family"
done
LOCALE=bg ctl help && grep -q '^Употреба: sudo losporctl' "$work/out" || fail "Bulgarian usage is missing"
set +e; ctl terminology; result=$?; set -e
[ "$result" = 2 ] || fail "an unknown family did not exit 2 (got $result)"
ok "usage names every family in both languages, and an unknown one is refused"

# 2. One root rule: everything but help and version needs sudo, and says so.
if [ "$(id -u)" -ne 0 ]; then
  set +e; TEST_ONLY=0 ctl status; result=$?; set -e
  [ "$result" = 4 ] || fail "a non-root status did not exit 4 (got $result)"
  grep -Fq 'sudo losporctl status' "$work/out" || fail "the root refusal did not give the command to run"
  TEST_ONLY=0 ctl version && grep -qx '1.4.0' "$work/out" || fail "version needed root or did not print the release"
  ok "commands need sudo and say so, except help and version"
fi

# 3. A healthy appliance reads as all good, in plain words.
fixture
ctl status || fail "status failed"
grep -qx 'LOSPOR Hospital 1.4.0' "$work/out" || fail "status did not name the release"
grep -qx 'Overall: all good' "$work/out" || fail "a healthy appliance was not all good"
! grep -q 'Next steps' "$work/out" || fail "a healthy appliance was given next steps"
ok "a healthy appliance reads as all good"

# 4. Each problem is graded and gets its exact next step.
fixture
PROBE_SIGNAL="$(printf '%s' "$healthy_signal" | sed 's/"backup":"fresh"/"backup":"overdue"/; s/"certificate":"valid"/"certificate":"expiring"/')" ctl status \
  || fail "status failed on an unhealthy appliance"
grep -qx 'Overall: action required' "$work/out" || fail "an overdue backup did not require action"
grep -qx 'X Backup on this server: overdue' "$work/out" || fail "the overdue backup was not marked"
grep -qx '! Certificate: expires soon' "$work/out" || fail "the expiring certificate was not marked for attention"
grep -Fq -- '- Run: sudo losporctl backup run' "$work/out" || fail "the overdue backup had no next step"
ok "problems are graded and each gets its next step"

# 5. --json is one object with exactly the documented fields.
fixture
printf 'LOSPOR-HOSPITAL-UPDATE-STATUS-V1\t2026-09-13T07:00:00Z\t1.4.0\t1.4.1\tupdate-available\t-\t-\n' > "$home/.data/update-status.tsv"
ctl status --json || fail "status --json failed"
python3 - "$work/out" <<'PY' || fail "status --json is not the documented object"
import json, sys
value = json.load(open(sys.argv[1]))
assert set(value) == {"schemaVersion", "release", "overall", "observedAt", "checks", "updates"}, value
assert value["overall"] == "attention", value
assert set(value["checks"]) == {"services", "storage", "clock", "backup", "offHostBackup", "keyEscrow", "certificate", "updateAgent", "updateSupply", "restoreLock", "activationLock"}
assert value["updates"] == {"state": "update-available", "latestVersion": "1.4.1", "checkedAt": "2026-09-13T07:00:00Z"}, value
PY
ok "status --json is exactly the documented object, and an available update needs attention"

# 6. Every subcommand reaches the script it stands for.
while IFS='|' read -r command expected; do
  fixture
  mkdir -p "$home/backups/lospor-20260913T072635Z-W3UVqwGn.backup"
  printf 'LOSPOR-HOSPITAL-UPDATE-STATUS-V1\t2026-09-13T07:00:00Z\t1.4.0\t1.4.1\tupdate-available\t1.4.1\t%s\n' "$(printf 'a%.0s' $(seq 64))" > "$home/.data/update-status.tsv"
  # shellcheck disable=SC2086
  ctl $command || fail "losporctl $command failed"
  called "$expected"
done <<'TABLE'
check|doctor.sh
check --go-live|doctor.sh --go-live
backup run|backup-now.sh
backup drill|restore-backup.sh --drill backups/lospor-20260913T072635Z-W3UVqwGn.backup
update check|check-for-update.sh
update download|prepare-verified-release.sh 1.4.1 -
update download 1.4.2|prepare-verified-release.sh 1.4.2 -
update apply --yes|apply-prepared-release.sh 1.4.1 -
update recover|recover-release-activation.sh inspect
update recover resume-rollback --confirm|recover-release-activation.sh resume-rollback --confirm
config plan|apply-site-config.sh --plan
config apply --yes|apply-site-config.sh --yes
accounts operator state|appliance-operator.sh state
accounts operator repair|appliance-operator.sh repair-status
secrets state|rotate-operational-secrets.sh state
secrets rotate|rotate-operational-secrets.sh prepare ordinary
secrets commit --yes|rotate-operational-secrets.sh commit
TABLE
ok "every subcommand reaches the script it stands for"

# 7. A change that restarts services is not made without a yes.
for command in "config apply" "update apply" "secrets commit" "secrets rollback"; do
  fixture
  printf 'LOSPOR-HOSPITAL-UPDATE-STATUS-V1\t-\t1.4.0\t1.4.1\tupdate-available\t1.4.1\t-\n' > "$home/.data/update-status.tsv"
  set +e; ctl $command; result=$?; set -e
  [ "$result" = 2 ] || fail "losporctl $command without --yes did not exit 2 (got $result)"
  grep -Fq 'Add --yes to confirm.' "$work/out" || fail "losporctl $command did not say how to confirm"
  ! grep -Eq 'apply-site-config.sh --yes|apply-prepared-release|rotate-operational-secrets.sh (commit|rollback)' "$work/calls" \
    || fail "losporctl $command changed something without a yes"
done
ok "restarting changes need a yes, and say how to give one"

# 8. Offline media is found by its one release.lock, and nothing is guessed.
fixture
mkdir -p "$work/usb"
: > "$work/usb/lospor-hospital-1.4.1-release.lock"
ctl update offline "$work/usb" --yes || fail "offline update failed"
called "load-offline.sh $work/usb/lospor-hospital-1.4.1-release.lock $work/usb/lospor-hospital-1.4.1-release.lock.sha256 $work/usb"
: > "$work/usb/lospor-hospital-1.4.2-release.lock"
set +e; ctl update offline "$work/usb" --yes; result=$?; set -e
[ "$result" = 2 ] || fail "media with two releases was not refused"
ok "offline media must hold exactly one release"

# 9. Nothing to download or apply says what to do instead.
fixture
set +e; ctl update apply --yes; result=$?; set -e
[ "$result" = 1 ] && grep -Fq 'sudo losporctl update download' "$work/out" || fail "apply with nothing downloaded did not point to download"
ok "an update with nothing downloaded points to the step before"

# 10. The support bundle holds only allowlisted, non-identifying tokens.
fixture
ctl support-bundle create || fail "support-bundle create failed"
bundle="$(ls "$home"/.data/support/lospor-support-*.json)"
[ "$(stat -c %a "$bundle")" = 600 ] || fail "the support bundle is not private"
for leak in clinical.example.org it@example.org "$secret" "$home"; do
  ! grep -Fq "$leak" "$bundle" || fail "the support bundle contains $leak"
done
python3 - "$bundle" <<'PY' || fail "the support bundle is not the allowlisted object"
import json, re, sys
bundle = json.load(open(sys.argv[1]))
assert set(bundle) == {"schemaVersion", "bundleType", "createdAt", "release", "releaseLockSha256", "host", "status", "services", "checks", "configuration"}, sorted(bundle)
assert set(bundle["host"]) == {"os", "osVersion", "kernel", "architecture", "docker", "compose"}
assert set(bundle["services"]) == {"api", "web", "pwa", "browser", "status", "caddy", "postgres", "backup", "delivery-worker"}
assert bundle["services"]["web"] == "redacted", bundle["services"]
assert bundle["services"]["api"] == "running:healthy"
def strings(value):
    if isinstance(value, dict):
        for item in value.values(): yield from strings(item)
    elif isinstance(value, str):
        yield value
for text in strings(bundle):
    assert re.fullmatch(r"[A-Za-z0-9._+:-]{1,64}", text), text
PY
ok "the support bundle holds only allowlisted, non-identifying tokens"

# 11. The installed launcher only ever runs the active verified release.
[ "$(grep -v '^#' "$source_root/infra/losporctl/losporctl")" = 'exec sh /opt/lospor-hospital/current/scripts/losporctl.sh "$@"' ] \
  || fail "the launcher runs something other than the current release's losporctl.sh"
grep -qx '    install -m 0755 ./infra/losporctl/losporctl /usr/local/bin/losporctl' "$source_root/scripts/install.sh" \
  || fail "installation does not install the launcher"
ok "the installed launcher runs only the active verified release"

echo "losporctl tests passed ($tests)"
