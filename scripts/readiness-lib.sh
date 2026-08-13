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

readiness_compose_v2() {
  version="${1:-}"
  version="${version#Docker Compose version }"
  version="${version#v}"
  case "$version" in 2.*) return 0 ;; *) return 1 ;; esac
}

readiness_backup_config() {
  interval="${1:-}"
  retry="${2:-}"
  retention="${3:-}"
  readiness_is_uint "$interval" && [ "$interval" -gt 0 ] \
    && readiness_is_uint "$retry" && [ "$retry" -gt 0 ] \
    && readiness_is_uint "$retention"
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
