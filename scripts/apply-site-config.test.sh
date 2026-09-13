#!/bin/sh
set -eu

source_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM
tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; [ ! -f "$work/out" ] || sed 's/^/    /' "$work/out" >&2; exit 1; }

secret="$(printf 's%.0s' $(seq 64))"
fixture() {
  rm -rf "$work/site" "$work/bin" "$work/docker.log"
  mkdir -p "$work/site/scripts" "$work/site/secrets" "$work/site/.data" "$work/bin"
  for script in apply-site-config.sh installed-release-state.sh operator-locale.sh update-pipeline-lib.sh site-config.sh network-boundaries.py support-url.py; do
    cp "$source_root/scripts/$script" "$work/site/scripts/"
  done
  cat > "$work/site/scripts/doctor.sh" <<'STUB'
#!/bin/sh
count_file="$DOCTOR_COUNT"
count=$(( $(cat "$count_file" 2>/dev/null || echo 0) + 1 ))
printf '%s\n' "$count" > "$count_file"
case "${DOCTOR_RESULTS:-pass}" in
  pass) exit 0 ;;
  fail-then-pass) [ "$count" -ge 2 ] ;;
  fail) exit 1 ;;
  needs-lock) flock -n "$DOCTOR_LOCK" true ;;
esac
STUB
  cat > "$work/bin/docker" <<'STUB'
#!/bin/sh
printf '%s\n' "$*" >> "$DOCKER_LOG"
exit 0
STUB
  chmod +x "$work/bin/docker"
  cat > "$work/site/site.env" <<'EOF'
LOSPOR_DEFAULT_LOCALE=en
HOSPITAL_CLINICAL_DOMAIN=clinical.example.org
HOSPITAL_RESEARCH_DOMAIN=research.example.org
HOSPITAL_TLS_MODE=local
ACME_EMAIL=it@example.org
AUTH_EMAIL_FROM=no-reply@clinical.example.org
HOSPITAL_RESEARCH_ALLOWED_CIDRS="10.20.30.0/24"
HOSPITAL_STATUS_ALLOWED_CIDRS="10.20.40.0/24"
HOSPITAL_SUPPORT_URL=
HOSPITAL_UPDATE_SUPPLY_MODE=offline
EOF
  printf 'HOSPITAL_POSTGRES_PASSWORD=%s\n' "$secret" > "$work/site/secrets/appliance.env"
  chmod 600 "$work/site/site.env" "$work/site/secrets/appliance.env"
  : > "$work/site/.data/io-mutation.lock"
  chmod 600 "$work/site/.data/io-mutation.lock"
  (. "$work/site/scripts/site-config.sh" && site_config_compile "$work/site")
  rm -f "$work/doctor.count"
}

run_apply() {
  DOCTOR_LOCK="$work/site/.data/io-mutation.lock" PATH="$work/bin:$PATH" DOCKER_LOG="$work/docker.log" DOCTOR_COUNT="$work/doctor.count" \
    HOSPITAL_SITE_CONFIG_TEST_ONLY=1 HOSPITAL_UPDATE_TEST_ONLY=1 LOSPOR_OPERATOR_LOCALE=en "$@" \
    sh "$work/site/scripts/apply-site-config.sh" $apply_mode > "$work/out" 2>&1
}
set_site() { (. "$work/site/scripts/site-config.sh" && site_config_set "$work/site/site.env" "$1" "$2"); }

# 1. A plan names the changed setting, prints no secret, and changes nothing.
fixture
set_site HOSPITAL_STATUS_ALLOWED_CIDRS '"10.20.41.0/24"'
env_before="$(cat "$work/site/.env")"
apply_mode=--plan
run_apply env || fail "a valid plan was refused"
grep -Fq 'HOSPITAL_STATUS_ALLOWED_CIDRS: 10.20.40.0/24 -> 10.20.41.0/24' "$work/out" || fail "the plan did not name the change"
! grep -Fq "$secret" "$work/out" || fail "the plan printed a secret"
[ "$(cat "$work/site/.env")" = "$env_before" ] || fail "a plan changed .env"
! grep -q '^compose up' "$work/docker.log" || fail "a plan started services"
ok "a plan names the changed setting, prints no secret, and changes nothing"

