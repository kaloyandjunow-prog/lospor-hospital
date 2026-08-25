#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"
. "$root/scripts/operator-locale.sh"
operator_locale_load "$root"

command -v openssl >/dev/null 2>&1 || {
  operator_error "OpenSSL is required to provision Status secrets." "OpenSSL е необходим за създаване на тайните на Status."
  exit 1
}

status_secret_maintenance_mode="${STATUS_SECRET_MAINTENANCE_MODE:-all}"
case "$status_secret_maintenance_mode" in
  all|fallback-certificate) ;;
  *)
    operator_error "Unknown Status secret maintenance mode." "Непознат режим за поддръжка на тайните на Status."
    exit 1
    ;;
esac

# Installation, updates, operator maintenance, and the scheduled fallback-TLS
# renewal may meet. Serialize the whole idempotent secret check so two renewal
# attempts cannot interleave the key and certificate replacements.
mkdir -p .data
status_secrets_lock=".data/status-secrets.lock"
[ ! -L "$status_secrets_lock" ] \
  && { [ ! -e "$status_secrets_lock" ] || [ -f "$status_secrets_lock" ]; } \
  || { operator_error "The Status secret lock path is unsafe." "Пътят за заключване на тайните на Status е небезопасен."; exit 1; }
: >> "$status_secrets_lock"
chmod 600 "$status_secrets_lock"
[ "$(stat -c %h "$status_secrets_lock" 2>/dev/null || echo 0)" = 1 ] \
  || { operator_error "The Status secret lock path is linked." "Пътят за заключване на тайните на Status има допълнителна връзка."; exit 1; }
if command -v flock >/dev/null 2>&1; then
  exec 9>> "$status_secrets_lock"
  flock -w 60 9 \
    || { operator_error "Timed out waiting for Status secret maintenance." "Изтече времето за изчакване на поддръжката на тайните на Status."; exit 1; }
else
  case "$(uname -s 2>/dev/null || echo unknown)" in
    MINGW*|MSYS*|CYGWIN*) ;;
    *) operator_error "flock is required for Status secret maintenance." "flock е необходим за поддръжката на тайните на Status."; exit 1 ;;
  esac
fi

umask 077
mkdir -p secrets/status
chmod 700 secrets/status

ensure_hex() {
  target="$1"
  if [ ! -s "$target" ]; then
    openssl rand -hex 32 > "$target"
  fi
}

if [ "$status_secret_maintenance_mode" = all ]; then
  ensure_hex secrets/status/snapshot-token
  ensure_hex secrets/status/account-control-token
  ensure_hex secrets/status/api-event-token
  ensure_hex secrets/status/rate-limit-key
  ensure_hex secrets/status/mfa-encryption-key
  ensure_hex secrets/status/db-probe-password

  api_event_token="$(tr -d '\r\n' < secrets/status/api-event-token)"
  printf '{"api":"%s"}\n' \
    "$api_event_token" \
    > secrets/status/event-tokens.json
fi

fallback_config="secrets/status/.fallback-openssl.cnf.$$"
fallback_pending_key="secrets/status/.fallback-key.pem.$$"
fallback_pending_cert="secrets/status/.fallback-cert.pem.$$"
fallback_key_public="secrets/status/.fallback-key-public.pem.$$"
fallback_cert_public="secrets/status/.fallback-cert-public.pem.$$"

cleanup_fallback_pending() {
  rm -f -- "$fallback_config" "$fallback_pending_key" "$fallback_pending_cert" \
    "$fallback_key_public" "$fallback_cert_public"
}
trap cleanup_fallback_pending EXIT HUP INT TERM

