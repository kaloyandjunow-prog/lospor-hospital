#!/bin/sh
set -eu

interval="${HOSPITAL_DELIVERY_INTERVAL_SECONDS:-60}"
signals="${HOSPITAL_SIGNALS_DIR:-/signals}"
marker="${signals}/delivery-worker-status.v1.json"
mkdir -p "$signals"
case "$interval" in
  ''|*[!0-9]*) echo DELIVERY_INTERVAL_INVALID >&2; exit 2 ;;
esac
[ "$interval" -ge 5 ] || { echo DELIVERY_INTERVAL_INVALID >&2; exit 2; }

write_marker() {
  state="$1"
  code="$2"
  category="$3"
  observed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  temporary="${marker}.tmp.$$"
  trap 'rm -f "$temporary"' EXIT HUP INT TERM
  if [ "$category" -gt 0 ] 2>/dev/null; then
    printf '{"schemaVersion":1,"signalType":"delivery-worker","observedAt":"%s","state":"%s","resultCode":"%s","httpStatusCategory":%s}\n' \
      "$observed_at" "$state" "$code" "$category" > "$temporary"
  else
    printf '{"schemaVersion":1,"signalType":"delivery-worker","observedAt":"%s","state":"%s","resultCode":"%s"}\n' \
      "$observed_at" "$state" "$code" > "$temporary"
  fi
  mv "$temporary" "$marker"
  trap - EXIT HUP INT TERM
}

while true; do
  set +e
  http_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
    --max-time 30 \
    -X POST \
    -H "Authorization: Bearer ${HOSPITAL_WORKER_TOKEN}" \
    http://api:3002/v1/internal/hospital-delivery/process)"
  curl_status=$?
  set -e

  if [ "$curl_status" -ne 0 ]; then
    write_marker FAILURE API_UNAVAILABLE 0
  else
    category="$(printf '%s' "$http_status" | cut -c1)"
    case "$category" in
      2) write_marker SUCCESS PROCESS_REQUEST_ACCEPTED "$category" ;;
      *) write_marker FAILURE PROCESS_REQUEST_REJECTED "${category:-0}" ;;
    esac
  fi

  sleep "$interval"
done
