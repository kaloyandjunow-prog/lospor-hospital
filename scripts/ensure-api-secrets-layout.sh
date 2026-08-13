#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"

umask 077
mkdir -p secrets/api
chmod 700 secrets/api

# One-time migration for appliances created before Status existed. Move only
# the exact API/Central allowlist; never copy Status credentials into this
# directory. Existing files in the destination win so an upgrade cannot
# silently replace a newer certificate.
for name in \
  site-signing-private.pem \
  site-signing-public.pem \
  site-client-key.pem \
  site-client.csr \
  site-client-cert.pem \
  central-ca.pem
do
  if [ -e "secrets/$name" ] && [ ! -e "secrets/api/$name" ]; then
    mv "secrets/$name" "secrets/api/$name"
  fi
done
