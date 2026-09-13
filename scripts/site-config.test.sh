#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM
tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }

. "$root/scripts/site-config.sh"

fresh_home() {
  rm -rf "$work/home"
  mkdir -p "$work/home/secrets"
  printf 'LOSPOR_DEFAULT_LOCALE=bg\nHOSPITAL_CLINICAL_DOMAIN=clinical.test\nHOSPITAL_TLS_MODE=local\nHOSPITAL_RESEARCH_ALLOWED_CIDRS="10.1.0.0/24"\n' > "$work/home/site.env"
  printf 'HOSPITAL_POSTGRES_PASSWORD=%s\nHOSPITAL_BACKUP_SITE_ID=site-1\n' "$(printf 'a%.0s' $(seq 64))" > "$work/home/secrets/appliance.env"
  chmod 600 "$work/home/site.env" "$work/home/secrets/appliance.env"
}

# 1. Both sources compile into one generated .env, verbatim, with a derived profile.
fresh_home
site_config_compile "$work/home" || fail "a valid configuration did not compile"
grep -q '^# GENERATED' "$work/home/.env" || fail "the generated .env is not marked as generated"
grep -qx 'HOSPITAL_RESEARCH_ALLOWED_CIDRS="10.1.0.0/24"' "$work/home/.env" || fail "a site line was not copied verbatim"
grep -qx 'HOSPITAL_BACKUP_SITE_ID=site-1' "$work/home/.env" || fail "an appliance line was not copied"
grep -qx 'COMPOSE_PROFILES=' "$work/home/.env" || fail "COMPOSE_PROFILES was not derived for local TLS"
[ "$(stat -c %a "$work/home/.env")" = 600 ] || fail "the generated .env is not 0600"
ok "site.env and appliance.env compile into a generated, private .env"

# 2. The ACME profile follows the certificate mode rather than being stored.
site_config_set "$work/home/site.env" HOSPITAL_TLS_MODE acme
site_config_compile "$work/home"
grep -qx 'COMPOSE_PROFILES=tls-acme' "$work/home/.env" || fail "acme TLS did not derive the tls-acme profile"
[ "$(grep -c '^HOSPITAL_TLS_MODE=' "$work/home/site.env")" = 1 ] || fail "setting a key duplicated it"
ok "the certificate mode derives the Compose profile, and set replaces in place"

# 3-6. Every way a source can be wrong refuses, and leaves the previous .env alone.
before="$(cat "$work/home/.env")"
refuses() {
  description="$1"; code="$2"
  if site_config_compile "$work/home" 2> "$work/err"; then fail "$description: compiled"; fi
  grep -q "$code" "$work/err" || fail "$description: expected $code"
  [ "$(cat "$work/home/.env")" = "$before" ] || fail "$description: .env changed"
  ok "$description"
}
fresh_home; site_config_compile "$work/home"; before="$(cat "$work/home/.env")"
printf 'HOSPITAL_POSTGRES_PASSWORD=exposed\n' >> "$work/home/site.env"
refuses "a secret put in site.env is refused" SITE_CONFIG_NOT_A_SITE_KEY

fresh_home; site_config_compile "$work/home"; before="$(cat "$work/home/.env")"
printf 'HOSPITAL_CLINICAL_DOMAIN=other.test\n' >> "$work/home/secrets/appliance.env"
refuses "a site key hidden in appliance.env is refused" SITE_CONFIG_SITE_KEY_IN_APPLIANCE

fresh_home; site_config_compile "$work/home"; before="$(cat "$work/home/.env")"
printf 'HOSPITAL_CLINICAL_DOMAIN=twice.test\n' >> "$work/home/site.env"
refuses "a duplicated key is refused" SITE_CONFIG_DUPLICATE

fresh_home; site_config_compile "$work/home"; before="$(cat "$work/home/.env")"
printf 'not a setting\n' >> "$work/home/site.env"
refuses "a malformed line is refused" SITE_CONFIG_MALFORMED

