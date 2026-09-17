#!/bin/sh
# Tests the delivery worker loop, and in particular the retention schedule the
# appliance never had: the purge route's own comment points at Vercel Cron and a
# vercel.json, neither of which exists on a hospital box, so nothing called it.
#
# The loop runs forever by design. `sleep` is stubbed to signal its parent, so
# exactly one pass runs and becomes observable -- a stub that merely exits would
# end the stub and leave the loop spinning.
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
loop="$root/infra/delivery/worker-loop.sh"
failures=0

pass() { printf 'PASS  %s\n' "$1"; }
fail() { failures=$((failures + 1)); printf 'FAIL  %s\n' "$1" >&2; }

# A working directory with stubbed curl and sleep. $1 is the HTTP code returned
# to the two CRON_SECRET routes (retention and case closure); delivery is always
# 200, since these tests are about the schedules bolted onto its loop.
make_work() {
  work="$(mktemp -d)"
  mkdir -p "$work/bin" "$work/signals"
  calls="$work/calls"
  : > "$calls"

  cat > "$work/bin/curl" <<STUB
#!/bin/sh
for arg in "\$@"; do
  case "\$arg" in
    *purge-deleted)
      echo "retention \$*" >> "$calls"; printf '%s' "${1:-200}"; exit 0 ;;
    *ehr-import/purge)
      echo "ehrpurge \$*" >> "$calls"; printf '%s' "\${EHR_PURGE_STATUS:-200}"; exit 0 ;;
    *close-expired-cases)
      echo "caseclose \$*" >> "$calls"; printf '%s' "${1:-200}"; exit 0 ;;
    *hospital-delivery/process)
      echo "delivery \$*" >> "$calls"; printf '200'; exit 0 ;;
  esac
done
exit 0
STUB
  printf '#!/bin/sh\nkill -TERM "$PPID" 2>/dev/null\nexit 0\n' > "$work/bin/sleep"
  chmod +x "$work/bin/curl" "$work/bin/sleep"
}

run_loop() {
  # The stub sleep terminates the loop with a signal, which the calling shell
  # would otherwise announce as "Terminated" on every pass. Reaping it inside a
  # subshell whose stderr is discarded keeps the test output readable.
  (
    PATH="$work/bin:$PATH" \
    HOSPITAL_SIGNALS_DIR="$work/signals" \
    HOSPITAL_WORKER_TOKEN=delivery-token \
    CRON_SECRET=retention-secret \
    sh "$loop" >/dev/null 2>&1 || true
  ) 2>/dev/null || true
}

# 1. A fresh appliance purges on its first pass rather than waiting a day.
make_work 200
run_loop
if grep -q "^retention " "$calls"; then
  pass "retention runs on a fresh appliance"
else
  fail "retention did not run when no previous attempt was recorded"
fi

# 2. It authenticates with CRON_SECRET, which is what the route actually checks.
#    The worker only ever had HOSPITAL_WORKER_TOKEN, so it could not have called
#    this route even if something had scheduled it.
if grep "^retention " "$calls" | grep -q "Bearer retention-secret"; then
  pass "retention presents CRON_SECRET"
else
  fail "retention did not present CRON_SECRET"
fi
if grep "^delivery " "$calls" | grep -q "Bearer delivery-token"; then
  pass "delivery still presents HOSPITAL_WORKER_TOKEN"
else
  fail "delivery bearer changed"
fi

# 3. A successful purge is recorded where the status page reads it.
signal="$work/signals/retention-status.v1.json"
if grep -q '"signalType":"retention"' "$signal" \
  && grep -q '"state":"SUCCESS"' "$signal" \
  && grep -q '"resultCode":"RETENTION_COMPLETED"' "$signal"; then
  pass "a successful purge writes a SUCCESS retention signal"
else
  fail "retention success signal missing or malformed"
fi

# 4. Delivery is untouched by all of this.
if grep -q '"signalType":"delivery-worker"' "$work/signals/delivery-worker-status.v1.json"; then
  pass "delivery signal still written"
else
  fail "delivery signal missing"
fi

# 5. Having just run, it does not run again on the next pass.
: > "$calls"
run_loop
if grep -q "^retention " "$calls"; then
  fail "retention ran twice inside its interval"
else
  pass "retention does not repeat inside its interval"
fi

# 6. Once the interval has elapsed, it runs again.
echo 0 > "$work/signals/retention-last-attempt"
: > "$calls"
run_loop
if grep -q "^retention " "$calls"; then
  pass "retention runs again once its interval has elapsed"
else
  fail "retention did not run after its interval elapsed"
fi

# 7. A refused purge is an outage the status page can see, not a silent skip.
make_work 403
run_loop
signal="$work/signals/retention-status.v1.json"
if grep -q '"state":"FAILURE"' "$signal" \
  && grep -q '"resultCode":"RETENTION_REJECTED"' "$signal"; then
  pass "a refused purge writes a FAILURE retention signal"
else
  fail "a refused purge did not surface as a failure"
fi

