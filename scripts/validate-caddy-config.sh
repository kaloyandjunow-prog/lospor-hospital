#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"
. "$root/scripts/operator-locale.sh"
. "$root/scripts/readiness-lib.sh"
operator_locale_load "$root"

env_value() {
  sed -n "s/^$1=//p" "$root/.env" 2>/dev/null \
    | tail -n 1 | tr -d '\r' | sed 's/^"//; s/"$//'
}

mode="$(env_value HOSPITAL_TLS_MODE)"
profiles="$(env_value COMPOSE_PROFILES)"
clinical_domain="$(env_value HOSPITAL_CLINICAL_DOMAIN)"
research_domain="$(env_value HOSPITAL_RESEARCH_DOMAIN)"
command -v python3 >/dev/null 2>&1 || {
  operator_error \
    "Python 3 is required to validate network CIDR boundaries safely." \
    "Необходим е Python 3 за безопасна проверка на мрежовите CIDR граници."
  exit 1
}
case "$mode:$profiles" in
  acme:tls-acme|operator:|local:) ;;
  *)
    operator_error \
      "TLS mode and Compose profile disagree; refusing Caddy validation." \
      "TLS режимът и Compose профилът не съвпадат; Caddy няма да бъде проверен."
    exit 1
    ;;
esac
if ! readiness_hostname "$clinical_domain" \
  || ! readiness_hostname "$research_domain" \
  || [ "$clinical_domain" = "$research_domain" ]; then
  operator_error \
    "Clinical and Research must be two different valid DNS hostnames." \
    "Clinical и Research трябва да бъдат две различни валидни DNS имена."
  exit 1
fi

if [ -n "$(env_value HOSPITAL_CADDY_GLOBAL_EXTRA)" ] \
  || [ -n "$(env_value HOSPITAL_CADDY_SITE_EXTRA)" ]; then
  operator_error \
    "Legacy free-form Caddy settings are forbidden; choose an explicit HOSPITAL_TLS_MODE." \
    "Старите свободни Caddy настройки са забранени; изберете изрично HOSPITAL_TLS_MODE."
  exit 1
fi

network_override="$(env_value HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE)"
case "$network_override" in
  "") network_override_argument="" ;;
  confirmed) network_override_argument="--allow-all-rfc1918" ;;
  *)
    operator_error \
      "HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE must be empty or exactly confirmed." \
      "HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE трябва да бъде празно или точно confirmed."
    exit 1
    ;;
esac
for boundary_key in HOSPITAL_RESEARCH_ALLOWED_CIDRS HOSPITAL_STATUS_ALLOWED_CIDRS; do
  boundary_value="$(env_value "$boundary_key")"
  boundary_canonical="$(python3 scripts/network-boundaries.py \
    --locale "${LOSPOR_OPERATOR_LOCALE:-bg}" $network_override_argument "$boundary_value")" || exit 1
  [ "$boundary_value" = "$boundary_canonical" ] || {
    operator_error \
      "$boundary_key must use this exact canonical value: $boundary_canonical" \
      "$boundary_key трябва да използва точно тази канонична стойност: $boundary_canonical"
    exit 1
  }
done

docker compose config --quiet
docker compose run --rm --no-deps --interactive=false -T caddy \
  validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
if [ "$mode" = acme ]; then
  docker compose --profile tls-acme run --rm --no-deps --interactive=false -T acme-http \
    validate --config /etc/caddy/AcmeProxyCaddyfile --adapter caddyfile >/dev/null
fi
operator_say \
  "Caddy configuration matches TLS mode $mode and is valid." \
  "Конфигурацията на Caddy съответства на TLS режим $mode и е валидна."
