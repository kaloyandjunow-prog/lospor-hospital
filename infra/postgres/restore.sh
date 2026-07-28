#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: restore.sh /backups/lospor-YYYYMMDDTHHMMSSZ.dump" >&2
  exit 2
fi

artifact="$1"
test -f "$artifact"
test -f "${artifact}.sha256"
cd "$(dirname "$artifact")"
sha256sum -c "$(basename "${artifact}.sha256")"

if [ "${LOSPOR_RESTORE_CONFIRM:-}" != "RESTORE" ]; then
  echo "Set LOSPOR_RESTORE_CONFIRM=RESTORE to replace the Hospital database." >&2
  exit 2
fi

dropdb --host=postgres --username="$POSTGRES_USER" --if-exists "$POSTGRES_DB"
createdb --host=postgres --username="$POSTGRES_USER" "$POSTGRES_DB"
pg_restore \
  --host=postgres \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --clean \
  --if-exists \
  --no-owner \
  "$artifact"
