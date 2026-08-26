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

# Its own Compose project, so this and scripts/test-install.sh cannot collide.
# That script tears its project down with `down -v` in a trap; sharing a name
# would mean running the install test silently destroyed the dev appliance's
# database. Exported here rather than inside the install step so that `down`,
# `reset` and `logs` all address the same project.
COMPOSE_PROJECT_NAME=lospor-dev
export COMPOSE_PROJECT_NAME

# Name the appliance after the machine's own LAN address, through sslip.io,
# which resolves any a.b.c.d.sslip.io to a.b.c.d. That makes the box reachable
# from a phone on the same WiFi with nothing to configure on the phone — which
# is the only way to try the PWA as a clinician would actually hold it.
#
# Not a bare IP: SNI cannot carry an IP address, so with more than one site
# defined the TLS handshake fails before any request is made. It has to be a
# name, and the name has to resolve from the phone, which rules out .localhost.
#
# LOSPOR_DEV_HOST overrides this if the guess is wrong or there is no internet
# to resolve sslip.io.
# Each branch ends in `|| true`: this runs under `set -e` inside a command
# substitution, so a probe that simply is not present on this platform — `ip` on
# Git Bash, `ipconfig` on Linux — would otherwise abort the whole assignment
# before the fallback ever ran.
detect_lan_ip() {
  candidate="$(ip route get 1.1.1.1 2>/dev/null \
    | awk '{for(i=1;i<=NF;i++) if($i=="src") {print $(i+1); exit}}' || true)"
  if [ -n "$candidate" ]; then printf '%s' "$candidate"; return 0; fi

  # Docker and WSL both add 172.16/12 interfaces that route nowhere useful, and
  # 169.254 means DHCP failed. Neither is reachable from a phone.
  candidate="$(ipconfig 2>/dev/null | awk '/IPv4/ {gsub(/\r/,""); print $NF}' \
    | grep -vE '^(127\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)' | head -1 || true)"
  printf '%s' "$candidate"
}

LAN_IP="${LOSPOR_DEV_HOST:-$(detect_lan_ip)}"
if [ -z "$LAN_IP" ]; then
  echo "Could not work out this machine's LAN address." >&2
  echo "Set it explicitly:  LOSPOR_DEV_HOST=192.168.1.23 $0 up" >&2
  exit 1
fi

CLINICAL_DOMAIN="lospor.${LAN_IP}.sslip.io"
RESEARCH_DOMAIN="research.${LAN_IP}.sslip.io"
ADMIN_EMAIL="admin@lospor.dev"
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
      *.localhost|localhost|*.sslip.io|"") : ;;
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
  # Values in the environment, never on standard input. generate-secrets.sh
  # refuses to read from a pipe: install.sh reads the administrator's password
  # from that same stream, so a prompt reading from it consumed the password.
  #
  # A host-originated request through Docker's published-port NAT arrives at
  # Caddy with a source IP from this compose project's own bridge subnet
  # (e.g. 172.23.0.1), not 127.0.0.1 -- confirmed against a real container;
  # 127.0.0.1 alone never matches it. Every default Docker bridge network
  # falls inside 172.16.0.0/12, so this covers whichever specific subnet
  # compose allocates without hardcoding this one project's bridge gateway.
  ACME_EMAIL="dev@${CLINICAL_DOMAIN}" \
  HOSPITAL_CLINICAL_DOMAIN="$CLINICAL_DOMAIN" \
  HOSPITAL_RESEARCH_DOMAIN="$RESEARCH_DOMAIN" \
  HOSPITAL_TLS_MODE=local \
  HOSPITAL_RESEARCH_ALLOWED_CIDRS="127.0.0.1/32 172.16.0.0/12" \
  HOSPITAL_STATUS_ALLOWED_CIDRS="127.0.0.1/32 172.16.0.0/12" \
  AUTH_EMAIL_FROM="no-reply@${CLINICAL_DOMAIN}" \
  LOSPOR_DEFAULT_LOCALE=en \
  HOSPITAL_ADULT_GUIDANCE_DEFAULT=true \
  HOSPITAL_PEDIATRIC_GUIDANCE_DEFAULT=true \
  HOSPITAL_EXTERNAL_AI_DEFAULT=false \
    sh scripts/generate-secrets.sh >/dev/null 2>&1 || true

  # generate-secrets.sh also writes a CSR for Central enrollment, which fails on
  # Git Bash because MSYS rewrites the openssl -subj argument into a Windows
  # path. Only the signing keypair is needed to install, so carry on if those
  # two files exist and let the CSR be someone else's problem.
  for required in secrets/api/site-signing-private.pem secrets/api/site-signing-public.pem; do
    if [ ! -s "$required" ]; then
      echo "Missing $required — run scripts/generate-secrets.sh by hand." >&2
      exit 1
    fi
  done
}

