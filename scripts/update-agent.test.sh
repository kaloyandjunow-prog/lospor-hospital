#!/bin/sh
set -eu

# The update agent's rules, each tested against the harm it prevents.
#
# The agent runs as root and applies releases, so what it refuses matters more
# than what it does. These drive the real script against real files, with the
# apply itself stubbed -- the question here is which requests reach an apply at
# all, not what `update.sh` does once it starts.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
tests=0
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM

MSYS="${MSYS:+$MSYS }winsymlinks:nativestrict"
export MSYS

ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; [ -f "$work/out" ] && sed 's/^/    /' "$work/out" >&2; exit 1; }

home="$work/home"
runtime="$home/.data/runtime"
requests="$runtime/update/requests"
state="$runtime/update/state"
mkdir -p "$requests" "$state" "$work/site/scripts" "$home/.data"

for script in installed-release-state.sh update-agent-loop.sh; do
  cp "$root/scripts/$script" "$work/site/scripts/$script"
done
chmod +x "$work/site/scripts/"*.sh
ln -s "$home" "$work/site/.lospor-home"

# The apply, stubbed. Records that it ran, and can be told to fail.
cat > "$work/site/scripts/update.sh" <<'STUB'
#!/bin/sh
echo ran >> "$APPLY_RECORD"
exit "${APPLY_EXIT:-0}"
STUB
cat > "$work/site/scripts/check-for-update.sh" <<'STUB'
#!/bin/sh
exit 0
STUB
chmod +x "$work/site/scripts/update.sh" "$work/site/scripts/check-for-update.sh"

# An installed release for the agent to compare a request against. The state
# file is validated strictly -- header, version shape, the exact relative path
# derived from the version, and a real digest of the lock it points at -- so the
# fixture builds a real one rather than a plausible-looking line.
installed_root="$home/.data/releases/1.2.0/lospor-hospital-1.2.0"
mkdir -p "$installed_root/.release"
# The state check requires the release to actually be there, not just named.
touch "$installed_root/compose.yaml" "$installed_root/compose.release.yaml"
printf 'LOSPOR-HOSPITAL-RELEASE-LOCK-V2\nrelease\t1.2.0\n' > "$installed_root/.release/release.lock"
installed_sha="$(sha256sum "$installed_root/.release/release.lock" | awk '{print $1}')"
printf '%s  release.lock\n' "$installed_sha" > "$installed_root/.release/release.lock.sha256"
printf 'LOSPOR-HOSPITAL-INSTALLED-RELEASE-V1\t1.2.0\t.data/releases/1.2.0/lospor-hospital-1.2.0\t%s\n' \
  "$installed_sha" > "$home/.data/installed-release.tsv"

request() {
  # requestId targetVersion expectedInstalled sessionKind window
  cat > "$requests/apply.request.v1.json" <<JSON
{"schemaVersion":1,"requestType":"apply-release","requestId":"$1",
 "targetVersion":"$2","targetLockSha256":"$(printf 'target' | sha256sum | awk '{print $1}')",
 "expectedInstalledVersion":"$3","requestedAt":"2026-08-20T12:00:00Z",
 "expiresAt":"$4","sessionKind":"$5","window":"$6"}
JSON
}

soon() { date -u -d "+15 minutes" +%Y-%m-%dT%H:%M:%SZ; }
past() { date -u -d "-15 minutes" +%Y-%m-%dT%H:%M:%SZ; }

run_agent() {
  # One tick. The loop sleeps forever, so it is run with a poll it never
  # reaches: the work of a tick all happens before the first sleep.
  rm -f "$work/apply-record"
  APPLY_RECORD="$work/apply-record" \
  HOSPITAL_UPDATE_AGENT_POLL_SECONDS=5 \
  "$@" \
    timeout 20 sh "$work/site/scripts/update-agent-loop.sh" >"$work/out" 2>&1 || true
}

phase_of() {
  sed -n 's/.*"phase"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$state/update-agent.v1.json" 2>/dev/null | head -1
}
code_of() {
  sed -n 's/.*"resultCode"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$state/update-agent.v1.json" 2>/dev/null | head -1
}
applied() { [ -s "$work/apply-record" ]; }

# 1. The ordinary path: inside the window, everything agrees, it applies.
request aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 1.3.0 1.2.0 "$(soon)" password immediate
run_agent env HOSPITAL_UPDATE_WINDOW_START=00:00 HOSPITAL_UPDATE_WINDOW_END=23:59
applied || fail "a valid request never reached the apply"
[ "$(phase_of)" = completed ] || fail "expected completed, got $(phase_of)"
ok "a request that agrees with the installed release is applied"

# 2. Replay. The ledger has seen this id, so it is refused even though the file
#    is identical -- which is the point: a replayed request looks legitimate.
request aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 1.3.0 1.2.0 "$(soon)" password immediate
run_agent env HOSPITAL_UPDATE_WINDOW_START=00:00 HOSPITAL_UPDATE_WINDOW_END=23:59
applied && fail "a replayed request was applied a second time"
[ "$(code_of)" = UPDATE_REQUEST_REPLAYED ] || fail "expected replay refusal, got $(code_of)"
ok "a request already in the ledger is refused"

