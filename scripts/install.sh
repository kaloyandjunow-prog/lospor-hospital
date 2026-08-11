#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"

command -v docker >/dev/null 2>&1 || {
  echo "Docker is required." >&2
  exit 1
}
docker compose version >/dev/null
command -v openssl >/dev/null 2>&1 || {
  echo "OpenSSL is required." >&2
  exit 1
}

if [ ! -f .env ]; then
  ./scripts/generate-secrets.sh
fi

# Only the site signing identity is required, and it is generated locally. The
# client certificate and Central CA are issued during enrollment, so requiring
# them here would mean no hospital could install before a Central existed to
# enrol with.
for required in \
  secrets/site-signing-private.pem \
  secrets/site-signing-public.pem
do
  test -s "$required" || {
    echo "Missing required secret: $required" >&2
    echo "Run ./scripts/generate-secrets.sh, or generate the signing identity with" >&2
    echo "  node scripts/generate-hospital-identity.mjs secrets <SITE-CODE>" >&2
    exit 1
  }
done

if [ -s secrets/site-client-cert.pem ] && [ -s secrets/central-ca.pem ]; then
  echo "Central client credentials found; this installation can be enrolled."
else
  echo "No Central credentials: installing standalone. Clinical data stays local"
  echo "and research export is available once the site enrols with Central."
fi

docker compose config --quiet
# Same two supply routes as scripts/update.sh. With compose.release.yaml active
# the services carry published image tags and nothing is compiled here; without
# it they are built from the vendored source. pull skips anything buildable and
# build skips anything already pulled, so running both is correct either way.
docker compose pull --ignore-buildable
docker compose build
docker compose up -d postgres
# -T: without it, `docker compose run` takes the terminal and swallows stdin,
# which eats the answers to the prompts below when they are piped in.
docker compose run --rm -T migrate

# Ask only for what has not already been supplied.
#
# A technician standing at a hospital box sees exactly the prompts they always
# did. Everything can also come from the environment, which is what lets the
# install be tested: before this, the only way to run it was by hand, so the
# real install path had no coverage at all and three defects reached a first
# bring-up undetected — a bootstrap that could never create an administrator,
# a lockfile npm ci could not read, and a stale database password.
#
# The password deliberately has no default. It is prompted for unless it is
# explicitly exported, so it does not end up in shell history, a config file or
# an image layer by accident.
ask() {
  var="$1"; label="$2"; default="${3:-}"
  eval "current=\${$var:-}"
  if [ -n "$current" ]; then return 0; fi
  if [ -n "$default" ]; then
    printf "%s [%s]: " "$label" "$default" >&2
  else
    printf "%s: " "$label" >&2
  fi
  read -r value || value=""
  eval "$var=\"\${value:-$default}\""
}

ask HOSPITAL_INSTITUTION_NAME        "Hospital name"
ask HOSPITAL_INSTITUTION_CITY        "Hospital city"
ask HOSPITAL_INSTITUTION_COUNTRY     "Hospital country" "Bulgaria"
ask HOSPITAL_BOOTSTRAP_ADMIN_EMAIL   "Initial administrator email"
ask HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME "Administrator first name"
ask HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME  "Administrator last name"

if [ -z "${HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD:-}" ]; then
  printf "Administrator password: " >&2
  stty -echo 2>/dev/null || true
  read -r HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD
  stty echo 2>/dev/null || true
  printf "\n" >&2
fi

export \
  HOSPITAL_INSTITUTION_NAME \
  HOSPITAL_INSTITUTION_CITY \
  HOSPITAL_INSTITUTION_COUNTRY \
  HOSPITAL_BOOTSTRAP_ADMIN_EMAIL \
  HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME \
  HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME \
  HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD

docker compose --profile tools run --rm -T \
  -e HOSPITAL_INSTITUTION_NAME \
  -e HOSPITAL_INSTITUTION_CITY \
  -e HOSPITAL_INSTITUTION_COUNTRY \
  -e HOSPITAL_BOOTSTRAP_ADMIN_EMAIL \
  -e HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME \
  -e HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME \
  -e HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD \
  tools npm run hospital:bootstrap

unset HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD
docker compose --profile tools run --rm -T tools \
  npx tsx scripts/seed-option-library.ts
docker compose up -d
docker compose ps

echo "Installation complete."
echo "Import the licensed reference vocabulary package before clinical use."
