#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/lospor-retention-test.XXXXXX")"
cleanup() { rm -rf -- "$test_root"; }
trap cleanup EXIT HUP INT TERM

tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
assert_exists() { [ -e "$1" ] || fail "expected $1"; }
assert_missing() { [ ! -e "$1" ] || fail "expected $1 to be removed"; }

auth_key=0123456789abcdef0123456789abcdef0123456789abcdef
now_epoch=1787400000
object_counter=0

make_object() {
  days_old="$1"
  seconds_offset="$2"
  object_kind="$3"
  object_counter=$((object_counter + 1))
  suffix="$(printf '%08d' "$object_counter")"
  completed=$((now_epoch - days_old * 86400 - seconds_offset))
  created=$((completed - 5))
  completed_at="$(date -u -d "@$completed" +%Y-%m-%dT%H:%M:%SZ)"
  created_at="$(date -u -d "@$created" +%Y-%m-%dT%H:%M:%SZ)"
  stamp="$(printf '%s' "$completed_at" | tr -d ':-')"
  made_object="$test_root/lospor-${stamp}-${suffix}.backup"
  mkdir "$made_object"
  printf 'dump-%s\n' "$suffix" > "$made_object/database.dump"
  dump_bytes="$(wc -c < "$made_object/database.dump" | tr -d '[:space:]')"
  dump_sha="$(sha256sum "$made_object/database.dump" | awk '{ print $1 }')"
  unsigned="$test_root/unsigned-${suffix}.json"
  cat > "$unsigned" <<EOF
{
  "schemaVersion":1,
  "objectType":"lospor-postgresql-logical-backup",
  "toolVersion":"1.2.0",
  "runId":"${stamp}-${suffix}",
  "kind":"$object_kind",
  "siteId":"site-fixture",
  "applianceId":"appliance-fixture",
  "hospitalRelease":"1.2.0",
  "exchangeContractVersion":"2.2.0",
  "dataDictionaryVersion":"2.2.0",
  "postgresMajor":17,
  "migrationCount":2,
  "migrationFingerprint":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "schemaFingerprint":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "patientHmacKeyFingerprint":"sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  "patientEncryptionKeyFingerprint":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  "exportPseudonymKeyFingerprint":"sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  "omopPseudonymSaltFingerprint":"sha256:1212121212121212121212121212121212121212121212121212121212121212",
  "siteSigningKeyFingerprint":"sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "externalAiSealKeyFingerprint":"sha256:abababababababababababababababababababababababababababababababab",
  "administratorMfaKeyFingerprint":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "manifestAuthKeyFingerprint":"sha256:$(printf '%s' "$auth_key" | sha256sum | awk '{ print $1 }')",
  "createdAt":"$created_at",
  "createdAtEpoch":$created,
  "completedAt":"$completed_at",
  "completedAtEpoch":$completed,
  "dumpFile":"database.dump",
  "sourceDatabaseBytes":1000,
  "dumpBytes":$dump_bytes,
  "dumpSha256":"$dump_sha"
}
EOF
  manifest_hmac="$(openssl dgst -sha256 -hmac "$auth_key" "$unsigned" | awk '{ print $NF }')"
  sed '$d' "$unsigned" | sed '$s/$/,/' > "$made_object/manifest.json"
  printf '  "manifestHmacSha256":"%s"\n}\n' "$manifest_hmac" >> "$made_object/manifest.json"
  rm -f -- "$unsigned"
}

# Dense window: every authenticated recovery point through 48 hours remains.
make_object 0 3600 manual; recent_one="$made_object"
make_object 1 3600 scheduled; recent_two="$made_object"
make_object 1 82800 manual; recent_three="$made_object"

# Sixteen older UTC days supply one daily candidate each. The newest fourteen
# days are retained; days 17 and 18 are beyond the daily horizon.
day=3
while [ "$day" -le 18 ]; do
  make_object "$day" 100 scheduled
  eval "day_${day}_object=\$made_object"
  day=$((day + 1))
done
# A second, older object on day three is outside the dense window and is not a
# second daily recovery point.
make_object 3 200 manual; day_three_duplicate="$made_object"

make_object 60 100 pre-update; pre_update="$made_object"
make_object 70 100 immutable; immutable="$made_object"
make_object 80 100 scheduled; invalid="$made_object"
printf tampered >> "$invalid/database.dump"
printf legacy > "$test_root/lospor-20200101T000000Z.dump"
mkdir "$test_root/.lospor-run-crashed.tmp.AAAAAAAA" "$test_root/.lospor-run-recent.tmp.BBBBBBBB"
touch -d '3 days ago' "$test_root/.lospor-run-crashed.tmp.AAAAAAAA"

