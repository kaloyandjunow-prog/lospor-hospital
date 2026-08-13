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

# This end-to-end test uses synthetic .localhost DNS and may run on a smaller CI
# runner or Docker Desktop. The exact isolated project name plus this explicit
# test-only assertion makes readiness report-only here while every real
# installation remains fail-closed. The readiness rules have separate positive
# and negative tests in readiness-check.test.sh.
HOSPITAL_ALLOW_UNSUPPORTED_TEST_HOST=1
export HOSPITAL_ALLOW_UNSUPPORTED_TEST_HOST

CLINICAL="lospor-test.localhost"
RESEARCH="lospor-test-research.localhost"
ADMIN_EMAIL="install-test@lospor.localhost"
ADMIN_PASSWORD="InstallTest!2026"
failures=0
completed_success=0

pass() { printf "  ok    %s\n" "$1"; }
fail() { printf "  FAIL  %s\n" "$1"; failures=$((failures + 1)); }

check_http() {
  label="$1"; url="$2"; want="$3"
  got="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 30 "$url" 2>/dev/null || echo 000)"
  if [ "$got" = "$want" ]; then pass "$label ($got)"; else fail "$label — expected $want, got $got"; fi
}

# Git Bash on Windows otherwise rewrites the Linux container path into a host
# path before Docker runs `test` inside Status. Ordinary POSIX shells ignore
# this compatibility variable.
status_signal_exists() {
  MSYS_NO_PATHCONV=1 docker compose exec -T status test -s "$1"
}

# Always tear down, including on failure. A surviving volume is not merely
# untidy: Postgres only applies POSTGRES_PASSWORD when it initialises an empty
# data directory, so a leftover volume makes the *next* run fail to authenticate
# for reasons that look nothing like the real cause.
cleanup() {
  echo
  if [ "${HOSPITAL_TEST_RETAIN_ON_SUCCESS:-}" = 1 ] && [ "$completed_success" -eq 1 ]; then
    echo "==> retaining the verified test appliance for manual browser inspection"
    echo "    run: COMPOSE_PROJECT_NAME=$COMPOSE_PROJECT_NAME docker compose down -v --remove-orphans"
    return
  fi
  echo "==> tearing down"
  docker compose down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f .env
  rm -rf secrets/api 2>/dev/null || true
  rm -rf secrets/status 2>/dev/null || true
  remaining="$(docker volume ls -q --filter "name=${COMPOSE_PROJECT_NAME}" | wc -l | tr -d ' ')"
  if [ "$remaining" = "0" ]; then
    echo "    volumes removed"
  else
    echo "    WARNING: $remaining lospor-hospital volume(s) survived teardown" >&2
  fi
}
trap cleanup EXIT INT TERM

if [ -e .env ] || [ -e secrets/api ] || [ -e secrets/status ]; then
  echo "REFUSING: appliance configuration or secret directories already exist." >&2
  echo "This test installs from nothing and" >&2
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
for required in secrets/api/site-signing-private.pem secrets/api/site-signing-public.pem; do
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
  sh scripts/install.sh <<EOF
${ADMIN_PASSWORD}
${ADMIN_PASSWORD}
EOF

echo
echo "==> checking what the install actually produced"

# 1. Services with health checks must actually become healthy. Merely matching
#    "Up" also matches "Up ... (health: starting)", which previously allowed a
#    cold install to pass before its applications were ready.
for svc in postgres api web pwa browser status; do
  health_attempts=0
  health_result=""
  while [ "$health_attempts" -lt 60 ]; do
    status="$(docker compose ps --format '{{.Service}}\t{{.Status}}' | awk -v s="$svc" '$1==s {$1=""; print}')"
    case "$status" in
      *unhealthy*|*Exited*|*Restarting*|"") health_result="failed"; break ;;
      *healthy*) health_result="healthy"; break ;;
      *) health_attempts=$((health_attempts + 1)); sleep 2 ;;
    esac
  done
  if [ "$health_result" = "healthy" ]; then
    pass "$svc is $(echo "$status" | tr -s ' ' | sed 's/^ //')"
  else
    fail "$svc did not become healthy (${status:-missing})"
  fi
done

# Caddy, the worker and the backup scheduler have no Docker health check. Their
# real behavior is tested below by HTTPS, heartbeat and verified-backup probes.
for svc in caddy delivery-worker backup; do
  status="$(docker compose ps --format '{{.Service}}\t{{.Status}}' | awk -v s="$svc" '$1==s {$1=""; print}')"
  case "$status" in
    *unhealthy*|*Exited*|*Restarting*|"") fail "$svc is '${status:-missing}'" ;;
    *Up*) pass "$svc is $(echo "$status" | tr -s ' ' | sed 's/^ //')" ;;
    *) fail "$svc is '$status'" ;;
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
check_http "status login"      "https://${CLINICAL}/status/login" 200
check_http "status fallback"   "https://localhost:3443/status/login" 200

