#!/bin/sh
set -eu

# The guided installer is a front end, and the risk of a front end is that it
# becomes a way past a check rather than a way through one. These drive it with
# no terminal, so it takes the plain-prompt path, and assert that each refusal
# actually refuses -- and that the refusal happens before anything is pulled.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
tests=0
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM

ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; [ -f "$work/out" ] && sed 's/^/    /' "$work/out" >&2; exit 1; }

mkdir -p "$work/scripts"
cp "$root/scripts/install-guided.sh" "$work/scripts/"
cp "$root/scripts/network-boundaries.py" "$work/scripts/"
cp "$root/scripts/support-url.py" "$work/scripts/"
mkdir -p "$work/test-bin"
python_validation=1
if ! python3 -c 'raise SystemExit(0)' >/dev/null 2>&1; then
  python_validation=0
  printf '#!/bin/sh\nfor value do :; done\nprintf "%%s\\n" "$value"\n' > "$work/test-bin/python3"
  chmod +x "$work/test-bin/python3"
fi
printf 'pretend release lock\n' > "$work/lock"
printf 'x\n' > "$work/lock.sha256"
real_digest="$(sha256sum "$work/lock" | awk '{print $1}')"

cat > "$work/scripts/readiness-check.sh" <<'STUB'
#!/bin/sh
echo "PASS  stub readiness"
if [ "${STUB_READINESS_FAILS:-0}" = 1 ]; then echo "FAIL  stub failure" >&2; exit 1; fi
exit 0
STUB
cat > "$work/scripts/run-online-release.sh" <<'STUB'
#!/bin/sh
cat > "$INSTALL_RECORD.stdin"
printf '%s\n' "${LOSPOR_DEFAULT_LOCALE:-}" > "$INSTALL_RECORD.locale"
printf '%s\n' "${HOSPITAL_EXTERNAL_AI_DEFAULT:-}" > "$INSTALL_RECORD.external-ai-default"
printf '%s\n' "${HOSPITAL_SUPPORT_URL:-}" > "$INSTALL_RECORD.support-url"
printf '%s\n' "${HOSPITAL_UPDATE_SUPPLY_MODE:-}" > "$INSTALL_RECORD.update-supply"
printf '%s|%s|%s\n' "${HOSPITAL_STATUS_ALLOWED_CIDRS:-}" "${HOSPITAL_RESEARCH_ALLOWED_CIDRS:-}" "${HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE:-}" > "$INSTALL_RECORD.networks"
printf 'HOSPITAL_CLINICAL_DOMAIN=c.test.invalid\nHOSPITAL_STATUS_PORT=3443\n' > .env
printf 'reached\n' > "$INSTALL_RECORD"
STUB
# The offline launcher is a peer of the online one, not a fallback: the guided
# front end must be able to finish through either, so both are stubbed and each
# records which one actually ran.
cat > "$work/scripts/load-offline.sh" <<'STUB'
#!/bin/sh
cat > "$INSTALL_RECORD.stdin"
printf '%s\n' "${LOSPOR_DEFAULT_LOCALE:-}" > "$INSTALL_RECORD.locale"
printf '%s\n' "${HOSPITAL_UPDATE_SUPPLY_MODE:-}" > "$INSTALL_RECORD.update-supply"
printf 'HOSPITAL_CLINICAL_DOMAIN=c.test.invalid\nHOSPITAL_STATUS_PORT=3443\n' > .env
printf 'offline\n' > "$INSTALL_RECORD.launcher"
printf 'reached\n' > "$INSTALL_RECORD"
STUB
cp "$root/scripts/pin-release-signing-key.sh" "$work/scripts/"
cp "$root/scripts/installed-release-state.sh" "$work/scripts/"

# A release carrying a signing key, so the pinning prompt is actually exercised.
# Without this the whole block is skipped and the tests below pass by not
# running, which is how the first version of this suite "passed".
mkdir -p "$work/infra/release-signing"
openssl genpkey -algorithm ED25519 -out "$work/maintainer.key" 2>/dev/null
openssl pkey -in "$work/maintainer.key" -pubout \
  -out "$work/infra/release-signing/release-signing-public.pem" 2>/dev/null
