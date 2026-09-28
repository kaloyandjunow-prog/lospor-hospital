#!/bin/sh
# Tests the EHR worker loop (1.4.x; coverage review 1.4.13): it refuses a
# setting that would hammer the API or cannot authenticate, calls both routes
# each pass with the worker token, keeps going when one fails, and never
# prints a response body -- those carry clinical content.
#
# As in worker-loop.test.sh, `sleep` is stubbed to signal its parent so that
# exactly one pass runs.
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
loop="$root/infra/delivery/ehr-worker-loop.sh"
failures=0

pass() { printf 'PASS  %s\n' "$1"; }
fail() { failures=$((failures + 1)); printf 'FAIL  %s\n' "$1" >&2; }

# $1: HTTP code for the delivery route; $2: for the import scan ("down" makes
# curl itself fail, as with the API container stopped).
make_work() {
  work="$(mktemp -d)"
  mkdir -p "$work/bin"
  calls="$work/calls"
  : > "$calls"
  cat > "$work/bin/curl" <<STUB
#!/bin/sh
for arg in "\$@"; do
  case "\$arg" in
    *ehr-delivery/process) echo "delivery \$*" >> "$calls"; code="$1" ;;
    *ehr-import/scan) echo "scan \$*" >> "$calls"; code="$2" ;;
  esac
done
[ "\$code" = down ] && exit 7
# Like curl: the body goes to stdout unless it is sent elsewhere. It stands
# for clinical content, which must never reach the log.
case " \$* " in *" --output /dev/null "*) ;; *) printf 'PATIENT-BODY' ;; esac
printf '%s' "\$code"
exit 0
STUB
  printf '#!/bin/sh\nkill -TERM "$PPID" 2>/dev/null\nexit 0\n' > "$work/bin/sleep"
  chmod +x "$work/bin/curl" "$work/bin/sleep"
}

# Runs one pass; the loop's stderr is kept for the checks.
# (dash adds its own "Terminated" when the stub sleep ends the loop; that line
# is the harness, not the worker, and the quiet checks leave it out.)
run_loop() {
  (
    PATH="$work/bin:$PATH" \
    HOSPITAL_WORKER_TOKEN="${TOKEN-worker-token}" \
    HOSPITAL_EHR_INTERVAL_SECONDS="${INTERVAL-60}" \
    sh "$loop" >/dev/null 2>"$work/stderr" || echo "$?" > "$work/exit"
  ) 2>/dev/null || true
}

exit_code() { cat "$work/exit" 2>/dev/null || echo none; }

# 1. Settings that would busy-loop the clinical API or cannot authenticate.
for bad in abc 4 0 -5; do
  make_work 200 200
  INTERVAL="$bad" run_loop
  if [ "$(exit_code)" = 2 ] && grep -q EHR_INTERVAL_INVALID "$work/stderr" && [ ! -s "$calls" ]; then
    pass "interval '$bad' is refused before any call"
  else
    fail "interval '$bad' was not refused"
  fi
done
make_work 200 200
INTERVAL="" run_loop
if [ "$(exit_code)" != 2 ] && grep -q "^delivery " "$calls"; then
  pass "an empty interval falls back to the default and runs"
else
  fail "an empty interval did not fall back to the default"
fi
make_work 200 200
TOKEN="" run_loop
if [ "$(exit_code)" = 2 ] && grep -q EHR_WORKER_TOKEN_MISSING "$work/stderr" && [ ! -s "$calls" ]; then
  pass "a missing worker token is refused before any call"
else
  fail "a missing worker token was not refused"
fi

# 2. One pass calls both routes, delivery first, with the worker token.
make_work 200 204
run_loop
if [ "$(cut -d' ' -f1 "$calls" | tr '\n' ' ')" = "delivery scan " ] \
  && ! grep -v "Bearer worker-token" "$calls" | grep -q . \
  && ! grep -v "^Terminated$" "$work/stderr" | grep -q .; then
  pass "both routes are called with the worker token, quietly on success"
else
  fail "the pass did not call both routes with the worker token"
fi

# 3. A refused delivery does not hold up the import scan, and says only the code.
make_work 503 200
run_loop
if grep -q "^scan " "$calls" && grep -qx "EHR_CALL_FAILED /v1/internal/ehr-delivery/process 503" "$work/stderr"; then
  pass "a failed delivery is reported by code and the scan still runs"
else
  fail "a failed delivery stopped the scan or was not reported"
fi

# 4. An API that is not answering is named as such, not as a failed call.
#    The first call is the unreachable one, so carrying on means the second is made.
make_work down 200
run_loop
if grep -qx "EHR_API_UNAVAILABLE /v1/internal/ehr-delivery/process" "$work/stderr" && grep -q "^scan " "$calls"; then
  pass "an unreachable API is reported and the loop carries on"
else
  fail "an unreachable API stopped the loop or was misreported"
fi

# 5. No response body ever reaches the log, whatever the call returned.
for codes in "200 204" "500 200"; do
  set -- $codes
  make_work "$1" "$2"
  run_loop
  if grep -q PATIENT-BODY "$work/stderr"; then fail "a response body reached the log ($codes)"; else pass "no response body in the log ($codes)"; fi
done

rm -rf -- "$work"
if [ "$failures" -gt 0 ]; then
  echo "$failures EHR worker loop check(s) failed" >&2
  exit 1
fi
echo "ehr-worker-loop: ok"
