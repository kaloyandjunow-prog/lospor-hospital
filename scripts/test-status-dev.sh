#!/bin/sh
# Contract and resilience smoke test for the exact-two-container harness.
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"

compose() { docker compose -f compose.status-dev.yaml "$@"; }
cleanup() {
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f .data/status-dev-test.cookies
}
trap cleanup EXIT HUP INT TERM

./scripts/dev-status.sh reset >/dev/null

wait_http() {
  url="$1"; expected="$2"; attempts=0
  while [ "$attempts" -lt 30 ]; do
    actual="$(curl -ks -o /dev/null -w '%{http_code}' --max-time 3 "$url" 2>/dev/null || true)"
    [ "$actual" = "$expected" ] && return 0
    attempts=$((attempts + 1))
    sleep 1
  done
  echo "Expected HTTP $expected from $url, got ${actual:-none}." >&2
  return 1
}

wait_http http://127.0.0.1:13004/status/login 200
wait_http https://127.0.0.1:13443/status/login 200

cookie_jar=".data/status-dev-test.cookies"
rm -f "$cookie_jar"
login_status="$(
  printf 'email=%s&password=%s' 'status-admin@lospor.localhost' 'StatusDev!2026' \
    | curl -sk -o /dev/null -w '%{http_code}' \
        -H 'Origin: https://127.0.0.1:13443' \
        -H 'Content-Type: application/x-www-form-urlencoded' \
        -c "$cookie_jar" --data-binary @- \
        https://127.0.0.1:13443/status/login
)"
[ "$login_status" = 303 ] || {
  echo "Status test login failed with HTTP $login_status." >&2
  exit 1
}

wait_component() {
  component="$1"; expected="$2"; attempts=0
  while [ "$attempts" -lt 12 ]; do
    if curl -sk --fail --silent -b "$cookie_jar" \
        https://127.0.0.1:13443/status/api/state \
      | node scripts/assert-status-component.mjs "$component" "$expected"; then
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 3
  done
  echo "Status never reported $component as $expected." >&2
  return 1
}

containers="$(compose ps -a --services | sort | tr '\n' ' ')"
[ "$containers" = "appliance-fixture status " ] || {
  echo "Harness did not contain exactly the two expected containers: $containers" >&2
  exit 1
}

# A clinical outage must not remove either the login page or Status liveness.
./scripts/dev-status.sh scenario database-down >/dev/null
wait_component database outage
wait_http https://127.0.0.1:13443/status/login 200
compose exec -T status node -e \
  "fetch('http://127.0.0.1:3004/internal/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

./scripts/dev-status.sh scenario api-down >/dev/null
wait_component api outage
wait_http http://127.0.0.1:13004/status/login 200

# History and auth survive a Status restart because only SQLite lives in its
# dedicated volume; the fixture cannot read it.
compose restart status >/dev/null
wait_http http://127.0.0.1:13004/status/login 200
[ "$(curl -sk -o /dev/null -w '%{http_code}' -b "$cookie_jar" \
    https://127.0.0.1:13443/status/api/state)" = 200 ] || {
  echo "Authenticated Status session did not survive restart." >&2
  exit 1
}
curl -sk --fail --silent -b "$cookie_jar" \
  https://127.0.0.1:13443/status/api/state \
  | node scripts/assert-status-component.mjs api outage --incident || {
    echo "Status incident history did not survive restart." >&2
    exit 1
  }
compose exec -T appliance-fixture test ! -e /data/status.sqlite

rm -f "$cookie_jar"

echo "Two-container Status harness verified."