# 5. The API rejects an unauthenticated request rather than serving data. A 401
#    here is the check that it is enforcing auth, not that it is merely awake.
check_http "API refuses anonymous access" "https://${CLINICAL}/v1/cases" 401

# The one password must work in both independently verified products. Send it
# only on stdin; never put it in curl argv or persist it in configuration.
clinical_login_status="$(
  printf '%s\n%s\n' "$ADMIN_EMAIL" "$ADMIN_PASSWORD" \
    | sh scripts/container-node.sh scripts/credential-json.mjs status-init \
    | curl -sk -o /dev/null -w '%{http_code}' --max-time 30 \
        -H 'Content-Type: application/json' --data-binary @- \
        "https://${CLINICAL}/v1/auth/token"
)"
if [ "$clinical_login_status" = 200 ]; then
  pass "operator password signs in to the clinical API"
else
  fail "clinical operator sign-in returned $clinical_login_status"
fi

mkdir -p .data
cookie_jar=".data/status-install-test.cookies"
rm -f "$cookie_jar"
status_login_status="$(
  printf 'email=%s&password=%s' "$ADMIN_EMAIL" "$ADMIN_PASSWORD" \
    | curl -sk -o /dev/null -w '%{http_code}' --max-time 30 \
        -H 'Origin: https://localhost:3443' \
        -H 'Content-Type: application/x-www-form-urlencoded' \
        -c "$cookie_jar" --data-binary @- \
        "https://localhost:3443/status/login"
)"
if [ "$status_login_status" = 303 ] \
  && [ "$(curl -sk -o /dev/null -w '%{http_code}' --max-time 30 \
      -b "$cookie_jar" https://localhost:3443/status/api/state)" = 200 ]; then
  pass "same password signs in to independent Status"
else
  fail "independent Status operator sign-in failed ($status_login_status)"
fi
rm -f "$cookie_jar"

# Plaintext must never survive setup in files, Compose metadata, container
# metadata, SQLite or service logs.
credential_leaked=0
case "$(cat .env compose.yaml 2>/dev/null)" in
  *"$ADMIN_PASSWORD"*) credential_leaked=1 ;;
esac
config_text="$(docker compose config 2>/dev/null)"
case "$config_text" in *"$ADMIN_PASSWORD"*) credential_leaked=1 ;; esac
unset config_text
container_ids="$(docker compose ps -q)"
if [ -n "$container_ids" ]; then
  inspect_text="$(docker inspect $container_ids 2>/dev/null)"
  case "$inspect_text" in *"$ADMIN_PASSWORD"*) credential_leaked=1 ;; esac
  unset inspect_text
fi
logs_text="$(docker compose logs --no-color 2>/dev/null)"
case "$logs_text" in *"$ADMIN_PASSWORD"*) credential_leaked=1 ;; esac
case "$logs_text" in *"$ADMIN_EMAIL"*) credential_leaked=1 ;; esac
unset logs_text
printf '%s' "$ADMIN_PASSWORD" \
  | docker compose exec -T status node -e \
      "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{const fs=require('fs');if(fs.readFileSync('/data/status.sqlite').includes(Buffer.from(s)))process.exit(1)})" \
  || credential_leaked=1
if [ "$credential_leaked" -eq 0 ]; then
  pass "operator plaintext is absent from persisted/runtime metadata and logs"
else
  fail "operator plaintext leaked beyond the one-shot setup/login request"
fi

# 6. Both independent verifiers were created from the same one-time prompt and
# reached the same generation. This checks generations only; no hash or email
# is printed by the command.
if sh scripts/appliance-operator.sh verify; then
  pass "operator credential stores are synchronized"
else
  fail "operator credential stores disagree"
fi

