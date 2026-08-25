#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/lospor-backup-hardening.XXXXXX")"
cleanup() { rm -rf -- "$test_root"; }
trap cleanup EXIT HUP INT TERM

tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }

mock_dir="$test_root/mocks"
mkdir -p "$mock_dir"
cat > "$mock_dir/psql" <<'MOCK'
#!/bin/sh
case "$*" in
  *pg_database_size*) printf '%s\n' "${MOCK_DATABASE_BYTES:-1000}" ;;
  *server_version_num*) printf '%s\n' "${MOCK_POSTGRES_VERSION_NUM:-170011}" ;;
  *migration_name*) printf '%s\n' '20260801000000_alpha:aaa' '20260802000000_beta:bbb' ;;
  *) printf '%s\n' 1 ;;
esac
MOCK
cat > "$mock_dir/pg_dump" <<'MOCK'
#!/bin/sh
output=""
schema=0
for argument in "$@"; do
  case "$argument" in
    --file=*) output="${argument#--file=}" ;;
    --schema-only) schema=1 ;;
  esac
done
[ -n "$output" ] || exit 2
if [ "$schema" -eq 1 ]; then
  printf '%s\n' 'CREATE TABLE fixture(id integer);' > "$output"
  printf '%s\n' schema >> "${MOCK_CALLS:?}"
  exit 0
fi
printf '%s\n' custom >> "${MOCK_CALLS:?}"
[ "${MOCK_FAIL_DUMP:-0}" -ne 1 ] || exit 1
if [ -n "${MOCK_SLOW_MARKER:-}" ]; then
  : > "$MOCK_SLOW_MARKER"
  while [ ! -e "${MOCK_RELEASE_MARKER:?}" ]; do sleep 0.05; done
fi
printf '%s\n' 'fixture custom archive' > "$output"
MOCK
cat > "$mock_dir/pg_restore" <<'MOCK'
#!/bin/sh
exit "${MOCK_PG_RESTORE_EXIT:-0}"
MOCK
chmod +x "$mock_dir/psql" "$mock_dir/pg_dump" "$mock_dir/pg_restore"

auth_key=0123456789abcdef0123456789abcdef0123456789abcdef
fp_a=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
fp_b=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
fp_c=sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
fp_d=sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
fp_e=sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
fp_f=sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
fp_g=sha256:1212121212121212121212121212121212121212121212121212121212121212

run_backup() {
  destination="$1"
  signals="$2"
  shift 2
  mkdir -p "$destination" "$signals"
  io_lock="$destination.io-mutation.lock"
  : >> "$io_lock"
  env PATH="$mock_dir:$PATH" \
    HOSPITAL_BACKUP_DIR="$destination" \
    HOSPITAL_SIGNALS_DIR="$signals" \
    HOSPITAL_IO_MUTATION_LOCK_FILE="$io_lock" \
    HOSPITAL_BACKUP_OBJECT_LIB="$root/infra/postgres/backup-object-lib.sh" \
    HOSPITAL_BACKUP_DATABASE_BYTES_OVERRIDE=1000 \
    HOSPITAL_BACKUP_AVAILABLE_BYTES_OVERRIDE=1000000 \
    HOSPITAL_BACKUP_RESERVE_BYTES=1000 \
    HOSPITAL_BACKUP_SPACE_MULTIPLIER_PERCENT=150 \
    HOSPITAL_BACKUP_NOW_EPOCH=1787400000 \
    HOSPITAL_BACKUP_SITE_ID=site-fixture \
    HOSPITAL_BACKUP_APPLIANCE_ID=appliance-fixture \
    HOSPITAL_APPLIANCE_RELEASE=1.2.0 \
    HOSPITAL_EXCHANGE_CONTRACT_VERSION=2.2.0 \
    HOSPITAL_DATA_DICTIONARY_VERSION=2.2.0 \
    HOSPITAL_BACKUP_TOOL_VERSION=1.2.0 \
    HOSPITAL_PATIENT_HMAC_KEY_FINGERPRINT="$fp_a" \
    HOSPITAL_PATIENT_ENCRYPTION_KEY_FINGERPRINT="$fp_b" \
    HOSPITAL_EXPORT_PSEUDONYM_KEY_FINGERPRINT="$fp_c" \
    HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT="$fp_g" \
    HOSPITAL_SITE_SIGNING_KEY_FINGERPRINT="$fp_d" \
    HOSPITAL_EXTERNAL_AI_SEAL_KEY_FINGERPRINT="$fp_e" \
    HOSPITAL_MFA_ENCRYPTION_KEY_FINGERPRINT="$fp_f" \
    HOSPITAL_BACKUP_MANIFEST_HMAC_KEY="$auth_key" \
    POSTGRES_USER=lospor POSTGRES_DB=lospor \
    MOCK_CALLS="$destination/calls" \
    "$@" sh "$root/infra/postgres/backup-once.sh"
}

