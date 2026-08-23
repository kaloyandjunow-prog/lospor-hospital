#!/bin/sh
set -eu
set +x

# Scheduled root-side renewal for the independent loopback Status TLS pair.
# The secret helper writes a fixed reload marker only after a complete pair has
# passed its key, SAN, and 30-day validity checks. This wrapper restarts only
# Status and clears that marker only after the listener serves the new pair.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
test_only="${STATUS_FALLBACK_CERTIFICATE_TEST_ONLY:-0}"
if [ "$test_only" != 1 ] && [ "$(id -u)" -ne 0 ]; then
  echo STATUS_FALLBACK_CERTIFICATE_ROOT_REQUIRED >&2
  exit 1
fi
cd "$root"

# Do not restart Status in the middle of a backup, database migration, release
# activation, or another destructive host operation. update.sh already owns
# this exact lock and explicitly tells its child process to reuse that proof.
io_lock_held="${STATUS_FALLBACK_CERTIFICATE_IO_LOCK_HELD:-0}"
case "$io_lock_held" in 0|1) ;; *) echo STATUS_FALLBACK_CERTIFICATE_LOCK_STATE_INVALID >&2; exit 1 ;; esac
if [ "$io_lock_held" != 1 ]; then
  if [ "$test_only" = 1 ]; then
    io_lock="${STATUS_FALLBACK_CERTIFICATE_TEST_IO_LOCK_FILE:?test I/O lock is required}"
  else
    if [ -n "${LOSPOR_APPLIANCE_HOME:-}" ]; then
      appliance_root="$(CDPATH= cd -- "$LOSPOR_APPLIANCE_HOME" && pwd -P)"
    elif [ -L "$root/.lospor-home" ]; then
      appliance_root="$(CDPATH= cd -- "$root/.lospor-home" && pwd -P)"
    else
      appliance_root="$root"
    fi
    io_lock="$appliance_root/.data/io-mutation.lock"
  fi
  case "$io_lock" in /*) ;; *) echo STATUS_FALLBACK_CERTIFICATE_IO_LOCK_UNSAFE >&2; exit 1 ;; esac
  [ -f "$io_lock" ] && [ ! -L "$io_lock" ] \
    && [ "$(stat -c %h "$io_lock" 2>/dev/null || echo 0)" = 1 ] \
    || { echo STATUS_FALLBACK_CERTIFICATE_IO_LOCK_UNSAFE >&2; exit 1; }
  command -v flock >/dev/null 2>&1 \
    || { echo STATUS_FALLBACK_CERTIFICATE_FLOCK_REQUIRED >&2; exit 1; }
  exec 8>> "$io_lock"
  flock -w 60 8 \
    || { echo STATUS_FALLBACK_CERTIFICATE_MAINTENANCE_BUSY >&2; exit 75; }
fi

command -v openssl >/dev/null 2>&1 \
  || { echo STATUS_FALLBACK_CERTIFICATE_OPENSSL_REQUIRED >&2; exit 1; }
STATUS_SECRET_MAINTENANCE_MODE=fallback-certificate \
  sh scripts/ensure-status-secrets.sh >/dev/null

marker="$root/.data/status-fallback-certificate.reload-required"
if [ ! -e "$marker" ]; then
  echo STATUS_FALLBACK_CERTIFICATE_CURRENT
  exit 0
fi
[ -f "$marker" ] && [ ! -L "$marker" ] \
  && [ "$(stat -c %h "$marker" 2>/dev/null || echo 0)" = 1 ] \
  && [ "$(wc -c < "$marker" | tr -d '[:space:]')" = 2 ] \
  && [ "$(cat "$marker")" = 1 ] \
  || { echo STATUS_FALLBACK_CERTIFICATE_MARKER_UNSAFE >&2; exit 1; }

certificate="$root/secrets/status/fallback-cert.pem"
expected_fingerprint="$(openssl x509 -in "$certificate" -noout -fingerprint -sha256 2>/dev/null \
  | sed 's/^sha256 Fingerprint=//; s/^SHA256 Fingerprint=//' | tr -d ':\r\n' | tr 'A-F' 'a-f')"
printf '%s\n' "$expected_fingerprint" | grep -Eq '^[a-f0-9]{64}$' \
  || { echo STATUS_FALLBACK_CERTIFICATE_INVALID >&2; exit 1; }

docker compose restart status >/dev/null \
  || { echo STATUS_FALLBACK_CERTIFICATE_RESTART_FAILED >&2; exit 1; }

work="$(mktemp -d)"
cleanup_renewal() { rm -rf -- "$work" 2>/dev/null || true; }
trap cleanup_renewal EXIT HUP INT TERM

live_fingerprint=""
if [ "$test_only" = 1 ]; then
  live_certificate="${STATUS_FALLBACK_CERTIFICATE_TEST_LIVE_CERT_FILE:?test live certificate is required}"
  case "$live_certificate" in /*) ;; *) echo STATUS_FALLBACK_CERTIFICATE_TEST_PATH_UNSAFE >&2; exit 1 ;; esac
  [ -f "$live_certificate" ] && [ ! -L "$live_certificate" ] \
    || { echo STATUS_FALLBACK_CERTIFICATE_TEST_PATH_UNSAFE >&2; exit 1; }
  live_fingerprint="$(openssl x509 -in "$live_certificate" -noout -fingerprint -sha256 2>/dev/null \
    | sed 's/^sha256 Fingerprint=//; s/^SHA256 Fingerprint=//' | tr -d ':\r\n' | tr 'A-F' 'a-f')"
else
  command -v timeout >/dev/null 2>&1 \
    || { echo STATUS_FALLBACK_CERTIFICATE_TIMEOUT_REQUIRED >&2; exit 1; }
  status_port="$(awk -F= '$1 == "HOSPITAL_STATUS_PORT" { count += 1; value = substr($0, length($1) + 2) } END { if (count == 1) print value; else if (count > 1) exit 1 }' .env 2>/dev/null || true)"
  status_port="${status_port:-3443}"
  printf '%s\n' "$status_port" | grep -Eq '^[0-9]{1,5}$' \
    || { echo STATUS_FALLBACK_CERTIFICATE_PORT_INVALID >&2; exit 1; }
  [ "$status_port" -ge 1 ] && [ "$status_port" -le 65535 ] \
    || { echo STATUS_FALLBACK_CERTIFICATE_PORT_INVALID >&2; exit 1; }

  attempt=0
  while [ "$attempt" -lt 30 ]; do
    attempt=$((attempt + 1))
    live="$work/live.pem"
    if docker compose ps --services --status running status 2>/dev/null | grep -Fxq status \
        && printf '\n' | timeout 5 openssl s_client \
          -connect "127.0.0.1:$status_port" -servername localhost 2>/dev/null \
          | openssl x509 -outform PEM > "$live" 2>/dev/null \
        && [ -s "$live" ]; then
      live_fingerprint="$(openssl x509 -in "$live" -noout -fingerprint -sha256 2>/dev/null \
        | sed 's/^sha256 Fingerprint=//; s/^SHA256 Fingerprint=//' | tr -d ':\r\n' | tr 'A-F' 'a-f')"
      [ "$live_fingerprint" = "$expected_fingerprint" ] && break
    fi
    sleep 1
  done
fi

if [ "$live_fingerprint" != "$expected_fingerprint" ]; then
  echo STATUS_FALLBACK_CERTIFICATE_RELOAD_UNVERIFIED >&2
  exit 1
fi
rm -f -- "$marker"
echo STATUS_FALLBACK_CERTIFICATE_RENEWED_AND_RELOADED
