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
. "$root/scripts/installed-release-state.sh"
if [ "${HOSPITAL_RELEASE_TRANSITION:-}" = 1 ]; then
  release_state_assert_verified_transition "$root"
else
  appliance_home="$(release_state_appliance_home "$root")"
  set +e
  release_state_apply "$appliance_home"
  release_state_result=$?
  set -e
  case "$release_state_result" in
    0) root="$state_release_root" ;;
    10) ;;
    *) exit "$release_state_result" ;;
  esac
fi
cd "$root"
set -a
. ./.env
set +a

# Refuse before interrupting the API if the externally issued mTLS material is
# incomplete. The signing identity was already created during installation.
for required in \
  secrets/api/site-signing-private.pem \
  secrets/api/site-signing-public.pem \
  secrets/api/site-client-key.pem \
  secrets/api/site-client-cert.pem \
  secrets/api/central-ca.pem
do
  test -s "$required" || {
    echo "Missing required Central credential: $required" >&2
    exit 1
  }
done

# Certificate files are placed on the host before this command. Refresh the
# service-specific runtime volume and restart only the API so enrollment uses
# the new mTLS material without exposing Status secrets to it.
./scripts/ensure-status-secrets.sh >/dev/null
./scripts/ensure-api-secrets-layout.sh
docker compose run --rm -T runtime-secrets-init >/dev/null
docker compose restart api >/dev/null

api_attempts=0
while [ "$api_attempts" -lt 30 ]; do
  api_code="$(curl --silent --insecure --output /dev/null --write-out '%{http_code}' \
    --max-time 3 "https://${HOSPITAL_CLINICAL_DOMAIN}/health/ready" 2>/dev/null || true)"
  [ "$api_code" = 200 ] && break
  api_attempts=$((api_attempts + 1))
  sleep 1
done
[ "${api_code:-}" = 200 ] || {
  echo "Hospital API did not become ready after loading Central credentials." >&2
  exit 1
}

case "$site_name" in
  *\"*|*\\*)
    echo "SITE_NAME must not contain quote or backslash characters." >&2
    exit 2
    ;;
esac

printf "Hospital administrator email: " >&2
IFS= read -r email
printf "Hospital administrator password: " >&2
if [ -t 0 ]; then stty -echo; fi
IFS= read -r password
if [ -t 0 ]; then stty echo; fi
printf "\n" >&2

login="$(
  printf '%s\n%s\n' "$email" "$password" \
    | sh scripts/container-node.sh scripts/credential-json.mjs status-init \
    | curl \
        --fail \
        --silent \
        --show-error \
        -X POST \
        -H "Content-Type: application/json" \
        --data-binary @- \
        "https://${HOSPITAL_CLINICAL_DOMAIN}/v1/auth/token"
)"
unset password
access_token="$(printf "%s" "$login" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
test -n "$access_token" || {
  echo "Hospital login returned no access token." >&2
  exit 1
}

printf '%s\n%s\n%s\n%s\n' \
  "$enrollment_token" "$central_url" "$site_code" "$site_name" \
  | sh scripts/container-node.sh scripts/credential-json.mjs central-enrollment \
  | curl \
  --fail \
  --silent \
  --show-error \
  -X POST \
  -H "Authorization: Bearer ${access_token}" \
  -H "Content-Type: application/json" \
  --data-binary @- \
  "https://${HOSPITAL_CLINICAL_DOMAIN}/v1/hospital/enroll"
printf "\n"
