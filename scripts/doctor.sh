#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"

docker compose config --quiet
docker compose ps

set -a
. ./.env
set +a

curl --fail --silent --show-error "https://${HOSPITAL_API_DOMAIN}/health/ready" >/dev/null
curl --fail --silent --show-error "https://${HOSPITAL_WEB_DOMAIN}/" >/dev/null
curl --fail --silent --show-error "https://${HOSPITAL_PWA_DOMAIN}/health" >/dev/null

latest="$(find backups -maxdepth 1 -type f -name 'lospor-*.dump' -print | sort | tail -n 1)"
if [ -z "$latest" ]; then
  echo "Warning: no completed database backup exists yet." >&2
else
  sha256sum -c "${latest}.sha256"
fi

echo "Hospital appliance checks passed."
