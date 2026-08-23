#!/bin/sh
# Run the real Status image against a deterministic synthetic appliance.
# Exactly two persistent containers are started; one-shot credential setup is
# removed before the command returns.
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"

compose() {
  docker compose -f compose.status-dev.yaml "$@"
}

secrets_dir=".data/status-dev-secrets"
email="status-admin@lospor.localhost"
password="StatusDev!2026"

ensure_ready() {
  ./scripts/ensure-status-dev-secrets.sh
}

initialize_auth() {
  compose run --rm -T secrets-init >/dev/null
  printf '%s\n%s\n%s\n' "$email" "$password" 1 \
    | node scripts/credential-json.mjs status-init \
    | node scripts/validate-operator-credential.mjs \
    | compose run --rm --no-deps -T status node dist/cli.js init-auth >/dev/null
}

remove_init_container() {
  # The initializer is a one-shot setup task, not part of the requested
  # two-container harness. Remove its exited container object once both
  # persistent services have started.
  compose rm -f secrets-init >/dev/null
}

control() {
  scenario="$1"
  token="$(tr -d '\r\n' < "$secrets_dir/fixture-control-token")"
  printf 'header = "Authorization: Bearer %s"\n' "$token" \
    | curl --config - --fail --silent --show-error --max-time 10 \
        -X POST \
        "http://127.0.0.1:18080/__control/scenarios/$scenario" >/dev/null
}

urls() {
  cat <<EOF

Status monitor development harness (two containers)

  Status login:    http://127.0.0.1:13004/status/login
  HTTPS fallback: https://127.0.0.1:13443/status/login
  Fixture control: loopback only on http://127.0.0.1:18080

  Email:           $email
  Password:        $password
  First sign-in:   enroll TOTP and save the ten one-use recovery codes

Change conditions with:
  $0 scenario api-down
  $0 scenario database-down
  $0 scenario web-down
  $0 scenario backup-failure
  $0 scenario healthy

EOF
}

case "${1:-up}" in
  up)
    ensure_ready
    compose build
    initialize_auth
    compose up -d --remove-orphans
    remove_init_container
    # One-shot run containers are normally auto-removed. Be explicit in the
    # count so a stale exited container cannot make the two-container claim lie.
    persistent="$(compose ps --services --status running | wc -l | tr -d ' ')"
    [ "$persistent" = 2 ] || {
      echo "Expected exactly two running containers, found $persistent." >&2
      exit 1
    }
    urls
    ;;
  reset)
    ensure_ready
    compose down -v --remove-orphans
    compose build
    initialize_auth
    compose up -d --remove-orphans
    remove_init_container
    urls
    ;;
  down)
    compose down
    ;;
  scenario)
    [ "$#" -eq 2 ] || {
      echo "Usage: $0 scenario NAME" >&2
      exit 2
    }
    ensure_ready
    control "$2"
    echo "Fixture scenario changed to $2. Status opens after its probe debounce."
    ;;
  urls)
    urls
    ;;
  logs)
    compose logs -f
    ;;
  *)
    echo "Usage: $0 [up|reset|down|scenario NAME|urls|logs]" >&2
    exit 2
    ;;
esac