basic="$test_root/basic"
mkdir -p "$basic"
: > "$basic/calls"
basic_output="$(run_backup "$basic" "$test_root/basic-signals")" || fail "valid backup failed"
[ "$basic_output" = BACKUP_VERIFIED ] || fail "valid backup did not return BACKUP_VERIFIED"
object="$(find "$basic" -mindepth 1 -maxdepth 1 -type d -name 'lospor-*.backup' -print)"
[ -n "$object" ] && [ -f "$object/database.dump" ] && [ -f "$object/manifest.json" ] \
  || fail "complete recovery object was not published"
[ ! -e "$object/manifest.pending" ] || fail "pending manifest remained visible"
[ -f "$basic/.last-verified.v1" ] || fail "freshness marker was not persisted"
basic_signal="$test_root/basic-signals/backup-status.v1.json"
grep -Eq '^\{"schemaVersion":1,"signalType":"backup","observedAt":"[0-9TZ:-]+","state":"SUCCESS","resultCode":"BACKUP_VERIFIED","artifactBytes":[0-9]+,"checksumAlgorithm":"sha256"\}$' "$basic_signal" \
  && ! grep -Fq 'backupKind' "$basic_signal" \
  || fail "backup signal widened its exact privacy-safe v1 schema"
HOSPITAL_BACKUP_DIR="$basic" HOSPITAL_BACKUP_MANIFEST_HMAC_KEY="$auth_key" \
  HOSPITAL_BACKUP_OBJECT_LIB="$root/infra/postgres/backup-object-lib.sh" PATH="$mock_dir:$PATH" \
  sh -c '. "$HOSPITAL_BACKUP_OBJECT_LIB"; backup_verify_object "$1" full' sh "$object" \
  || fail "published object did not verify against its authenticated manifest"
ok "a dump and authenticated compatibility manifest publish as one manifest-last object"

grep -Fq '"siteId":"site-fixture"' "$object/manifest.json" \
  && grep -Fq '"migrationFingerprint":"sha256:' "$object/manifest.json" \
  && grep -Fq '"patientEncryptionKeyFingerprint":"sha256:' "$object/manifest.json" \
  && grep -Fq '"omopPseudonymSaltFingerprint":"sha256:' "$object/manifest.json" \
  && grep -Fq '"externalAiSealKeyFingerprint":"sha256:' "$object/manifest.json" \
  && grep -Fq '"administratorMfaKeyFingerprint":"sha256:' "$object/manifest.json" \
  && ! grep -Eq 'fixture custom archive|0123456789abcdef' "$object/manifest.json" \
  || fail "manifest metadata is incomplete or leaks secret/dump content"
ok "manifest carries privacy-safe site, compatibility, and key fingerprints only"

cp "$object/manifest.json" "$object/manifest.before-tamper"
sed 's/"hospitalRelease":"1.2.0"/"hospitalRelease":"9.9.9"/' \
  "$object/manifest.before-tamper" > "$object/manifest.json"
if HOSPITAL_BACKUP_DIR="$basic" HOSPITAL_BACKUP_MANIFEST_HMAC_KEY="$auth_key" \
    PATH="$mock_dir:$PATH" sh -c '. "$1"; backup_verify_object "$2" integrity' sh \
      "$root/infra/postgres/backup-object-lib.sh" "$object" >/dev/null 2>&1; then
  fail "tampered manifest passed authentication"
fi
mv "$object/manifest.before-tamper" "$object/manifest.json"
ok "manifest authentication rejects altered compatibility metadata"

cp "$object/manifest.json" "$object/manifest.before-extra-field"
extra_base="$test_root/extra-base.json"
extra_unsigned="$test_root/extra-unsigned.json"
HOSPITAL_BACKUP_MANIFEST_HMAC_KEY="$auth_key" sh -c \
  '. "$1"; backup_manifest_unsigned_copy "$2" "$3"' sh \
  "$root/infra/postgres/backup-object-lib.sh" "$object/manifest.json" "$extra_base"