install_appliance() {
  echo "==> installing (this builds six images the first time; several minutes)"
  # The generated development configuration selects HOSPITAL_TLS_MODE=local;
  # Caddy therefore uses its internal authority and never publishes ACME port 80.
  # A hospital host must be Ubuntu 24.04 with sshd, systemctl, ss, getent and
  # timedatectl present, and install.sh enforces that. A developer machine is
  # none of those things -- on Windows the check fails eight ways before a
  # single container starts. This is explicitly not how a hospital installs, so
  # report host readiness without enforcing it.
  export HOSPITAL_ALLOW_UNSUPPORTED_TEST_HOST=1
  HOSPITAL_INSTITUTION_NAME="LOSPOR Dev Hospital" \
  HOSPITAL_INSTITUTION_CITY="Sofia" \
  HOSPITAL_INSTITUTION_COUNTRY="Bulgaria" \
  HOSPITAL_BOOTSTRAP_ADMIN_EMAIL="$ADMIN_EMAIL" \
  HOSPITAL_BOOTSTRAP_ADMIN_USERNAME="Dev.Admin" \
  HOSPITAL_BOOTSTRAP_ADMIN_CONTACT_EMAIL="$ADMIN_EMAIL" \
  HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME="Dev" \
  HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME="Admin" \
    sh scripts/install.sh <<EOF
${ADMIN_PASSWORD}
${ADMIN_PASSWORD}
EOF
}

urls() {
  cat <<EOF

  The appliance is up.

    Clinical (web)     https://${CLINICAL_DOMAIN}
    Phone app (PWA)    https://${CLINICAL_DOMAIN}/app/
    API                https://${CLINICAL_DOMAIN}/v1
    Research browser   https://${RESEARCH_DOMAIN}
    Appliance status  https://${CLINICAL_DOMAIN}/status/
    Status fallback   https://localhost:3443/status/ (server console/SSH tunnel)

    Sign in            ${ADMIN_EMAIL}
                       ${ADMIN_PASSWORD}

  Every browser will warn about the certificate, including on the phone. That
  is correct and expected: Caddy issues its own, because no public authority
  will vouch for a machine on your WiFi. Tap through it.

  FROM A PHONE ON THE SAME WIFI

  The names above already resolve to ${LAN_IP} from any device, so there is
  nothing to set up on the phone. What usually blocks it is the host firewall:
  Windows denies inbound 80/443 by default, and does so silently. Allow them
  once, from an ADMINISTRATOR PowerShell:

    New-NetFirewallRule -DisplayName "LOSPOR appliance (local subnet)" \`
      -Direction Inbound -Action Allow -Protocol TCP -LocalPort 80,443 \`
      -RemoteAddress LocalSubnet -Profile Any

  Scoped to the local subnet on purpose: the appliance should answer the ward,
  not the internet.

  If the address changes — a new DHCP lease, a different network — re-run
  '$0 up'. The names are derived from it each time.

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
