#!/bin/sh
set -eu

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

docker compose config --quiet
docker compose ps

# Read the two values this script needs, rather than sourcing the whole file.
#
# `. ./.env` executes it. Every value is shell, so a setting containing spaces
# runs as a command: HOSPITAL_CADDY_SITE_EXTRA=tls /run/tls/fullchain.pem ...
# -- the ordinary way to write it -- made doctor.sh exit 127 trying to run a
# program called `tls`, on a healthy appliance, with a message naming a
# certificate path and nothing about the real cause. The same shape would
# execute anything else an operator put in a value.
#
# This is the reader scripts/readiness-check.sh already uses.
env_value() {
  sed -n "s/^$1=//p" "$root/.env" 2>/dev/null \
    | tail -n 1 | tr -d '' | sed 's/^"//; s/"$//'
}
HOSPITAL_CLINICAL_DOMAIN="$(env_value HOSPITAL_CLINICAL_DOMAIN)"
[ -n "$HOSPITAL_CLINICAL_DOMAIN" ] \
  || { echo "HOSPITAL_CLINICAL_DOMAIN is not set in .env" >&2; exit 1; }
[ -n "${HOSPITAL_TLS_MODE:-}" ] || HOSPITAL_TLS_MODE="$(env_value HOSPITAL_TLS_MODE)"
[ -n "${HOSPITAL_TLS_VERIFY_CA:-}" ] || HOSPITAL_TLS_VERIFY_CA="$(env_value HOSPITAL_TLS_VERIFY_CA)"

# Verify the clinical name against whatever authority this site actually uses.
#
# These four calls used to trust only the public store, which is right for a
# site holding a Let's Encrypt certificate and impossible for any other. A LAN
# install runs `local_certs`, where Caddy signs with a CA it generated itself,
# and no amount of waiting makes a public root vouch for that. The check could
# not pass, and doctor.sh is the health gate for both applying a release and
# verifying the rollback afterwards -- so an update installed cleanly, failed
# here, rolled back, failed here again, and left the activation lock behind for
# an operator. Every update, on every LAN appliance, by construction.
#
# The answer is to name the authority rather than to stop checking. --insecure
# would turn a proof that the right service answered into a note that something
# did, on the one path where a hospital most needs the stronger statement.
tls_ca=""
tls_ca_temporary=""
case "${HOSPITAL_TLS_MODE:-acme}" in
  acme)
    # A publicly trusted certificate. The system store is the right authority.
    ;;
  operator)
    # The hospital's own CA issued the certificate; it is the only thing that
    # can vouch for it, and a managed estate already trusts it everywhere else.
    [ -n "${HOSPITAL_TLS_VERIFY_CA:-}" ] \
      || { echo "HOSPITAL_TLS_MODE=operator requires HOSPITAL_TLS_VERIFY_CA." >&2; exit 1; }
    [ -s "$HOSPITAL_TLS_VERIFY_CA" ] \
      || { echo "Certificate authority file is missing or empty: $HOSPITAL_TLS_VERIFY_CA" >&2; exit 1; }
    tls_ca="$HOSPITAL_TLS_VERIFY_CA"
    ;;
  local)
    # Caddy's own root, read from the running container. Reaching into the
    # volume proves the chain that is actually being served rather than one
    # recorded when the appliance was installed, and a man in the middle on the
    # ward network still fails -- which is the whole point of not using
    # --insecure here.
    tls_ca_temporary="$(mktemp)"
    chmod 600 "$tls_ca_temporary"
    trap 'rm -f "$tls_ca_temporary"' EXIT HUP INT TERM
    if ! docker compose exec -T caddy cat \
      /data/caddy/pki/authorities/local/root.crt > "$tls_ca_temporary" 2>/dev/null \
      || [ ! -s "$tls_ca_temporary" ]; then
      echo "HOSPITAL_TLS_MODE=local but Caddy has issued no local authority yet." >&2
      exit 1
    fi
    tls_ca="$tls_ca_temporary"
    ;;
  *)
    echo "HOSPITAL_TLS_MODE must be acme, local or operator; got '${HOSPITAL_TLS_MODE}'." >&2
    exit 1
    ;;
esac

clinical_curl() {
  if [ -n "$tls_ca" ]; then
    curl --cacert "$tls_ca" --fail --silent --show-error "$1" >/dev/null
  else
    curl --fail --silent --show-error "$1" >/dev/null
  fi
}

# One clinical host now answers for all three: the web app at the root, the
# phone app under /app, and the API under /v1. Checking each path separately
# still proves each service behind the proxy is alive.
clinical_curl "https://${HOSPITAL_CLINICAL_DOMAIN}/"
clinical_curl "https://${HOSPITAL_CLINICAL_DOMAIN}/app/"
clinical_curl "https://${HOSPITAL_CLINICAL_DOMAIN}/health/ready"
clinical_curl "https://${HOSPITAL_CLINICAL_DOMAIN}/status/login"
# The fallback certificate is intentionally private/self-signed and the port is
# bound to loopback only. It is used through an SSH tunnel when Caddy or the
# clinical stack is unavailable.
curl --insecure --fail --silent --show-error \
  "https://localhost:3443/status/login" >/dev/null

docker compose exec -T status node -e \
  "fetch('http://127.0.0.1:3004/internal/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
sh scripts/appliance-operator.sh verify

for marker in backup-status.v1.json delivery-worker-status.v1.json; do
  if ! docker compose exec -T status test -s "/signals/$marker"; then
    echo "Warning: Status has not received $marker yet." >&2
  fi
done

latest="$(find backups -maxdepth 1 -type f -name 'lospor-*.dump' -print | sort | tail -n 1)"
if [ -z "$latest" ]; then
  echo "Warning: no completed database backup exists yet." >&2
else
  # Sidecars intentionally contain only the dump basename. Verify from inside
  # the backup directory so the operator check resolves the same file that the
  # backup container verified, not a nonexistent name in the repository root.
  latest_name="$(basename "$latest")"
  (cd backups && sha256sum -c "${latest_name}.sha256")
fi

echo "Hospital appliance checks passed."
