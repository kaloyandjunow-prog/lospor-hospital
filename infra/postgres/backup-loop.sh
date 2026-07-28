#!/bin/sh
set -eu

umask 077
interval="${HOSPITAL_BACKUP_INTERVAL_SECONDS:-86400}"
retention="${HOSPITAL_BACKUP_RETENTION_DAYS:-30}"

while true; do
  /usr/local/bin/backup-once.sh

  find /backups -type f -name 'lospor-*.dump' -mtime "+$retention" -delete
  find /backups -type f -name 'lospor-*.dump.sha256' -mtime "+$retention" -delete
  sleep "$interval"
done
