#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
. "$root/scripts/install-supply-lib.sh"

tests=0
assert_equal() {
  label="$1"; expected="$2"; actual="$3"
  [ "$actual" = "$expected" ] || {
    echo "FAIL: $label (expected $expected, got $actual)" >&2
    exit 1
  }
  tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$label"
}
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

assert_equal "resolved build model selects source mode" source \
  "$(install_detect_supply '{"services":{"api":{"build":{"context":"."}}}}')"
assert_equal "build-free resolved model selects release mode" verified-release \
  "$(install_detect_supply '{"services":{"api":{"image":"registry/api:1.0.0"}}}')"
expect_true "source mode runs without a release-verification assertion" \
  install_supply_authorized source ""
expect_false "source mode rejects a misleading verification assertion" \
  install_supply_authorized source 1
expect_false "release mode fails closed without prior verification" \
  install_supply_authorized verified-release ""
expect_false "release mode rejects an arbitrary truthy value" \
  install_supply_authorized verified-release true
expect_true "release mode accepts only the verifier's exact assertion" \
  install_supply_authorized verified-release 1

if sh "$root/scripts/container-node.sh" scripts/not-approved.mjs >/dev/null 2>&1; then
  echo "FAIL: container helper accepted an unapproved script" >&2
  exit 1
fi
tests=$((tests + 1)); printf 'ok %s - container helper rejects arbitrary scripts\n' "$tests"

if grep -E '(^|[|;&])[[:space:]]*node[[:space:]]+scripts/' \
    "$root/scripts/install.sh" \
    "$root/scripts/appliance-operator.sh" \
    "$root/scripts/enroll-central.sh" >/dev/null; then
  echo "FAIL: a client operation still requires host Node.js" >&2
  exit 1
fi
tests=$((tests + 1)); printf 'ok %s - client credential operations have no host Node.js call\n' "$tests"

if grep -E '^[[:space:]]*\./scripts/verify-loaded-release-images\.sh' \
    "$root/scripts/install.sh" \
    "$root/scripts/update.sh" >/dev/null; then
  echo "FAIL: packaged install or update directly executes a non-executable verifier" >&2
  exit 1
fi
tests=$((tests + 1)); printf 'ok %s - packaged image verification is invoked through sh\n' "$tests"

echo "install supply tests passed ($tests)"
