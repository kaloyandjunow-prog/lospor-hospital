#!/bin/sh
# generate-secrets.sh had no tests, and it decides who a hospital's account
# email claims to be from, which values are secret, and whether an existing
# configuration can be overwritten.
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
failures=0

pass() { printf 'PASS  %s\n' "$1"; }
fail() { failures=$((failures + 1)); printf 'FAIL  %s\n' "$1" >&2; }

# A throwaway root holding just the scripts the generator needs. The script
# derives its root from its own path, so it writes here and never near the repo.
make_site() {
  site="$(mktemp -d)"
  mkdir -p "$site/scripts" "$site/infra/postgres"
  cp "$root/scripts/generate-secrets.sh" "$site/scripts/"
  cp "$root/scripts/ensure-backup-configuration.sh" "$site/scripts/"
  cp "$root/scripts/ehr-transport-seal-key.sh" "$site/scripts/"
  cp "$root/scripts/mfa-encryption-key.sh" "$site/scripts/"
  cp "$root/scripts/network-boundaries.py" "$site/scripts/"
  cp "$root/scripts/support-url.py" "$site/scripts/"
  cp "$root/scripts/operator-locale.sh" "$site/scripts/"
  cp "$root/infra/postgres/offhost-deferred.sh" "$site/infra/postgres/"
  cp "$root/scripts/ensure-status-secrets.sh" "$site/scripts/" 2>/dev/null \
    || printf '#!/bin/sh\nexit 0\n' > "$site/scripts/ensure-status-secrets.sh"
  mkdir -p "$site/test-bin"
  if ! command -v python3 >/dev/null 2>&1; then
    printf '#!/bin/sh\nfor value do :; done\nprintf "%%s\\n" "$value"\n' > "$site/test-bin/python3"
    chmod +x "$site/test-bin/python3"
  fi
}

env_value() {
  sed -n "s/^$1=//p" "$site/.env" | tail -n 1
}

# Exclude only openssl's "/CN=..." subject from Git Bash path conversion. A
# global conversion ban would also hide mktemp paths from the Windows openssl
# used by this development test; the appliance itself runs on Ubuntu.
# The exit status is ignored on purpose: these assertions are about the
# configuration that was written, not about the certificate request.
# Every value comes from the environment. Nothing is piped: the generator
# refuses to read a value from standard input at all, which is the point.
run_generator() {
  PATH="$site/test-bin:$PATH" MSYS2_ARG_CONV_EXCL=/CN= sh "$site/scripts/generate-secrets.sh" \
    </dev/null >/dev/null 2>"$site/generate-secrets.stderr" || true
}

# Git Bash reports 644 for everything on an NTFS working tree, so the mode
# assertion only means something where the filesystem carries POSIX modes.
posix_modes_supported() {
  probe="$(mktemp)"
  chmod 600 "$probe"
  [ "$(stat -c '%a' "$probe" 2>/dev/null || echo unknown)" = "600" ]
}

export ACME_EMAIL=it@hospital.example
export HOSPITAL_CLINICAL_DOMAIN=lospor.hospital.example
export HOSPITAL_RESEARCH_DOMAIN=research.hospital.example
export HOSPITAL_TLS_MODE=local
export HOSPITAL_RESEARCH_ALLOWED_CIDRS="10.24.30.0/24 fd12:3456:789a:30::/64"
export HOSPITAL_STATUS_ALLOWED_CIDRS="10.24.40.0/24 fd12:3456:789a:40::/64"
export LOSPOR_DEFAULT_LOCALE=bg
export HOSPITAL_ADULT_GUIDANCE_DEFAULT=true
export HOSPITAL_PEDIATRIC_GUIDANCE_DEFAULT=true
export HOSPITAL_EXTERNAL_AI_DEFAULT=true
export HOSPITAL_SUPPORT_URL=mailto:support@hospital.example
export HOSPITAL_UPDATE_SUPPLY_MODE=connected

