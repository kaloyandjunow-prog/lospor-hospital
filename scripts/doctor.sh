#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"

docker compose config --quiet
docker compose ps

set -a
. ./.env
set +a

# One clinical host now answers for all three: the web app at the root, the
# phone app under /app, and the API under /v1. Checking each path separately
# still proves each service behind the proxy is alive.
curl --fail --silent --show-error "https://${HOSPITAL_CLINICAL_DOMAIN}/" >/dev/null
curl --fail --silent --show-error "https://${HOSPITAL_CLINICAL_DOMAIN}/app/" >/dev/null
curl --fail --silent --show-error "https://${HOSPITAL_CLINICAL_DOMAIN}/health/ready" >/dev/null

latest="$(find backups -maxdepth 1 -type f -name 'lospor-*.dump' -print | sort | tail -n 1)"
if [ -z "$latest" ]; then
  echo "Warning: no completed database backup exists yet." >&2
else
  sha256sum -c "${latest}.sha256"
fi

echo "Hospital appliance checks passed."
