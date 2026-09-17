#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
. "$root/scripts/readiness-lib.sh"

tests=0
expect_true() {
  label="$1"; shift
  "$@" || { echo "FAIL: $label" >&2; exit 1; }
  tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$label"
}
expect_false() {
  label="$1"; shift
  if "$@"; then echo "FAIL: $label" >&2; exit 1; fi
  tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$label"
}

expect_contains() {
  label="$1"; haystack="$2"; needle="$3"
  case "$haystack" in
    *"$needle"*) ;;
    *) echo "FAIL: $label (missing '$needle')" >&2; exit 1 ;;
  esac
  tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$label"
}

expect_not_contains() {
  label="$1"; haystack="$2"; needle="$3"
  case "$haystack" in
    *"$needle"*) echo "FAIL: $label (unexpected '$needle')" >&2; exit 1 ;;
    *) ;;
  esac
  tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$label"
}

expect_true "Ubuntu 24.04 amd64 is supported" readiness_supported_os ubuntu 24.04 x86_64
expect_false "older Ubuntu is rejected" readiness_supported_os ubuntu 22.04 x86_64
expect_false "a different distribution is rejected" readiness_supported_os debian 24.04 x86_64
expect_false "ARM is rejected for the 1.0.0 image set" readiness_supported_os ubuntu 24.04 aarch64
expect_false "Compose 2.0.0 is below the supported boundary" readiness_compose_supported 2.0.0
expect_false "Compose 2.18.1 is below the supported boundary" readiness_compose_supported 2.18.1
expect_true "Compose 2.19.0 is accepted at the boundary" readiness_compose_supported 2.19.0
expect_true "a later Compose 2.19 patch is accepted" readiness_compose_supported 2.19.9
expect_true "the long Compose version form is accepted" readiness_compose_supported "Docker Compose version v2.39.1"
expect_true "current Compose 5.x remains compatible" readiness_compose_supported 5.3.1
expect_false "a prerelease of the boundary is rejected" readiness_compose_supported 2.19.0-rc.1
expect_false "Compose v1 is rejected" readiness_compose_supported 1.29.2
expect_false "malformed Compose version is rejected" readiness_compose_supported current
expect_true "documented backup defaults are accepted" readiness_backup_config 14400 300 172800 14
expect_true "a tighter backup interval and longer retention are accepted" readiness_backup_config 3600 300 259200 30
expect_false "zero backup interval is rejected" readiness_backup_config 0 300 172800 14
expect_false "an interval beyond the four-hour RPO is rejected" readiness_backup_config 14401 300 172800 14
expect_false "less than 48 hours of complete retention is rejected" readiness_backup_config 14400 300 172799 14
expect_false "fewer than 14 daily recovery points are rejected" readiness_backup_config 14400 300 172800 13
expect_true "ordinary hospital hostname is accepted" readiness_hostname lospor.hospital.example
expect_false "a URL is not accepted as a hostname" readiness_hostname https://lospor.example
expect_false "a shell-like hostname is rejected" readiness_hostname 'lospor.example;id'
expect_true "resource threshold accepts equality" readiness_at_least 8 8
expect_false "resource threshold rejects undersizing" readiness_at_least 7 8
expect_true "a 16 GB Hyper-V VM, as Docker reports it, has enough memory" readiness_memory_enough 16768016384
expect_true "exactly 16 GiB has enough memory" readiness_memory_enough 17179869184
expect_false "a 12 GB server does not have enough memory" readiness_memory_enough 12884901888
expect_false "unreported memory is not enough" readiness_memory_enough ""
expect_true "ACME selects only the ACME exposure profile" readiness_tls_profile_matches acme tls-acme
expect_true "operator TLS publishes no ACME profile" readiness_tls_profile_matches operator ""
expect_true "local TLS publishes no ACME profile" readiness_tls_profile_matches local ""
expect_false "operator TLS cannot accidentally publish the ACME profile" readiness_tls_profile_matches operator tls-acme


# The report runs before the install, so it has to check the ports the site
# will actually publish. Checking 443 on a server that will publish 8443 tests
# a port nobody uses and misses the one that would fail.
expect_specs() {
  label="$1"; expected="$2"; shift 2
  actual="$(readiness_port_specs "$@")"
  [ "$actual" = "$expected" ] || {
    echo "FAIL: $label" >&2
    echo "  expected: $expected" >&2
    echo "  actual:   $actual" >&2
    exit 1
  }
  tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$label"
}

expect_specs "unset ports fall back to the documented defaults" \
  "80:80:acme-http 443:443:caddy 3443:3443:status" "" "" acme
expect_specs "configured ports are the ones checked" \
  "80:80:acme-http 8443:443:caddy 9443:3443:status" 8443 9443 acme
expect_specs "operator TLS does not reserve port 80" \
  "8443:443:caddy 3443:3443:status" 8443 "" operator
# A typo in .env must not silently check a port nobody will publish. Falling
# back is safer than trusting it: the install itself will reject the value.
expect_specs "a non-numeric port falls back rather than being trusted" \
  "80:80:acme-http 443:443:caddy 3443:3443:status" "eighty" "" acme