# 1b. A setting changed from blank shows blank on the old side. Splitting the
#     change on whitespace once shifted the new value into the old column.
fixture
set_site HOSPITAL_SUPPORT_URL 'mailto:it@example.org'
apply_mode=--plan
run_apply env || fail "a plan from a blank value was refused"
grep -Fq 'HOSPITAL_SUPPORT_URL: (blank) -> mailto:it@example.org' "$work/out" || fail "a change from blank was shown the wrong way round"
ok "a change from a blank value is shown the right way round"

# 2. Nothing to change is a success that touches nothing.
fixture
apply_mode=--yes
run_apply env || fail "an unchanged site.env was refused"
grep -Fq 'nothing to change' "$work/out" || fail "an unchanged site.env was not reported as such"
! grep -q '^compose up' "$work/docker.log" 2>/dev/null || fail "an unchanged configuration restarted services"
ok "an unchanged site.env applies nothing"

# 3-4. Unsafe input is refused before anything is compiled or started.
fixture
set_site HOSPITAL_RESEARCH_ALLOWED_CIDRS '"0.0.0.0/0"'
env_before="$(cat "$work/site/.env")"
if run_apply env; then fail "a world-open allowlist was accepted"; fi
grep -Fq 'HOSPITAL_RESEARCH_ALLOWED_CIDRS is not an exact, safe network list' "$work/out" || fail "the unsafe allowlist was not named"
[ "$(cat "$work/site/.env")" = "$env_before" ] || fail "a refused change altered .env"
ok "a world-open network allowlist is refused and nothing changes"

fixture
printf 'HOSPITAL_POSTGRES_PASSWORD=typed-by-hand\n' >> "$work/site/site.env"
if run_apply env; then fail "a secret typed into site.env was accepted"; fi
grep -Fq 'site.env is invalid' "$work/out" || fail "a secret in site.env was not refused as invalid"
ok "a secret typed into site.env is refused"

# 5. A healthy apply updates .env, restarts through Compose, and records it.
fixture
set_site HOSPITAL_STATUS_ALLOWED_CIDRS '"10.20.41.0/24"'
run_apply env || fail "a valid change was not applied"
grep -qx 'HOSPITAL_STATUS_ALLOWED_CIDRS="10.20.41.0/24"' "$work/site/.env" || fail ".env was not updated"
grep -qx 'compose up -d --wait --wait-timeout 300' "$work/docker.log" || fail "services were not reconciled"
grep -Fq 'HOSPITAL_STATUS_ALLOWED_CIDRS' "$work/site/.data/config/applied.v1.tsv" || fail "the change was not recorded"
grep -qx 'HOSPITAL_STATUS_ALLOWED_CIDRS="10.20.40.0/24"' "$work/site/.data/config/last-known-good/site.env" \
  || fail "last-known-good did not keep the running setting"
ok "a healthy change is applied, reconciled, and recorded"

# 6. An unhealthy result restores the running configuration, not the edit.
fixture
set_site HOSPITAL_STATUS_ALLOWED_CIDRS '"10.20.41.0/24"'
if run_apply env DOCTOR_RESULTS=fail-then-pass; then fail "an unhealthy change reported success"; fi
grep -qx 'HOSPITAL_STATUS_ALLOWED_CIDRS="10.20.40.0/24"' "$work/site/.env" || fail ".env was not restored"
grep -qx 'HOSPITAL_STATUS_ALLOWED_CIDRS="10.20.40.0/24"' "$work/site/site.env" || fail "site.env was restored to the rejected edit"
grep -qx 'HOSPITAL_STATUS_ALLOWED_CIDRS="10.20.41.0/24"' "$work/site/.data/config/site.env.rejected" || fail "the rejected edit was not kept"
[ "$(grep -c '^compose up -d --wait' "$work/docker.log")" = 2 ] || fail "the previous configuration was not started again"
ok "an unhealthy change is rolled back to the running configuration"

