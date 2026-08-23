#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM
site="$work/site"
home="$site/.lospor-home"
scripts="$site/scripts"
requests="$home/.data/runtime/update/requests"
state="$home/.data/runtime/update/state"
private="$home/.data/update-private"
zoneinfo="$work/zoneinfo"
bin="$work/bin"
mkdir -p "$scripts" "$requests" "$state" "$home/.data" "$zoneinfo/Europe" "$bin"
: > "$zoneinfo/Europe/Sofia"
: > "$home/.data/io-mutation.lock"
chmod 0600 "$home/.data/io-mutation.lock"

# The agent serialises itself against release work through flock. A stub that
# exits 0 makes every one of those refusals pass without excluding anything, so
# a host without flock declares the plan skipped instead.
if ! command -v flock >/dev/null 2>&1; then
  if [ "${HOSPITAL_REQUIRE_FULL_UPDATE_TESTS:-0}" = 1 ]; then
    printf 'Bail out! flock is unavailable and HOSPITAL_REQUIRE_FULL_UPDATE_TESTS=1.\n'
    exit 1
  fi
  printf '1..0 # SKIP the terminology agent suite needs flock, which %s does not provide\n' \
    "$(uname -s 2>/dev/null || echo this platform)"
  printf 'SKIPPED: 0 of 9 terminology agent assertions ran; they still need a host with flock.\n' >&2
  exit 0
fi
# sync is stubbed only where it does not exist. Replacing a working sync would
# neutralise the durability path everywhere, including the Linux hosts that are
# the only place it can be proved.
if ! command -v sync >/dev/null 2>&1; then
  cat > "$bin/sync" <<'STUB'
#!/bin/sh
exit 0
STUB
  chmod +x "$bin/sync"
fi

for name in installed-release-state.sh update-pipeline-lib.sh terminology-agent-lib.sh update-agent-loop.sh; do
  cp "$root/scripts/$name" "$scripts/$name"
done
cat > "$scripts/check-for-update.sh" <<'STUB'
#!/bin/sh
exit 0
STUB
cat > "$scripts/terminology-host-operation.sh" <<'STUB'
#!/bin/sh
printf '%s\t%s\t%s\n' "$1" "$2" "$3" >> "$TERMINOLOGY_CALLS"
[ "${TERMINOLOGY_STUB_FAIL:-0}" != 1 ]
STUB
cat > "$scripts/prepare-verified-release.sh" <<'STUB'
#!/bin/sh
exit 0
STUB
cat > "$scripts/apply-prepared-release.sh" <<'STUB'
#!/bin/sh
exit 0
STUB
chmod +x "$scripts"/*.sh

tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() {
  printf 'not ok %s - %s\n' "$((tests + 1))" "$1" >&2
  [ ! -f "$work/out" ] || sed 's/^/    /' "$work/out" >&2
  exit 1
}
now() { date -u +%s; }
request() {
  action="$1"; id="$2"; package="$3"; operator="$4"; epoch="${5:-$(now)}"
  printf 'LOSPOR-HOSPITAL-TERMINOLOGY-REQUEST-V1\t%s\t%s\t%s\t%s\t%s\n' \
    "$action" "$id" "$package" "$epoch" "$operator" > "$requests/terminology.request.v1.tsv"
}
reset_state() {
  rm -rf "$private" "$home/.data/terminology"
  rm -f "$requests"/* "$state"/* "$work/calls" 2>/dev/null || true
  mkdir -p "$requests" "$state"
}
run_agent() {
  PATH="$bin:$PATH" TERMINOLOGY_CALLS="$work/calls" HOSPITAL_UPDATE_AGENT_ONESHOT=1 \
    HOSPITAL_UPDATE_TEST_ONLY=1 HOSPITAL_UPDATE_TEST_ZONEINFO_ROOT="$zoneinfo" \
    HOSPITAL_UPDATE_AGENT_POLL_SECONDS=5 HOSPITAL_UPDATE_CHECK_INTERVAL_SECONDS=999999 \
    HOSPITAL_UPDATE_TIMEZONE=Europe/Sofia "$@" sh "$scripts/update-agent-loop.sh" \
    > "$work/out" 2>&1 || true
}
projection_code() {
  sed -n 's/.*"resultCode":"\([^"]*\)".*/\1/p' "$state/terminology-agent.v1.json" | head -1
}

reset_state
request import aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa approved-2026.08 status-operator-0123456789abcdef
run_agent env
grep -Fxq 'import	approved-2026.08	status-operator-0123456789abcdef' "$work/calls" \
  || fail "valid import did not reach the fixed host wrapper"
[ "$(projection_code)" = TERMINOLOGY_IMPORT_COMPLETED ] \
  || fail "successful import was not projected"
[ ! -e "$requests/terminology.request.v1.tsv" ] || fail "request remained in the public inbox"
ok "fixed import intent reaches only the packaged terminology wrapper"

reset_state
for bad in '../licensed' 'nested/package' '.hidden' 'package name' 'C:\licensed'; do
  request import bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb "$bad" status-operator-0123456789abcdef
  run_agent env
  [ ! -s "$work/calls" ] || fail "unsafe package label reached the host wrapper"
  rm -f "$requests/terminology.request.v1.tsv"
