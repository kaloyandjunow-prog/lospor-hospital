#!/bin/sh
set -eu

if [ "$#" -ne 4 ]; then
  echo "Usage: scripts/enroll-central.sh CENTRAL_URL SITE_CODE SITE_NAME ENROLLMENT_TOKEN" >&2
  exit 2
fi

central_url="${1%/}"
site_code="$2"
site_name="$3"
enrollment_token="$4"
root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"
set -a
. ./.env
set +a

case "$site_name" in
  *\"*|*\\*)
    echo "SITE_NAME must not contain quote or backslash characters." >&2
    exit 2
    ;;
esac

json_escape() {
  printf "%s" "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

printf "Hospital administrator email: " >&2
read -r email
printf "Hospital administrator password: " >&2
stty -echo
read -r password
stty echo
printf "\n" >&2

login="$(curl \
  --fail \
  --silent \
  --show-error \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$(json_escape "$email")\",\"password\":\"$(json_escape "$password")\"}" \
  "https://${HOSPITAL_CLINICAL_DOMAIN}/v1/auth/token")"
unset password
access_token="$(printf "%s" "$login" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
test -n "$access_token" || {
  echo "Hospital login returned no access token." >&2
  exit 1
}

curl \
  --fail \
  --silent \
  --show-error \
  -X POST \
  -H "Authorization: Bearer ${access_token}" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"${enrollment_token}\",\"centralBaseUrl\":\"${central_url}\",\"siteCode\":\"${site_code}\",\"siteName\":\"${site_name}\"}" \
  "https://${HOSPITAL_CLINICAL_DOMAIN}/v1/hospital/enroll"
printf "\n"
