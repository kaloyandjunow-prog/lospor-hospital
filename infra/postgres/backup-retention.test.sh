#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/lospor-backup-test.XXXXXX")"
cleanup() { rm -rf -- "$test_root"; }
trap cleanup EXIT HUP INT TERM

pass_count=0
assert_exists() {
  [ -e "$1" ] || { echo "FAIL: expected $1" >&2; exit 1; }
}
assert_missing() {
  [ ! -e "$1" ] || { echo "FAIL: expected $1 to be removed" >&2; exit 1; }
}
pass() { pass_count=$((pass_count + 1)); printf 'ok %s - %s\n' "$pass_count" "$1"; }

make_pair() {
  stamp="$1"
  printf 'backup-%s\n' "$stamp" > "$test_root/lospor-${stamp}.dump"
  digest="$(sha256sum "$test_root/lospor-${stamp}.dump" | awk '{ print $1 }')"
  printf '%s  %s\n' "$digest" "lospor-${stamp}.dump" \
    > "$test_root/lospor-${stamp}.dump.sha256"
}

make_pair 20200101T000000Z
make_pair 20200102T000000Z
make_pair 20260101T000000Z
make_pair 20260102T000000Z
touch -t 202001010000 "$test_root/lospor-20200101T000000Z.dump" "$test_root/lospor-20200101T000000Z.dump.sha256"
touch -t 202001020000 "$test_root/lospor-20200102T000000Z.dump" "$test_root/lospor-20200102T000000Z.dump.sha256"
touch -t 202001030000 "$test_root/lospor-20260101T000000Z.dump" "$test_root/lospor-20260101T000000Z.dump.sha256"
touch -t 202001040000 "$test_root/lospor-20260102T000000Z.dump" "$test_root/lospor-20260102T000000Z.dump.sha256"

HOSPITAL_BACKUP_DIR="$test_root" HOSPITAL_BACKUP_RETENTION_DAYS=0 \
  sh "$root/infra/postgres/prune-backups.sh" >/dev/null
assert_missing "$test_root/lospor-20200101T000000Z.dump"
assert_missing "$test_root/lospor-20200101T000000Z.dump.sha256"
assert_missing "$test_root/lospor-20200102T000000Z.dump"
assert_missing "$test_root/lospor-20200102T000000Z.dump.sha256"
assert_exists "$test_root/lospor-20260101T000000Z.dump"
assert_exists "$test_root/lospor-20260101T000000Z.dump.sha256"
assert_exists "$test_root/lospor-20260102T000000Z.dump"
assert_exists "$test_root/lospor-20260102T000000Z.dump.sha256"
pass "retention removes only old pairs and preserves the newest two valid pairs"

make_pair 20190101T000000Z
printf 'tampered\n' >> "$test_root/lospor-20190101T000000Z.dump"
printf 'orphan\n' > "$test_root/lospor-20180101T000000Z.dump.sha256"
touch -t 201901010000 "$test_root/lospor-20190101T000000Z.dump" "$test_root/lospor-20190101T000000Z.dump.sha256"
touch -t 201801010000 "$test_root/lospor-20180101T000000Z.dump.sha256"
HOSPITAL_BACKUP_DIR="$test_root" HOSPITAL_BACKUP_RETENTION_DAYS=0 \
  sh "$root/infra/postgres/prune-backups.sh" >/dev/null 2>&1
assert_exists "$test_root/lospor-20190101T000000Z.dump"
assert_exists "$test_root/lospor-20190101T000000Z.dump.sha256"
assert_exists "$test_root/lospor-20180101T000000Z.dump.sha256"
pass "invalid and orphaned backup files are reported but never deleted"

mock_dir="$test_root/mocks"
mkdir "$mock_dir"
printf '#!/bin/sh\necho backup >> "$CALLS"\nexit 1\n' > "$mock_dir/backup-fail.sh"
printf '#!/bin/sh\necho backup >> "$CALLS"\nexit 0\n' > "$mock_dir/backup-ok.sh"
printf '#!/bin/sh\necho prune >> "$CALLS"\nexit 0\n' > "$mock_dir/prune.sh"
chmod +x "$mock_dir"/*.sh
calls="$test_root/calls"
: > "$calls"
if CALLS="$calls" \
    HOSPITAL_BACKUP_ONCE_COMMAND="$mock_dir/backup-fail.sh" \
    HOSPITAL_BACKUP_PRUNE_COMMAND="$mock_dir/prune.sh" \
    sh "$root/infra/postgres/backup-cycle.sh" >/dev/null 2>&1; then
  echo "FAIL: failed backup cycle returned success" >&2
  exit 1
fi
[ "$(cat "$calls")" = backup ] || {
  echo "FAIL: retention ran after a failed backup" >&2
  exit 1
}
pass "a failed new backup never triggers retention"

: > "$calls"
CALLS="$calls" \
  HOSPITAL_BACKUP_ONCE_COMMAND="$mock_dir/backup-ok.sh" \
  HOSPITAL_BACKUP_PRUNE_COMMAND="$mock_dir/prune.sh" \
  sh "$root/infra/postgres/backup-cycle.sh" >/dev/null
[ "$(sed -n '1p' "$calls")" = backup ] && [ "$(sed -n '2p' "$calls")" = prune ] || {
  echo "FAIL: successful backup did not trigger retention in order" >&2
  exit 1
}
pass "a verified new backup triggers retention afterwards"

if grep -Eq 'archive_mode=on|archive_command|postgres-wal' "$root/compose.yaml"; then
  echo "FAIL: unbounded PostgreSQL WAL archiving returned to compose.yaml" >&2
  exit 1
fi
grep -Fq 'archive_mode=off' "$root/compose.yaml" \
  && grep -Fq './infra/postgres/backup-cycle.sh:/usr/local/bin/backup-cycle.sh:ro' "$root/compose.yaml" \
  && grep -Fq './infra/postgres/prune-backups.sh:/usr/local/bin/prune-backups.sh:ro' "$root/compose.yaml" || {
    echo "FAIL: resolved backup safety scripts are not wired into Compose" >&2
    exit 1
  }
pass "Compose disables WAL archiving and wires the verified backup cycle"

echo "backup retention tests passed ($pass_count)"