done
[ "$(projection_code)" = TERMINOLOGY_REQUEST_MALFORMED ] \
  || fail "malformed package label did not retain a fixed refusal"
ok "paths, nested directories, hidden labels and whitespace are rejected"

reset_state
request rollback cccccccccccccccccccccccccccccccc chosen-database status-operator-0123456789abcdef
run_agent env
[ ! -s "$work/calls" ] || fail "rollback accepted a browser-selected target"
[ "$(projection_code)" = TERMINOLOGY_REQUEST_MALFORMED ] || fail "targeted rollback was not refused"
ok "rollback can select only retained host state"

reset_state
request import dddddddddddddddddddddddddddddddd approved status-operator-0123456789abcdef "$(( $(now) - 8 * 86400 ))"
run_agent env
[ ! -s "$work/calls" ] || fail "expired request ran"
[ "$(projection_code)" = TERMINOLOGY_REQUEST_EXPIRED ] || fail "expired request lost its exact refusal"
ok "terminology requests have a bounded durable age"

reset_state
request finalize eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee - status-operator-0123456789abcdef
run_agent env
request finalize eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee - status-operator-0123456789abcdef
run_agent env
[ "$(wc -l < "$work/calls" | tr -d '[:space:]')" = 1 ] || fail "terminal request ID was replayed"
[ "$(projection_code)" = TERMINOLOGY_REQUEST_REPLAYED ] || fail "replay was not projected"
ok "durable terminal markers prevent replay"

reset_state
request resume ffffffffffffffffffffffffffffffff approved status-operator-0123456789abcdef
run_agent env TERMINOLOGY_STUB_FAIL=1
[ "$(projection_code)" = TERMINOLOGY_RESUME_FAILED ] || fail "failed resume was not projected"
[ -s "$private/terminology/journal.v1.tsv" ] || fail "terminal provenance journal is missing"
grep -Fq 'status-operator-0123456789abcdef' "$private/terminology/journal.v1.tsv" \
  || fail "pseudonymous operator provenance was not retained"
ok "failed operations retain bounded terminal provenance"

reset_state
mkdir -p "$private/terminology/inflight" "$private/terminology/terminal"
printf 'LOSPOR-HOSPITAL-TERMINOLOGY-TRANSITION-V1\t%s\tRUNNING\trollback\t%s\t-\tTERMINOLOGY_ROLLBACK_RUNNING\tstatus-operator-0123456789abcdef\n' \
  "$(now)" 11111111111111111111111111111111 > "$private/terminology/transition.v1.tsv"
printf 'evidence\n' > "$private/terminology/inflight/terminology.request.v1.tsv"
run_agent env
[ ! -s "$work/calls" ] || fail "ambiguous operation was retried"
[ "$(projection_code)" = TERMINOLOGY_AMBIGUOUS_OPERATION ] || fail "ambiguous operation did not stop for review"
[ -e "$private/terminology/inflight/terminology.request.v1.tsv" ] || fail "ambiguous evidence was removed"
ok "a host restart never retries an ambiguous terminology mutation"

reset_state
mkdir -p "$home/.data/terminology"
printf 'LOSPOR-HOSPITAL-TERMINOLOGY-V1\t%s\thospital-omop\t2026.08\t2026-08-23T08:00:00Z\tconsole-user\tlospor_previous_20260823_abcdef\trun-private\n' \
  "$(printf manifest | sha256sum | awk '{print $1}')" > "$home/.data/terminology/active.tsv"
printf 'LOSPOR-HOSPITAL-TERMINOLOGY-PENDING-V1\t%s\tlospor_term_private\tlospor_previous_private\tvalidated\trun-private\n' \
  "$(printf pending | sha256sum | awk '{print $1}')" > "$home/.data/terminology/pending.tsv"
run_agent env
grep -Fq '"packageId":"hospital-omop"' "$state/terminology-agent.v1.json" \
  || fail "active package provenance was not projected"
grep -Fq '"pendingPhase":"validated"' "$state/terminology-agent.v1.json" \
  || fail "pending phase was not projected"
for private_value in lospor_previous_ run-private console-user lospor_term_private; do
  ! grep -Fq "$private_value" "$state/terminology-agent.v1.json" \
    || fail "private host state crossed the projection: $private_value"
done
ok "projection exposes package provenance but no database, run, operator or path"

reset_state
request import 22222222222222222222222222222222 approved status-operator-0123456789abcdef
printf 'LOSPOR-HOSPITAL-UPDATE-REQUEST-V2\tprepare\t%s\t1.3.0\t%s\tnone\n' \
  33333333333333333333333333333333 "$(now)" > "$requests/prepare.request.v2.tsv"
run_agent env
[ ! -s "$work/calls" ] || fail "terminology ran beside a waiting release operation"
[ "$(projection_code)" = TERMINOLOGY_MAINTENANCE_BUSY ] || fail "maintenance conflict was not projected"
ok "terminology refuses to chain silently with a waiting release request"

printf 'terminology agent tests passed (%s)\n' "$tests"