fresh_home; site_config_compile "$work/home"; before="$(cat "$work/home/.env")"
printf 'COMPOSE_PROFILES=tls-acme\n' >> "$work/home/secrets/appliance.env"
refuses "a stored derived key is refused" SITE_CONFIG_DERIVED_KEY

# 8. A legacy .env splits once by ownership, and recompiles to the same settings.
rm -rf "$work/legacy" && mkdir -p "$work/legacy"
printf 'LOSPOR_DEFAULT_LOCALE=en\nCOMPOSE_PROFILES=\nHOSPITAL_CLINICAL_DOMAIN=legacy.test\nHOSPITAL_POSTGRES_PASSWORD=secret-value\nHOSPITAL_STATUS_ALLOWED_CIDRS="10.9.0.0/24"\n' > "$work/legacy/.env"
chmod 600 "$work/legacy/.env"
site_config_ensure_split "$work/legacy"
grep -qx 'HOSPITAL_CLINICAL_DOMAIN=legacy.test' "$work/legacy/site.env" || fail "a site key was not moved to site.env"
! grep -q 'secret-value' "$work/legacy/site.env" || fail "a secret was split into site.env"
grep -qx 'HOSPITAL_POSTGRES_PASSWORD=secret-value' "$work/legacy/secrets/appliance.env" || fail "a secret was not moved to appliance.env"
site_config_compile "$work/legacy"
for line in 'LOSPOR_DEFAULT_LOCALE=en' 'HOSPITAL_CLINICAL_DOMAIN=legacy.test' 'HOSPITAL_POSTGRES_PASSWORD=secret-value' 'HOSPITAL_STATUS_ALLOWED_CIDRS="10.9.0.0/24"' 'COMPOSE_PROFILES='; do
  grep -qx "$line" "$work/legacy/.env" || fail "the recompiled legacy .env lost: $line"
done
printf 'HOSPITAL_CLINICAL_DOMAIN=should-not-resplit.test\n' > "$work/legacy/.env.probe"
site_config_ensure_split "$work/legacy"
grep -qx 'HOSPITAL_CLINICAL_DOMAIN=legacy.test' "$work/legacy/site.env" || fail "an existing split was redone"
ok "a legacy .env splits once by ownership and recompiles to the same settings"

# 8b. A rebuild from escrow brings back .env and secrets/ but maybe not site.env.
#     The missing site.env is rebuilt from .env; the escrowed secrets stay as they are.
rm -rf "$work/escrow" && mkdir -p "$work/escrow/secrets"
printf 'LOSPOR_DEFAULT_LOCALE=en
COMPOSE_PROFILES=
HOSPITAL_CLINICAL_DOMAIN=escrow.test
HOSPITAL_POSTGRES_PASSWORD=escrowed
' > "$work/escrow/.env"
printf 'HOSPITAL_POSTGRES_PASSWORD=escrowed
' > "$work/escrow/secrets/appliance.env"
chmod 600 "$work/escrow/.env" "$work/escrow/secrets/appliance.env"
site_config_ensure_split "$work/escrow"
grep -qx 'HOSPITAL_CLINICAL_DOMAIN=escrow.test' "$work/escrow/site.env" || fail "a missing site.env was not rebuilt from .env"
[ "$(cat "$work/escrow/secrets/appliance.env")" = 'HOSPITAL_POSTGRES_PASSWORD=escrowed' ] || fail "an existing appliance.env was replaced"
[ -z "$(find "$work/escrow" -name '*.split.*')" ] || fail "a split left a temporary file behind"
site_config_compile "$work/escrow" || fail "the rebuilt sources did not compile"
ok "a site.env missing after a rebuild from escrow is recovered from .env"

# 9. The command-line form finds the appliance home through .lospor-home.
fresh_home
mkdir -p "$work/release/scripts"
cp "$root/scripts/site-config.sh" "$work/release/scripts/"
ln -s "$work/home" "$work/release/.lospor-home"
sh "$work/release/scripts/site-config.sh" compile || fail "the CLI did not compile through .lospor-home"
[ -f "$work/home/.env" ] && [ ! -e "$work/release/.env" ] || fail "the CLI compiled into the release instead of the appliance home"
ok "the command-line form compiles the appliance home a release links to"

