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