sed '$d' "$extra_base" | sed '$s/$/,/' > "$extra_unsigned"
printf '  "patientName":"Forbidden Fixture"\n}\n' >> "$extra_unsigned"
extra_hmac="$(openssl dgst -sha256 -hmac "$auth_key" "$extra_unsigned" | awk '{ print $NF }')"
sed '$d' "$extra_unsigned" | sed '$s/$/,/' > "$object/manifest.json"
printf '  "manifestHmacSha256":"%s"\n}\n' "$extra_hmac" >> "$object/manifest.json"
if HOSPITAL_BACKUP_DIR="$basic" HOSPITAL_BACKUP_MANIFEST_HMAC_KEY="$auth_key" \
    PATH="$mock_dir:$PATH" sh -c '. "$1"; backup_verify_object "$2" integrity' sh \
      "$root/infra/postgres/backup-object-lib.sh" "$object" >/dev/null 2>&1; then
  fail "authenticated manifest accepted a non-schema field that could carry PHI"
fi
mv "$object/manifest.before-extra-field" "$object/manifest.json"
ok "manifest schema rejects authenticated extra fields that could carry PHI or secrets"

low="$test_root/low"
mkdir -p "$low"
: > "$low/calls"
if run_backup "$low" "$test_root/low-signals" \
    HOSPITAL_BACKUP_AVAILABLE_BYTES_OVERRIDE=2499 >/dev/null 2>&1; then
  fail "low-capacity backup was accepted"
fi
[ ! -s "$low/calls" ] || fail "pg_dump ran before low-capacity refusal"
[ -z "$(find "$low" -mindepth 1 -maxdepth 1 -name 'lospor-*.backup' -print)" ] \
  || fail "low-capacity refusal exposed a final object"
ok "low capacity refuses before pg_dump or any partial final object"

failed="$test_root/failed"
mkdir -p "$failed"
: > "$failed/calls"
if run_backup "$failed" "$test_root/failed-signals" MOCK_FAIL_DUMP=1 >/dev/null 2>&1; then
  fail "failed pg_dump returned success"
fi
[ -z "$(find "$failed" -mindepth 1 -maxdepth 1 -name 'lospor-*.backup' -print)" ] \
  && [ -z "$(find "$failed" -mindepth 1 -maxdepth 1 -name '.lospor-run-*' -print)" ] \
  || fail "failed attempt left discoverable or private partial state"
ok "a failed attempt removes only its private run directory"

busy="$test_root/busy"
mkdir -p "$busy/.lospor-backup.lock" "$test_root/busy-signals"
printf '%s\n' someone-else > "$busy/.lospor-backup.lock/owner"
: > "$busy/calls"
set +e
run_backup "$busy" "$test_root/busy-signals" HOSPITAL_BACKUP_LOCK_WAIT_SECONDS=0 >/dev/null 2>&1
busy_result=$?
set -e
[ "$busy_result" -eq 75 ] && [ ! -s "$busy/calls" ] \
  || fail "contending caller did not return BUSY before pg_dump"
[ ! -e "$test_root/busy-signals/backup-status.v1.json" ] \
  || fail "BUSY caller overwrote the active backup result marker"
ok "a held shared-volume mutex returns the explicit BUSY exit contract"

maintenance="$test_root/maintenance"
mkdir -p "$maintenance" "$test_root/maintenance-signals"
: > "$maintenance/calls"
maintenance_lock="$maintenance.io-mutation.lock"
: > "$maintenance_lock"
(
  flock -x 9
  : > "$test_root/maintenance-held"
  while [ ! -e "$test_root/maintenance-release" ]; do sleep 0.05; done
) 9<> "$maintenance_lock" &
maintenance_pid=$!
attempt=0
while [ ! -e "$test_root/maintenance-held" ] && [ "$attempt" -lt 100 ]; do sleep 0.05; attempt=$((attempt + 1)); done
[ -e "$test_root/maintenance-held" ] || fail "maintenance fixture never acquired the shared lock"
set +e
run_backup "$maintenance" "$test_root/maintenance-signals" \
  HOSPITAL_BACKUP_LOCK_WAIT_SECONDS=0 > "$test_root/maintenance.out" 2> "$test_root/maintenance.err"
maintenance_result=$?
set -e
: > "$test_root/maintenance-release"
wait "$maintenance_pid" || fail "maintenance lock fixture failed"
[ "$maintenance_result" -eq 75 ] && [ ! -s "$maintenance/calls" ] \
  && grep -Fxq BACKUP_MAINTENANCE_BUSY "$test_root/maintenance.err" \
  || fail "backup did not defer before pg_dump while release maintenance held the shared lock"