# 1. An explicit sender is honoured.
make_site
export AUTH_EMAIL_FROM=postmaster@hospital.example
run_generator
if [ "$(env_value AUTH_EMAIL_FROM)" = "postmaster@hospital.example" ]; then
  pass "an explicit sender address is honoured"
else
  fail "explicit sender not honoured, got '$(env_value AUTH_EMAIL_FROM)'"
fi

# 2. Every prompted value lands in its own field. Adding a prompt without a
#    matching variable would silently consume the next answer -- which is how a
#    password once landed in a domain field during release verification.
ok=1
[ "$(env_value ACME_EMAIL)" = "it@hospital.example" ] || ok=0
[ "$(env_value HOSPITAL_CLINICAL_DOMAIN)" = "lospor.hospital.example" ] || ok=0
[ "$(env_value HOSPITAL_RESEARCH_DOMAIN)" = "research.hospital.example" ] || ok=0
[ "$(env_value HOSPITAL_TLS_MODE)" = "local" ] || ok=0
[ "$(env_value COMPOSE_PROFILES)" = "" ] || ok=0
[ "$(env_value HOSPITAL_RESEARCH_ALLOWED_CIDRS)" = '"10.24.30.0/24 fd12:3456:789a:30::/64"' ] || ok=0
[ "$(env_value HOSPITAL_STATUS_ALLOWED_CIDRS)" = '"10.24.40.0/24 fd12:3456:789a:40::/64"' ] || ok=0
[ "$(env_value LOSPOR_DEFAULT_LOCALE)" = "bg" ] || ok=0
[ "$(env_value HOSPITAL_ADULT_GUIDANCE_DEFAULT)" = "true" ] || ok=0
[ "$(env_value HOSPITAL_PEDIATRIC_GUIDANCE_DEFAULT)" = "true" ] || ok=0
[ "$(env_value HOSPITAL_EXTERNAL_AI_DEFAULT)" = "true" ] || ok=0
[ "$(env_value HOSPITAL_SUPPORT_URL)" = "mailto:support@hospital.example" ] || ok=0
[ "$(env_value HOSPITAL_UPDATE_SUPPLY_MODE)" = "connected" ] || ok=0
if [ "$ok" = 1 ]; then
  pass "every prompted value lands in its own field"
else
  fail "a prompted value landed in the wrong field"
fi

# 3. Secrets are generated, not templated or repeated.
backup_manifest_key="$(env_value HOSPITAL_BACKUP_MANIFEST_HMAC_KEY)"
omop_pseudonym_salt="$(env_value OMOP_PSEUDONYM_SALT)"
expected_omop_fp="sha256:$(printf '%s' "$omop_pseudonym_salt" | sha256sum | awk '{ print $1 }')"
case "$omop_pseudonym_salt" in *[!0-9a-f]*|'') omop_salt_valid=0 ;; *) omop_salt_valid=1 ;; esac
if [ -n "$(env_value HOSPITAL_PATIENT_HMAC_KEY)" ] \
  && [ "$(env_value HOSPITAL_PATIENT_HMAC_KEY)" != "replace" ] \
  && [ "$(env_value LOSPOR_AUTH_SECRET)" != "$(env_value CRON_SECRET)" ] \
  && [ "$(env_value HOSPITAL_OPERATIONAL_SECRET_GENERATION)" = 1 ] \
  && [ "${#backup_manifest_key}" -ge 32 ] \
  && [ "$(env_value HOSPITAL_BACKUP_INTERVAL_SECONDS)" = 14400 ] \
  && [ "$(env_value HOSPITAL_BACKUP_KEEP_ALL_SECONDS)" = 172800 ] \
  && [ "$(env_value HOSPITAL_BACKUP_DAILY_POINTS)" = 14 ]; then
  pass "secrets are generated rather than templated"
else
  fail "secrets look templated or repeated"
fi

if [ "$omop_salt_valid" -eq 1 ] \
  && [ "${#omop_pseudonym_salt}" -eq 64 ] \
  && [ "$(env_value HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT)" = "$expected_omop_fp" ]; then
  pass "OMOP pseudonym salt is canonical and its exact fingerprint is persisted"
