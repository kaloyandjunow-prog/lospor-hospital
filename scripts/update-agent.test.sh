#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM
tests=0
skipped=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
# A TAP SKIP directive, so a result that could not be produced is counted as
# skipped by whatever reads this rather than as one more passing assertion.
skip() { tests=$((tests + 1)); skipped=$((skipped + 1)); printf 'ok %s - %s # SKIP\n' "$tests" "$1"; }
fail() { echo "FAIL: $1" >&2; [ ! -f "$work/out" ] || sed 's/^/    /' "$work/out" >&2; exit 1; }

site="$work/site"; home="$site/.lospor-home"; scripts="$site/scripts"
zoneinfo="$work/zoneinfo"
test_bin="$work/bin"
mkdir -p "$scripts" "$home/.data" "$home/.data/runtime/update/requests" "$zoneinfo/Europe" "$test_bin"
: > "$zoneinfo/Europe/Sofia"
# The agent holds a request mutex through flock, and so does the cancellation
# command it has to exclude. Stubbing flock to exit 0 leaves those assertions
# passing while nothing is excluded, so a host without flock reports the plan as
# skipped rather than a row of results it did not earn.
if ! command -v flock >/dev/null 2>&1; then
  if [ "${HOSPITAL_REQUIRE_FULL_UPDATE_TESTS:-0}" = 1 ]; then
    printf 'Bail out! flock is unavailable and HOSPITAL_REQUIRE_FULL_UPDATE_TESTS=1.\n'
    exit 1
  fi
  printf '1..0 # SKIP the update agent suite needs flock, which %s does not provide\n' \
    "$(uname -s 2>/dev/null || echo this platform)"
  printf 'SKIPPED: 0 of 16 update agent assertions ran; they still need a host with flock.\n' >&2
  exit 0
fi
for name in installed-release-state.sh operator-locale.sh update-pipeline-lib.sh terminology-agent-lib.sh update-agent-loop.sh cancel-update-request.sh; do cp "$root/scripts/$name" "$scripts/$name"; done
cat > "$scripts/check-for-update.sh" <<'STUB'
#!/bin/sh
exit 0
STUB
cat > "$scripts/prepare-verified-release.sh" <<'STUB'
#!/bin/sh
printf 'prepare\t%s\t%s\n' "$1" "$2" >> "$AGENT_CALLS"
. "$(dirname "$0")/update-pipeline-lib.sh"
update_pipeline_init "$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)" "$(CDPATH= cd -- "$(dirname "$0")/../.lospor-home" && pwd -P)"
update_transition_write PREPARED prepare "$2" "$1" UPDATE_PREPARED "$(printf lock | sha256sum | awk '{print $1}')"
STUB
cat > "$scripts/apply-prepared-release.sh" <<'STUB'
#!/bin/sh
printf 'apply\t%s\t%s\n' "$1" "$2" >> "$AGENT_CALLS"
. "$(dirname "$0")/update-pipeline-lib.sh"
update_pipeline_init "$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)" "$(CDPATH= cd -- "$(dirname "$0")/../.lospor-home" && pwd -P)"
update_transition_write COMPLETED apply "$2" "$1" UPDATE_COMPLETED "$(printf lock | sha256sum | awk '{print $1}')"
update_projection_write completed UPDATE_COMPLETED "$1"
STUB
cat > "$scripts/terminology-host-operation.sh" <<'STUB'
#!/bin/sh
exit 0
STUB
chmod +x "$scripts/"*.sh

