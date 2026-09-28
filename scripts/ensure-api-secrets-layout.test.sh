#!/bin/sh
# ensure-api-secrets-layout.sh on install, on upgrade and on a damaged
# appliance (coverage review 1.4.13). It runs at every start: a regression here
# either blocks the API from starting or, worse, replaces a key that sealed
# data already in the database.
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT HUP INT TERM

fresh() {
  rm -rf -- "$work/site"
  mkdir -p "$work/site/scripts"
  cp "$root/scripts/ensure-api-secrets-layout.sh" "$work/site/scripts/"
  : > "$work/site/.env"
}
run() { sh "$work/site/scripts/ensure-api-secrets-layout.sh" >/dev/null 2>"$work/stderr"; }
fail() { echo "FAIL: $1" >&2; exit 1; }
mode() { stat -c '%a' "$1"; }
canonical() {
  encoded="$(tr -d '\r\n' < "$1")"
  [ "${#encoded}" -eq 44 ] && [ "$(printf '%s' "$encoded" | openssl base64 -d -A | wc -c | tr -d '[:space:]')" = 32 ]
}
keys="external-ai-seal-key ehr-transport-seal-key mfa-encryption-key"

# A new appliance: every key made, canonical, readable by the owner only.
fresh
run || fail "fresh install refused: $(cat "$work/stderr")"
[ "$(mode "$work/site/secrets/api")" = 700 ] || fail "secrets/api is not 0700"
for key in $keys; do
  canonical "$work/site/secrets/api/$key" || fail "$key is not canonical 32-byte base64"
  [ "$(mode "$work/site/secrets/api/$key")" = 600 ] || fail "$key is not 0600"
done
[ -f "$work/site/secrets/api/hospital-ca.pem" ] && [ ! -s "$work/site/secrets/api/hospital-ca.pem" ] \
  || fail "with no CA configured the CA file must exist and be empty"

# Every later start keeps the keys it has.
before="$(cat "$work/site/secrets/api/ehr-transport-seal-key")"
run || fail "second run refused"
[ "$(cat "$work/site/secrets/api/ehr-transport-seal-key")" = "$before" ] || fail "a restart replaced an existing key"

# A key lost on an appliance that recorded its fingerprint is never replaced:
# a fresh key would make every credential sealed with the old one unreadable.
for key in $keys; do
  case "$key" in
    external-ai-seal-key) variable=HOSPITAL_EXTERNAL_AI_SEAL_KEY_FINGERPRINT ;;
    ehr-transport-seal-key) variable=HOSPITAL_EHR_TRANSPORT_SEAL_KEY_FINGERPRINT ;;
    mfa-encryption-key) variable=HOSPITAL_MFA_ENCRYPTION_KEY_FINGERPRINT ;;
  esac
  fresh
  run
  printf '%s=sha256:%064d\n' "$variable" 0 >> "$work/site/.env"
  rm -f "$work/site/secrets/api/$key"
  if run; then fail "$key was replaced although its fingerprint is recorded"; fi
  grep -q "refusing to replace" "$work/stderr" || fail "no reason given for refusing $key"
  [ ! -s "$work/site/secrets/api/$key" ] || fail "$key was written despite the refusal"
done

# A key spelled in a non-canonical way is refused rather than used.
fresh
run
printf 'not-base64-at-all\n' > "$work/site/secrets/api/mfa-encryption-key"
if run; then fail "a non-canonical MFA key was accepted"; fi
grep -q "not canonical" "$work/stderr" || fail "no reason given for the non-canonical key"

# The outbound CA comes from the site's CA answer, relative to the site; the
# EHR override wins; a rotated authority replaces the copy on the next start.
fresh
printf 'site-ca\n' > "$work/site/site-ca.pem"
printf 'ehr-ca\n' > "$work/site/ehr-ca.pem"
printf 'HOSPITAL_TLS_VERIFY_CA="site-ca.pem"\n' >> "$work/site/.env"
run
[ "$(cat "$work/site/secrets/api/hospital-ca.pem")" = site-ca ] || fail "the site CA was not copied"
[ "$(mode "$work/site/secrets/api/hospital-ca.pem")" = 600 ] || fail "the CA copy is not 0600"
printf 'site-ca-rotated\n' > "$work/site/site-ca.pem"
run
[ "$(cat "$work/site/secrets/api/hospital-ca.pem")" = site-ca-rotated ] || fail "a rotated CA did not reach the API"
printf 'HOSPITAL_EHR_TLS_CA=%s\n' "$work/site/ehr-ca.pem" >> "$work/site/.env"
run
[ "$(cat "$work/site/secrets/api/hospital-ca.pem")" = ehr-ca ] || fail "the EHR CA override was not used"

# Appliances from before Status: the allowlisted files move into secrets/api,
# an existing destination wins, and nothing else is moved.
fresh
mkdir -p "$work/site/secrets/api"
printf 'old-cert\n' > "$work/site/secrets/site-client-cert.pem"
printf 'old-ca\n' > "$work/site/secrets/central-ca.pem"
printf 'newer-ca\n' > "$work/site/secrets/api/central-ca.pem"
printf 'status\n' > "$work/site/secrets/status-password"
run
[ "$(cat "$work/site/secrets/api/site-client-cert.pem")" = old-cert ] || fail "an allowlisted file was not moved"
[ ! -e "$work/site/secrets/site-client-cert.pem" ] || fail "the moved file was left behind"
[ "$(cat "$work/site/secrets/api/central-ca.pem")" = newer-ca ] || fail "an upgrade replaced a newer file"
[ -e "$work/site/secrets/status-password" ] && [ ! -e "$work/site/secrets/api/status-password" ] \
  || fail "a Status credential was moved into the API's directory"

echo "ensure-api-secrets-layout: ok"
