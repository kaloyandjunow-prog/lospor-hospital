#!/bin/sh
set -eu

backup_once="${HOSPITAL_BACKUP_ONCE_COMMAND:-/usr/local/bin/backup-once.sh}"
prune_backups="${HOSPITAL_BACKUP_PRUNE_COMMAND:-/usr/local/bin/prune-backups.sh}"

# Retention is intentionally downstream of a newly completed, checksum-
# verified backup. A failed dump never causes an older recovery point to be
# removed. Cleanup failure is reported but does not turn the good new dump into
# a failed backup or force an aggressive retry loop.
set +e
HOSPITAL_BACKUP_KIND="${HOSPITAL_BACKUP_KIND:-scheduled}" sh "$backup_once"
backup_result=$?
set -e
if [ "$backup_result" -eq 0 ]; then
  if ! sh "$prune_backups"; then
    printf '%s\n' BACKUP_RETENTION_CLEANUP_FAILED >&2
  fi
  exit 0
fi

if [ "$backup_result" -eq 75 ]; then
  printf '%s\n' BACKUP_BUSY >&2
  exit 75
fi

printf '%s\n' BACKUP_ATTEMPT_FAILED >&2
exit "$backup_result"
