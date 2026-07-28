#!/bin/sh
set -eu

umask 077
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
temporary="/backups/.lospor-${stamp}.dump.tmp"
artifact="/backups/lospor-${stamp}.dump"

pg_dump \
  --host=postgres \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --file="$temporary"
mv "$temporary" "$artifact"
sha256sum "$artifact" > "${artifact}.sha256"
echo "$artifact"