# 10. The operator example names exactly the site keys, and nothing generated.
site_config_check_source "$root/site.env.example" site || fail "site.env.example holds a key that is not a site setting"
example_keys="$(grep -Eo '^[A-Z][A-Z0-9_]*' "$root/site.env.example" | sort | tr '\n' ' ')"
expected_keys="$(printf '%s\n' $SITE_CONFIG_KEYS | sort | tr '\n' ' ')"
[ "$example_keys" = "$expected_keys" ] || fail "site.env.example does not name every site key exactly once"
ok "site.env.example documents exactly the settings hospital IT owns"

# 11. An advanced setting replaces the appliance's value, so the key appears once.
fresh_home
printf 'HOSPITAL_BACKUP_INTERVAL_SECONDS=14400\nHOSPITAL_BACKUP_DAILY_POINTS=14\n' >> "$work/home/secrets/appliance.env"
printf 'HOSPITAL_BACKUP_INTERVAL_SECONDS=7200\n' > "$work/home/advanced.env"
chmod 600 "$work/home/advanced.env"
site_config_compile "$work/home" || fail "a valid advanced.env did not compile"
[ "$(grep -c '^HOSPITAL_BACKUP_INTERVAL_SECONDS=' "$work/home/.env")" = 1 ] || fail "an advanced key appears more than once"
grep -qx 'HOSPITAL_BACKUP_INTERVAL_SECONDS=7200' "$work/home/.env" || fail "the advanced value did not replace the appliance value"
grep -qx 'HOSPITAL_BACKUP_DAILY_POINTS=14' "$work/home/.env" || fail "an appliance value without an override was lost"
rm -f "$work/home/advanced.env"
site_config_compile "$work/home"
grep -qx 'HOSPITAL_BACKUP_INTERVAL_SECONDS=14400' "$work/home/.env" || fail "removing advanced.env did not return the appliance value"
ok "an advanced setting replaces the appliance value once, and removing it restores the value"

# 12-15. advanced.env accepts only advanced keys, as whole numbers within their limits.
advanced_refuses() {
  description="$1"; code="$2"; content="$3"
  fresh_home; site_config_compile "$work/home"; before="$(cat "$work/home/.env")"
  printf '%s\n' "$content" > "$work/home/advanced.env"
  refuses "$description" "$code"
}
advanced_refuses "a backup interval longer than the four-hour policy is refused" SITE_CONFIG_ADVANCED_OUT_OF_RANGE 'HOSPITAL_BACKUP_INTERVAL_SECONDS=28800'
advanced_refuses "fewer than 14 daily backup points is refused" SITE_CONFIG_ADVANCED_OUT_OF_RANGE 'HOSPITAL_BACKUP_DAILY_POINTS=7'
advanced_refuses "a secret put in advanced.env is refused" SITE_CONFIG_NOT_AN_ADVANCED_KEY 'CRON_SECRET=12345678'
advanced_refuses "a value that is not a whole number is refused" SITE_CONFIG_MALFORMED 'HOSPITAL_BACKUP_DAILY_POINTS=20 days'

# 16. Every default is inside its own limits and is what a fresh install generates.
printf '%s\n' "$ADVANCED_CONFIG_SPEC" | while read -r key low high default; do
  [ "$low" -le "$default" ] && [ "$default" -le "$high" ] || fail "$key: the default is outside its limits"
  generated="$(sed -n "s/^$key=//p" "$root/scripts/generate-secrets.sh" | head -n 1)"
  [ -z "$generated" ] || [ "$generated" = "$default" ] || fail "$key: generate-secrets writes $generated, the limits say $default"
done
ok "every advanced default is inside its limits and matches a fresh install"

echo "site-config tests passed ($tests)"