requests="$home/.data/runtime/update/requests"
private="$home/.data/update-private"
state="$home/.data/runtime/update/state"
now() { date -u +%s; }
request() {
  action="$1"; id="$2"; version="$3"; epoch="$4"; window="$5"
  printf 'LOSPOR-HOSPITAL-UPDATE-REQUEST-V2\t%s\t%s\t%s\t%s\t%s\n' \
    "$action" "$id" "$version" "$epoch" "$window" > "$requests/$action.request.v2.tsv"
}
reset_state() {
  rm -rf "$home/.data/update-private"
  rm -f "$requests"/* "$state"/* "$work/calls" 2>/dev/null || true
}
run_agent() {
  PATH="$test_bin:$PATH" AGENT_CALLS="$work/calls" HOSPITAL_UPDATE_AGENT_ONESHOT=1 \
    HOSPITAL_UPDATE_TEST_ONLY=1 HOSPITAL_UPDATE_TEST_ZONEINFO_ROOT="$zoneinfo" \
    HOSPITAL_UPDATE_AGENT_POLL_SECONDS=5 HOSPITAL_UPDATE_CHECK_INTERVAL_SECONDS=999999 \
    HOSPITAL_UPDATE_TIMEZONE=Europe/Sofia "$@" sh "$scripts/update-agent-loop.sh" \
    > "$work/out" 2>&1 || true
}
code() { sed -n 's/.*"resultCode":"\([^"]*\)".*/\1/p' "$state/update-agent.v2.json" | head -1; }

. "$scripts/update-pipeline-lib.sh"
if [ "$(TZ=Europe/Sofia date -d '2026-03-29 20:00' -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || true)" = 2026-03-29T17:00:00Z ]; then
  spring_now="$(date -u -d '2026-03-28T19:00:00Z' +%s)"
  autumn_now="$(date -u -d '2026-10-24T18:30:00Z' +%s)"
  [ "$(update_next_window_opening Europe/Sofia 20:00 "$spring_now")" = 2026-03-29T17:00:00Z ] \
    || fail "spring DST window was not converted to the correct UTC instant"
  [ "$(update_next_window_opening Europe/Sofia 20:00 "$autumn_now")" = 2026-10-25T18:00:00Z ] \
    || fail "autumn DST window was not converted to the correct UTC instant"
  ok "maintenance windows remain local through both Sofia DST transitions"
else
  skip "maintenance windows through both Sofia DST transitions (platform has no IANA date data)"
fi

reset_state
request prepare aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 1.3.0 "$(now)" none
run_agent env
grep -Fxq 'prepare	1.3.0	aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' "$work/calls" || fail "valid preparation did not run"
[ ! -e "$requests/prepare.request.v2.tsv" ] || fail "preparation request was not consumed"
ok "preparation intent reaches only the trusted prepare command"

reset_state
request apply bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 1.3.0 "$(now)" override
run_agent env
grep -Fxq 'apply	1.3.0	bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' "$work/calls" || fail "valid apply did not run"
ok "apply intent reaches only the exact prepared-release command"

reset_state
request prepare cccccccccccccccccccccccccccccccc 1.3.0 "$(( $(now) - 8 * 86400 ))" none
run_agent env
[ ! -s "$work/calls" ] || fail "expired request ran"
[ "$(code)" = UPDATE_REQUEST_EXPIRED ] || fail "expired request did not retain its exact failure"
run_agent env
[ "$(code)" = UPDATE_REQUEST_EXPIRED ] || fail "terminal request failure was silently reset"
ok "durable requests have a day-scale bounded maximum age"

for malformed in \
  'LOSPOR-HOSPITAL-UPDATE-REQUEST-V2	prepare	dddddddddddddddddddddddddddddddd	../../etc	1	none' \
  'LOSPOR-HOSPITAL-UPDATE-REQUEST-V2	prepare	eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee	1.3.0	1	none	extra' \
  'LOSPOR-HOSPITAL-UPDATE-REQUEST-V2	prepare	eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee	1.3.0	1	none	' \
  'LOSPOR-HOSPITAL-UPDATE-REQUEST-V2	prepare	eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee	1.3.0	999999999999999999999999999	none' \
  'not-a-request'; do
  reset_state
  printf '%b\n' "$malformed" > "$requests/prepare.request.v2.tsv"
  run_agent env
  [ ! -s "$work/calls" ] || fail "malformed request ran"
done
ok "traversal, extra fields, and unknown formats are rejected"

reset_state
outside_start="$(TZ=Europe/Sofia date -d '+2 hours' +%H:%M)"
outside_end="$(TZ=Europe/Sofia date -d '+2 hours 1 minute' +%H:%M)"
request apply ffffffffffffffffffffffffffffffff 1.3.0 "$(now)" scheduled
run_agent env HOSPITAL_UPDATE_WINDOW_START="$outside_start" HOSPITAL_UPDATE_WINDOW_END="$outside_end"
[ ! -s "$work/calls" ] || fail "scheduled request ran outside its window"
[ -s "$private/inflight/apply.request.v2.tsv" ] || fail "queued intent did not survive in root-owned state"
[ "$(code)" = UPDATE_QUEUED ] || fail "queued state was not projected"
run_agent env HOSPITAL_UPDATE_WINDOW_START="$outside_start" HOSPITAL_UPDATE_WINDOW_END="$outside_end"
[ -s "$private/inflight/apply.request.v2.tsv" ] || fail "queued intent did not survive restart"
ok "maintenance-window intent survives restart without expiring in minutes"

reset_state
mkdir -p "$private/inflight" "$state"
. "$scripts/update-pipeline-lib.sh"
update_pipeline_init "$site" "$home"
update_transition_write APPLYING apply 11111111111111111111111111111111 1.3.0 UPDATE_APPLYING "$(printf lock | sha256sum | awk '{print $1}')"
run_agent env
[ ! -s "$work/calls" ] || fail "ambiguous apply was retried"
[ "$(code)" = UPDATE_AMBIGUOUS_APPLY ] || fail "ambiguous apply did not require operator"
ok "restart never retries an ambiguous apply"

reset_state
mkdir "$home/.data/release-activation.lock"
run_agent env
[ "$(code)" = UPDATE_ACTIVATION_LOCK_PRESENT ] || fail "activation lock was not surfaced"
[ -d "$home/.data/release-activation.lock" ] || fail "agent cleared the activation lock"
rmdir "$home/.data/release-activation.lock"
ok "agent never clears an activation lock"

reset_state
mkdir -p "$private"
printf 'LOSPOR-HOSPITAL-UPDATE-JOURNAL-V2\t%s\tCOMPLETED\tapply\t22222222222222222222222222222222\t1.3.0\tUPDATE_COMPLETED\t%s\n' \
  "$(now)" "$(printf lock | sha256sum | awk '{print $1}')" > "$private/journal.v2.tsv"
request apply 22222222222222222222222222222222 1.3.0 "$(now)" override
run_agent env
[ ! -s "$work/calls" ] || fail "replayed request ran"
[ "$(code)" = UPDATE_REQUEST_REPLAYED ] || fail "replay did not retain its exact refusal"
ok "terminal request IDs cannot be replayed"

reset_state
request apply 33333333333333333333333333333333 1.3.0 "$(now)" scheduled
PATH="$test_bin:$PATH" HOSPITAL_UPDATE_TEST_ONLY=1 sh "$scripts/cancel-update-request.sh" apply \
  33333333333333333333333333333333 > "$work/out" 2>&1 \
  || fail "explicit cancellation failed"
[ ! -e "$requests/apply.request.v2.tsv" ] || fail "cancelled request remained pending"
[ "$(code)" = UPDATE_CANCELLED ] || fail "cancellation did not retain its exact terminal state"
ok "an exact pending request can be cancelled explicitly without mutation"

reset_state
request apply 44444444444444444444444444444444 1.3.0 "$(now)" scheduled
if PATH="$test_bin:$PATH" HOSPITAL_UPDATE_TEST_ONLY=1 sh "$scripts/cancel-update-request.sh" apply \
  55555555555555555555555555555555 > "$work/out" 2>&1; then
  fail "cancellation accepted a different request ID"
fi
[ -s "$requests/apply.request.v2.tsv" ] || fail "ID mismatch removed the waiting request"
ok "cancellation is bound to the exact request ID when one is supplied"

reset_state
request apply 55555555555555555555555555555555 1.3.0 "$(now)" scheduled
mkdir -p "$private"
: > "$work/cancel-lock-alias"
ln "$work/cancel-lock-alias" "$private/request-agent.lock"
if PATH="$test_bin:$PATH" HOSPITAL_UPDATE_TEST_ONLY=1 \
  sh "$scripts/cancel-update-request.sh" apply > "$work/out" 2>&1; then
  fail "cancellation used a multiply-linked mutex"
fi
[ -s "$requests/apply.request.v2.tsv" ] || fail "unsafe cancellation lock removed intent"
rm -f "$work/cancel-lock-alias"
ok "cancellation refuses an unsafe mutex without changing intent"

reset_state
: > "$work/elsewhere"
if ln -s "$work/elsewhere" "$requests/prepare.request.v2.tsv" 2>/dev/null \
  && [ -L "$requests/prepare.request.v2.tsv" ]; then
  run_agent env
  [ ! -s "$work/calls" ] || fail "symlink request ran"
  [ "$(code)" = UPDATE_REQUEST_UNSAFE ] || fail "symlink request did not retain refusal"
  ok "symlink requests are rejected"
else
  rm -f "$requests/prepare.request.v2.tsv"
  skip "symlink requests are rejected (platform has no real symlinks)"
fi

reset_state
transient_id=66666666666666666666666666666666
transient="$requests/.transient-publication.tmp"
printf 'LOSPOR-HOSPITAL-UPDATE-REQUEST-V2\tprepare\t%s\t1.3.0\t%s\tnone\n' \
  "$transient_id" "$(now)" > "$transient"
ln "$transient" "$requests/prepare.request.v2.tsv"
(sleep 0.2; rm -f "$transient") &
run_agent env
grep -Fxq "prepare	1.3.0	$transient_id" "$work/calls" \
  || fail "the legitimate hard-link publication interval was rejected"
ok "agent tolerates only the bounded link/unlink publication interval"

reset_state
persistent_id=77777777777777777777777777777777
persistent="$work/persistent-request-alias"
printf 'LOSPOR-HOSPITAL-UPDATE-REQUEST-V2\tprepare\t%s\t1.3.0\t%s\tnone\n' \
  "$persistent_id" "$(now)" > "$persistent"
ln "$persistent" "$requests/prepare.request.v2.tsv"
run_agent env
[ ! -s "$work/calls" ] || fail "a persistently hard-linked request ran"
[ "$(code)" = UPDATE_REQUEST_UNSAFE ] || fail "persistent hard link did not retain refusal"
[ -e "$persistent" ] || fail "agent changed the hard-link alias outside the inbox"
rm -f "$persistent"
ok "persistent hard-link aliases are rejected"

reset_state
mkdir -p "$private"
: > "$work/request-lock-alias"
ln "$work/request-lock-alias" "$private/request-agent.lock"
run_agent env
grep -Fxq UPDATE_REQUEST_LOCK_UNSAFE "$work/out" \
  || fail "multiply-linked agent mutex was accepted"
[ ! -s "$work/calls" ] || fail "agent acted while its mutex identity was unsafe"
rm -f "$work/request-lock-alias"
ok "agent refuses an unsafe request-mutex inode before reconciliation"

printf 'update agent tests passed (%s of %s; %s skipped)\n' "$((tests - skipped))" "$tests" "$skipped"
[ "$skipped" -eq 0 ] \
  || printf 'SKIPPED %s update agent assertions on this host; they still need a host that provides what they depend on.\n' "$skipped" >&2
