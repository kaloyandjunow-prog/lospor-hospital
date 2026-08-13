#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"

command -v openssl >/dev/null 2>&1 || {
  echo "OpenSSL is required." >&2
  exit 1
}

directory=".data/status-dev-secrets"
umask 077
mkdir -p "$directory"
chmod 700 "$directory"

ensure_hex() {
  target="$1"
  [ -s "$target" ] || openssl rand -hex 32 > "$target"
}

ensure_hex "$directory/fixture-control-token"
ensure_hex "$directory/snapshot-token"
ensure_hex "$directory/status-event-token"
ensure_hex "$directory/rate-limit-key"

event_token="$(tr -d '\r\n' < "$directory/status-event-token")"
printf '{"fixture":"%s"}\n' "$event_token" > "$directory/event-tokens.json"

if [ ! -s "$directory/fallback-key.pem" ] || [ ! -s "$directory/fallback-cert.pem" ]; then
  config="$directory/.fallback-openssl.cnf"
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
  openssl req -x509 -newkey rsa:3072 -nodes -days 30 \
    -config "$config" \
    -keyout "$directory/fallback-key.pem" \
    -out "$directory/fallback-cert.pem" >/dev/null 2>&1
  rm -f "$config"
fi

chmod 600 "$directory"/*