[ ! -e "$test_root/maintenance-signals/backup-status.v1.json" ] \
  || fail "maintenance contention overwrote the completed-backup status marker"
ok "the update-wide maintenance mutex defers backup before any database read"

concurrent="$test_root/concurrent"
mkdir -p "$concurrent" "$test_root/concurrent-signals"
: > "$concurrent/calls"
slow_marker="$test_root/slow-started"
release_marker="$test_root/release-slow"
run_backup "$concurrent" "$test_root/concurrent-signals" \
  MOCK_SLOW_MARKER="$slow_marker" MOCK_RELEASE_MARKER="$release_marker" \
  HOSPITAL_BACKUP_KIND=scheduled > "$test_root/first.out" 2> "$test_root/first.err" &
first_pid=$!
attempt=0
while [ ! -e "$slow_marker" ] && [ "$attempt" -lt 100 ]; do sleep 0.05; attempt=$((attempt + 1)); done
[ -e "$slow_marker" ] || fail "first concurrent backup never reached pg_dump"
run_backup "$concurrent" "$test_root/concurrent-signals" \
  HOSPITAL_BACKUP_KIND=pre-update HOSPITAL_BACKUP_LOCK_WAIT_SECONDS=10 \
  > "$test_root/second.out" 2> "$test_root/second.err" &
second_pid=$!
sleep 0.15
: > "$release_marker"
wait "$first_pid" || fail "first concurrent backup failed"
wait "$second_pid" || fail "waiting concurrent backup failed"
[ "$(grep -c '^custom$' "$concurrent/calls")" -eq 1 ] \
  || fail "simultaneous requests ran more than one pg_dump"
concurrent_object="$(find "$concurrent" -mindepth 1 -maxdepth 1 -type d -name 'lospor-*.backup' -print)"
[ "$(printf '%s\n' "$concurrent_object" | grep -c .)" -eq 1 ] \
  && [ -f "$concurrent_object/.retain-pre-update" ] \
  && grep -Fxq BACKUP_REUSED_VERIFIED "$test_root/second.out" \
  || fail "waiting pre-update request did not reuse and protect the verified object"
ok "simultaneous scheduled and pre-update requests produce exactly one protected backup"

clock="$test_root/clock"
sleep_log="$test_root/sleep.log"
cycle_log="$test_root/cycle.log"
cat > "$clock" <<'MOCK'
#!/bin/sh
printf '%s\n' 1787400100
MOCK
sleep_mock="$test_root/sleep-mock"
cat > "$sleep_mock" <<'MOCK'
#!/bin/sh
printf '%s\n' "$1" > "$SLEEP_LOG"
exit 42
MOCK
cycle_mock="$test_root/cycle-mock"
cat > "$cycle_mock" <<'MOCK'
#!/bin/sh
: > "$CYCLE_LOG"
MOCK
chmod +x "$clock" "$sleep_mock" "$cycle_mock"
set +e
HOSPITAL_BACKUP_DIR="$concurrent" \
HOSPITAL_BACKUP_OBJECT_LIB="$root/infra/postgres/backup-object-lib.sh" \
HOSPITAL_BACKUP_MANIFEST_HMAC_KEY="$auth_key" \
HOSPITAL_BACKUP_INTERVAL_SECONDS=14400 \
HOSPITAL_BACKUP_NOW_COMMAND="$clock" \
HOSPITAL_BACKUP_SLEEP_COMMAND="$sleep_mock" \
HOSPITAL_BACKUP_CYCLE_COMMAND="$cycle_mock" \
SLEEP_LOG="$sleep_log" CYCLE_LOG="$cycle_log" \
  sh "$root/infra/postgres/backup-loop.sh" >/dev/null 2>&1
loop_result=$?
set -e
[ "$loop_result" -eq 42 ] && [ "$(cat "$sleep_log")" = 14300 ] && [ ! -e "$cycle_log" ] \
  || fail "restart did not honor the remaining four-hour interval"
ok "scheduler restart sleeps the remaining interval instead of duplicating a fresh backup"

