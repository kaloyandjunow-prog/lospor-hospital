#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
. "$root/scripts/readiness-lib.sh"

strict=false
case "${1:-}" in
  "") ;;
  --strict) strict=true ;;
  *) echo "Usage: scripts/readiness-check.sh [--strict]" >&2; exit 2 ;;
esac

failures=0
warnings=0
pass() { printf 'PASS  %s\n' "$1"; }
fail() { failures=$((failures + 1)); printf 'FAIL  %s\n' "$1" >&2; }
warn() { warnings=$((warnings + 1)); printf 'WARN  %s\n' "$1" >&2; }

require_command() {
  if command -v "$1" >/dev/null 2>&1; then
    pass "$1 is installed"
  else
    fail "$1 is required"
  fi
}

echo "LOSPOR Hospital host readiness (read-only)"
for command_name in docker openssl curl sshd getent ss systemctl timedatectl \
  sha256sum gzip tar
do
  require_command "$command_name"
done

os_id=""
os_version=""
if [ -r /etc/os-release ]; then
  # /etc/os-release is an operating-system-owned data file. Extract only the
  # two literal fields needed here; do not source it as shell code.
  os_id="$(sed -n 's/^ID=//p' /etc/os-release | tail -n 1 | tr -d '"\r')"
  os_version="$(sed -n 's/^VERSION_ID=//p' /etc/os-release | tail -n 1 | tr -d '"\r')"
fi
host_arch="$(uname -m 2>/dev/null || true)"
if readiness_supported_os "$os_id" "$os_version" "$host_arch"; then
  pass "host is Ubuntu 24.04 LTS amd64"
else
  fail "host must be Ubuntu 24.04 LTS amd64 (Windows Server hosts it in Hyper-V)"
fi

if command -v docker >/dev/null 2>&1; then
  if docker_info="$(docker info --format '{{.OSType}}|{{.Architecture}}|{{.NCPU}}|{{.MemTotal}}|{{.DockerRootDir}}' 2>/dev/null)"; then
    old_ifs="$IFS"; IFS='|'; set -- $docker_info; IFS="$old_ifs"
    docker_os="${1:-}"; docker_arch="${2:-}"; docker_cpus="${3:-0}"
    docker_memory="${4:-0}"; docker_root="${5:-}"
    if [ "$docker_os" = linux ] && { [ "$docker_arch" = x86_64 ] || [ "$docker_arch" = amd64 ]; }; then
      pass "Docker Engine runs Linux amd64 containers"
    else
      fail "Docker Engine must run Linux amd64 containers"
    fi
    if readiness_at_least "$docker_cpus" 8; then
      pass "Docker has at least 8 CPU cores"
    else
      fail "Docker needs at least 8 CPU cores (reported ${docker_cpus:-unknown})"
    fi
    if readiness_at_least "$docker_memory" 17179869184; then
      pass "Docker has at least 16 GiB RAM"
    else
      fail "Docker needs at least 16 GiB RAM"
    fi
  else
    docker_root=""
    fail "Docker Engine is not reachable by this operator"
  fi

  compose_version="$(docker compose version --short 2>/dev/null || true)"
  if readiness_compose_supported "$compose_version"; then
    pass "Docker Compose 2.19.0 or newer is available ($compose_version)"
  else
    fail "Docker Compose 2.19.0 or newer is required"
  fi
fi

check_free_space() {
  label="$1"; path="$2"
  available_kib="$(df -Pk "$path" 2>/dev/null | awk 'NR == 2 { print $4 }')"
  if readiness_at_least "$available_kib" 209715200; then
    pass "$label has at least 200 GiB free"
  else
    fail "$label needs at least 200 GiB free"
  fi
}
check_free_space "appliance filesystem" "$root"
if [ -n "${docker_root:-}" ] && [ "$docker_root" != "$root" ]; then
  check_free_space "Docker storage filesystem" "$docker_root"
fi

if command -v timedatectl >/dev/null 2>&1; then
  synchronized="$(timedatectl show --property=NTPSynchronized --value 2>/dev/null || true)"
  if [ "$synchronized" = yes ]; then
    pass "system clock is synchronized"
  else
    fail "system clock is not confirmed synchronized; TLS and clinical timestamps depend on it"
  fi
fi
if command -v systemctl >/dev/null 2>&1 && command -v sshd >/dev/null 2>&1; then
  if systemctl is-active --quiet ssh 2>/dev/null; then
    pass "OpenSSH Server is active for the Status recovery tunnel"
  else
    fail "OpenSSH Server is not active; the Status recovery tunnel would be unavailable"
  fi
fi

env_value() {
  key="$1"
  sed -n "s/^${key}=//p" "$root/.env" 2>/dev/null \
    | tail -n 1 | tr -d '\r' | sed 's/^"//; s/"$//'
}

if [ -f "$root/.env" ]; then
  clinical_domain="$(env_value HOSPITAL_CLINICAL_DOMAIN)"
  research_domain="$(env_value HOSPITAL_RESEARCH_DOMAIN)"
  for domain in "$clinical_domain" "$research_domain"; do
    if readiness_hostname "$domain" && getent ahosts "$domain" >/dev/null 2>&1; then
      pass "DNS resolves $domain"
    else
      fail "configured domain does not resolve: ${domain:-missing}"
    fi
  done

  interval="$(env_value HOSPITAL_BACKUP_INTERVAL_SECONDS)"
  retry="$(env_value HOSPITAL_BACKUP_RETRY_SECONDS)"
  retention="$(env_value HOSPITAL_BACKUP_RETENTION_DAYS)"
  [ -n "$interval" ] || interval=86400
  [ -n "$retry" ] || retry=300
  [ -n "$retention" ] || retention=30
  if readiness_backup_config "$interval" "$retry" "$retention"; then
    pass "backup schedule and retention values are valid"
  else
    fail "backup interval/retry must be positive seconds and retention must be whole days"
  fi

  if docker compose config --quiet >/dev/null 2>&1; then
    pass "Docker Compose configuration resolves"
  else
    fail "Docker Compose configuration is invalid"
  fi
else
  fail ".env is missing; generate the appliance configuration first"
fi

if [ -d "$root/backups" ] && [ -w "$root/backups" ]; then
  pass "local backup directory exists and is writable"
else
  fail "local backup directory is missing or not writable"
fi
warn "Hospital IT must configure and monitor a separate encrypted off-host backup copy"
warn "Hospital policy must separately verify disk encryption, UPS, firewall, and external port reachability"

if command -v ss >/dev/null 2>&1; then
  for port_spec in "80:caddy" "443:caddy" "3443:status"; do
    port="${port_spec%%:*}"
    owner_service="${port_spec#*:}"
    listeners="$(ss -H -ltn "sport = :$port" 2>/dev/null || true)"
    if [ -z "$listeners" ]; then
      pass "TCP port $port is available"
    elif [ -f "$root/.env" ] \
      && [ -n "$(cd "$root" && docker compose port "$owner_service" "$port" 2>/dev/null || true)" ]; then
      pass "TCP port $port is already owned by this appliance's $owner_service service"
    else
      fail "TCP port $port is already in use"
    fi
  done
fi

printf 'Readiness result: %s failure(s), %s warning(s).\n' "$failures" "$warnings"
if [ "$strict" = true ] && [ "$failures" -ne 0 ]; then
  exit 1
fi
exit 0
