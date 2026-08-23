#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM
tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
value() { printf '%s\n' "$1" | awk -F '\t' -v key="$2" '$1 == key { print $2; exit }'; }
subject_prefix=/
case "$(uname -s 2>/dev/null || true)" in MINGW*|MSYS*) subject_prefix=// ;; esac

make_ca() {
  ca_name="$1"
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -subj "${subject_prefix}CN=$ca_name" -keyout "$work/$ca_name.key" -out "$work/$ca_name.crt" \
    >/dev/null 2>&1
}
make_certificate() {
  output="$1"; names="$2"; eku="$3"; days="$4"
  openssl req -new -newkey rsa:2048 -nodes \
    -subj "${subject_prefix}CN=clinical.test" \
    -addext "subjectAltName=$names" -addext "extendedKeyUsage=$eku" \
    -keyout "$work/$output.key" -out "$work/$output.csr" >/dev/null 2>&1
  openssl x509 -req -in "$work/$output.csr" -CA "$work/Trusted.key.crt" \
    -CAkey "$work/Trusted.key.key" -CAcreateserial -days "$days" \
    -copy_extensions copy -out "$work/$output.pem" >/dev/null 2>&1
}
inspect() {
  sh "$root/scripts/tls-certificate-check.sh" \
    "$work/$1.pem" "$work/$2.key" "$work/$3.crt" \
    clinical.test research.test 2592000
}

# A dot in the CA name keeps the helper filenames distinct from certificate
# fixture names while remaining a valid test-only common name.
make_ca Trusted.key
make_ca Wrong.key
make_certificate valid 'DNS:clinical.test,DNS:research.test' serverAuth 90
make_certificate one-name 'DNS:clinical.test' serverAuth 90
make_certificate client-only 'DNS:clinical.test,DNS:research.test' clientAuth 90
make_certificate near-expiry 'DNS:clinical.test,DNS:research.test' serverAuth 1
make_certificate other-key 'DNS:clinical.test,DNS:research.test' serverAuth 90

report="$(inspect valid valid Trusted.key)"
for field in LEAF_PRESENT KEY_MATCH CLINICAL_HOST RESEARCH_HOST SERVER_PURPOSE \
  CLINICAL_VERIFY RESEARCH_VERIFY CHECKEND
do
  [ "$(value "$report" "$field")" = 1 ] || fail "valid certificate failed $field"
done
ok "a matching CA, key, EKU, validity and both DNS identities pass"

report="$(inspect one-name one-name Trusted.key)"
[ "$(value "$report" CLINICAL_HOST)" = 1 ] \
  && [ "$(value "$report" RESEARCH_HOST)" = 0 ] \
  && [ "$(value "$report" RESEARCH_VERIFY)" = 0 ] \
  || fail "a missing Research SAN was accepted"
ok "the Research hostname is independently required"

report="$(inspect valid other-key Trusted.key)"
[ "$(value "$report" KEY_MATCH)" = 0 ] || fail "an unrelated private key was accepted"
ok "an unrelated private key is rejected"

report="$(inspect valid valid Wrong.key)"
[ "$(value "$report" CLINICAL_VERIFY)" = 0 ] \
  && [ "$(value "$report" RESEARCH_VERIFY)" = 0 ] \
  || fail "an unrelated CA was accepted"
ok "an unrelated CA is rejected for both names"

report="$(inspect client-only client-only Trusted.key)"
[ "$(value "$report" SERVER_PURPOSE)" = 0 ] \
  && [ "$(value "$report" CLINICAL_VERIFY)" = 0 ] \
  || fail "a client-only certificate was accepted for a TLS server"
ok "client-only EKU is rejected"

report="$(inspect near-expiry near-expiry Trusted.key)"
[ "$(value "$report" CHECKEND)" = 0 ] || fail "a certificate inside the 30-day floor passed"
ok "the 30-day validity floor is enforced"

printf 'TLS certificate readiness tests passed (%s)\n' "$tests"
