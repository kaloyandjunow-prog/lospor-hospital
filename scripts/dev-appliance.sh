#!/bin/sh
# Stand the whole appliance up locally, the way it runs at a hospital.
#
#   ./scripts/dev-appliance.sh up      install if needed, start, print the URLs
#   ./scripts/dev-appliance.sh reset   destroy everything, including data, then up
#   ./scripts/dev-appliance.sh down    stop, keep the data
#   ./scripts/dev-appliance.sh urls    print the URLs and the test login again
#   ./scripts/dev-appliance.sh logs    follow every service
#
# This is for looking at the thing and clicking around it. It is not how a
# hospital installs — that is scripts/install.sh, which this calls.
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"

CLINICAL_DOMAIN="lospor.localhost"
RESEARCH_DOMAIN="lospor-research.localhost"
ADMIN_EMAIL="admin@lospor.localhost"
ADMIN_PASSWORD="LosporDev!2026"

# Refuse to touch anything that is not obviously a local test install.
#
# Every destructive path below removes volumes. If this ever ran against a real
# appliance it would delete a hospital's clinical database, so it checks first
# and stops rather than asking a question someone might click through.
assert_local() {
  if [ -f .env ]; then
    domain="$(grep -E '^HOSPITAL_CLINICAL_DOMAIN=' .env | cut -d= -f2- || true)"
    case "$domain" in
      *.localhost|localhost|"") : ;;
      *)
        echo "REFUSING: .env points at '$domain', which is not a .localhost name." >&2
        echo "This script destroys volumes. It only runs against a local install." >&2
        exit 1
        ;;
    esac
  fi
}

write_env() {
  [ -f .env ] && return 0
  echo "==> generating .env and signing identity for a local install"
  printf '%s\n%s\n%s\n' \
    "dev@${CLINICAL_DOMAIN}" "$CLINICAL_DOMAIN" "$RESEARCH_DOMAIN" \
    | sh scripts/generate-secrets.sh >/dev/null 2>&1 || true

  # generate-secrets.sh also writes a CSR for Central enrollment, which fails on
  # Git Bash because MSYS rewrites the openssl -subj argument into a Windows
  # path. Only the signing keypair is needed to install, so carry on if those
  # two files exist and let the CSR be someone else's problem.
  for required in secrets/site-signing-private.pem secrets/site-signing-public.pem; do
    if [ ! -s "$required" ]; then
      echo "Missing $required — run scripts/generate-secrets.sh by hand." >&2
      exit 1
    fi
  done
}

install_appliance() {
  echo "==> installing (this builds six images the first time; several minutes)"
  HOSPITAL_INSTITUTION_NAME="LOSPOR Dev Hospital" \
  HOSPITAL_INSTITUTION_CITY="Sofia" \
  HOSPITAL_INSTITUTION_COUNTRY="Bulgaria" \
  HOSPITAL_BOOTSTRAP_ADMIN_EMAIL="$ADMIN_EMAIL" \
  HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME="Dev" \
  HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME="Admin" \
  HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    sh scripts/install.sh
}

urls() {
  cat <<EOF

  The appliance is up.

    Clinical (web)     https://${CLINICAL_DOMAIN}
    Phone app (PWA)    https://${CLINICAL_DOMAIN}/app/
    API                https://${CLINICAL_DOMAIN}/v1
    Research browser   https://${RESEARCH_DOMAIN}

    Sign in            ${ADMIN_EMAIL}
                       ${ADMIN_PASSWORD}

  Your browser will warn about the certificate. That is correct: Caddy issues
  its own for a .localhost name rather than asking a public authority for a
  name nobody owns. Click through it.

  Chrome and Edge resolve *.localhost by themselves. Firefox may need entries
  in your hosts file.

EOF
}

case "${1:-up}" in
  up)
    assert_local
    write_env
    install_appliance
    urls
    ;;
  reset)
    assert_local
    echo "==> destroying containers and volumes, including the database"
    docker compose down -v --remove-orphans || true
    rm -f .env
    write_env
    install_appliance
    urls
    ;;
  down)
    assert_local
    docker compose down
    echo "Stopped. Data kept — 'reset' is what throws it away."
    ;;
  urls)
    urls
    ;;
  logs)
    docker compose logs -f
    ;;
  *)
    echo "usage: $0 [up|reset|down|urls|logs]" >&2
    exit 1
    ;;
esac
