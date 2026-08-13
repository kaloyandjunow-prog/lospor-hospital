#!/bin/sh
set -eu

# Retention applies only to complete, checksum-valid backup pairs. Invalid or
# orphaned files are deliberately left for an operator to inspect; deleting
# half of a pair can hide a failed backup or make recovery less predictable.
backup_dir="${HOSPITAL_BACKUP_DIR:-/backups}"
retention_days="${HOSPITAL_BACKUP_RETENTION_DAYS:-30}"

case "$retention_days" in
  ''|*[!0-9]*) printf '%s\n' BACKUP_RETENTION_INVALID >&2; exit 2 ;;
esac
[ -d "$backup_dir" ] && [ -w "$backup_dir" ] || {
  printf '%s\n' BACKUP_DIRECTORY_INVALID >&2
  exit 2
}

list_file="$(mktemp "${TMPDIR:-/tmp}/lospor-valid-backups.XXXXXX")" || {
  printf '%s\n' BACKUP_RETENTION_CLEANUP_FAILED >&2
  exit 1
}
active_dump=""
active_checksum=""
active_trash=""
cleanup() {
  # If interruption occurs while moving a pair out of discovery, restore both
  # visible names. Once both moves complete the active fields are cleared and
  # the pair is considered deleted even if removing its hidden trash fails.
  if [ -n "$active_trash" ]; then
    [ ! -e "$active_trash/$(basename "$active_dump")" ] \
      || mv "$active_trash/$(basename "$active_dump")" "$active_dump" 2>/dev/null || true
    [ ! -e "$active_trash/$(basename "$active_checksum")" ] \
      || mv "$active_trash/$(basename "$active_checksum")" "$active_checksum" 2>/dev/null || true
    rmdir "$active_trash" 2>/dev/null || true
  fi
  rm -f -- "$list_file"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

valid_pair() {
  dump="$1"
  checksum="${dump}.sha256"
  name="$(basename "$dump")"

  [ -f "$dump" ] && [ ! -L "$dump" ] \
    && [ -f "$checksum" ] && [ ! -L "$checksum" ] || return 1
  printf '%s\n' "$name" | grep -Eq '^lospor-[0-9]{8}T[0-9]{6}Z\.dump$' \
    || return 1

  # A sidecar is valid only when it has exactly one ordinary sha256sum line
  # naming this dump. This avoids accepting a sidecar that verifies some other
  # path in the backup directory.
  [ "$(wc -l < "$checksum" | tr -d '[:space:]')" = 1 ] || return 1
  checksum_line="$(sed -n '1p' "$checksum")"
  case "$checksum_line" in
    *"  "*) ;;
    *) return 1 ;;
  esac
  expected="${checksum_line%%  *}"
  recorded_name="${checksum_line#*  }"
  [ "$recorded_name" = "$name" ] || return 1
  [ "${#expected}" -eq 64 ] || return 1
  case "$expected" in *[!0-9a-f]*) return 1 ;; esac

  actual="$(sha256sum "$dump" 2>/dev/null | awk '{ print $1 }')" || return 1
  [ "$actual" = "$expected" ]
}

found_dump=false
for dump in "$backup_dir"/lospor-*.dump; do
  [ -e "$dump" ] || continue
  found_dump=true
  if valid_pair "$dump"; then
    printf '%s\n' "$dump" >> "$list_file"
  else
    printf '%s %s\n' BACKUP_RETENTION_SKIPPED_INVALID_PAIR "$(basename "$dump")" >&2
  fi
done

# Report orphan sidecars, but never delete them automatically.
for checksum in "$backup_dir"/lospor-*.dump.sha256; do
  [ -e "$checksum" ] || continue
  [ -e "${checksum%.sha256}" ] || {
    printf '%s %s\n' BACKUP_RETENTION_SKIPPED_ORPHAN "$(basename "$checksum")" >&2
  }
done

[ "$found_dump" = true ] || exit 0

# Filenames contain a UTC basic timestamp, so reverse lexical order is newest
# first. Ranks one and two in the already validated list are never removed,
# regardless of age. Older deletion candidates are checksum-verified again
# immediately before removal to close the gap between discovery and deletion.
valid_rank=0
sort -r "$list_file" | while IFS= read -r dump; do
  [ -n "$dump" ] || continue
  valid_rank=$((valid_rank + 1))
  [ "$valid_rank" -gt 2 ] || continue

  if [ -n "$(find "$dump" -prune -mtime "+$retention_days" -print)" ]; then
    if ! valid_pair "$dump"; then
      printf '%s %s\n' BACKUP_RETENTION_SKIPPED_INVALID_PAIR "$(basename "$dump")" >&2
      continue
    fi
    checksum="${dump}.sha256"
    trash_dir="$(mktemp -d "${backup_dir}/.prune-$(basename "$dump").XXXXXX")" || {
      printf '%s %s\n' BACKUP_RETENTION_CLEANUP_FAILED "$(basename "$dump")" >&2
      exit 1
    }
    active_dump="$dump"
    active_checksum="$checksum"
    active_trash="$trash_dir"
    if mv "$dump" "$trash_dir/$(basename "$dump")" \
      && mv "$checksum" "$trash_dir/$(basename "$checksum")"; then
      active_dump=""; active_checksum=""; active_trash=""
      rm -f -- "$trash_dir/$(basename "$dump")" "$trash_dir/$(basename "$checksum")"
      rmdir "$trash_dir"
      printf '%s %s\n' BACKUP_RETENTION_REMOVED "$(basename "$dump")"
    else
      printf '%s %s\n' BACKUP_RETENTION_CLEANUP_FAILED "$(basename "$dump")" >&2
      exit 1
    fi
  fi
done
