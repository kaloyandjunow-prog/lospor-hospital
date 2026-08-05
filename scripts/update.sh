#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"

test -f .env || {
  echo "Hospital is not configured." >&2
  exit 1
}

./scripts/backup-now.sh
node scripts/verify-upstream.mjs
node scripts/verify-pinned-contract.mjs
docker compose config --quiet
docker compose build --pull
docker compose run --rm migrate
docker compose up -d
./scripts/doctor.sh