# 6b. Coordinated rotation updates both independent hashes, revokes old
# credentials and leaves generations aligned.
ROTATED_PASSWORD="InstallRotated!2026"
if sh scripts/appliance-operator.sh rotate <<EOF
${ADMIN_EMAIL}
${ROTATED_PASSWORD}
${ROTATED_PASSWORD}
EOF
then
  api_attempts=0
  while [ "$api_attempts" -lt 30 ]; do
    code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 3 "https://${CLINICAL}/health/ready" 2>/dev/null || true)"
    [ "$code" = 200 ] && break
    api_attempts=$((api_attempts + 1))
    sleep 1
  done

  clinical_new="$(printf '%s\n%s\n' "$ADMIN_EMAIL" "$ROTATED_PASSWORD" \
    | sh scripts/container-node.sh scripts/credential-json.mjs status-init \
    | curl -sk -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
        --data-binary @- "https://${CLINICAL}/v1/auth/token")"
  clinical_old="$(printf '%s\n%s\n' "$ADMIN_EMAIL" "$ADMIN_PASSWORD" \
    | sh scripts/container-node.sh scripts/credential-json.mjs status-init \
    | curl -sk -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
        --data-binary @- "https://${CLINICAL}/v1/auth/token")"
  status_new="$(printf 'email=%s&password=%s' "$ADMIN_EMAIL" "$ROTATED_PASSWORD" \
    | curl -sk -o /dev/null -w '%{http_code}' -H 'Origin: https://localhost:3443' \
        -H 'Content-Type: application/x-www-form-urlencoded' --data-binary @- \
        https://localhost:3443/status/login)"
  status_old="$(printf 'email=%s&password=%s' "$ADMIN_EMAIL" "$ADMIN_PASSWORD" \
    | curl -sk -o /dev/null -w '%{http_code}' -H 'Origin: https://localhost:3443' \
        -H 'Content-Type: application/x-www-form-urlencoded' --data-binary @- \
        https://localhost:3443/status/login)"
  if [ "$clinical_new" = 200 ] && [ "$clinical_old" = 401 ] \
    && [ "$status_new" = 303 ] && [ "$status_old" = 401 ] \
    && sh scripts/appliance-operator.sh verify; then
    pass "coordinated rotation accepts only the new credential in both services"
  else
    fail "coordinated rotation verification failed (clinical $clinical_new/$clinical_old, Status $status_new/$status_old)"
  fi
else
  fail "coordinated operator rotation command failed"
fi

# 7. Durable service signals must be visible from Status, not inferred from a
# running container. Trigger a verified backup now rather than waiting a day.
if sh scripts/backup-now.sh >/dev/null 2>&1 \
  && status_signal_exists /signals/backup-status.v1.json; then
  pass "verified backup marker is visible to Status"
else
  fail "verified backup marker is missing"
fi

worker_attempts=0
while [ "$worker_attempts" -lt 15 ] && \
  ! status_signal_exists /signals/delivery-worker-status.v1.json; do
  worker_attempts=$((worker_attempts + 1))
  sleep 2
done
if status_signal_exists /signals/delivery-worker-status.v1.json; then
  pass "delivery-worker heartbeat is visible to Status"
else
  fail "delivery-worker heartbeat is missing"
fi

# 8. The outage claim: stop both clinical API and database, then prove the
# independent login and liveness endpoints still answer on the loopback-only
# HTTPS fallback. Bring them back before teardown so the failed state does not
# hide cleanup errors.
docker compose stop api postgres >/dev/null
check_http "Status survives API and database outage" \
  "https://localhost:3443/status/login" 200
if docker compose exec -T status node -e \
  "fetch('http://127.0.0.1:3004/internal/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"; then
  pass "Status liveness survives API and database outage"
else
  fail "Status liveness failed during API and database outage"
fi
docker compose start postgres >/dev/null
postgres_attempts=0
while [ "$postgres_attempts" -lt 30 ] && \
  ! docker compose exec -T postgres pg_isready -U lospor -d lospor >/dev/null 2>&1; do
  postgres_attempts=$((postgres_attempts + 1))
  sleep 1
done
docker compose start api >/dev/null

for failed_service in web pwa browser caddy delivery-worker backup; do
  docker compose stop "$failed_service" >/dev/null
  if [ "$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 \
      https://localhost:3443/status/login 2>/dev/null || true)" = 200 ]; then
    pass "Status fallback survives $failed_service outage"
  else
    fail "Status fallback failed during $failed_service outage"
  fi
  docker compose start "$failed_service" >/dev/null
done

docker compose restart status >/dev/null
status_restart_attempts=0
while [ "$status_restart_attempts" -lt 30 ]; do
  code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 3 \
    https://localhost:3443/status/login 2>/dev/null || true)"
  [ "$code" = 200 ] && break
  status_restart_attempts=$((status_restart_attempts + 1))
  sleep 1
done
if [ "$code" = 200 ] && sh scripts/appliance-operator.sh verify; then
  pass "Status auth and history volume survive a monitor restart"
else
  fail "Status did not recover cleanly from its own restart"
fi

echo
if [ "$failures" -eq 0 ]; then
  echo "install verified: every check passed"
  completed_success=1
  exit 0
fi
echo "install FAILED: $failures check(s)" >&2
exit 1
