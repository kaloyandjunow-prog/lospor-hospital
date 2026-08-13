#!/bin/sh
set -eu

backup_once="${HOSPITAL_BACKUP_ONCE_COMMAND:-/usr/local/bin/backup-once.sh}"
prune_backups="${HOSPITAL_BACKUP_PRUNE_COMMAND:-/usr/local/bin/prune-backups.sh}"

# Retention is intentionally downstream of a newly completed, checksum-
# verified backup. A failed dump never causes an older recovery point to be
# removed. Cleanup failure is reported but does not turn the good new dump into
# a failed backup or force an aggressive retry loop.
if sh "$backup_once"; then
  if ! sh "$prune_backups"; then
    printf '%s\n' BACKUP_RETENTION_CLEANUP_FAILED >&2
  fi
  exit 0
fi

printf '%s\n' BACKUP_ATTEMPT_FAILED >&2
exit 1
