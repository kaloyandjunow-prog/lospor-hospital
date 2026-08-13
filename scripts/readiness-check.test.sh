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
expect_true "documented backup defaults are accepted" readiness_backup_config 86400 300 30
expect_true "zero-day retention remains safe because two pairs are preserved" readiness_backup_config 86400 300 0
expect_false "zero backup interval is rejected" readiness_backup_config 0 300 30
expect_false "non-numeric retention is rejected" readiness_backup_config 86400 300 thirty
expect_true "ordinary hospital hostname is accepted" readiness_hostname lospor.hospital.example
expect_false "a URL is not accepted as a hostname" readiness_hostname https://lospor.example
expect_false "a shell-like hostname is rejected" readiness_hostname 'lospor.example;id'
expect_true "resource threshold accepts equality" readiness_at_least 8 8
expect_false "resource threshold rejects undersizing" readiness_at_least 7 8

echo "readiness validation tests passed ($tests)"
