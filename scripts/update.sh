#!/bin/sh
set -eu

# Updates a running appliance.
#
# Two supply routes, and the script does not care which is in use. With
# compose.release.yaml active the services carry published image tags and are
# pulled; without it they are built from the vendored source. `pull` skips
# anything buildable and `build` skips anything already pulled, so running both
# is correct either way.
#
#   # published images (preferred)
#   export HOSPITAL_RELEASE=8.5.0
#   export COMPOSE_FILE=compose.yaml:compose.release.yaml
#   ./scripts/update.sh
#
#   # from source
#   ./scripts/update.sh
#
# The order is deliberate: back up before anything is touched, verify the bundle
# is what it claims to be before it is run, and apply migrations before starting
# the new containers. Database migrations must stay backward compatible for the
# rollback window — recovery is restoring the backup taken on the first line,
# never rolling the schema backward by hand.

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

docker compose pull --ignore-buildable
docker compose build --pull

docker compose run --rm migrate
docker compose up -d
./scripts/doctor.sh