# A marker timestamp is not trusted independently of the authenticated object.
# A mismatched marker falls back to the manifest's authenticated completion
# time, without either accepting the forgery or duplicating a fresh backup.
cp "$concurrent/.last-verified.v1" "$test_root/marker.valid"
sed 's/^completedAtEpoch=.*/completedAtEpoch=1787400100/' \
  "$test_root/marker.valid" > "$concurrent/.last-verified.v1"
rm -f "$cycle_log"
set +e
HOSPITAL_BACKUP_DIR="$concurrent" \
HOSPITAL_BACKUP_OBJECT_LIB="$root/infra/postgres/backup-object-lib.sh" \
HOSPITAL_BACKUP_MANIFEST_HMAC_KEY="$auth_key" \
HOSPITAL_BACKUP_INTERVAL_SECONDS=14400 \
HOSPITAL_BACKUP_NOW_COMMAND="$clock" \
HOSPITAL_BACKUP_SLEEP_COMMAND="$sleep_mock" \
HOSPITAL_BACKUP_CYCLE_COMMAND="$cycle_mock" \
HOSPITAL_BACKUP_LOOP_MAX_CYCLES=1 \
SLEEP_LOG="$sleep_log" CYCLE_LOG="$cycle_log" \
  sh "$root/infra/postgres/backup-loop.sh" >/dev/null 2>&1
forged_marker_result=$?
set -e
[ "$forged_marker_result" -eq 42 ] && [ "$(cat "$sleep_log")" = 14300 ] \
  && [ ! -e "$cycle_log" ] \
  || fail "scheduler trusted the forged timestamp or duplicated the authenticated fresh object"
mv "$test_root/marker.valid" "$concurrent/.last-verified.v1"
ok "restart freshness falls back to the authenticated manifest completion time"

# Simulate power loss after the manifest became durable but before the marker
# rename. Both the scheduler and a manual request must discover/reuse the
# complete object instead of launching another pg_dump.
rm -f "$concurrent/.last-verified.v1"
rm -f "$cycle_log"
set +e
HOSPITAL_BACKUP_DIR="$concurrent" \
HOSPITAL_BACKUP_OBJECT_LIB="$root/infra/postgres/backup-object-lib.sh" \
HOSPITAL_BACKUP_MANIFEST_HMAC_KEY="$auth_key" \
HOSPITAL_BACKUP_INTERVAL_SECONDS=14400 \
HOSPITAL_BACKUP_NOW_COMMAND="$clock" \
HOSPITAL_BACKUP_SLEEP_COMMAND="$sleep_mock" \
HOSPITAL_BACKUP_CYCLE_COMMAND="$cycle_mock" \
SLEEP_LOG="$sleep_log" CYCLE_LOG="$cycle_log" \
  sh "$root/infra/postgres/backup-loop.sh" >/dev/null 2>&1
crash_window_loop_result=$?
set -e
[ "$crash_window_loop_result" -eq 42 ] && [ ! -e "$cycle_log" ] \
  || fail "scheduler duplicated an object published just before marker loss"
before_reuse_dumps="$(grep -c '^custom$' "$concurrent/calls")"
reuse_output="$(run_backup "$concurrent" "$test_root/concurrent-signals" HOSPITAL_BACKUP_KIND=manual)" \
  || fail "manual crash-window recovery failed"
[ "$reuse_output" = BACKUP_REUSED_VERIFIED ] \
  && [ "$(grep -c '^custom$' "$concurrent/calls")" = "$before_reuse_dumps" ] \
  && [ -f "$concurrent/.last-verified.v1" ] \
  || fail "manual request did not reuse and repair the manifest-published object"
ok "manifest-published object recovery closes the marker-update crash window without another dump"

hook_dir="$test_root/hook"
mkdir -p "$hook_dir"
hook="$test_root/offhost-hook"
cat > "$hook" <<'MOCK'
#!/bin/sh
[ -f "$1/manifest.json" ] || exit 1
printf '%s\n' "$1" > "$OFFHOST_CALL"
MOCK
chmod +x "$hook"
: > "$hook_dir/calls"
OFFHOST_CALL="$test_root/offhost.call" run_backup "$hook_dir" "$test_root/hook-signals" \
  HOSPITAL_BACKUP_OFFHOST_HOOK="$hook" >/dev/null \
  || fail "off-host acknowledgement hook failed"
[ -f "$hook_dir/.last-offhost-verified.v1" ] && [ -s "$test_root/offhost.call" ] \
  || fail "off-host acknowledgement was not tracked"
ok "off-host hook receives a verified object and persists its acknowledgement"

echo "backup hardening tests passed ($tests)"
