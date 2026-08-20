#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"
. "$root/scripts/install-supply-lib.sh"
. "$root/scripts/installed-release-state.sh"

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
./scripts/ensure-status-secrets.sh
./scripts/ensure-api-secrets-layout.sh

# Pin the maintainer's release signing key, if this release carries one and the
# operator has been given its fingerprint.
#
# Doing it here, before anything is built or started, means a site that was sent
# the wrong fingerprint finds out immediately rather than after ten containers
# are running. Pinning is optional: with no key pinned the appliance verifies
# each release against the digest the operator is given every time, exactly as
# it always has. What it buys is that the digest stops being needed -- one
# fingerprint at install replaces one digest per release, forever.
release_signing_key="infra/release-signing/release-signing-public.pem"
if [ -s "$release_signing_key" ]; then
  set +e
  sh scripts/pin-release-signing-key.sh "$release_signing_key"
  pin_result=$?
  set -e
  case "$pin_result" in
    0) ;;
    # Nothing pinned and no fingerprint given: this site keeps using the
    # per-release digest. Not a failure, and the script has already said so.
    3) ;;
    # Anything else is a key that is not the one this appliance trusts. Stop
    # before a single container is built.
    *) exit "$pin_result" ;;
  esac
fi

# Only the site signing identity is required, and it is generated locally. The
# client certificate and Central CA are issued during enrollment, so requiring
# them here would mean no hospital could install before a Central existed to
# enrol with.
for required in \
  secrets/api/site-signing-private.pem \
  secrets/api/site-signing-public.pem
do
  test -s "$required" || {
    echo "Missing required secret: $required" >&2
    echo "Run ./scripts/generate-secrets.sh to create the local signing identity." >&2
    exit 1
  }
done

if [ -n "${HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD:-}" ]; then
  echo "HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD is no longer accepted." >&2
  echo "Pipe the password to the installer or enter it at the hidden prompt." >&2
  exit 2
fi

# A non-interactive caller supplies exactly two password lines on stdin. Read
# them before Compose/Buildx can inspect the same stream. Interactive operators
# keep the shorter-lived late prompt below, after image preparation.
HOSPITAL_BOOTSTRAP_PASSWORD_PRELOADED=0
if [ ! -t 0 ]; then
  IFS= read -r HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD || {
    echo "Missing piped appliance administrator password." >&2
    exit 2
  }
  IFS= read -r HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD_CONFIRM || {
    unset HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD
    echo "Missing piped appliance administrator password confirmation." >&2
    exit 2
  }
  if [ "$HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD" != "$HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD_CONFIRM" ]; then
    unset HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD_CONFIRM
    echo "Administrator passwords did not match." >&2
    exit 2
  fi
  unset HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD_CONFIRM
  HOSPITAL_BOOTSTRAP_PASSWORD_PRELOADED=1
fi

if [ -s secrets/api/site-client-cert.pem ] && [ -s secrets/api/central-ca.pem ]; then
  echo "Central client credentials found; this installation can be enrolled."
else
  echo "No Central credentials: installing standalone. Clinical data stays local"
  echo "and research export is available once the site enrols with Central."
fi

# Two named local projects may skip the production host gate: the install test
# and the developer appliance. Both are throwaway and neither is how a hospital
# installs. The names are matched exactly, and the opt-in flag is required as
# well, so no real deployment can reach the relaxed path by accident.
case "${COMPOSE_PROJECT_NAME:-}:${HOSPITAL_ALLOW_UNSUPPORTED_TEST_HOST:-}" in
  lospor-install-test:1|lospor-dev:1)
    echo "TEST ONLY: reporting host readiness without enforcing the Ubuntu production host."
    sh scripts/readiness-check.sh
    ;;
  *)
    sh scripts/readiness-check.sh --strict
    ;;
esac
docker compose config --quiet

# Determine the supply route from Docker Compose's resolved model rather than
# parsing COMPOSE_FILE (whose separator and path form differ across hosts). A
# release overlay removes every custom build definition. Its images must have
# been verified by the integrity-checking online/offline launcher before this script runs;
# installation must never replace those exact bytes by pulling or rebuilding.
resolved_compose="$(docker compose --profile tools config --format json)"
install_supply="$(install_detect_supply "$resolved_compose")"
unset resolved_compose

if ! install_supply_authorized "$install_supply" "${HOSPITAL_IMAGES_VERIFIED:-}"; then
  case "$install_supply" in
    verified-release)
      echo "Release images have not been verified by the supported installer." >&2
      echo "Use the supported online/offline release launcher; do not set the verification flag manually." >&2
      ;;
    *)
      echo "HOSPITAL_IMAGES_VERIFIED is valid only for a release-image installation." >&2
      ;;
  esac
  exit 1
fi

case "$install_supply:${HOSPITAL_IMAGES_VERIFIED:-}" in
  verified-release:1)
    release_state_assert_verified_transition "$root" \
      || { echo "Release installation lacks a coherent verified transition." >&2; exit 1; }
    sh ./scripts/verify-loaded-release-images.sh "$HOSPITAL_VERIFIED_RELEASE_LOCK"
    echo "Using already verified release images; pull/build is disabled."
    ;;
  source:"")
    echo "Source installation: building the vendored application images locally."
    # Buildx uses stdin for the generated bake definition. Close the installer's
    # input explicitly so it cannot consume a piped administrator password.
    docker compose --profile tools pull --ignore-buildable </dev/null
    docker compose --profile tools build </dev/null
    ;;
