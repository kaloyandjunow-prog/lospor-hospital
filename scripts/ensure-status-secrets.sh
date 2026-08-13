#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"

command -v openssl >/dev/null 2>&1 || {
  echo "OpenSSL is required to provision Status secrets." >&2
  exit 1
}

umask 077
mkdir -p secrets/status
chmod 700 secrets/status

ensure_hex() {
  target="$1"
  if [ ! -s "$target" ]; then
    openssl rand -hex 32 > "$target"
  fi
}

ensure_hex secrets/status/snapshot-token
ensure_hex secrets/status/api-event-token
ensure_hex secrets/status/rate-limit-key
ensure_hex secrets/status/db-probe-password

api_event_token="$(tr -d '\r\n' < secrets/status/api-event-token)"
printf '{"api":"%s"}\n' \
  "$api_event_token" \
  > secrets/status/event-tokens.json

if [ ! -s secrets/status/fallback-key.pem ] || \
   [ ! -s secrets/status/fallback-cert.pem ]; then
  config="secrets/status/.fallback-openssl.cnf"
  printf '%s\n' \
    '[req]' \
    'distinguished_name = dn' \
    'x509_extensions = extensions' \
    'prompt = no' \
    '[dn]' \
    'CN = localhost' \
    '[extensions]' \
    'subjectAltName = DNS:localhost,IP:127.0.0.1' \
    > "$config"
  openssl req -x509 -newkey rsa:3072 -nodes -days 825 \
    -config "$config" \
    -keyout secrets/status/fallback-key.pem \
    -out secrets/status/fallback-cert.pem
  rm -f "$config"
fi

chmod 600 secrets/status/*
echo "Status secrets are present."
