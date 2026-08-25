#!/bin/sh
set -eu

# Test-only counterpart of the production secret materializer. It creates two
# disjoint named-volume views, then exits; only Status and the fixture remain
# running in the exact-two-container harness.

umask 077
source_dir="${DEV_SECRET_SOURCE:-/source}"
status_target="${DEV_STATUS_SECRET_TARGET:-/target/status}"
fixture_target="${DEV_FIXTURE_SECRET_TARGET:-/target/fixture}"
signals_target="${DEV_SIGNALS_TARGET:-/target/signals}"

install_for() {
  source_file="$1"
  target_file="$2"
  owner="$3"
  test -s "$source_file" || {
    printf '%s\n' DEV_SECRET_SOURCE_MISSING >&2
    exit 1
  }
  temporary="${target_file}.tmp.$$"
  cp "$source_file" "$temporary"
  chmod 400 "$temporary"
  chown "$owner" "$temporary"
  mv -f "$temporary" "$target_file"
}

mkdir -p "$status_target" "$fixture_target"
chmod 711 "$status_target" "$fixture_target"

# The fixture is the sole writer for the test-only signal volume while Status
# mounts it read-only. The Status SQLite volume is deliberately not exposed to
# this initializer; Docker seeds its ownership from the Status image.
mkdir -p "$signals_target"
chown 1000:1000 "$signals_target"
chmod 755 "$signals_target"

install_for "$source_dir/event-tokens.json" "$status_target/event-tokens.json" 1001:1001
install_for "$source_dir/rate-limit-key" "$status_target/rate-limit-key" 1001:1001
install_for "$source_dir/mfa-encryption-key" "$status_target/mfa-encryption-key" 1001:1001
install_for "$source_dir/snapshot-token" "$status_target/snapshot-token" 1001:1001
install_for "$source_dir/fallback-cert.pem" "$status_target/fallback-cert.pem" 1001:1001
install_for "$source_dir/fallback-key.pem" "$status_target/fallback-key.pem" 1001:1001

install_for "$source_dir/fixture-control-token" "$fixture_target/control-token" 1000:1000
install_for "$source_dir/snapshot-token" "$fixture_target/snapshot-token" 1000:1000

printf '%s\n' DEV_RUNTIME_SECRETS_READY