openssl genpkey -algorithm ED25519 -out "$work/attacker.key" 2>/dev/null
openssl pkey -in "$work/attacker.key" -pubout -out "$work/attacker.pub" 2>/dev/null
fingerprint_of() {
  printf 'SHA256:%s' "$(openssl pkey -pubin -in "$1" -outform DER 2>/dev/null \
    | openssl dgst -sha256 -binary | openssl base64 | tr -d '\r\n=')"
}
cp "$root/scripts/verify-release-signature.sh" "$work/scripts/"
openssl pkeyutl -sign -inkey "$work/maintainer.key" -rawin -in "$work/lock" -out "$work/lock.sig"
good_fingerprint="$(fingerprint_of "$work/infra/release-signing/release-signing-public.pem")"
wrong_fingerprint="$(fingerprint_of "$work/attacker.pub")"

chmod +x "$work/scripts/"*.sh

# Everything except the digest and the password is pinned, so stdin carries a
# fixed number of answers whether or not .env exists. That variability is the
# fragility this installer exists to remove; a test depending on it would be
# testing its own fixture.
pinned="LOSPOR_DEFAULT_LOCALE=en HOSPITAL_INSTALL_SUPPLY_MODE=connected HOSPITAL_RELEASE_SIGNING_FINGERPRINT=$good_fingerprint ACME_EMAIL=it@test.invalid AUTH_EMAIL_FROM=no-reply@c.test.invalid HOSPITAL_CLINICAL_DOMAIN=c.test.invalid HOSPITAL_RESEARCH_DOMAIN=r.test.invalid HOSPITAL_TLS_MODE=local HOSPITAL_RESEARCH_ALLOWED_CIDRS=10.24.30.0/24 HOSPITAL_STATUS_ALLOWED_CIDRS=10.24.40.0/24 HOSPITAL_SUPPORT_URL= HOSPITAL_ADULT_GUIDANCE_DEFAULT=true HOSPITAL_PEDIATRIC_GUIDANCE_DEFAULT=true HOSPITAL_EXTERNAL_AI_DEFAULT=false HOSPITAL_BACKUP_OFFHOST_HOOK_SOURCE= HOSPITAL_INSTITUTION_NAME=Test HOSPITAL_INSTITUTION_CITY=City HOSPITAL_INSTITUTION_COUNTRY=Country HOSPITAL_BOOTSTRAP_ADMIN_EMAIL=a@b.invalid HOSPITAL_BOOTSTRAP_ADMIN_USERNAME=Clinical.Admin HOSPITAL_BOOTSTRAP_ADMIN_CONTACT_EMAIL= HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME=A HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME=B"

# Every run starts unpinned, so its answers begin with the digest. A key pinned
# as a side effect of an earlier run would skip that prompt and shift every
# later answer by one line. Runs that exercise a pinned appliance say so.
run_guided_pinned() {
  ( cd "$work" && env $pinned "$@" PATH="$work/test-bin:$PATH" INSTALL_RECORD="$work/record" \
      sh scripts/install-guided.sh lock lock.sha256 . ) >"$work/out" 2>&1
}
run_guided() {
  rm -f "$work/secrets/release-signing-public.pem"
  run_guided_pinned "$@"
}

# 1. A wrong digest stops the install, before anything is pulled.
rm -f "$work/record"
printf '0000000000000000000000000000000000000000000000000000000000000000\n' > "$work/answers"
if run_guided < "$work/answers"; then fail "a mismatched release lock did not stop the install"; fi
grep -q "RELEASE LOCK DOES NOT MATCH" "$work/out" || fail "no mismatch message shown"
[ ! -f "$work/record" ] || fail "the launcher ran despite a mismatched lock"
ok "a mismatched release lock stops the install before anything is pulled"

# 2. A malformed digest is rejected as malformed, not compared.
rm -f "$work/record"
printf 'not-a-digest\n' > "$work/answers"
if run_guided < "$work/answers"; then fail "a malformed digest was accepted"; fi
grep -q "not a SHA-256 digest" "$work/out" || fail "malformed digest not reported as such"
ok "a malformed digest is refused before any comparison"