# 7b. The same daily run deletes EHR staging data past its window, with the same
#     secret, and a refused EHR purge is a failed retention run on Status.
make_work 200
run_loop
if grep "^ehrpurge " "$calls" | grep -q "Bearer retention-secret" \
  && grep -q '"resultCode":"RETENTION_COMPLETED"' "$work/signals/retention-status.v1.json"; then
  pass "retention also purges EHR staging data with CRON_SECRET"
else
  fail "retention did not purge EHR staging data"
fi
make_work 200
EHR_PURGE_STATUS=500
export EHR_PURGE_STATUS
run_loop
unset EHR_PURGE_STATUS
if grep -q '"state":"FAILURE"' "$work/signals/retention-status.v1.json" \
  && grep -q '"resultCode":"RETENTION_EHR_STAGING_REJECTED"' "$work/signals/retention-status.v1.json"; then
  pass "a refused EHR staging purge surfaces as a failed retention run"
else
  fail "a refused EHR staging purge did not surface as a failure"
fi

# 8. The attempt is stamped even when it failed, so a broken endpoint is retried
#    on the retention clock rather than hammered every 60 seconds for a day.
if [ -f "$work/signals/retention-last-attempt" ]; then
  pass "a failed purge still records its attempt"
else
  fail "a failed purge left no attempt stamp, so it would retry every pass"
fi

# 9. Automatic case closure, which had no clock here at all until 1.3.0. The
#    route existed and the serverless deployment ran it from Vercel Cron; on an
#    appliance a case closed only if a clinician happened to be looking at it
#    when its thirty-minute window ran out, and one nobody returned to stayed
#    open indefinitely.
make_work 200
run_loop
if grep -q "^caseclose " "$calls"; then
  pass "case closure runs on a fresh appliance"
else
  fail "case closure did not run"
fi
if grep "^caseclose " "$calls" | grep -q "Bearer retention-secret"; then
  pass "case closure presents CRON_SECRET"
else
  fail "case closure did not present CRON_SECRET"
fi
signal="$work/signals/case-close-status.v1.json"
if grep -q '"signalType":"case-close"' "$signal" \
  && grep -q '"state":"SUCCESS"' "$signal" \
  && grep -q '"resultCode":"CASE_CLOSE_COMPLETED"' "$signal"; then
  pass "a successful sweep writes a SUCCESS case-close signal"
else
  fail "case-close success signal missing or malformed"
fi

# 10. It keeps its own clock. Running on every 60-second delivery pass would be
#     four times the traffic a thirty-minute window can possibly need.
: > "$calls"
run_loop
if grep -q "^caseclose " "$calls"; then
  fail "case closure ran again inside its interval"
else
  pass "case closure does not repeat inside its interval"
fi
echo 0 > "$work/signals/case-close-last-attempt"
: > "$calls"
run_loop
if grep -q "^caseclose " "$calls"; then
  pass "case closure runs again once its interval has elapsed"
else
  fail "case closure did not run after its interval elapsed"
fi

# 11. A refused sweep is visible on the status page, and still stamps its
#     attempt so a broken endpoint is not retried every 60 seconds.
make_work 403
run_loop
signal="$work/signals/case-close-status.v1.json"
if grep -q '"state":"FAILURE"' "$signal" \
  && grep -q '"resultCode":"CASE_CLOSE_REJECTED"' "$signal"; then
  pass "a refused sweep writes a FAILURE case-close signal"
else
  fail "a refused sweep did not surface as a failure"
fi
if [ -f "$work/signals/case-close-last-attempt" ]; then
  pass "a failed sweep still records its attempt"
else
  fail "a failed sweep left no attempt stamp, so it would retry every pass"
fi

# 12. Its interval is validated like the others rather than quietly coerced.
make_work 200
if PATH="$work/bin:$PATH" HOSPITAL_SIGNALS_DIR="$work/signals" \
  HOSPITAL_CASE_CLOSE_INTERVAL_SECONDS=nope \
  HOSPITAL_WORKER_TOKEN=t CRON_SECRET=s sh "$loop" >/dev/null 2>&1; then
  fail "a non-numeric case-close interval was accepted"
else
  pass "a non-numeric case-close interval is refused"
fi

# 13. A nonsensical interval stops the worker rather than being quietly coerced.
make_work 200
RETENTION_INTERVAL=nope
if PATH="$work/bin:$PATH" HOSPITAL_SIGNALS_DIR="$work/signals" \
  HOSPITAL_RETENTION_INTERVAL_SECONDS=nope \
  HOSPITAL_WORKER_TOKEN=t CRON_SECRET=s sh "$loop" >/dev/null 2>&1; then
  fail "a non-numeric retention interval was accepted"
else
  pass "a non-numeric retention interval is refused"
fi
if PATH="$work/bin:$PATH" HOSPITAL_SIGNALS_DIR="$work/signals" \
  HOSPITAL_RETENTION_INTERVAL_SECONDS=5 \
  HOSPITAL_WORKER_TOKEN=t CRON_SECRET=s sh "$loop" >/dev/null 2>&1; then
  fail "an implausibly short retention interval was accepted"
else
  pass "an implausibly short retention interval is refused"
fi
unset RETENTION_INTERVAL

printf '\n%s failure(s).\n' "$failures"
[ "$failures" -eq 0 ] || exit 1
