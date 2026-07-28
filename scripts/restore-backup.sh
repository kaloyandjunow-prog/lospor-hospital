#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: scripts/restore-backup.sh backups/lospor-YYYYMMDDTHHMMSSZ.dump" >&2
  exit 2
fi

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"
artifact="/backups/$(basename "$1")"

docker compose stop api delivery-worker web pwa browser backup
docker compose run --rm \
  -e LOSPOR_RESTORE_CONFIRM=RESTORE \
  --entrypoint /usr/local/bin/restore.sh \
  backup "$artifact"
docker compose run --rm migrate
docker compose up -d
