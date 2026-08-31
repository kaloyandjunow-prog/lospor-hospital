#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM
tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }

mkdir -p "$work/site/scripts" "$work/site/apps/api/prisma" "$work/bin"
cp "$root/scripts/doctor.sh" "$work/site/scripts/"
cp "$root/scripts/installed-release-state.sh" "$work/site/scripts/"
cp "$root/scripts/operator-locale.sh" "$work/site/scripts/"
printf '%s\n' 'LOSPOR_DEFAULT_LOCALE=en' > "$work/site/.env"
printf '%s\n' 'generator client {}' > "$work/site/apps/api/prisma/schema.prisma"

cat_stub='#!/bin/sh
printf "%s\n" "$*" >> "$DOCTOR_DOCKER_LOG"
case "$*" in
  *"exec -T postgres psql "*) printf "%s\n" 1 ;;
  *"exec -T status node -e"*)
    case "$*" in *"${DOCTOR_FAIL_URL:-__never__}"*) exit 1 ;; esac ;;
esac
exit 0
'
printf '%s' "$cat_stub" > "$work/bin/docker"
printf '%s\n' '#!/bin/sh' 'exit 0' > "$work/site/scripts/appliance-operator.sh"
printf '%s\n' '#!/bin/sh' 'printf "%s\n" "$*" >> "$DOCTOR_TERMINOLOGY_LOG"' 'exit 0' \
  > "$work/site/scripts/terminology-status.sh"
chmod +x "$work/bin/docker" "$work/site/scripts/"*.sh

run_doctor() {
  DOCTOR_DOCKER_LOG="$work/docker.log" \
  DOCTOR_TERMINOLOGY_LOG="$work/terminology.log" \
  PATH="$work/bin:$PATH" \
    sh "$work/site/scripts/doctor.sh" --restore-preopen
}

: > "$work/docker.log"
: > "$work/terminology.log"
output="$(run_doctor)" || fail "healthy restored services did not pass"
[ "$(printf '%s\n' "$output" | grep -c '^RESTORE_PREOPEN_OK$')" -eq 1 ] \
  || fail "the exact restore pre-open proof was not emitted once"
for required in \
  'pg_isready' \
  'prisma/build/index.js migrate status --schema prisma/schema.prisma' \
  'http://api:3002/health/live' \
  'http://api:3002/health/ready' \
  'http://web:3000/login' \
  'http://pwa:8080/health' \
  'http://browser:3003/login' \
  'http://127.0.0.1:3004/internal/health/live'
do
  grep -Fq "$required" "$work/docker.log" || fail "pre-open doctor skipped $required"
done
# Terminology gates reopening only for an appliance that HAD approved
# terminology. This fixture has none, so a restore must not invent a clinical
# approval the appliance was already running without: normal operation only
# warns about missing terminology, and refusing to reopen after a restore left
# a site that was serving patients five minutes earlier unable to come back.
grep -Fxq -- '--go-live' "$work/terminology.log" \
  && fail "pre-open doctor demanded go-live terminology on an appliance that never had an approved package"
# The stub records "$*", so a no-argument call logs an empty line: test for the
# line existing, not for it having content.
[ -s "$work/terminology.log" ] \
  || fail "pre-open doctor skipped the terminology report entirely"
ok "reopening does not require terminology an appliance never had"

# The regression check that must survive: an appliance WITH an approved package
# has to still have a valid one after the restore. Losing or corrupting
# terminology across a restore is a real fault.
mkdir -p "$work/site/.data/terminology"
printf 'LOSPOR-HOSPITAL-TERMINOLOGY-V1\t%s\tpkg\t1\t2026-08-30T00:00:00Z\top\t-\trun\n' \
  "$(printf 'x' | sha256sum | awk '{print $1}')" > "$work/site/.data/terminology/active.tsv"
: > "$work/terminology.log"
run_doctor > "$work/out" 2>&1 || true
grep -Fxq -- '--go-live' "$work/terminology.log" \
  || fail "pre-open doctor skipped strict terminology readiness for an appliance that had an approved package"
rm -rf "$work/site/.data/terminology"
ok "an appliance with approved terminology must still prove it after a restore"
if grep -Eq 'caddy|https://|--resolve|openssl' "$work/docker.log"; then
  fail "pre-open doctor touched Caddy or a public TLS route"
fi
ok "pre-open mode proves the closed internal stack, schema and terminology before emitting its exact marker"

: > "$work/docker.log"
: > "$work/terminology.log"
set +e
failed_output="$(DOCTOR_FAIL_URL='http://browser:3003/login' run_doctor 2>&1)"
failed_result=$?
set -e
[ "$failed_result" -ne 0 ] || fail "an unhealthy internal Browser passed pre-open doctor"
! printf '%s\n' "$failed_output" | grep -q '^RESTORE_PREOPEN_OK$' \
  || fail "a failed pre-open doctor emitted the success proof"
case "$failed_output" in *"public access remains closed"*) ;; *)
  fail "the English failure did not explain that the edge stays closed" ;;
esac
ok "an internal service failure keeps the public edge closed and emits no success proof"

: > "$work/docker.log"
set +e
failed_bg="$(LOSPOR_DEFAULT_LOCALE=bg DOCTOR_FAIL_URL='http://browser:3003/login' run_doctor 2>&1)"
failed_bg_result=$?
set -e
[ "$failed_bg_result" -ne 0 ] || fail "Bulgarian failure path unexpectedly passed"
case "$failed_bg" in *"публичният достъп остава затворен"*) ;; *)
  fail "the Bulgarian failure was not localized" ;;
esac
ok "restore pre-open failures are explained in Bulgarian"

printf 'doctor restore pre-open tests passed (%s)\n' "$tests"
