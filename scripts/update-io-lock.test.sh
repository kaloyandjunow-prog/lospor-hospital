#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"

if [ "${1:-}" = child ]; then
  . "$root/scripts/update-pipeline-lib.sh"
  update_pipeline_init "$root" "$IO_TEST_HOME"
  if ! update_io_lock_acquire "${IO_TEST_PURPOSE:-prepare}"; then
    exit 73
  fi
  if [ "${IO_TEST_HOLD:-0}" = 1 ]; then
    printf 'ready\n' > "$IO_TEST_READY"
    while [ ! -e "$IO_TEST_STOP" ]; do sleep 0.05; done
  fi
  update_io_lock_release
  exit 0
fi

# Every assertion below is about one process excluding another through flock. A
# host without flock cannot run any of them, and the whole plan is declared
# skipped rather than reporting a passing test: an `ok` line for work that never
# happened is how a mutual-exclusion suite comes to look permanently healthy on
# the one platform where it has never run.
if ! command -v flock >/dev/null 2>&1; then
  if [ "${HOSPITAL_REQUIRE_FULL_UPDATE_TESTS:-0}" = 1 ]; then
    printf 'Bail out! flock is unavailable and HOSPITAL_REQUIRE_FULL_UPDATE_TESTS=1.\n'
    exit 1
  fi
  printf '1..0 # SKIP the update I/O lock suite needs flock, which %s does not provide\n' \
    "$(uname -s 2>/dev/null || echo this platform)"
  printf 'SKIPPED: 0 of 6 update I/O lock assertions ran; they still need a host with flock.\n' >&2
  exit 0
fi

work="$(mktemp -d)"
holder=""
cleanup() {
  [ -z "$holder" ] || kill "$holder" 2>/dev/null || true
  rm -rf "$work"
}
trap cleanup EXIT HUP INT TERM
home="$work/appliance"
lock="$home/.data/io-mutation.lock"
owner="$lock.owner.v1.tsv"
ready="$work/ready"
stop="$work/stop"
mkdir -p "$home/.data"
: > "$lock"
chmod 0600 "$lock"
tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { printf 'not ok %s - %s\n' "$((tests + 1))" "$1" >&2; exit 1; }

inode_before="$(stat -c %i "$lock")"
HOSPITAL_UPDATE_TEST_ONLY=1 IO_TEST_HOME="$home" IO_TEST_HOLD=1 \
  IO_TEST_READY="$ready" IO_TEST_STOP="$stop" \
  sh "$0" child > "$work/holder.out" 2>&1 &
holder=$!
attempt=0
while [ ! -s "$ready" ] && [ "$attempt" -lt 100 ]; do
  sleep 0.05
  attempt=$((attempt + 1))
done
[ -s "$ready" ] || fail "the first process did not acquire the shared lock"
awk -F '\t' 'NR == 1 && NF == 5 && $1 == "LOSPOR-HOSPITAL-IO-MUTATION-OWNER-V1" && $4 == "prepare" { ok=1 } END { exit !(NR == 1 && ok) }' "$owner" \
  || fail "the diagnostic owner sidecar is not strict"
ok "a holder locks the persistent inode and writes a bounded owner sidecar"

started="$(date -u +%s)"
set +e
contended="$(HOSPITAL_UPDATE_TEST_ONLY=1 IO_TEST_HOME="$home" \
  sh "$0" child 2>&1)"
contended_result=$?
set -e
elapsed=$(( $(date -u +%s) - started ))
[ "$contended_result" -eq 73 ] \
  && printf '%s\n' "$contended" | grep -Fxq UPDATE_MAINTENANCE_BUSY \
  && [ "$elapsed" -le 2 ] \
  || fail "contention did not fail immediately with UPDATE_MAINTENANCE_BUSY"
ok "a competing backup/update is refused immediately without waiting"

: > "$stop"
wait "$holder"
holder=""
[ -f "$lock" ] && [ ! -e "$owner" ] \
  && [ "$(stat -c %i "$lock")" = "$inode_before" ] \
  || fail "release replaced/deleted the shared inode or retained its owner sidecar"
ok "release closes flock but never replaces or deletes the shared lock file"

HOSPITAL_UPDATE_TEST_ONLY=1 IO_TEST_HOME="$home" IO_TEST_PURPOSE=database-update \
  sh "$0" child > "$work/reacquire.out" 2>&1 \
  || fail "the persistent lock could not be acquired after a clean release"
[ -f "$lock" ] && [ "$(stat -c %i "$lock")" = "$inode_before" ] \
  || fail "a later acquisition changed the shared inode"
ok "the same inode can coordinate the next destructive operation"

rm -f "$lock"
set +e
missing="$(HOSPITAL_UPDATE_TEST_ONLY=1 IO_TEST_HOME="$home" sh "$0" child 2>&1)"
missing_result=$?
set -e
[ "$missing_result" -eq 73 ] \
  && printf '%s\n' "$missing" | grep -Fxq UPDATE_MAINTENANCE_LOCK_INVALID \
  || fail "a missing persistent lock was created or ignored"
[ ! -e "$lock" ] || fail "the update path silently recreated the lock inode"
ok "a missing lock fails closed instead of creating a different inode"

: > "$lock"
chmod 0600 "$lock"
ln "$lock" "$work/second-link"
set +e
linked="$(HOSPITAL_UPDATE_TEST_ONLY=1 IO_TEST_HOME="$home" sh "$0" child 2>&1)"
linked_result=$?
set -e
[ "$linked_result" -eq 73 ] \
  && printf '%s\n' "$linked" | grep -Fxq UPDATE_MAINTENANCE_LOCK_INVALID \
  || fail "a multiply-linked lock was accepted"
ok "a replaced or multiply-linked lock inode is rejected"

printf 'update I/O lock tests passed (%s)\n' "$tests"
