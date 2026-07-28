#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"
docker compose run --rm --entrypoint /usr/local/bin/backup-once.sh backup
