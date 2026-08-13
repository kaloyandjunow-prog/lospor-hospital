#!/bin/sh
set -eu

umask 077
interval="${HOSPITAL_BACKUP_INTERVAL_SECONDS:-86400}"
retry_interval="${HOSPITAL_BACKUP_RETRY_SECONDS:-300}"
retention="${HOSPITAL_BACKUP_RETENTION_DAYS:-30}"

case "$interval" in
  ''|*[!0-9]*|0) printf '%s\n' BACKUP_INTERVAL_INVALID >&2; exit 2 ;;
esac
case "$retention" in
  ''|*[!0-9]*) printf '%s\n' BACKUP_RETENTION_INVALID >&2; exit 2 ;;
esac
case "$retry_interval" in
  ''|*[!0-9]*|0) printf '%s\n' BACKUP_RETRY_INTERVAL_INVALID >&2; exit 2 ;;
esac

while true; do
  # backup-cycle writes the durable success/failure marker and runs retention
  # only after a newly verified backup. A failed attempt must not terminate the
  # scheduler, otherwise there would be no later recovery.
  if sh /usr/local/bin/backup-cycle.sh; then
    next_interval="$interval"
  else
    next_interval="$retry_interval"
  fi
  if ! find /backups -type f \( -name '.lospor-*.tmp.*' -o -name '.lospor-*.sha256.tmp.*' \) -mtime +1 -delete; then
    printf '%s\n' BACKUP_TEMP_CLEANUP_FAILED >&2
  fi

  sleep "$next_interval"
done
