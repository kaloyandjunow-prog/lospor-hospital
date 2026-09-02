#!/bin/sh
set -eu

# Drives the EHR adapter.
#
# There is no scheduler in the appliance, so nothing happens unless something
# asks. This container asks: twice per interval it tells the API to send what is
# due and to read what the hospital left. All the work happens in the API — this
# only decides when, which is why it can be a curl image rather than an
# eleventh release image carrying a runtime of its own.
#
# Both calls are independent. A hospital system that has stopped reading its
# outbox must not stop us staging what it has already written, and a full
# inbox must not hold up a protocol that is due to go.

interval="${HOSPITAL_EHR_INTERVAL_SECONDS:-60}"
case "$interval" in
  ''|*[!0-9]*) echo EHR_INTERVAL_INVALID >&2; exit 2 ;;
esac
# Below five seconds this stops being a poll and becomes a busy loop against
# the clinical API.
[ "$interval" -ge 5 ] || { echo EHR_INTERVAL_INVALID >&2; exit 2; }

[ -n "${HOSPITAL_WORKER_TOKEN:-}" ] || { echo EHR_WORKER_TOKEN_MISSING >&2; exit 2; }

call() {
  # Never prints a response body: these carry clinical content.
  set +e
  status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
    --max-time 60 \
    -X POST \
    -H "Authorization: Bearer ${HOSPITAL_WORKER_TOKEN}" \
    "http://api:3002$1")"
  rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    echo "EHR_API_UNAVAILABLE $1" >&2
  elif [ "${status%"${status#?}"}" != "2" ]; then
    echo "EHR_CALL_FAILED $1 $status" >&2
  fi
}

while true; do
  call /v1/internal/ehr-delivery/process
  call /v1/internal/ehr-import/scan
  sleep "$interval"
done
