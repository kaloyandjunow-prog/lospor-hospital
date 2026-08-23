#!/bin/sh
set -eu

umask 077

script_dir="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
object_lib="${HOSPITAL_BACKUP_OBJECT_LIB:-/usr/local/bin/backup-object-lib.sh}"
[ -f "$object_lib" ] || object_lib="$script_dir/backup-object-lib.sh"
. "$object_lib"

interval="${HOSPITAL_BACKUP_INTERVAL_SECONDS:-14400}"
retry_interval="${HOSPITAL_BACKUP_RETRY_SECONDS:-300}"
backup_dir="${HOSPITAL_BACKUP_DIR:-/backups}"
max_cycles="${HOSPITAL_BACKUP_LOOP_MAX_CYCLES:-0}"

case "$interval" in ''|*[!0-9]*|0) printf '%s\n' BACKUP_INTERVAL_INVALID >&2; exit 2 ;; esac
case "$retry_interval" in ''|*[!0-9]*|0) printf '%s\n' BACKUP_RETRY_INTERVAL_INVALID >&2; exit 2 ;; esac
case "$max_cycles" in ''|*[!0-9]*) printf '%s\n' BACKUP_LOOP_MAX_CYCLES_INVALID >&2; exit 2 ;; esac
[ -d "$backup_dir" ] && [ ! -L "$backup_dir" ] || {
  printf '%s\n' BACKUP_DIRECTORY_INVALID >&2
  exit 2
}

loop_now() {
  if [ -n "${HOSPITAL_BACKUP_NOW_COMMAND:-}" ]; then
    case "$HOSPITAL_BACKUP_NOW_COMMAND" in /*) ;; *) return 1 ;; esac
    "$HOSPITAL_BACKUP_NOW_COMMAND"
  else
    date -u +%s
  fi
}

loop_sleep() {
  sleep_seconds="$1"
  if [ -n "${HOSPITAL_BACKUP_SLEEP_COMMAND:-}" ]; then
    case "$HOSPITAL_BACKUP_SLEEP_COMMAND" in /*) ;; *) return 1 ;; esac
    "$HOSPITAL_BACKUP_SLEEP_COMMAND" "$sleep_seconds"
  else
    sleep "$sleep_seconds"
  fi
}

# The durable marker belongs to the shared backup volume. A restarted
# scheduler sleeps only the remaining time, rather than creating a duplicate
# merely because its container restarted.
startup_object=""
startup_marker_epoch=""
startup_verified=0
if backup_read_last_verified; then
  startup_object="$backup_last_object"
  startup_marker_epoch="$backup_last_completed_epoch"
  if backup_verify_object "$startup_object" integrity \
      && [ "$backup_manifest_completed_epoch" = "$startup_marker_epoch" ]; then
    startup_verified=1
  else
    printf '%s\n' BACKUP_FRESHNESS_MARKER_INVALID >&2
  fi
fi
if [ "$startup_verified" -eq 0 ] && backup_find_latest_verified; then
  startup_object="$backup_latest_object"
  startup_marker_epoch="$backup_latest_completed_epoch"
  if backup_verify_object "$startup_object" integrity \
      && [ "$backup_manifest_completed_epoch" = "$startup_marker_epoch" ]; then
    startup_verified=1
  fi
fi
if [ "$startup_verified" -eq 1 ]; then
  startup_now="$(loop_now)" || { printf '%s\n' BACKUP_CLOCK_INVALID >&2; exit 2; }
  backup_is_uint "$startup_now" || { printf '%s\n' BACKUP_CLOCK_INVALID >&2; exit 2; }
  startup_age=$((startup_now - startup_marker_epoch))
  if [ "$startup_age" -ge 0 ] && [ "$startup_age" -lt "$interval" ]; then
    remaining=$((interval - startup_age))
    printf '%s %s\n' BACKUP_FRESH_SLEEP_SECONDS "$remaining"
    loop_sleep "$remaining"
  fi
fi

cycle_count=0
while :; do
  # Retention remains downstream of an authenticated backup or an explicitly
  # reused fresh recovery point. A failed attempt never expires older data.
  if HOSPITAL_BACKUP_KIND=scheduled sh "${HOSPITAL_BACKUP_CYCLE_COMMAND:-/usr/local/bin/backup-cycle.sh}"; then
    next_interval="$interval"
  else
    next_interval="$retry_interval"
  fi
  cycle_count=$((cycle_count + 1))
  if [ "$max_cycles" -gt 0 ] && [ "$cycle_count" -ge "$max_cycles" ]; then
    exit 0
  fi

  loop_sleep "$next_interval"
done
