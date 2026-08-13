#!/bin/sh
set -eu

# Materialize host-owned, mode-0600 source secrets into service-specific named
# volumes. Docker Compose implements local `secrets:` as bind mounts, which
# preserve host ownership and are unreadable by our UID 1001 containers. The
# named-volume copies keep the host sources private while giving each service
# only its allowlist. No secret value is printed.

umask 077
status_source="${STATUS_SECRET_SOURCE:-/source/status}"
api_source="${API_SECRET_SOURCE:-/source/api}"
status_target="${STATUS_SECRET_TARGET:-/target/status}"
api_target="${API_SECRET_TARGET:-/target/api}"
api_status_target="${API_STATUS_SECRET_TARGET:-/target/api-status}"
runtime_uid="${RUNTIME_SECRET_UID:-1001}"
runtime_gid="${RUNTIME_SECRET_GID:-1001}"

for directory in "$status_target" "$api_target" "$api_status_target"; do
  mkdir -p "$directory"
  # Root owns the volume root so this one-shot can refresh it. Runtime users
  # may traverse but cannot list or write it; only their 0400 files are readable.
  chmod 711 "$directory"
done

install_secret() {
  source_file="$1"
  target_file="$2"
  required="$3"
  temporary="${target_file}.tmp.$$"

  if [ ! -s "$source_file" ]; then
    if [ "$required" = required ]; then
      printf '%s\n' RUNTIME_SECRET_SOURCE_MISSING >&2
      exit 1
    fi
    rm -f "$target_file"
    return 0
  fi

  cp "$source_file" "$temporary"
  chmod 400 "$temporary"
  chown "$runtime_uid:$runtime_gid" "$temporary"
  mv -f "$temporary" "$target_file"
}

for name in \
  snapshot-token \
  api-event-token \
  event-tokens.json \
  rate-limit-key \
  db-probe-password \
  fallback-cert.pem \
  fallback-key.pem
do
  install_secret "$status_source/$name" "$status_target/$name" required
done

# The API receives only the two Status transport tokens, never the Status
# password verifier, session key, TLS key, database probe secret, or event map.
install_secret \
  "$status_source/snapshot-token" \
  "$api_status_target/snapshot-token" \
  required
install_secret \
  "$status_source/api-event-token" \
  "$api_status_target/api-event-token" \
  required

# Central credentials remain a separate API-only allowlist. Client
# certificate material is optional until enrollment; the signing identity is
# required for every appliance.
for name in site-signing-private.pem site-signing-public.pem; do
  install_secret "$api_source/$name" "$api_target/$name" required
done
for name in site-client-key.pem site-client-cert.pem central-ca.pem; do
  install_secret "$api_source/$name" "$api_target/$name" optional
done

printf '%s\n' RUNTIME_SECRETS_READY