# 3. Mismatched administrator passwords stop the install.
rm -f "$work/record"
printf '%s\nfirst-secret\nsecond-secret\n' "$real_digest" > "$work/answers"
if run_guided < "$work/answers"; then fail "mismatched passwords did not stop the install"; fi
grep -q "did not match" "$work/out" || fail "no password mismatch message"
[ ! -f "$work/record" ] || fail "the launcher ran despite mismatched passwords"
ok "mismatched administrator passwords stop the install"

# 4. Invalid Hospital usernames are refused before any credential is created.
rm -f "$work/record"
printf '%s\n' "$real_digest" > "$work/answers"
if run_guided HOSPITAL_BOOTSTRAP_ADMIN_USERNAME='Doctor Name' < "$work/answers"; then
  fail "an invalid Hospital username was accepted"
fi
grep -q "First clinical administrator login username" "$work/out" +  || fail "invalid username rules were not shown"
[ ! -f "$work/record" ] || fail "the launcher ran despite an invalid username"
ok "invalid Hospital usernames stop guided installation"

# 5. A failing readiness check stops the install.
rm -f "$work/record"
printf '%s\nsame-secret\nsame-secret\n' "$real_digest" > "$work/answers"
if run_guided STUB_READINESS_FAILS=1 < "$work/answers"; then fail "a failing readiness check did not stop the install"; fi
[ ! -f "$work/record" ] || fail "the launcher ran despite a failing readiness check"
ok "a failing readiness check stops the install"

# 6. The happy path reaches the real launcher, with the password on stdin.
rm -f "$work/record"
printf '%s\ngood-secret\ngood-secret\n' "$real_digest" > "$work/answers"
run_guided < "$work/answers" || fail "the happy path did not complete"
[ -f "$work/record" ] || fail "the launcher was never reached"
printf 'good-secret\ngood-secret\n\n' | cmp -s - "$work/record.stdin" \
  || fail "the launcher did not receive two password lines and the optional AI-key line on standard input"
ok "the happy path reaches the launcher with secrets only on standard input"
[ "$(cat "$work/record.networks")" = '10.24.40.0/24|10.24.30.0/24|' ] \
  || fail "network lists given in the environment were not used as they are"

# 6b. The network lists are not asked for: until Hospital IT sets them in Status,
#     Status answers every private network and Research answers nobody.
rm -f "$work/record" "$work/.env"
printf '%s\ngood-secret\ngood-secret\n' "$real_digest" > "$work/answers"
run_guided HOSPITAL_STATUS_ALLOWED_CIDRS= HOSPITAL_RESEARCH_ALLOWED_CIDRS= < "$work/answers" || fail "an install without network lists did not complete"
[ "$(cat "$work/record.networks")" = '10.0.0.0/8 172.16.0.0/12 192.168.0.0/16|127.0.0.1/32|confirmed' ] \
  || fail "the installed network lists were not the documented defaults (got $(cat "$work/record.networks"))"
! grep -q "CIDR" "$work/out" || fail "the installer still asked about networks"
ok "the network lists are left to Status: every private network for Status, none for Research"

# 6. The password is never echoed.
if grep -q "good-secret" "$work/out"; then fail "the password appeared in the output"; fi
ok "the administrator password is never echoed"


# 7. Every value generate-secrets.sh prompts for is collected here.
#
#    This is the contract that was broken. generate-secrets.sh grew a fourth
#    prompt, AUTH_EMAIL_FROM, and this installer was not taught to ask for it.
#    install.sh runs the generator and then reads the administrator's password
#    from the same standard input, so the unasked prompt consumed the password
#    and wrote it into .env as the sender address for every account email --
#    silently, and permanently, because the next run finds .env present and
#    skips generation entirely.
#
#    The generator now refuses to read from a pipe at all, so a repeat would
#    stop the install rather than leak. This keeps it from getting that far:
#    a prompt added there without a matching question here fails now, in the
#    test suite, rather than in front of a hospital.
prompted="$(sed -n 's/.*\$(prompt \([A-Z_][A-Z0-9_]*\).*/\1/p' "$root/scripts/generate-secrets.sh" | sort -u)"
[ -n "$prompted" ] || fail "could not read the prompted variables from generate-secrets.sh"
missing=""
for variable in $prompted; do
  case "$variable" in
    LOSPOR_DEFAULT_LOCALE)
      grep -q "export LOSPOR_DEFAULT_LOCALE" "$root/scripts/install-guided.sh" \
        || missing="$missing $variable" ;;
    HOSPITAL_TLS_MODE)
      grep -q "ask_tls_mode" "$root/scripts/install-guided.sh" \
        || missing="$missing $variable" ;;
    *)
      # Asked, or given an explicit default and exported: either way the
      # generator never falls through to reading standard input.
      { grep -q "ask_value $variable " "$root/scripts/install-guided.sh" \
        || { grep -q ": \"\${$variable:=" "$root/scripts/install-guided.sh" \
          && grep -Eq "export .*\b$variable\b" "$root/scripts/install-guided.sh"; }; } \
        || missing="$missing $variable" ;;
  esac
