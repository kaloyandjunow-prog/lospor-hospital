#!/bin/sh
set -eu

umask 077

script_dir="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
object_lib="${HOSPITAL_BACKUP_OBJECT_LIB:-/usr/local/bin/backup-object-lib.sh}"
[ -f "$object_lib" ] || object_lib="$script_dir/backup-object-lib.sh"
. "$object_lib"

backup_dir="${HOSPITAL_BACKUP_DIR:-/backups}"
keep_all_seconds="${HOSPITAL_BACKUP_KEEP_ALL_SECONDS:-172800}"
daily_points="${HOSPITAL_BACKUP_DAILY_POINTS:-14}"
lock_wait="${HOSPITAL_BACKUP_LOCK_WAIT_SECONDS:-60}"
for setting in "$keep_all_seconds" "$daily_points" "$lock_wait"; do
  backup_is_uint "$setting" || { backup_error BACKUP_RETENTION_INVALID; exit 2; }
done
[ "$keep_all_seconds" -gt 0 ] && [ "$daily_points" -gt 0 ] || {
  backup_error BACKUP_RETENTION_INVALID
  exit 2
}
[ -d "$backup_dir" ] && [ -w "$backup_dir" ] && [ ! -L "$backup_dir" ] || {
  backup_error BACKUP_DIRECTORY_INVALID
  exit 2
}

now_epoch="${HOSPITAL_BACKUP_NOW_EPOCH:-$(date -u +%s)}"
backup_is_uint "$now_epoch" || { backup_error BACKUP_CLOCK_INVALID; exit 2; }
recent_threshold=$((now_epoch - keep_all_seconds))

list_file="$(mktemp "${TMPDIR:-/tmp}/lospor-valid-backups.XXXXXX")" || exit 1
daily_file="$(mktemp "${TMPDIR:-/tmp}/lospor-daily-backups.XXXXXX")" || {
  rm -f -- "$list_file"
  exit 1
}
lock_dir="$backup_dir/.lospor-backup.lock"
lock_token="retention-${now_epoch}-$$"
lock_owned=0
active_original=""
active_trash=""

release_lock() {
  [ "$lock_owned" -eq 1 ] || return 0
  owner="$(sed -n '1p' "$lock_dir/owner" 2>/dev/null || true)"
  if [ -z "$owner" ] || [ "$owner" = "$lock_token" ]; then
    rm -f -- "$lock_dir/owner"
    rmdir "$lock_dir" 2>/dev/null || true
  fi
  lock_owned=0
}

cleanup() {
  if [ -n "$active_trash" ] && [ -d "$active_trash" ] && [ -n "$active_original" ]; then
    [ -e "$active_original" ] || mv "$active_trash" "$active_original" 2>/dev/null || true
  fi
  release_lock
  rm -f -- "$list_file" "$daily_file"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

lock_started="$(date -u +%s)"
lock_deadline=$((lock_started + lock_wait))
while ! mkdir "$lock_dir" 2>/dev/null; do
  lock_now="$(date -u +%s)"
  if [ "$lock_now" -ge "$lock_deadline" ]; then
    backup_error BACKUP_BUSY
    exit 75
  fi
  sleep 1
done
lock_owned=1
printf '%s\n' "$lock_token" > "$lock_dir/owner"
chmod 600 "$lock_dir/owner"

# Crash remnants are removed only while holding the same shared lock as dump
# publication. This prevents a long-running manual/pre-update dump from being
# mistaken for stale temporary state by the scheduler.
if ! find "$backup_dir" -mindepth 1 -maxdepth 1 -type d \
    -name '.lospor-run-*.tmp.*' -mtime +1 -exec rm -rf -- {} \;; then
  backup_error BACKUP_TEMP_CLEANUP_FAILED
  exit 1
fi

# Only authenticated manifest-last directories enter retention. Legacy flat
# dumps, incomplete directories, symlinks, and objects with a bad MAC/checksum
# remain visible for an operator and are never automatically destroyed.
for object in "$backup_dir"/lospor-*.backup; do
  [ -e "$object" ] || continue
  if backup_verify_object "$object" integrity; then
    printf '%s\t%s\n' "$backup_manifest_completed_epoch" "$backup_verified_object" >> "$list_file"
  else
    backup_error "BACKUP_RETENTION_SKIPPED_INVALID_OBJECT $(basename "$object")"
  fi
done
for legacy in "$backup_dir"/lospor-*.dump "$backup_dir"/lospor-*.dump.sha256; do
  [ -e "$legacy" ] || continue
  backup_error "BACKUP_RETENTION_SKIPPED_LEGACY_OBJECT $(basename "$legacy")"
done

valid_rank=0
sort -nr "$list_file" | while IFS="$(printf '\t')" read -r completed_epoch object; do
  [ -n "$object" ] || continue
  valid_rank=$((valid_rank + 1))

  # Protected recovery points are intentionally indefinite. A later policy may
  # archive them off-host, but ordinary local retention never removes them.
  if [ -f "$object/.retain-pre-update" ] || [ -f "$object/.retain-immutable" ] \
      || [ -f "$object/.retain-pre-restore" ]; then
    continue
  fi
  manifest_kind="$(backup_manifest_value "$object/manifest.json" kind)" || continue
  case "$manifest_kind" in pre-update|immutable|pre-restore) continue ;; esac

  # Preserve the newest two independently of wall-clock gaps, then every
  # authenticated point for 48 hours.
  [ "$valid_rank" -gt 2 ] || continue
  [ "$completed_epoch" -lt "$recent_threshold" ] || continue

  recovery_day="$(date -u -d "@$completed_epoch" +%Y%m%d)" || {
    backup_error "BACKUP_RETENTION_SKIPPED_INVALID_TIME $(basename "$object")"
    continue
  }
  if grep -Fxq "$recovery_day" "$daily_file"; then
    keep_daily=0
  elif [ "$(wc -l < "$daily_file" | tr -d '[:space:]')" -lt "$daily_points" ]; then
    printf '%s\n' "$recovery_day" >> "$daily_file"
    keep_daily=1
  else
    keep_daily=0
  fi
  [ "$keep_daily" -eq 0 ] || continue

  # Re-authenticate immediately before the atomic move out of discovery.
  if ! backup_verify_object "$object" integrity; then
    backup_error "BACKUP_RETENTION_SKIPPED_INVALID_OBJECT $(basename "$object")"
    continue
  fi
  object_name="$(basename "$object")"
  trash="$backup_dir/.prune-${object_name}.$$"
  [ ! -e "$trash" ] || {
    backup_error "BACKUP_RETENTION_CLEANUP_FAILED $object_name"
    exit 1
  }
  active_original="$object"
  active_trash="$trash"
  if mv "$object" "$trash"; then
    case "$trash" in
      "$backup_dir"/.prune-lospor-*.backup.*) ;;
      *) exit 1 ;;
    esac
    if ! rm -rf -- "$trash"; then
      backup_error "BACKUP_RETENTION_CLEANUP_FAILED $object_name"
      exit 1
    fi
    active_original=""
    active_trash=""
    backup_sync_file "$backup_dir" || {
      backup_error "BACKUP_RETENTION_FSYNC_FAILED $object_name"
      exit 1
    }
    printf '%s %s\n' BACKUP_RETENTION_REMOVED "$object_name"
  else
    backup_error "BACKUP_RETENTION_CLEANUP_FAILED $object_name"
    exit 1
  fi
done
