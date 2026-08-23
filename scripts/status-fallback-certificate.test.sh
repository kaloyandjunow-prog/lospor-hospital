#!/bin/sh
set -eu

source_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
work="$(mktemp -d)"
cleanup() { rm -rf -- "$work"; }
trap cleanup EXIT HUP INT TERM

fixture="$work/release"
mkdir -p "$fixture/scripts" "$fixture/secrets/status"
cp "$source_root/scripts/ensure-status-secrets.sh" "$fixture/scripts/"
cp "$source_root/scripts/operator-locale.sh" "$fixture/scripts/"

(cd "$fixture" && sh scripts/ensure-status-secrets.sh >/dev/null)
marker="$fixture/.data/status-fallback-certificate.reload-required"
[ "$(cat "$marker")" = 1 ]
openssl x509 -in "$fixture/secrets/status/fallback-cert.pem" -noout -checkend 2592000
# Bare, these asserted nothing: -checkhost and -checkip exit 0 whether or not
# the certificate carries the name, on the OpenSSL the appliance runs. Grep the
# answer out of the output instead.
openssl x509 -in "$fixture/secrets/status/fallback-cert.pem" -noout -checkhost localhost   | grep -q "does match"
openssl x509 -in "$fixture/secrets/status/fallback-cert.pem" -noout -checkip 127.0.0.1   | grep -q "does match"
first="$(openssl x509 -in "$fixture/secrets/status/fallback-cert.pem" -noout -fingerprint -sha256)"
rm -f -- "$marker"

(cd "$fixture" && sh scripts/ensure-status-secrets.sh >/dev/null)
second="$(openssl x509 -in "$fixture/secrets/status/fallback-cert.pem" -noout -fingerprint -sha256)"
[ "$first" = "$second" ]
[ ! -e "$marker" ]
printf 'ok 1 - a valid fallback certificate is retained\n'

config="$work/expiring.cnf"
printf '%s\n' \
  '[req]' 'distinguished_name = dn' 'x509_extensions = extensions' 'prompt = no' \
  '[dn]' 'CN = localhost' \
  '[extensions]' 'subjectAltName = DNS:localhost,IP:127.0.0.1' > "$config"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -config "$config" \
  -keyout "$fixture/secrets/status/fallback-key.pem" \
  -out "$fixture/secrets/status/fallback-cert.pem" >/dev/null 2>&1
expiring="$(openssl x509 -in "$fixture/secrets/status/fallback-cert.pem" -noout -fingerprint -sha256)"
(cd "$fixture" && sh scripts/ensure-status-secrets.sh >/dev/null)
renewed="$(openssl x509 -in "$fixture/secrets/status/fallback-cert.pem" -noout -fingerprint -sha256)"
[ "$renewed" != "$expiring" ]
[ "$(cat "$marker")" = 1 ]
openssl x509 -in "$fixture/secrets/status/fallback-cert.pem" -noout -checkend 2592000
printf 'ok 2 - a fallback certificate inside the 30-day renewal window is replaced\n'
rm -f -- "$marker"

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
  -out "$fixture/secrets/status/fallback-key.pem" >/dev/null 2>&1
mismatched="$(openssl x509 -in "$fixture/secrets/status/fallback-cert.pem" -noout -fingerprint -sha256)"
(cd "$fixture" && sh scripts/ensure-status-secrets.sh >/dev/null)
repaired="$(openssl x509 -in "$fixture/secrets/status/fallback-cert.pem" -noout -fingerprint -sha256)"
[ "$repaired" != "$mismatched" ]
[ "$(cat "$marker")" = 1 ]
printf 'ok 3 - a mismatched key and certificate are replaced as one validated pair\n'

echo 'Status fallback certificate tests passed (3)'