done
[ -z "$missing" ] || fail "generate-secrets.sh prompts for$missing, which install-guided.sh neither asks for nor defaults"
ok "every value the generator prompts for is collected or explicitly defaulted by the installer"



# The signing-key answers come from the environment, like every other value, so
# stdin still carries exactly the digest and two passwords. A test that fed the
# fingerprint positionally would be re-creating the fragility this installer
# exists to remove -- and would have broken tests 3 to 6 the moment the prompt
# was added, which is exactly what happened while writing these.

# 8. The fingerprint the operator was given decides, not the key that arrived
#    with the download. A release able to install its own key could
#    authenticate every release after it.
rm -f "$work/record" "$work/secrets/release-signing-public.pem"
printf '%s\ngood-secret\ngood-secret\n' "$real_digest" > "$work/answers"
if run_guided HOSPITAL_RELEASE_SIGNING_FINGERPRINT="$wrong_fingerprint" < "$work/answers"; then
  fail "a mismatched signing key did not stop the install"
fi
grep -q "DOES NOT MATCH THE FINGERPRINT" "$work/out" || fail "no signing key mismatch message"
[ ! -f "$work/record" ] || fail "the launcher ran despite a mismatched signing key"
[ ! -f "$work/secrets/release-signing-public.pem" ] || fail "a rejected key was pinned anyway"
ok "a signing key that is not the one the operator was promised stops the install"

# 9. Confirming the right fingerprint pins the key. This is what ends the
#    per-release digest for every future update.
rm -f "$work/record" "$work/secrets/release-signing-public.pem"
printf '%s\ngood-secret\ngood-secret\n' "$real_digest" > "$work/answers"
run_guided < "$work/answers" || fail "the correct fingerprint did not complete"
[ -s "$work/secrets/release-signing-public.pem" ] || fail "the signing key was not pinned"
[ -f "$work/record" ] || fail "the launcher was never reached"
ok "confirming the fingerprint pins the key and the install proceeds"

# 10. Once pinned the operator is never asked again -- not for the fingerprint,
#     and not for the digest either: the lock's signature under the pinned key
#     is the separately authenticated value the digest used to be.
rm -f "$work/record"
printf 'good-secret\ngood-secret\n' > "$work/answers"
run_guided_pinned HOSPITAL_RELEASE_SIGNING_FINGERPRINT= < "$work/answers" \
  || fail "a pinned appliance re-prompted or failed"
[ -f "$work/record" ] || fail "the launcher was never reached with a pinned key"
! grep -q "Expected release.lock SHA-256" "$work/out" || fail "a pinned appliance still asked for the digest"
ok "a pinned appliance installs by signature, with no digest or fingerprint to type"

# 10b. With a pinned key, a lock the pinned key did not sign stops the install.
rm -f "$work/record"
cp "$work/lock.sig" "$work/lock.sig.good"
openssl pkeyutl -sign -inkey "$work/attacker.key" -rawin -in "$work/lock" -out "$work/lock.sig"
if run_guided_pinned HOSPITAL_RELEASE_SIGNING_FINGERPRINT= < "$work/answers"; then
  fail "a lock signed by another key was accepted on a pinned appliance"