# `-checkhost` and `-checkip` print the answer and exit 0 either way on OpenSSL
# 3.0, which is what Ubuntu 24.04 and therefore the appliance runs; only 3.2 and
# later return 1 for a name or address the certificate does not carry. Both
# checks below therefore always succeeded, and a fallback certificate covering
# neither localhost nor 127.0.0.1 would be judged reusable instead of being
# regenerated.
#
# `-checkend` is unaffected: it does return 1 when the certificate is expiring.
#
# Unrecognised output is refused rather than guessed at.
certificate_covers() {
  covers_output="$(openssl x509 -in "$1" -noout "$2" "$3" 2>/dev/null)" || return 1
  case "$covers_output" in
    *"does NOT match"*) return 1 ;;
    *"does match"*) return 0 ;;
    *) return 1 ;;
  esac
}

fallback_certificate_usable() {
  candidate_key="$1"
  candidate_cert="$2"
  [ -f "$candidate_key" ] && [ ! -L "$candidate_key" ] && [ -s "$candidate_key" ] \
    && [ -f "$candidate_cert" ] && [ ! -L "$candidate_cert" ] && [ -s "$candidate_cert" ] \
    && openssl x509 -in "$candidate_cert" -noout -checkend 2592000 >/dev/null 2>&1 \
    && certificate_covers "$candidate_cert" -checkhost localhost \
    && certificate_covers "$candidate_cert" -checkip 127.0.0.1 \
    && openssl pkey -in "$candidate_key" -pubout -out "$fallback_key_public" >/dev/null 2>&1 \
    && openssl x509 -in "$candidate_cert" -pubkey -noout > "$fallback_cert_public" 2>/dev/null \
    && cmp -s "$fallback_key_public" "$fallback_cert_public"
}

# The independent loopback Status endpoint must not become unusable after a
# long-running appliance outlives its original self-signed certificate. Keep a
# valid pair when it has at least 30 days remaining; otherwise build and verify
# a complete replacement before touching either live path.
if ! fallback_certificate_usable \
  secrets/status/fallback-key.pem secrets/status/fallback-cert.pem; then
  printf '%s\n' \
    '[req]' \
    'distinguished_name = dn' \
    'x509_extensions = extensions' \
    'prompt = no' \
    '[dn]' \
    'CN = localhost' \
    '[extensions]' \
    'subjectAltName = DNS:localhost,IP:127.0.0.1' \
    > "$fallback_config"
  openssl req -x509 -newkey rsa:3072 -nodes -days 825 \
    -config "$fallback_config" \
    -keyout "$fallback_pending_key" \
    -out "$fallback_pending_cert" >/dev/null 2>&1
  chmod 600 "$fallback_pending_key" "$fallback_pending_cert"
  fallback_certificate_usable "$fallback_pending_key" "$fallback_pending_cert" || {
    operator_error "The replacement Status fallback certificate failed validation." "Заместващият резервен сертификат на Status не премина проверката."
    exit 1
  }
  mv -f -- "$fallback_pending_key" secrets/status/fallback-key.pem
  mv -f -- "$fallback_pending_cert" secrets/status/fallback-cert.pem
  fallback_reload_marker=".data/status-fallback-certificate.reload-required"
  [ ! -L "$fallback_reload_marker" ] \
    && { [ ! -e "$fallback_reload_marker" ] || [ -f "$fallback_reload_marker" ]; } \
    || { operator_error "The Status certificate reload marker is unsafe." "Маркерът за презареждане на сертификата на Status е небезопасен."; exit 1; }
  fallback_reload_tmp="$fallback_reload_marker.tmp.$$"
  printf '1\n' > "$fallback_reload_tmp"
  chmod 600 "$fallback_reload_tmp"
  mv -f -- "$fallback_reload_tmp" "$fallback_reload_marker"
fi

cleanup_fallback_pending
trap - EXIT HUP INT TERM
if [ "$status_secret_maintenance_mode" = all ]; then
  chmod 600 secrets/status/*
  operator_say "Status secrets are present." "Тайните на Status са налични."
else
  chmod 600 secrets/status/fallback-key.pem secrets/status/fallback-cert.pem
  operator_say "The Status fallback certificate is present." "Резервният сертификат на Status е наличен."
fi