# 3. Stale. The request names an installed version that is no longer what is
#    installed, so the operator was approving something other than this.
request bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 1.3.0 1.1.0 "$(soon)" password immediate
run_agent env HOSPITAL_UPDATE_WINDOW_START=00:00 HOSPITAL_UPDATE_WINDOW_END=23:59
applied && fail "a request naming the wrong installed version was applied"
[ "$(code_of)" = UPDATE_REQUEST_STALE ] || fail "expected stale refusal, got $(code_of)"
ok "a request that describes a different appliance is refused"

# 4. Expired.
request cccccccccccccccccccccccccccccccc 1.3.0 1.2.0 "$(past)" password immediate
run_agent env HOSPITAL_UPDATE_WINDOW_START=00:00 HOSPITAL_UPDATE_WINDOW_END=23:59
applied && fail "an expired request was applied"
[ "$(code_of)" = UPDATE_REQUEST_EXPIRED ] || fail "expected expiry refusal, got $(code_of)"
ok "an expired request is refused"

# 5. A recovery session may not apply. It is break-glass for someone who has
#    lost the password; restarting the clinical stack is not that. Checked here
#    as well as in Status, so a compromised Status cannot promote itself.
request dddddddddddddddddddddddddddddddd 1.3.0 1.2.0 "$(soon)" recovery immediate
run_agent env HOSPITAL_UPDATE_WINDOW_START=00:00 HOSPITAL_UPDATE_WINDOW_END=23:59
applied && fail "a recovery session applied an update"
[ "$(code_of)" = UPDATE_REQUEST_SESSION_KIND ] || fail "expected session refusal, got $(code_of)"
ok "a recovery session cannot apply an update"

# 6. Outside the maintenance window a request is queued, not refused. An
#    operator who clicks at two in the afternoon has succeeded.
request eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee 1.3.0 1.2.0 "$(soon)" password scheduled
run_agent env HOSPITAL_UPDATE_WINDOW_START=03:00 HOSPITAL_UPDATE_WINDOW_END=03:01
applied && fail "an update ran outside the maintenance window"
[ "$(phase_of)" = queued ] || fail "expected queued, got $(phase_of)"
[ -e "$requests/apply.request.v1.json" ] || fail "a queued request was consumed instead of kept"
ok "outside the window a request is queued and kept, not refused"

# 7. Override runs it anyway -- a separate, deliberate act.
request ffffffffffffffffffffffffffffffff 1.3.0 1.2.0 "$(soon)" password override
run_agent env HOSPITAL_UPDATE_WINDOW_START=03:00 HOSPITAL_UPDATE_WINDOW_END=03:01
applied || fail "an override did not run outside the window"
ok "an override applies outside the window"

# 8. The activation lock stops everything. It means either an apply is running
#    or a rollback did not finish, and only a person can tell which.
rm -f "$requests/apply.request.v1.json"
: > "$home/.data/release-activation.lock"
request 11111111111111111111111111111111 1.4.0 1.2.0 "$(soon)" password immediate
run_agent env HOSPITAL_UPDATE_WINDOW_START=00:00 HOSPITAL_UPDATE_WINDOW_END=23:59
applied && fail "an update ran on top of an activation lock"
[ "$(phase_of)" = needs-operator ] || fail "expected needs-operator, got $(phase_of)"
[ -e "$home/.data/release-activation.lock" ] || fail "the agent removed the activation lock"
ok "an activation lock stops the agent, and it never clears it"
rm -f "$home/.data/release-activation.lock"

# 9. A failed apply is terminal. One request, one attempt: an agent that retried
#    would turn one operator's intent into two attempts on a clinical database.
request 22222222222222222222222222222222 1.4.0 1.2.0 "$(soon)" password immediate
run_agent env APPLY_EXIT=1 HOSPITAL_UPDATE_WINDOW_START=00:00 HOSPITAL_UPDATE_WINDOW_END=23:59
[ "$(phase_of)" = failed ] || fail "expected failed, got $(phase_of)"
[ ! -e "$requests/apply.request.v1.json" ] || fail "a failed request was left to be retried"
ok "a failed apply is terminal and is not retried"

# 10. A backward clock stops the agent rather than letting it guess. Everything
#     here is time-based: the window, the stamps, expiry.
rm -f "$requests/apply.request.v1.json"
date -u -d "+1 hour" +%s > "$state/agent-last-tick"
run_agent env HOSPITAL_UPDATE_WINDOW_START=00:00 HOSPITAL_UPDATE_WINDOW_END=23:59
grep -q UPDATE_AGENT_CLOCK_BACKWARDS "$work/out" || fail "a backward clock was not refused"
ok "a backward clock stops the agent"

printf 'update agent tests passed (%s)\n' "$tests"