else
  [ "$omop_salt_valid" -eq 1 ] && omop_charset=valid || omop_charset=invalid
  [ "${#omop_pseudonym_salt}" -eq 64 ] && omop_length=valid || omop_length=invalid
  [ -n "$(env_value HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT)" ] \
    && omop_fingerprint=present || omop_fingerprint=missing
  [ "$(env_value HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT)" = "$expected_omop_fp" ] \
    && omop_match=valid || omop_match=invalid
  fail "OMOP pseudonym salt contract failed (charset=$omop_charset, length=$omop_length, fingerprint=$omop_fingerprint, match=$omop_match)"
fi

seal_key="$(tr -d '\r\n' < "$site/secrets/api/external-ai-seal-key" 2>/dev/null || true)"
seal_raw="$site/external-ai-seal.raw"
if [ "${#seal_key}" -eq 44 ] \
  && printf '%s' "$seal_key" | openssl base64 -d -A -out "$seal_raw" 2>/dev/null \
  && [ "$(wc -c < "$seal_raw" | tr -d '[:space:]')" = 32 ] \
  && [ "$(openssl base64 -A -in "$seal_raw")" = "$seal_key" ]; then
  pass "external-AI credential seal key is canonical and independent"
else
  fail "external-AI credential seal key is missing or invalid"
fi
rm -f -- "$seal_raw"

mfa_key="$(tr -d '\r\n' < "$site/secrets/api/mfa-encryption-key" 2>/dev/null || true)"
mfa_raw="$site/mfa-encryption.raw"
if [ "${#mfa_key}" -eq 44 ] \
  && [ "$mfa_key" != "$seal_key" ] \
  && printf '%s' "$mfa_key" | openssl base64 -d -A -out "$mfa_raw" 2>/dev/null \
  && [ "$(wc -c < "$mfa_raw" | tr -d '[:space:]')" = 32 ] \
  && [ "$(openssl base64 -A -in "$mfa_raw")" = "$mfa_key" ]; then
  pass "administrator MFA encryption key is canonical and independent"
else
  fail "administrator MFA encryption key is missing, invalid, or reused"
fi
rm -f -- "$mfa_raw"

# 4. The file is not world-readable.
if posix_modes_supported; then
  mode="$(stat -c '%a' "$site/.env" 2>/dev/null || echo unknown)"
  if [ "$mode" = "600" ]; then
    pass ".env is created readable only by its owner"
  else
    fail ".env mode is $mode, expected 600"
  fi
else
  printf 'SKIP  .env mode (filesystem does not carry POSIX modes)\n'
fi

# 5. An existing configuration is never silently replaced.
if PATH="$site/test-bin:$PATH" MSYS_NO_PATHCONV=1 sh "$site/scripts/generate-secrets.sh" </dev/null >/dev/null 2>&1; then
  fail "regenerating over an existing .env was allowed"
else
  pass "an existing .env is refused rather than replaced"
fi

# 6. A value missing from the environment is never taken from standard input.
#
#    install.sh runs this script and then reads the administrator's password
#    from the same stream. A prompt that falls back to reading consumed that
#    password and wrote it into the field it was asking about -- silently,
#    and permanently, because the next run finds .env present and skips
#    generation. A fourth prompt reintroduced exactly that, as the password
#    becoming AUTH_EMAIL_FROM.
make_site
unset AUTH_EMAIL_FROM
sender_leak="$(printf 'S3cret-Password!
S3cret-Password!
' \
  | PATH="$site/test-bin:$PATH" MSYS_NO_PATHCONV=1 sh "$site/scripts/generate-secrets.sh" 2>&1 || true)"
if [ -f "$site/.env" ]; then
  fail "generated .env from piped input: $(env_value AUTH_EMAIL_FROM)"
else
  pass "a value missing from the environment is not read from a pipe"
fi
if printf %s "$sender_leak" | grep -q "AUTH_EMAIL_FROM"; then
  pass "the refusal names the variable that was missing"
