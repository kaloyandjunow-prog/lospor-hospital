#!/bin/sh
# configure-network-boundaries.sh (coverage review 1.4.13). It rewrites who can
# reach Research and Status, and restarts the edge. So: a new boundary is
# applied only after the candidate validates, a refused or failed change
# leaves the working configuration exactly as it was, the previous values are
# kept as last-known-good, and admitting every private network needs both
# flags. Docker is stubbed; python3 is required (network-boundaries.py).
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
  for script in configure-network-boundaries.sh installed-release-state.sh operator-locale.sh site-config.sh network-boundaries.py; do
    cp "$source_root/scripts/$script" "$work/site/scripts/"
  done
  # Records every call. DOCKER_FAIL names the step that fails:
  # config (candidate refused), validate (Caddy refuses it) or up (edge will not start).
  cat > "$work/bin/docker" <<'STUB'
#!/bin/sh
printf '%s\n' "$*" >> "$DOCKER_LOG"
case "$*" in
  *"config --quiet"*) [ "${DOCKER_FAIL:-}" != config ] ;;
  *"caddy validate"*) [ "${DOCKER_FAIL:-}" != validate ] ;;
  *"up -d"*) [ "${DOCKER_FAIL:-}" != up ] || { [ -e "$DOCKER_LOG.failed" ] && exit 0; : > "$DOCKER_LOG.failed"; exit 1; } ;;
esac
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
  (. "$work/site/scripts/site-config.sh" && site_config_compile "$work/site")
  cp "$work/site/site.env" "$work/site.before"
  cp "$work/site/.env" "$work/env.before"
}

run() {
  PATH="$work/bin:$PATH" DOCKER_LOG="$work/docker.log" LOSPOR_OPERATOR_LOCALE=en \
    HOSPITAL_SITE_CONFIG_TEST_ONLY=1 HOSPITAL_UPDATE_TEST_ONLY=1 \
    sh "$work/site/scripts/configure-network-boundaries.sh" "$@" > "$work/out" 2>&1 < /dev/null
}
value() { sed -n "s/^$1=//p" "$2" | tail -n 1 | tr -d '"'; }
unchanged() {
  cmp -s "$work/site/site.env" "$work/site.before" && cmp -s "$work/site/.env" "$work/env.before"
}
no_leftovers() { ! ls "$work/site" | grep -q 'network-rollback\|network-apply'; }

# 1. A valid change: canonical values in site.env and .env, the old ones kept.
fixture
run --research "10.20.31.0/24 10.20.30.0/24" --status "10.20.41.0/24" || fail "a valid change was refused"
[ "$(value HOSPITAL_RESEARCH_ALLOWED_CIDRS "$work/site/site.env")" = "10.20.30.0/24 10.20.31.0/24" ] || fail "research CIDRs not canonical in site.env"
[ "$(value HOSPITAL_STATUS_ALLOWED_CIDRS "$work/site/.env")" = "10.20.41.0/24" ] || fail ".env was not recompiled"
[ "$(value HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE "$work/site/site.env")" = "" ] || fail "private-network override set without the flags"
last_good="$work/site/.data/network/last-known-good-boundaries.tsv"
printf 'LOSPOR-HOSPITAL-NETWORK-V1\t[^\t]*\t10.20.30.0/24\t10.20.40.0/24\n' > "$work/pattern"
grep -q "$(cat "$work/pattern")" "$last_good" || fail "last-known-good does not hold the previous values"
[ "$(stat -c %a "$last_good")" = 600 ] || fail "last-known-good is not private"
grep -q "config --quiet" "$work/docker.log" && grep -q "caddy validate" "$work/docker.log" || fail "the candidate was not validated"
[ "$(grep -n "caddy validate" "$work/docker.log" | cut -d: -f1)" -lt "$(grep -n "up -d" "$work/docker.log" | cut -d: -f1)" ] || fail "the edge restarted before validation"
no_leftovers || fail "rollback or apply files left behind"
ok "a valid change is canonical, validated first, and keeps the old values"

# 2. A boundary that admits the world is refused; nothing changes, nothing restarts.
fixture
if run --research "0.0.0.0/0" --status "10.20.41.0/24"; then fail "0.0.0.0/0 was accepted"; fi
unchanged || fail "a refused boundary changed the configuration"
! grep -q "up -d" "$work/docker.log" 2>/dev/null || fail "a refused boundary restarted the edge"
ok "a world-wide boundary is refused and changes nothing"

# 3. Every private network needs both flags; one alone is refused outright.
fixture
if run --research "10.0.0.0/8 172.16.0.0/12 192.168.0.0/16" --status "10.20.41.0/24"; then fail "all RFC1918 accepted without the override"; fi
unchanged || fail "the refused override changed the configuration"
set +e; run --unsafe-all-rfc1918 --research "10.20.31.0/24" --status "10.20.41.0/24"; code=$?; set -e
[ "$code" = 2 ] && unchanged || fail "the override without its confirmation was not refused ($code)"
run --unsafe-all-rfc1918 --confirm-all-rfc1918 --research "10.0.0.0/8 172.16.0.0/12 192.168.0.0/16" --status "10.20.41.0/24" \
  || fail "the confirmed override was refused"
[ "$(value HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE "$work/site/.env")" = confirmed ] || fail "the confirmed override was not recorded"
grep -q "WARNING" "$work/out" || fail "the override was applied without its warning"
ok "admitting every private network takes both flags and says so"

# 4. A candidate that Compose or Caddy refuses is never applied.
for step in config validate; do
  fixture
  if DOCKER_FAIL=$step run --research "10.20.31.0/24" --status "10.20.41.0/24"; then fail "applied although $step failed"; fi
  unchanged || fail "a candidate refused at $step changed the configuration"
  ! grep -q "up -d" "$work/docker.log" || fail "a candidate refused at $step restarted the edge"
  no_leftovers || fail "files left behind after $step failed"
done
ok "a candidate refused by Compose or Caddy changes nothing"

# 5. An edge that will not start with the new boundary gets the old one back.
fixture
if DOCKER_FAIL=up run --research "10.20.31.0/24" --status "10.20.41.0/24"; then fail "reported success although the edge did not start"; fi
unchanged || fail "the prior site.env and .env were not restored"
[ "$(grep -c "up -d" "$work/docker.log")" = 2 ] || fail "the edge was not restarted on the restored configuration"
grep -q "prior site.env and .env were restored" "$work/out" || fail "the operator was not told"
no_leftovers || fail "files left behind after the rollback"
ok "a boundary the edge cannot start with is rolled back"

echo "configure-network-boundaries: $tests passed"