expect_specs "an out-of-range port falls back rather than being trusted" \
  "80:80:acme-http 443:443:caddy 3443:3443:status" 99999 0 acme
# The container ports never move; only the host side does. Losing this would
# make `docker compose port` miss the mapping and report the appliance's own
# listener as a foreign process.
expect_specs "container ports stay fixed while host ports move" \
  "80:80:acme-http 8443:443:caddy 9443:3443:status" 8443 9443 acme

# Exercise the complete report, not only its pure helper functions. These
# assertions are deliberately independent of the current host: the readiness
# result can contain failures on a development workstation while its language
# contract must remain deterministic.
bg_report="$(LOSPOR_DEFAULT_LOCALE=bg sh "$root/scripts/readiness-check.sh" 2>&1)"
expect_contains "Bulgarian is available for the complete readiness report" \
  "$bg_report" "Готовност на сървъра за LOSPOR Hospital"
expect_contains "Bulgarian readiness output has a localized result" \
  "$bg_report" "Резултат от проверката:"
expect_not_contains "Bulgarian readiness output does not leak English status prefixes" \
  "$bg_report" "PASS  "

en_report="$(LOSPOR_DEFAULT_LOCALE=en sh "$root/scripts/readiness-check.sh" 2>&1)"
expect_contains "English remains available for the complete readiness report" \
  "$en_report" "LOSPOR Hospital host readiness"
expect_contains "English readiness output has its result" \
  "$en_report" "Readiness result:"

preinstall_report="$(LOSPOR_DEFAULT_LOCALE=en \
  HOSPITAL_CLINICAL_DOMAIN=clinical.invalid \
  HOSPITAL_RESEARCH_DOMAIN=research.invalid \
  HOSPITAL_TLS_MODE=local COMPOSE_PROFILES= \
  HOSPITAL_ADULT_GUIDANCE_DEFAULT=true \
  HOSPITAL_PEDIATRIC_GUIDANCE_DEFAULT=false \
  HOSPITAL_EXTERNAL_AI_DEFAULT=true \
  HOSPITAL_RESEARCH_ALLOWED_CIDRS=10.24.30.0/24 \
  HOSPITAL_STATUS_ALLOWED_CIDRS=10.24.40.0/24 \
  sh "$root/scripts/readiness-check.sh" --preinstall 2>&1)"
expect_contains "fresh guided install validates collected settings without writing secrets" \
  "$preinstall_report" "will be generated after readiness passes"
expect_contains "fresh guided install declares the future OMOP backup binding" \
  "$preinstall_report" "the OMOP pseudonym salt will be generated and bound to authenticated backups"
expect_not_contains "fresh guided install does not require a pre-existing dotenv file" \
  "$preinstall_report" ".env is missing"

preinstall_bg_report="$(LOSPOR_DEFAULT_LOCALE=bg \
  HOSPITAL_CLINICAL_DOMAIN=clinical.invalid \
  HOSPITAL_RESEARCH_DOMAIN=research.invalid \
  HOSPITAL_TLS_MODE=local COMPOSE_PROFILES= \
  HOSPITAL_ADULT_GUIDANCE_DEFAULT=true \
  HOSPITAL_PEDIATRIC_GUIDANCE_DEFAULT=false \
  HOSPITAL_EXTERNAL_AI_DEFAULT=true \
  HOSPITAL_RESEARCH_ALLOWED_CIDRS=10.24.30.0/24 \
  HOSPITAL_STATUS_ALLOWED_CIDRS=10.24.40.0/24 \
  sh "$root/scripts/readiness-check.sh" --preinstall 2>&1)"
expect_contains "Bulgarian guided install declares the future OMOP backup binding" \
  "$preinstall_bg_report" "Солта за OMOP псевдоними ще бъде създадена и обвързана с удостоверените архиви"

offline_report="$(LOSPOR_DEFAULT_LOCALE=en \
  HOSPITAL_CLINICAL_DOMAIN=clinical.invalid \
  HOSPITAL_RESEARCH_DOMAIN=research.invalid \
  HOSPITAL_TLS_MODE=local COMPOSE_PROFILES= \
  HOSPITAL_UPDATE_SUPPLY_MODE=offline \
  HOSPITAL_ADULT_GUIDANCE_DEFAULT=true \
  HOSPITAL_PEDIATRIC_GUIDANCE_DEFAULT=true \
  HOSPITAL_EXTERNAL_AI_DEFAULT=true \
  HOSPITAL_RESEARCH_ALLOWED_CIDRS=10.24.30.0/24 \
  HOSPITAL_STATUS_ALLOWED_CIDRS=10.24.40.0/24 \
  sh "$root/scripts/readiness-check.sh" --preinstall 2>&1)"
expect_contains "offline readiness names the USB supply" \
  "$offline_report" "releases come from verified USB media"

expect_contains "connected readiness needs no credential" \
  "$preinstall_report" "no credentials are needed"
expect_not_contains "connected readiness never mentions a credential provisioner" \
  "$preinstall_report" "provision-update-credentials"

echo "readiness validation tests passed ($tests)"
