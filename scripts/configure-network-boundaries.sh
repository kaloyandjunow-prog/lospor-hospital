#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
. "$root/scripts/installed-release-state.sh"
appliance_home="$(release_state_appliance_home "$root")"
if release_state_apply "$appliance_home"; then root="$state_release_root"; fi
cd "$root"
. "$root/scripts/operator-locale.sh"
operator_locale_load "$root"

usage() {
  operator_error \
    "Usage: configure-network-boundaries.sh [--research '<CIDRs>'] [--status '<CIDRs>'] [--unsafe-all-rfc1918 --confirm-all-rfc1918]" \
    "Употреба: configure-network-boundaries.sh [--research '<CIDR мрежи>'] [--status '<CIDR мрежи>'] [--unsafe-all-rfc1918 --confirm-all-rfc1918]"
  exit 2
}

research=""
status=""
unsafe=0
confirmed=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --research) [ "$#" -ge 2 ] || usage; research="$2"; shift 2 ;;
    --status) [ "$#" -ge 2 ] || usage; status="$2"; shift 2 ;;
    --unsafe-all-rfc1918) unsafe=1; shift ;;
    --confirm-all-rfc1918) confirmed=1; shift ;;
    *) usage ;;
  esac
done
[ "$unsafe" -eq "$confirmed" ] || usage

if [ -z "$research" ]; then
  operator_text \
    "Exact Research/VPN CIDRs (space-separated)" \
    "Точни Research/VPN CIDR мрежи (разделени с интервал)" >&2
  printf ': ' >&2
  read -r research
fi
if [ -z "$status" ]; then
  operator_text \
    "Exact IT management CIDRs (space-separated)" \
    "Точни CIDR мрежи за ИТ управление (разделени с интервал)" >&2
  printf ': ' >&2
  read -r status
fi

allow_argument=""
allow_value=""
if [ "$unsafe" -eq 1 ]; then
  allow_argument="--allow-all-rfc1918"
  allow_value=confirmed
  operator_error \
    "WARNING: the documented unsafe override admits every RFC1918 address. World-wide networks remain forbidden." \
    "ВНИМАНИЕ: документираното опасно изключение допуска всеки RFC1918 адрес. Мрежи, обхващащи целия интернет, остават забранени."
fi

locale="${LOSPOR_OPERATOR_LOCALE:-bg}"
research="$(python3 scripts/network-boundaries.py --locale "$locale" $allow_argument "$research")" || exit 1
status="$(python3 scripts/network-boundaries.py --locale "$locale" $allow_argument "$status")" || exit 1

env_link="$root/.env"
[ -f "$env_link" ] || {
  operator_error "Hospital .env is missing." "Липсва .env на болничната система."
  exit 1
}
env_real="$(readlink -f "$env_link")"
case "$env_real" in ""|/) operator_error "Unsafe .env path." "Опасен път до .env."; exit 1 ;; esac
# Allowlists are site settings: the change is made to site.env and .env is
# recompiled, first into a private candidate that is validated, then for real.
. "$root/scripts/site-config.sh"
site_config_ensure_split "$appliance_home"
site_real="$appliance_home/site.env"
umask 077
candidate_home="$(mktemp -d)"
candidate="$candidate_home/.env"
rollback="${env_real}.network-rollback.$"
rollback_site="${site_real}.network-rollback.$"
cleanup() { rm -rf "$candidate_home"; rm -f "$rollback" "$rollback_site"; }
trap cleanup EXIT HUP INT TERM
cp "$env_real" "$rollback"
cp "$site_real" "$rollback_site"
mkdir "$candidate_home/secrets"
cp "$appliance_home/secrets/appliance.env" "$candidate_home/secrets/appliance.env"
restore_prior() {
  cp "$rollback_site" "$site_real"
  cp "$rollback" "$env_real"
  chmod 600 "$site_real" "$env_real"
}

awk -v research="$research" -v status="$status" -v allow="$allow_value" '
  BEGIN { seen_research=0; seen_status=0; seen_allow=0 }
  /^HOSPITAL_RESEARCH_ALLOWED_CIDRS=/ {
    print "HOSPITAL_RESEARCH_ALLOWED_CIDRS=\"" research "\""; seen_research=1; next
  }
  /^HOSPITAL_STATUS_ALLOWED_CIDRS=/ {
    print "HOSPITAL_STATUS_ALLOWED_CIDRS=\"" status "\""; seen_status=1; next
  }
  /^HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE=/ {
    print "HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE=" allow; seen_allow=1; next
  }
  { print }
  END {
    if (!seen_research) print "HOSPITAL_RESEARCH_ALLOWED_CIDRS=\"" research "\""
    if (!seen_status) print "HOSPITAL_STATUS_ALLOWED_CIDRS=\"" status "\""
    if (!seen_allow) print "HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE=" allow
  }
' "$site_real" > "$candidate_home/site.env"
chmod 600 "$candidate_home/site.env"
site_config_compile "$candidate_home" || exit 1

# Resolve Compose and parse the exact mode-expanded Caddyfile before replacing
# the working configuration. The candidate is never loaded into the running
# edge unless both checks pass.
docker compose --env-file "$candidate" config --quiet
# See validate-caddy-config.sh: the hardened Caddy image has no ENTRYPOINT, so
# the binary name must be explicit or the container tries to exec "validate".
docker compose --env-file "$candidate" run --rm --no-deps --interactive=false -T caddy \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null

state_dir="$appliance_home/.data/network"
mkdir -p "$state_dir"
chmod 700 "$state_dir"
last_good="$state_dir/last-known-good-boundaries.tsv"
old_research="$(sed -n 's/^HOSPITAL_RESEARCH_ALLOWED_CIDRS=//p' "$env_real" | tail -n 1 | tr -d '\r"')"
old_status="$(sed -n 's/^HOSPITAL_STATUS_ALLOWED_CIDRS=//p' "$env_real" | tail -n 1 | tr -d '\r"')"
printf 'LOSPOR-HOSPITAL-NETWORK-V1\t%s\t%s\t%s\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$old_research" "$old_status" > "${last_good}.tmp.$$"
chmod 600 "${last_good}.tmp.$$"
mv "${last_good}.tmp.$$" "$last_good"

cp "$candidate_home/site.env" "$site_real.network-apply.$"
mv -f "$site_real.network-apply.$" "$site_real"
cp "$candidate" "$env_real.network-apply.$"
mv -f "$env_real.network-apply.$" "$env_real"
if ! docker compose up -d --no-deps --force-recreate caddy; then
  restore_prior
  docker compose up -d --no-deps --force-recreate caddy >/dev/null 2>&1 || true
  operator_error \
    "The new boundary could not start. The prior site.env and .env were restored." \
    "Новата мрежова граница не можа да се стартира. Предишните site.env и .env са възстановени."
  exit 1
fi

operator_say \
  "Network boundaries applied. Last-known-good values are protected at $last_good." \
  "Мрежовите граници са приложени. Последните работещи стойности са защитени в $last_good."