esac
# Same reason as in activate-verified-release.sh: a bind mount whose host path
# is missing is created by the daemon as root, and the one-shot below cannot
# take the mode back.
mkdir -p .data/update/requests .data/update/state
docker compose run --rm --interactive=false -T runtime-secrets-init
docker compose up -d postgres
sh scripts/postgres-update-gate.sh preflight
# These initializers do not read input. Compose keeps stdin open by default even
# with -T, which would consume passwords piped to this installer before the
# prompts below can read them.
docker compose run --rm --interactive=false -T migrate
sh scripts/postgres-update-gate.sh postflight
docker compose --profile tools run --rm --interactive=false -T status-db-init

# Ask only for what has not already been supplied.
#
# A technician standing at a hospital box sees exactly the prompts they always
# did. Everything can also come from the environment, which is what lets the
# install be tested: before this, the only way to run it was by hand, so the
# real install path had no coverage at all and three defects reached a first
# bring-up undetected — a bootstrap that could never create an administrator,
# a lockfile npm ci could not read, and a stale database password.
#
# The password deliberately has no default and no environment-variable path.
# It moves from this terminal to one-shot initializers only over stdin, so it
# never appears in Compose metadata, argv, shell history or an image layer.
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

if [ "$HOSPITAL_BOOTSTRAP_PASSWORD_PRELOADED" -ne 1 ]; then
  printf "Appliance administrator password: " >&2
  stty -echo 2>/dev/null || true
  read -r HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD
  stty echo 2>/dev/null || true
  printf "\nConfirm administrator password: " >&2
  stty -echo 2>/dev/null || true
  read -r HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD_CONFIRM
  stty echo 2>/dev/null || true
  printf "\n" >&2
  if [ "$HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD" != "$HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD_CONFIRM" ]; then
    unset HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD_CONFIRM
    echo "Administrator passwords did not match." >&2
    exit 2
  fi
  unset HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD_CONFIRM
fi
unset HOSPITAL_BOOTSTRAP_PASSWORD_PRELOADED

export \
  HOSPITAL_INSTITUTION_NAME \
  HOSPITAL_INSTITUTION_CITY \
  HOSPITAL_INSTITUTION_COUNTRY \
  HOSPITAL_BOOTSTRAP_ADMIN_EMAIL \
  HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME \
  HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME

# Initialize the independent Status verifier first. This operation is
# idempotent for the same initial credential, so an interrupted install can be
# retried without replacing an existing operator behind their back.
printf '%s\n%s\n%s\n' \
  "$HOSPITAL_BOOTSTRAP_ADMIN_EMAIL" "$HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD" 1 \
  | sh scripts/container-node.sh scripts/credential-json.mjs status-init \
  | sh scripts/container-node.sh scripts/validate-operator-credential.mjs \
  | docker compose run --rm --no-deps -T status node dist/cli.js init-auth
docker compose up -d status

printf '%s\n%s\n%s\n' \
  "$HOSPITAL_BOOTSTRAP_ADMIN_EMAIL" "$HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD" 1 \
  | sh scripts/container-node.sh scripts/credential-json.mjs clinical-bootstrap \
  | docker compose --profile tools run --rm -T \
      -e HOSPITAL_INSTITUTION_NAME \
      -e HOSPITAL_INSTITUTION_CITY \
      -e HOSPITAL_INSTITUTION_COUNTRY \
      -e HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME \
      -e HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME \
      tools ./node_modules/.bin/tsx --conditions=react-server scripts/bootstrap-hospital-admin.ts

unset HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD
docker compose --profile tools run --rm -T tools \
  ./node_modules/.bin/tsx scripts/seed-option-library.ts

# ICD-10 from the vendored Core bundle, so a diagnosis can be coded before the
# licensed vocabulary package is imported. /v1/search/icd10 reads Icd10Code and
# nothing else, unlike its siblings -- procedures serve a bundled file and drugs
# fall back to one -- so an unseeded table left the diagnosis field returning
# nothing at all, which reads as "no such code" rather than "nothing is loaded".
# Insert-only: an institution that has imported its approved package keeps every
# label it imported.
docker compose --profile tools run --rm -T tools \
  ./node_modules/.bin/tsx scripts/seed-icd10-from-bundle.ts
docker compose up -d
docker compose ps

echo "Installation complete."
env_setting() {
  sed -n "s/^$1=//p" .env | tail -n 1 | tr -d '\r' | sed 's/^"//; s/"$//'
}
clinical_domain="$(env_setting HOSPITAL_CLINICAL_DOMAIN)"
https_port="$(env_setting HOSPITAL_HTTPS_PORT)"
https_port="${https_port:-443}"
status_port="$(env_setting HOSPITAL_STATUS_PORT)"
status_port="${status_port:-3443}"
if [ -n "$clinical_domain" ]; then
  # Only name the port when it is not the one browsers assume, so the common
  # install does not print a URL clinicians would copy with a needless :443.
  if [ "$https_port" = "443" ]; then
    echo "Status: https://${clinical_domain}/status/"
  else
    echo "Status: https://${clinical_domain}:${https_port}/status/"
  fi
fi
echo "Outage fallback (from an SSH tunnel): https://localhost:${status_port}/status/"
echo "  ssh -L ${status_port}:127.0.0.1:${status_port} <admin>@$(hostname -f 2>/dev/null || hostname)"
echo "Import the licensed reference vocabulary package before clinical use."
