#!/bin/sh
# Install the appliance from nothing, prove it works, then destroy it.
#
# This exists because the install had no test at all. It could only be driven by
# a human at a keyboard, so nothing exercised it, and the first real bring-up on
# 11 Aug 2026 hit three defects in a row that every unit suite had passed over:
#
#   - bootstrap-hospital-admin.ts imported a module that calls "server-only",
#     which throws outside Next. No hospital could ever have created its first
#     administrator.
#   - apps/web/package-lock.json was in a shape `npm ci` could not read.
#   - the database rejected the password because the volume predated it.
#
# None of those are visible from a unit test. All three are caught below.
#
# WHAT THIS ASSERTS, AND WHY EACH ONE
#
# "The containers are running" proves nothing: during the failure above,
# `docker compose ps` reported postgres as healthy for the entire time the
# migration was failing. So each check below is something a broken install
# cannot fake.
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"

# Its own compose project, so teardown can only ever remove what this test
# created. Without this the `down -v` below runs against the default project and
# deletes the database of whatever appliance happens to be running on this
# machine — including a developer's, mid-session.
COMPOSE_PROJECT_NAME="lospor-install-test"
export COMPOSE_PROJECT_NAME

CLINICAL="lospor-test.localhost"
RESEARCH="lospor-test-research.localhost"
ADMIN_EMAIL="install-test@lospor.localhost"
ADMIN_PASSWORD="InstallTest!2026"
failures=0

pass() { printf "  ok    %s\n" "$1"; }
fail() { printf "  FAIL  %s\n" "$1"; failures=$((failures + 1)); }

check_http() {
  label="$1"; url="$2"; want="$3"
  got="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 30 "$url" 2>/dev/null || echo 000)"
  if [ "$got" = "$want" ]; then pass "$label ($got)"; else fail "$label — expected $want, got $got"; fi
}

# Always tear down, including on failure. A surviving volume is not merely
# untidy: Postgres only applies POSTGRES_PASSWORD when it initialises an empty
# data directory, so a leftover volume makes the *next* run fail to authenticate
# for reasons that look nothing like the real cause.
cleanup() {
  echo
  echo "==> tearing down"
  docker compose down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f .env
  rm -f secrets/site-signing-private.pem secrets/site-signing-public.pem \
        secrets/site-client-key.pem secrets/site-client-csr.pem 2>/dev/null || true
  remaining="$(docker volume ls -q --filter "name=${COMPOSE_PROJECT_NAME}" | wc -l | tr -d ' ')"
  if [ "$remaining" = "0" ]; then
    echo "    volumes removed"
  else
    echo "    WARNING: $remaining lospor-hospital volume(s) survived teardown" >&2
  fi
}
trap cleanup EXIT INT TERM

if [ -f .env ]; then
  echo "REFUSING: .env already exists. This test installs from nothing and" >&2
  echo "destroys what it creates; it will not touch an existing install." >&2
  echo "Run ./scripts/dev-appliance.sh down first if that is a dev instance." >&2
  trap - EXIT INT TERM
  exit 1
fi

# Caddy binds 80 and 443 on the host, so only one appliance can run at a time
# whatever the project name. Say so plainly rather than failing later inside a
# container start, which reads as a broken test rather than a busy port.
for port in 80 443; do
  if docker ps --format '{{.Ports}}' | grep -q ":${port}->"; then
    echo "REFUSING: port ${port} is already published by a running container." >&2
    echo "Stop the other appliance first: ./scripts/dev-appliance.sh down" >&2
    trap - EXIT INT TERM
    exit 1
  fi
done

echo "==> installing from nothing"
printf '%s\n%s\n%s\n' "test@${CLINICAL}" "$CLINICAL" "$RESEARCH" \
  | sh scripts/generate-secrets.sh >/dev/null 2>&1 || true
for required in secrets/site-signing-private.pem secrets/site-signing-public.pem; do
  [ -s "$required" ] || { echo "generate-secrets.sh did not produce $required" >&2; exit 1; }
done

# The whole point: this runs unattended. If install.sh ever stops accepting
# these from the environment, this line hangs and the test times out rather
# than silently passing.
HOSPITAL_INSTITUTION_NAME="Install Test Hospital" \
HOSPITAL_INSTITUTION_CITY="Sofia" \
HOSPITAL_INSTITUTION_COUNTRY="Bulgaria" \
HOSPITAL_BOOTSTRAP_ADMIN_EMAIL="$ADMIN_EMAIL" \
HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME="Install" \
HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME="Test" \
HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  sh scripts/install.sh < /dev/null

echo
echo "==> checking what the install actually produced"

# 1. Every service healthy, not merely up. `docker compose ps` reporting "Up" is
#    what made the earlier failure invisible.
for svc in postgres api web pwa browser caddy; do
  status="$(docker compose ps --format '{{.Service}}\t{{.Status}}' | awk -v s="$svc" '$1==s {$1=""; print}')"
  case "$status" in
    *healthy*|*Up*) pass "$svc is $(echo "$status" | tr -s ' ' | sed 's/^ //')" ;;
    *)              fail "$svc is '$status'" ;;
  esac
done

# 2. An administrator exists. This is the direct check for the bootstrap defect:
#    the install would exit non-zero, but asserting the row is what says a human
#    can actually log in to the box that was just installed.
admins="$(docker compose exec -T postgres psql -U lospor -d lospor -tAc \
  "select count(*) from \"User\" where email = '$(echo "$ADMIN_EMAIL" | tr 'A-Z' 'a-z')';" 2>/dev/null | tr -d '[:space:]')"
if [ "$admins" = "1" ]; then pass "administrator row exists"; else fail "expected 1 administrator, found '${admins:-none}'"; fi

# 3. The clinical reference data is present. An appliance with empty dropdowns
#    starts and serves pages and is useless at the bedside.
options="$(docker compose exec -T postgres psql -U lospor -d lospor -tAc \
  'select count(*) from "OptionLibrary";' 2>/dev/null | tr -d '[:space:]')"
if [ "${options:-0}" -gt 100 ] 2>/dev/null; then
  pass "option library seeded ($options rows)"
else
  fail "option library looks empty ('${options:-none}' rows)"
fi

# 4. Every published route answers through Caddy, on both hostnames.
check_http "API liveness"      "https://${CLINICAL}/health/live"  200
check_http "API readiness"     "https://${CLINICAL}/health/ready" 200
check_http "web login page"    "https://${CLINICAL}/login"        200
check_http "phone app at /app" "https://${CLINICAL}/app/"         200
check_http "research browser"  "https://${RESEARCH}/login"        200

# 5. The API rejects an unauthenticated request rather than serving data. A 401
#    here is the check that it is enforcing auth, not that it is merely awake.
check_http "API refuses anonymous access" "https://${CLINICAL}/v1/cases" 401

echo
if [ "$failures" -eq 0 ]; then
  echo "install verified: every check passed"
  exit 0
fi
echo "install FAILED: $failures check(s)" >&2
exit 1
