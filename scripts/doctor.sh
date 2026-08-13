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

set -a
. ./.env
set +a

# One clinical host now answers for all three: the web app at the root, the
# phone app under /app, and the API under /v1. Checking each path separately
# still proves each service behind the proxy is alive.
curl --fail --silent --show-error "https://${HOSPITAL_CLINICAL_DOMAIN}/" >/dev/null
curl --fail --silent --show-error "https://${HOSPITAL_CLINICAL_DOMAIN}/app/" >/dev/null
curl --fail --silent --show-error "https://${HOSPITAL_CLINICAL_DOMAIN}/health/ready" >/dev/null
curl --fail --silent --show-error "https://${HOSPITAL_CLINICAL_DOMAIN}/status/login" >/dev/null
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