fi
[ ! -f "$work/record" ] || fail "the launcher ran despite a foreign signature"
grep -q "SIGNATURE DOES NOT MATCH THE TRUSTED KEY" "$work/out" || fail "the foreign signature was not named"
mv "$work/lock.sig.good" "$work/lock.sig"
ok "a pinned appliance refuses a lock its key did not sign"

# 11. Declining is supported. A site that keeps using a per-release digest must
#     still install, or pinning becomes mandatory by accident.
rm -f "$work/record" "$work/secrets/release-signing-public.pem"
printf '%s\n\ngood-secret\ngood-secret\n' "$real_digest" > "$work/answers"
run_guided HOSPITAL_RELEASE_SIGNING_FINGERPRINT= < "$work/answers" \
  || fail "declining to pin stopped the install"
[ ! -f "$work/secrets/release-signing-public.pem" ] || fail "a key was pinned without confirmation"
[ -f "$work/record" ] || fail "the launcher was never reached"
ok "declining to pin leaves the appliance on per-release digests"

# 12. With no preconfigured answer, the first bilingual prompt defaults to
#     Bulgarian and that selection reaches the appliance configuration path.
rm -f "$work/record" "$work/record.locale" "$work/secrets/release-signing-public.pem"
printf '\n%s\ngood-secret\ngood-secret\n' "$real_digest" > "$work/answers"
run_guided LOSPOR_DEFAULT_LOCALE= < "$work/answers" \
  || fail "the Bulgarian default-language path did not complete"
[ "$(cat "$work/record.locale")" = bg ] || fail "the default language was not exported as bg"
grep -q "Това инсталира LOSPOR Hospital" "$work/out" || fail "the installer did not switch to Bulgarian immediately"
ok "the first bilingual prompt defaults to Bulgarian and applies it immediately"

# 13. English remains an explicit supported choice for a foreign operator.
rm -f "$work/record" "$work/record.locale" "$work/secrets/release-signing-public.pem"
printf '2\n%s\ngood-secret\ngood-secret\n' "$real_digest" > "$work/answers"
run_guided LOSPOR_DEFAULT_LOCALE= < "$work/answers" \
  || fail "the explicit English language path did not complete"
[ "$(cat "$work/record.locale")" = en ] || fail "the English choice was not exported"
grep -q "This installs the LOSPOR Hospital appliance" "$work/out" || fail "the installer did not switch to English"
ok "English can be selected explicitly from the first bilingual prompt"

# 14. Automation cannot silently persist a third, unsupported locale.
rm -f "$work/record"
if run_guided LOSPOR_DEFAULT_LOCALE=de </dev/null; then fail "an unsupported default locale was accepted"; fi
grep -q "must be bg or en" "$work/out" || fail "the unsupported locale refusal was not explained"
[ ! -f "$work/record" ] || fail "the launcher ran with an unsupported locale"
ok "an unsupported configured language is refused before installation"

# 15. Guidance, external AI, support contact, e-mail sender, country and the
#     off-host hook are no longer asked. Each takes its safe default without
#     consuming a line of standard input, and the provider key -- added later in
#     Status, where it is sealed -- is never carried by the installer.
rm -f "$work/record" "$work/record.stdin" "$work/record.external-ai-default" \
  "$work/secrets/release-signing-public.pem" "$work/.env"
printf '%s\ngood-secret\ngood-secret\n' "$real_digest" > "$work/answers"
run_guided HOSPITAL_EXTERNAL_AI_DEFAULT= HOSPITAL_ADULT_GUIDANCE_DEFAULT= HOSPITAL_PEDIATRIC_GUIDANCE_DEFAULT= \
  AUTH_EMAIL_FROM= HOSPITAL_INSTITUTION_COUNTRY= < "$work/answers" \
  || fail "the install without optional answers did not complete"
[ "$(cat "$work/record.external-ai-default")" = true ] \
  || fail "external AI did not default to enabled"
printf 'good-secret\ngood-secret\n\n' | cmp -s - "$work/record.stdin" \
  || fail "the installer stdin carried more than the two password lines and an empty provider-key line"
for removed in "guidance for faster" "external AI" "Mistral API" "off-host backup executable" "Sender address" "Hospital country"; do
  ! grep -Fq "$removed" "$work/out" || fail "the installer still asked: $removed"
