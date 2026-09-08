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

# Retention is a legal obligation, not a delivery concern, so it runs on its own
# clock inside the same loop. It had no clock at all: the route's comment points
# at Vercel Cron and a vercel.json, neither of which exists on an appliance, so
# account anonymisation and rate-limit pruning had never run on a hospital box.
retention_interval="${HOSPITAL_RETENTION_INTERVAL_SECONDS:-86400}"
retention_marker="${signals}/retention-status.v1.json"
retention_stamp="${signals}/retention-last-attempt"
case "$retention_interval" in
  ''|*[!0-9]*) echo RETENTION_INTERVAL_INVALID >&2; exit 2 ;;
esac
[ "$retention_interval" -ge 60 ] || { echo RETENTION_INTERVAL_INVALID >&2; exit 2; }

# Closing cases whose review window elapsed also had no clock here. The route
# has existed all along and the serverless deployment runs it from Vercel Cron,
# which an appliance does not have -- so on a hospital box the only thing that
# ever closed a case was a clinician happening to have the case open when the
# countdown ran out. A case nobody was watching stayed open indefinitely.
#
# Its own clock, in minutes: the review window is thirty minutes, so the daily
# retention cadence would be useless and the sixty-second delivery cadence is
# more traffic than a thirty-minute window needs.
close_interval="${HOSPITAL_CASE_CLOSE_INTERVAL_SECONDS:-300}"
close_marker="${signals}/case-close-status.v1.json"
close_stamp="${signals}/case-close-last-attempt"
case "$close_interval" in
  ''|*[!0-9]*) echo CASE_CLOSE_INTERVAL_INVALID >&2; exit 2 ;;
esac
[ "$close_interval" -ge 60 ] || { echo CASE_CLOSE_INTERVAL_INVALID >&2; exit 2; }

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

write_retention_marker() {
  state="$1"
  code="$2"
  observed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  temporary="${retention_marker}.tmp.$$"
  trap 'rm -f "$temporary"' EXIT HUP INT TERM
  printf '{"schemaVersion":1,"signalType":"retention","observedAt":"%s","state":"%s","resultCode":"%s"}\n' \
    "$observed_at" "$state" "$code" > "$temporary"
  mv "$temporary" "$retention_marker"
  trap - EXIT HUP INT TERM
}

run_retention() {
  # The attempt is stamped before the result is known, so a failing endpoint is
  # retried on the retention clock rather than on the 60-second delivery clock.
  # A purge that slips a day is recoverable; hammering a broken endpoint every
  # minute for a day is not, and the marker is what surfaces the failure.
  date -u +%s > "$retention_stamp"

  set +e
  http_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
    --max-time 60 \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    http://api:3002/v1/internal/purge-deleted)"
  status=$?
  set -e

  if [ "$status" -ne 0 ]; then
    echo "RETENTION_API_UNAVAILABLE" >&2
    write_retention_marker FAILURE RETENTION_API_UNAVAILABLE
    return 0
  fi
  case "$(printf '%s' "$http_status" | cut -c1)" in
    2) echo "RETENTION_COMPLETED"; write_retention_marker SUCCESS RETENTION_COMPLETED ;;
    *) echo "RETENTION_REJECTED http=${http_status}" >&2
       write_retention_marker FAILURE RETENTION_REJECTED ;;
  esac
}

retention_due() {
  [ -f "$retention_stamp" ] || return 0
  last="$(cat "$retention_stamp" 2>/dev/null || echo 0)"
  case "$last" in ''|*[!0-9]*) return 0 ;; esac
  now="$(date -u +%s)"
  [ "$((now - last))" -ge "$retention_interval" ]
}

write_close_marker() {
  state="$1"
  code="$2"
  observed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  temporary="${close_marker}.tmp.$$"
  trap 'rm -f "$temporary"' EXIT HUP INT TERM
  printf '{"schemaVersion":1,"signalType":"case-close","observedAt":"%s","state":"%s","resultCode":"%s"}\n' \
    "$observed_at" "$state" "$code" > "$temporary"
  mv "$temporary" "$close_marker"
  trap - EXIT HUP INT TERM
}

run_case_close() {
  # Stamped before the result, for the same reason retention is: a failing
  # endpoint is then retried on its own clock rather than on the delivery
  # worker's, and the marker is what makes the failure visible.
  date -u +%s > "$close_stamp"

  set +e
  http_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
    --max-time 60 \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    http://api:3002/v1/internal/close-expired-cases)"
  status=$?
  set -e

  if [ "$status" -ne 0 ]; then
    echo "CASE_CLOSE_API_UNAVAILABLE" >&2
    write_close_marker FAILURE CASE_CLOSE_API_UNAVAILABLE
    return 0
  fi
  case "$(printf '%s' "$http_status" | cut -c1)" in
    2) echo "CASE_CLOSE_COMPLETED"; write_close_marker SUCCESS CASE_CLOSE_COMPLETED ;;
    *) echo "CASE_CLOSE_REJECTED http=${http_status}" >&2
       write_close_marker FAILURE CASE_CLOSE_REJECTED ;;
  esac
}

case_close_due() {
  [ -f "$close_stamp" ] || return 0
  last="$(cat "$close_stamp" 2>/dev/null || echo 0)"
  case "$last" in ''|*[!0-9]*) return 0 ;; esac
  now="$(date -u +%s)"
  [ "$((now - last))" -ge "$close_interval" ]
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

  if case_close_due; then
    run_case_close
  fi

  if retention_due; then
    run_retention
  fi

  sleep "$interval"
done