HOSPITAL_BACKUP_DIR="$test_root" \
HOSPITAL_BACKUP_OBJECT_LIB="$root/infra/postgres/backup-object-lib.sh" \
HOSPITAL_BACKUP_MANIFEST_HMAC_KEY="$auth_key" \
HOSPITAL_BACKUP_NOW_EPOCH="$now_epoch" \
HOSPITAL_BACKUP_KEEP_ALL_SECONDS=172800 \
HOSPITAL_BACKUP_DAILY_POINTS=14 \
  sh "$root/infra/postgres/prune-backups.sh" > "$test_root/prune.out" 2> "$test_root/prune.err"

assert_exists "$recent_one"
assert_exists "$recent_two"
assert_exists "$recent_three"
ok "retention preserves every authenticated recovery point for 48 hours"

day=3
while [ "$day" -le 16 ]; do
  eval "candidate=\$day_${day}_object"
  assert_exists "$candidate"
  day=$((day + 1))
done
assert_missing "$day_three_duplicate"
eval "day_seventeen=\$day_17_object"
eval "day_eighteen=\$day_18_object"
assert_missing "$day_seventeen"
assert_missing "$day_eighteen"
ok "retention keeps exactly fourteen older daily recovery points and removes same-day excess"

assert_exists "$pre_update"
assert_exists "$immutable"
ok "pre-update and immutable recovery points are never expired by ordinary retention"

assert_exists "$invalid"
assert_exists "$test_root/lospor-20200101T000000Z.dump"
grep -Fq "BACKUP_RETENTION_SKIPPED_INVALID_OBJECT $(basename "$invalid")" "$test_root/prune.err" \
  && grep -Fq 'BACKUP_RETENTION_SKIPPED_LEGACY_OBJECT lospor-20200101T000000Z.dump' "$test_root/prune.err" \
  || fail "unsafe objects were not reported"
ok "corrupt, incomplete, symlinked, and legacy objects are reported but never deleted"

assert_missing "$test_root/.lospor-run-crashed.tmp.AAAAAAAA"
assert_exists "$test_root/.lospor-run-recent.tmp.BBBBBBBB"
ok "shared-lock retention removes only stale private crash remnants"

mock_dir="$test_root/mocks"
mkdir "$mock_dir"
cat > "$mock_dir/backup-fail.sh" <<'MOCK'
#!/bin/sh
printf '%s\n' backup >> "$CALLS"
exit 1
MOCK
cat > "$mock_dir/backup-busy.sh" <<'MOCK'
#!/bin/sh
printf '%s\n' backup >> "$CALLS"
exit 75
MOCK
cat > "$mock_dir/backup-ok.sh" <<'MOCK'
#!/bin/sh
printf '%s\n' backup >> "$CALLS"
exit 0
MOCK
cat > "$mock_dir/prune.sh" <<'MOCK'
#!/bin/sh
printf '%s\n' prune >> "$CALLS"
exit 0
MOCK
chmod +x "$mock_dir"/*.sh
calls="$test_root/calls"
: > "$calls"
set +e
CALLS="$calls" HOSPITAL_BACKUP_ONCE_COMMAND="$mock_dir/backup-fail.sh" \
  HOSPITAL_BACKUP_PRUNE_COMMAND="$mock_dir/prune.sh" \
  sh "$root/infra/postgres/backup-cycle.sh" >/dev/null 2>&1
failed_result=$?
set -e
[ "$failed_result" -eq 1 ] && [ "$(cat "$calls")" = backup ] \
  || fail "failed backup triggered retention or lost its exit result"
ok "a failed backup never triggers retention"

: > "$calls"
set +e
CALLS="$calls" HOSPITAL_BACKUP_ONCE_COMMAND="$mock_dir/backup-busy.sh" \
  HOSPITAL_BACKUP_PRUNE_COMMAND="$mock_dir/prune.sh" \
  sh "$root/infra/postgres/backup-cycle.sh" >/dev/null 2>&1
busy_result=$?
set -e
[ "$busy_result" -eq 75 ] && [ "$(cat "$calls")" = backup ] \
  || fail "backup cycle did not preserve the BUSY contract"
ok "backup cycle preserves BUSY without running retention"

: > "$calls"
CALLS="$calls" HOSPITAL_BACKUP_ONCE_COMMAND="$mock_dir/backup-ok.sh" \
  HOSPITAL_BACKUP_PRUNE_COMMAND="$mock_dir/prune.sh" \
  sh "$root/infra/postgres/backup-cycle.sh" >/dev/null
[ "$(sed -n '1p' "$calls")" = backup ] && [ "$(sed -n '2p' "$calls")" = prune ] \
  || fail "verified backup did not trigger retention in order"
ok "a verified or explicitly reused backup triggers retention afterwards"

echo "backup retention tests passed ($tests)"