done
ok "optional settings take safe defaults without a question or a line of stdin"

# 16. A configured clinician support destination is validated before install
#     and reaches the generated environment without adding anything to the
#     password/provider-secret stdin channel.
rm -f "$work/record" "$work/record.support-url" "$work/secrets/release-signing-public.pem"
printf '%s\ngood-secret\ngood-secret\n' "$real_digest" > "$work/answers"
run_guided HOSPITAL_SUPPORT_URL=mailto:support@hospital.example < "$work/answers" \
  || fail "a safe support destination was refused"
[ "$(cat "$work/record.support-url")" = "mailto:support@hospital.example" ] \
  || fail "the support destination was not canonicalized"
ok "the optional support destination is validated and exported"

if [ "$python_validation" -eq 1 ]; then
  # The safe-destination case above reaches the launcher, whose fixture writes
  # .env. Leave no state from that successful installation: with .env present
  # the guided installer correctly treats configuration as already generated
  # and does not re-run the first-install support URL prompt or validator.
  rm -f "$work/record" "$work/.env"
  if run_guided HOSPITAL_SUPPORT_URL=http://unsafe.example < "$work/answers"; then
    fail "an insecure support destination was accepted"
  fi
  [ ! -f "$work/record" ] || fail "the launcher ran with an insecure support destination"
  ok "an insecure support destination is refused before installation"
else
  printf 'SKIP  insecure support destination guided refusal (Python unavailable; validator unit contract runs separately)\n'
fi

# A lock that actually names an offline part, so the media check has something
# to look for. Changing the lock changes the digest the operator must confirm.
printf 'artifact\toffline-part\t000\timages.tar.gz.part-000\t10\t%s\n' \
  "0000000000000000000000000000000000000000000000000000000000000000" > "$work/lock"
offline_digest="$(sha256sum "$work/lock" | awk '{print $1}')"
printf '%s\ngood-secret\ngood-secret\n' "$offline_digest" > "$work/answers"

# 19. An isolated hospital gets the same guided flow, finishing through the
#     offline launcher instead of the connected one.
rm -f "$work/record" "$work/record.launcher" "$work/secrets/release-signing-public.pem"
printf 'part\n' > "$work/images.tar.gz.part-000"
run_guided HOSPITAL_INSTALL_SUPPLY_MODE=offline < "$work/answers" \
  || fail "the guided installer could not finish without a network"
[ -f "$work/record" ] || fail "the offline launcher was never reached"
[ "$(cat "$work/record.launcher")" = offline ] \
  || fail "an offline install did not run the offline launcher"
[ "$(cat "$work/record.update-supply")" = offline ] \
  || fail "an offline install did not default future updates to offline"
printf 'good-secret\ngood-secret\n\n' | cmp -s - "$work/record.stdin" \
  || fail "the offline launcher received a different stdin than the connected one"
ok "the guided installer finishes through the offline launcher with the same stdin"

# An explicit future-update route remains independent from the current media.
rm -f "$work/record" "$work/record.update-supply" "$work/secrets/release-signing-public.pem"
printf '%s\ngood-secret\ngood-secret\n' "$offline_digest" > "$work/answers"
run_guided HOSPITAL_INSTALL_SUPPLY_MODE=offline HOSPITAL_UPDATE_SUPPLY_MODE=connected < "$work/answers" \
  || fail "an explicit connected future-update route was refused"
[ "$(cat "$work/record.update-supply")" = connected ] \
  || fail "the explicit future-update route was overwritten"
ok "an explicit future-update supply mode overrides the matching default"

# 20. Choosing offline without the parts fails closed. Quietly falling back to
#     the network would install from a source the operator did not agree to --
#     and an isolated hospital has no network to fall back to anyway.
rm -f "$work/record" "$work/record.launcher" "$work/images.tar.gz.part-000"
if run_guided HOSPITAL_INSTALL_SUPPLY_MODE=offline < "$work/answers"; then
  fail "an offline install proceeded without the offline parts"
fi
[ ! -f "$work/record" ] || fail "a launcher ran despite incomplete offline media"
grep -q "does not contain every offline part" "$work/out" \
  || fail "the incomplete offline media was not named"
