#!/bin/sh

# Pure validation helpers shared by readiness-check.sh and its negative-control
# tests. This file performs no host inspection and makes no changes.

readiness_is_uint() {
  case "${1:-}" in ''|*[!0-9]*) return 1 ;; *) return 0 ;; esac
}

readiness_at_least() {
  readiness_is_uint "${1:-}" && readiness_is_uint "${2:-}" \
    && [ "$1" -ge "$2" ]
}

readiness_supported_os() {
  [ "${1:-}" = ubuntu ] \
    && [ "${2:-}" = 24.04 ] \
    && { [ "${3:-}" = x86_64 ] || [ "${3:-}" = amd64 ]; }
}

readiness_compose_supported() {
  compose_version="${1:-}"
  compose_version="${compose_version#Docker Compose version }"
  compose_version="${compose_version#v}"

  # The release overlay uses the Compose `!reset` YAML tag, introduced in
  # 2.19.0. Validate a complete SemVer first so a major-only or malformed
  # version cannot accidentally pass the compatibility boundary.
  printf '%s\n' "$compose_version" | grep -Eq \
    '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$' \
    || return 1

  compose_without_build="${compose_version%%+*}"
  compose_core="${compose_without_build%%-*}"
  compose_prerelease=false
  [ "$compose_without_build" = "$compose_core" ] || compose_prerelease=true

  old_ifs="$IFS"
  IFS='.'
  set -- $compose_core
  IFS="$old_ifs"
  [ "$#" -eq 3 ] || return 1
  compose_major="$1"
  compose_minor="$2"
  compose_patch="$3"

  [ "$compose_major" -gt 2 ] && return 0
  [ "$compose_major" -eq 2 ] || return 1
  [ "$compose_minor" -gt 19 ] && return 0
  [ "$compose_minor" -eq 19 ] || return 1
  [ "$compose_patch" -gt 0 ] && return 0
  [ "$compose_patch" -eq 0 ] && [ "$compose_prerelease" = false ]
}

readiness_backup_config() {
  interval="${1:-}"
  retry="${2:-}"
  keep_all="${3:-}"
  daily_points="${4:-}"
  readiness_is_uint "$interval" && [ "$interval" -gt 0 ] \
    && [ "$interval" -le 14400 ] \
    && readiness_is_uint "$retry" && [ "$retry" -gt 0 ] \
    && readiness_is_uint "$keep_all" && [ "$keep_all" -ge 172800 ] \
    && readiness_is_uint "$daily_points" && [ "$daily_points" -ge 14 ]
}

readiness_hostname() {
  value="${1:-}"
  [ -n "$value" ] || return 1
  [ "${#value}" -le 253 ] || return 1
  case "$value" in
    *[!A-Za-z0-9.-]*|.*|*..*|*.) return 1 ;;
  esac
  printf '%s' "$value" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$'
}

# The host ports the appliance will publish, as `host:container:service`.
#
# Derived rather than hardcoded because the readiness report runs before the
# install: checking 443 on a server that will publish 8443 tests a port nobody
# is going to use and misses the one that would fail.
#
# Port 80 is a fixed number but a conditional exposure. ACME HTTP-01 always
# validates there, so the report includes it only for the exact ACME mode; the
# operator and local modes do not publish or reserve it.
readiness_tls_profile_matches() {
  case "${1:-}:${2:-}" in
    acme:tls-acme|local:|operator:) return 0 ;;
    *) return 1 ;;
  esac
}

readiness_port_specs() {
  https_port="${1:-}"
  status_port="${2:-}"
  tls_mode="${3:-}"
  readiness_is_uint "$https_port" && [ "$https_port" -ge 1 ] && [ "$https_port" -le 65535 ] \
    || https_port=443
  readiness_is_uint "$status_port" && [ "$status_port" -ge 1 ] && [ "$status_port" -le 65535 ] \
    || status_port=3443
  if [ "$tls_mode" = acme ]; then
    printf '80:80:acme-http %s:443:caddy %s:3443:status' "$https_port" "$status_port"
  else
    printf '%s:443:caddy %s:3443:status' "$https_port" "$status_port"
  fi
}
