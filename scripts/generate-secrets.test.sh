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
  mkdir -p "$site/scripts"
  cp "$root/scripts/generate-secrets.sh" "$site/scripts/"
  cp "$root/scripts/ensure-status-secrets.sh" "$site/scripts/" 2>/dev/null \
    || printf '#!/bin/sh\nexit 0\n' > "$site/scripts/ensure-status-secrets.sh"
}

env_value() {
  sed -n "s/^$1=//p" "$site/.env" | tail -n 1
}

# MSYS_NO_PATHCONV keeps Git Bash from rewriting openssl's "/CN=..." subject
# into a Windows path; the appliance runs on Ubuntu, where this does not arise.
# The exit status is ignored on purpose: these assertions are about the
# configuration that was written, not about the certificate request.
# Answers left on standard input stand in for someone pressing Enter at a
# prompt, which is what selects a default.
run_generator() {
  printf '%s' "${1:-}" | MSYS_NO_PATHCONV=1 \
    sh "$site/scripts/generate-secrets.sh" >/dev/null 2>&1 || true
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
if [ "$ok" = 1 ]; then
  pass "every prompted value lands in its own field"
else
  fail "a prompted value landed in the wrong field"
fi

# 3. Secrets are generated, not templated or repeated.
if [ -n "$(env_value HOSPITAL_PATIENT_HMAC_KEY)" ] \
  && [ "$(env_value HOSPITAL_PATIENT_HMAC_KEY)" != "replace" ] \
  && [ "$(env_value LOSPOR_AUTH_SECRET)" != "$(env_value CRON_SECRET)" ]; then
  pass "secrets are generated rather than templated"
else
  fail "secrets look templated or repeated"
fi

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
if MSYS_NO_PATHCONV=1 sh "$site/scripts/generate-secrets.sh" </dev/null >/dev/null 2>&1; then
  fail "regenerating over an existing .env was allowed"
else
  pass "an existing .env is refused rather than replaced"
fi

# 6. With no sender given, the default is derived from this site rather than
#    from the public project. A hospital cannot sign for lospor.org, so mail
#    sent as it fails SPF and DKIM and misattributes who sent it.
make_site
unset AUTH_EMAIL_FROM
run_generator '
'
if [ "$(env_value AUTH_EMAIL_FROM)" = "no-reply@lospor.hospital.example" ]; then
  pass "the default sender is derived from the site's own domain"
else
  fail "default sender not derived, got '$(env_value AUTH_EMAIL_FROM)'"
fi

# 7. Nothing in the generated configuration claims to be the project.
if grep -q "lospor\.org" "$site/.env"; then
  fail "generated .env still references lospor.org"
else
  pass "no lospor.org address reaches the generated configuration"
fi

# 8. A missing value with nothing left to read says which one, rather than
#    ending the run silently as it used to under `set -e`.
make_site
unset AUTH_EMAIL_FROM
message="$(MSYS_NO_PATHCONV=1 sh "$site/scripts/generate-secrets.sh" </dev/null 2>&1 || true)"
if printf '%s' "$message" | grep -q "AUTH_EMAIL_FROM"; then
  pass "a missing value names itself instead of failing silently"
else
  fail "a missing value gave no usable message: $message"
fi

printf '\n%s failure(s).\n' "$failures"
[ "$failures" -eq 0 ] || exit 1