ok "an offline install with incomplete media stops before either launcher runs"

# 21. A connected install needs no registry credential: the images are public.
rm -f "$work/record" "$work/record.launcher"
[ ! -e "$work/secrets/registry" ] || fail "the fixture unexpectedly carries registry credentials"
run_guided HOSPITAL_INSTALL_SUPPLY_MODE=connected < "$work/answers" \
  || fail "a connected install without registry credentials was refused"
[ -f "$work/record" ] && [ ! -f "$work/record.launcher" ] \
  || fail "the connected install did not reach the online launcher"
! grep -q "provision-update-credentials" "$work/out" \
  || fail "the installer still points at the removed credential provisioner"
ok "a connected install proceeds with no registry credentials"

# 22. An unknown supply mode is refused rather than treated as either path.
rm -f "$work/record" "$work/record.launcher"
if run_guided HOSPITAL_INSTALL_SUPPLY_MODE=whichever < "$work/answers"; then
  fail "an unknown supply mode was accepted"
fi
[ ! -f "$work/record" ] || fail "a launcher ran for an unknown supply mode"
ok "an unsupported release supply mode is refused before installation"

# 23. A first installation continued with --resume keeps the settings it wrote:
#     they are not asked again, so nothing typed for them is silently ignored.
rm -f "$work/record" "$work/.env"
mkdir -p "$work/resumed-home"
printf 'LOSPOR_DEFAULT_LOCALE=en\nHOSPITAL_CLINICAL_DOMAIN=kept.test.invalid\n' > "$work/resumed-home/site.env"
printf 'HOSPITAL_CLINICAL_DOMAIN=kept.test.invalid\nHOSPITAL_STATUS_PORT=3443\n' > "$work/resumed-home/.env"
ln -s "$work/resumed-home" "$work/.lospor-home"
# The offline cases above replaced the lock, so its digest is taken afresh.
printf '%s\nresume-secret\nresume-secret\n' "$(sha256sum "$work/lock" | awk '{print $1}')" > "$work/answers"
run_guided LOSPOR_DEFAULT_LOCALE= HOSPITAL_CLINICAL_DOMAIN= HOSPITAL_RESEARCH_DOMAIN= HOSPITAL_TLS_MODE= < "$work/answers" \
  || fail "a resumed installation did not complete"
grep -q "continues with the settings it already wrote" "$work/out" || fail "the resumed settings were not announced"
grep -q "kept.test.invalid" "$work/out" || fail "the kept clinical name was not shown"
if grep -q "Clinical name (web, phone app, API)" "$work/out"; then fail "a resumed installation was asked for its clinical name"; fi
[ "$(cat "$work/record.locale")" = en ] || fail "the resumed installation did not keep its language"
[ "$(head -n 1 "$work/record.stdin")" = resume-secret ] || fail "the password did not reach the launcher"
rm -f "$work/.lospor-home" "$work/.env"
rm -rf "$work/resumed-home"
ok "a resumed installation keeps its settings instead of asking for them again"

# An unattended first installation gives the administrator password as a
# root-only file: it reaches the launcher as typed, and the file is gone.
rm -f "$work/record" "$work/record.stdin"
# The offline cases above replaced the lock, so its digest is taken afresh.
printf '%s\n' "$(sha256sum "$work/lock" | awk '{print $1}')" > "$work/answers"
printf 'from-the-wizard\n' > "$work/admin-password"
run_guided HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD_FILE="$work/admin-password" < "$work/answers" \
  || fail "an install with a password file was refused"
[ "$(sed -n 1,2p "$work/record.stdin" | tr '\n' ' ')" = "from-the-wizard from-the-wizard " ] \
  || fail "the password from the file did not reach the launcher"
[ ! -e "$work/admin-password" ] || fail "the password file was left behind"
rm -f "$work/record"
if run_guided HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD_FILE="$work/missing-password" < "$work/answers"; then
  fail "a missing password file was accepted"
fi
[ ! -f "$work/record" ] || fail "the launcher ran without a password"
ok "an unattended install reads the password file once and removes it"

printf 'guided installer tests passed (%s)\n' "$tests"