else
  fail "the refusal did not name AUTH_EMAIL_FROM: $sender_leak"
fi

# 7. Nothing in the generated configuration claims to be the project. Generated
#    afresh, because the site above deliberately has no .env -- it refused to
#    take the sender from the pipe, which is what test 6 is about.
make_site
export AUTH_EMAIL_FROM=postmaster@hospital.example
run_generator
if grep -q "lospor\.org" "$site/.env"; then
  fail "generated .env still references lospor.org"
else
  pass "no lospor.org address reaches the generated configuration"
fi

# 8. A missing value with nothing left to read says which one, rather than
#    ending the run silently as it used to under `set -e`.
make_site
unset AUTH_EMAIL_FROM
message="$(PATH="$site/test-bin:$PATH" MSYS_NO_PATHCONV=1 sh "$site/scripts/generate-secrets.sh" </dev/null 2>&1 || true)"
if printf '%s' "$message" | grep -q "AUTH_EMAIL_FROM"; then
  pass "a missing value names itself instead of failing silently"
else
  fail "a missing value gave no usable message: $message"
fi

# 9. Only the two shipped locales may become the appliance default.
make_site
export AUTH_EMAIL_FROM=postmaster@hospital.example
export LOSPOR_DEFAULT_LOCALE=de
run_generator
if [ -f "$site/.env" ]; then
  fail "an unsupported appliance locale was persisted"
else
  pass "an unsupported appliance locale is refused before configuration is written"
fi

make_site
export LOSPOR_DEFAULT_LOCALE=bg
export HOSPITAL_UPDATE_SUPPLY_MODE=offline
run_generator
if [ "$(env_value HOSPITAL_UPDATE_SUPPLY_MODE)" = offline ]; then
  pass "offline update supply is persisted explicitly"
else
  fail "offline update supply was not persisted"
fi

make_site
export HOSPITAL_UPDATE_SUPPLY_MODE=automatic
run_generator
if [ -f "$site/.env" ]; then
  fail "an unsupported update supply mode was persisted"
else
  pass "an unsupported update supply mode is refused"
fi
export LOSPOR_DEFAULT_LOCALE=bg
export HOSPITAL_UPDATE_SUPPLY_MODE=connected

# 10. Account mutation authority is not the read-only snapshot bearer.
make_site
export AUTH_EMAIL_FROM=postmaster@hospital.example
run_generator
account_control_token="$(tr -d '\r\n' < "$site/secrets/status/account-control-token" 2>/dev/null || true)"
snapshot_token="$(tr -d '\r\n' < "$site/secrets/status/snapshot-token" 2>/dev/null || true)"
if [ "${#account_control_token}" -eq 64 ] \
  && [ "$account_control_token" != "$snapshot_token" ]; then
  pass "account control has a separate generated service bearer"
else
  fail "account control bearer is missing, malformed, or reused"
fi

# 11. Status TOTP encryption has its own exact 32-byte key.
status_mfa_key="$(tr -d '\r\n' < "$site/secrets/status/mfa-encryption-key" 2>/dev/null || true)"
api_mfa_key="$(tr -d '\r\n' < "$site/secrets/api/mfa-encryption-key" 2>/dev/null || true)"
status_rate_key="$(tr -d '\r\n' < "$site/secrets/status/rate-limit-key" 2>/dev/null || true)"
case "$status_mfa_key" in
  *[!0-9a-f]*|'') status_mfa_valid=0 ;;
  *) status_mfa_valid=1 ;;
esac
if [ "$status_mfa_valid" -eq 1 ] \
  && [ "${#status_mfa_key}" -eq 64 ] \
  && [ "$status_mfa_key" != "$api_mfa_key" ] \
  && [ "$status_mfa_key" != "$status_rate_key" ]; then
  pass "Status MFA has a separate exact 32-byte encryption key"
else
  fail "Status MFA key is missing, malformed, or reused"
fi

printf '\n%s failure(s).\n' "$failures"
[ "$failures" -eq 0 ] || exit 1