# 7. If even the rollback is unhealthy, it says recovery is required.
fixture
set_site HOSPITAL_STATUS_ALLOWED_CIDRS '"10.20.41.0/24"'
set +e; run_apply env DOCTOR_RESULTS=fail; result=$?; set -e
[ "$result" = 3 ] || fail "a failed rollback did not exit 3 (got $result)"
grep -Fq 'RECOVERY REQUIRED' "$work/out" || fail "a failed rollback was not reported as recovery required"
ok "a failed rollback reports recovery required"

# 8. Doctor runs without the maintenance lock: its backup check takes that lock,
#    and holding it across doctor rolled back every apply on a real appliance.
fixture
set_site HOSPITAL_STATUS_ALLOWED_CIDRS '"10.20.41.0/24"'
run_apply env DOCTOR_RESULTS=needs-lock || fail "doctor could not take the maintenance lock during apply"
ok "doctor runs without the maintenance lock held"

# 9. An advanced setting is planned and applied like a site setting, and one
#    outside its limits is refused before anything is compiled.
fixture
printf 'HOSPITAL_BACKUP_INTERVAL_SECONDS=14400\n' >> "$work/site/secrets/appliance.env"
(. "$work/site/scripts/site-config.sh" && site_config_compile "$work/site")
printf 'HOSPITAL_BACKUP_INTERVAL_SECONDS=7200\n' > "$work/site/advanced.env"
apply_mode=--plan
run_apply env || fail "a valid advanced plan was refused"
grep -Fq 'HOSPITAL_BACKUP_INTERVAL_SECONDS: 14400 -> 7200' "$work/out" || fail "the plan did not name the advanced change"
apply_mode=--yes
run_apply env || fail "a valid advanced change was not applied"
grep -qx 'HOSPITAL_BACKUP_INTERVAL_SECONDS=7200' "$work/site/.env" || fail ".env did not take the advanced value"
[ "$(grep -c '^HOSPITAL_BACKUP_INTERVAL_SECONDS=' "$work/site/.env")" = 1 ] || fail "the advanced key appears twice in .env"
printf 'HOSPITAL_BACKUP_INTERVAL_SECONDS=86400\n' > "$work/site/advanced.env"
env_before="$(cat "$work/site/.env")"
if run_apply env; then fail "a backup interval past the four-hour policy was accepted"; fi
grep -Fq 'advanced.env is invalid or outside its limits' "$work/out" || fail "the out-of-limit value was not named"
[ "$(cat "$work/site/.env")" = "$env_before" ] || fail "a refused advanced value altered .env"
ok "an advanced setting is planned and applied, and one outside its limits is refused"

# 10. An unhealthy advanced change is rolled back to the running values.
fixture
printf 'HOSPITAL_BACKUP_INTERVAL_SECONDS=14400\n' >> "$work/site/secrets/appliance.env"
printf 'HOSPITAL_BACKUP_INTERVAL_SECONDS=10800\n' > "$work/site/advanced.env"
chmod 600 "$work/site/advanced.env"
(. "$work/site/scripts/site-config.sh" && site_config_compile "$work/site")
printf 'HOSPITAL_BACKUP_INTERVAL_SECONDS=3600\n' > "$work/site/advanced.env"
apply_mode=--yes
if run_apply env DOCTOR_RESULTS=fail-then-pass; then fail "an unhealthy advanced change reported success"; fi
[ "$(cat "$work/site/advanced.env")" = 'HOSPITAL_BACKUP_INTERVAL_SECONDS=10800' ] || fail "advanced.env was not restored to the running value"
grep -qx 'HOSPITAL_BACKUP_INTERVAL_SECONDS=10800' "$work/site/.env" || fail ".env was not restored"
grep -qx 'HOSPITAL_BACKUP_INTERVAL_SECONDS=3600' "$work/site/.data/config/advanced.env.rejected" || fail "the rejected advanced edit was not kept"
ok "an unhealthy advanced change is rolled back to the running values"

echo "apply-site-config tests passed ($tests)"
