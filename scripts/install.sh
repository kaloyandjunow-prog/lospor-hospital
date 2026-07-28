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

for required in \
  secrets/site-signing-private.pem \
  secrets/site-signing-public.pem \
  secrets/site-client-cert.pem \
  secrets/site-client-key.pem \
  secrets/central-ca.pem
do
  test -s "$required" || {
    echo "Missing required secret: $required" >&2
    exit 1
  }
done

docker compose config --quiet
docker compose build
docker compose up -d postgres
docker compose run --rm migrate

printf "Hospital name: " >&2
read -r HOSPITAL_INSTITUTION_NAME
printf "Hospital city: " >&2
read -r HOSPITAL_INSTITUTION_CITY
printf "Hospital country [Bulgaria]: " >&2
read -r HOSPITAL_INSTITUTION_COUNTRY
HOSPITAL_INSTITUTION_COUNTRY="${HOSPITAL_INSTITUTION_COUNTRY:-Bulgaria}"
printf "Initial administrator email: " >&2
read -r HOSPITAL_BOOTSTRAP_ADMIN_EMAIL
printf "Administrator first name: " >&2
read -r HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME
printf "Administrator last name: " >&2
read -r HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME
printf "Administrator password: " >&2
stty -echo
read -r HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD
stty echo
printf "\n" >&2

export \
  HOSPITAL_INSTITUTION_NAME \
  HOSPITAL_INSTITUTION_CITY \
  HOSPITAL_INSTITUTION_COUNTRY \
  HOSPITAL_BOOTSTRAP_ADMIN_EMAIL \
  HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME \
  HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME \
  HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD

docker compose --profile tools run --rm \
  -e HOSPITAL_INSTITUTION_NAME \
  -e HOSPITAL_INSTITUTION_CITY \
  -e HOSPITAL_INSTITUTION_COUNTRY \
  -e HOSPITAL_BOOTSTRAP_ADMIN_EMAIL \
  -e HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME \
  -e HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME \
  -e HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD \
  tools npm run hospital:bootstrap

unset HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD
docker compose --profile tools run --rm tools \
  npx tsx scripts/seed-option-library.ts
docker compose up -d
docker compose ps

echo "Installation complete."
echo "Import the licensed reference vocabulary package before clinical use."
