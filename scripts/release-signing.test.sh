#!/bin/sh
set -eu

# The pinning and signature rules, each tested against the harm it prevents.
#
# pin-release-signing-key.sh carries the whole trust property of unattended
# updates, and it is short enough to look obviously correct while being subtly
# wrong. These drive the real scripts against real Ed25519 keys -- a
# maintainer's and an attacker's -- rather than asserting anything about their
# text.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
command -v openssl >/dev/null 2>&1 || { echo "openssl is required." >&2; exit 2; }

# The fixture points a release at an appliance home through .lospor-home, a
# symlink to a directory that contains the release. Under MSYS, ln -s copies
# when it cannot link, and that copy recurses into itself; ask for a real link.
MSYS="${MSYS:+$MSYS }winsymlinks:nativestrict"
export MSYS

tests=0
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; [ -f "$work/out" ] && sed 's/^/    /' "$work/out" >&2; exit 1; }

mkdir -p "$work/home" "$work/site/scripts"
for script in pin-release-signing-key.sh installed-release-state.sh \
              verify-release-signature.sh sign-release-lock.sh; do
  cp "$root/scripts/$script" "$work/site/scripts/$script"
done
chmod +x "$work/site/scripts/"*.sh
ln -s "$work/home" "$work/site/.lospor-home"

openssl genpkey -algorithm ED25519 -out "$work/maintainer.key" 2>/dev/null
openssl pkey -in "$work/maintainer.key" -pubout -out "$work/maintainer.pub" 2>/dev/null
openssl genpkey -algorithm ED25519 -out "$work/attacker.key" 2>/dev/null
openssl pkey -in "$work/attacker.key" -pubout -out "$work/attacker.pub" 2>/dev/null

fingerprint_of() {
  printf 'SHA256:%s' "$(openssl pkey -pubin -in "$1" -outform DER 2>/dev/null \
    | openssl dgst -sha256 -binary | openssl base64 | tr -d '\r\n=')"
}
good="$(fingerprint_of "$work/maintainer.pub")"
bad="$(fingerprint_of "$work/attacker.pub")"
[ "$good" != "$bad" ] || fail "the fixture generated one key twice"

pinned_key="$work/home/secrets/release-signing-public.pem"

# The exit code is the assertion in most of these, so it has to survive set -e;
# a bare subshell would end the run on the first non-zero.
pin() {
  want="$1"; key="$2"; shift 2
  set +e
  ( cd "$work/site" && env "$@" sh scripts/pin-release-signing-key.sh "$key" ) \
    >"$work/out" 2>&1
  got=$?
  set -e
  [ "$got" = "$want" ] || fail "expected exit $want from pin, got $got"
}

# -- Nothing pinned yet -------------------------------------------------------

# 1. Exit 3, not 1. "This site has not adopted pinning" and "this key is not the
#    one you were promised" are opposite situations: the first must not stop an
#    install, the second must stop everything. Collapsing them would either
#    break every site still on a per-release digest, or teach an operator that a
#    key warning is something installs print.
pin 3 "$work/maintainer.pub" HOSPITAL_RELEASE_SIGNING_FINGERPRINT=
grep -q "No release signing key is pinned" "$work/out" || fail "no unpinned explanation"
grep -q "$good" "$work/out" || fail "the operator is not shown what to compare against"
[ ! -e "$pinned_key" ] || fail "a key was pinned with no fingerprint given"
ok "with nothing pinned and no fingerprint, it declines without stopping the install"

# 2. The attacker's release supplies its own key. The operator's fingerprint,
#    which did not arrive with the download, is what decides.
pin 1 "$work/maintainer.pub" HOSPITAL_RELEASE_SIGNING_FINGERPRINT="$bad"
grep -q "DOES NOT MATCH THE FINGERPRINT" "$work/out" || fail "no mismatch message"
[ ! -e "$pinned_key" ] || fail "a rejected key was pinned anyway"
ok "a key that is not the one the operator was promised is refused, and not pinned"

# 3. The one moment a human is required.
pin 0 "$work/maintainer.pub" HOSPITAL_RELEASE_SIGNING_FINGERPRINT="$good"
[ -s "$pinned_key" ] || fail "the key was not pinned"
ok "the confirmed fingerprint pins the key"

# -- Once pinned --------------------------------------------------------------

# 4. The same key on every later release is a silent success, not a prompt.
pin 0 "$work/maintainer.pub" IGNORED=
[ ! -s "$work/out" ] || fail "an unchanged key produced output"
ok "an unchanged key is accepted silently"

# 5. This is the property the whole design exists for. A release that could
#    install its own signing key would authenticate every release after it.
pin 1 "$work/attacker.pub" IGNORED=
grep -q "RELEASE SIGNING KEY HAS CHANGED" "$work/out" || fail "a key change was not reported"
ok "a release offering a different key is refused"

# 6. And it cannot talk its way past by asserting its own key's fingerprint:
#    the pinned key wins over anything that arrives with the release.
pin 1 "$work/attacker.pub" HOSPITAL_RELEASE_SIGNING_FINGERPRINT="$bad"
grep -q "RELEASE SIGNING KEY HAS CHANGED" "$work/out" || fail "a self-asserted fingerprint won"
ok "a matching fingerprint supplied with the release cannot replace the pinned key"

# 7. An operator copying from a notice includes whatever the notice shows.
#    Telling them two identical keys differ teaches them to click past warnings.
rm -f "$pinned_key"
pin 0 "$work/maintainer.pub" HOSPITAL_RELEASE_SIGNING_FINGERPRINT="${good#SHA256:}"
[ -s "$pinned_key" ] || fail "a bare fingerprint was not accepted"
ok "the fingerprint is accepted with or without the SHA256: prefix"

# 7b. A confirmed fingerprint that cannot be written down is an operational
#     fault, not a refusal. It left with status 1 -- the same status as "this is
#     not the key you were promised" -- so install-guided.sh told the operator
#     the release did not match their fingerprint when the real cause was that
#     provisioning credentials as root had left secrets/ unwritable. An operator
#     sent hunting a tampered release over a mode bit is the failure this
#     separates: same confirmed key, a status of its own, and a message that
#     says so.
rm -f "$pinned_key"
# Root ignores a read-only directory, and Windows filesystems do not enforce one
# at all, so prove the fixture can actually deny a write before asserting on it.
write_denied=0
mkdir -p "$work/deny-probe"
chmod 500 "$work/deny-probe"
# A failed redirection is fatal to a non-interactive dash even inside `if !`,
# so probe with a command whose failure is only an exit status.
if [ "$(id -u)" -ne 0 ] && ! touch "$work/deny-probe/probe" 2>/dev/null; then
  write_denied=1
fi
chmod 700 "$work/deny-probe"
rm -rf "$work/deny-probe"
if [ "$write_denied" -eq 1 ]; then
  chmod 500 "$work/home/secrets"
  pin 5 "$work/maintainer.pub" HOSPITAL_RELEASE_SIGNING_FINGERPRINT="$good"
  grep -q "COULD NOT STORE THE RELEASE SIGNING KEY" "$work/out" \
    || fail "an unwritable secrets directory was not named as the cause"
  grep -q "fingerprint matched" "$work/out" \
    || fail "the operator was not told the release itself is fine"
  ! grep -q "DOES NOT MATCH THE FINGERPRINT" "$work/out" \
    || fail "a permission fault was reported as a fingerprint mismatch"
  chmod 700 "$work/home/secrets"
  [ ! -e "$pinned_key" ] || fail "a key was pinned despite the write failing"
  ok "a key that cannot be stored reports a permission fault, not a mismatch"
fi
# Restore the pinned key the cases below depend on, whether or not the fixture
# was able to deny a write above.
pin 0 "$work/maintainer.pub" HOSPITAL_RELEASE_SIGNING_FINGERPRINT="$good"
[ -s "$pinned_key" ] || fail "the fixture did not restore the pinned key"

# -- The pinned key against a real signature ----------------------------------

sign_with() {
  ( cd "$work/site" && printf '%s' "$(cat "$1")" | sh scripts/sign-release-lock.sh r.lock ) \
    >/dev/null 2>&1 || fail "signing failed"
}
check_signature() {
  set +e
  ( cd "$work/site" && sh scripts/verify-release-signature.sh r.lock r.lock.sig "$pinned_key" ) \
    >"$work/out" 2>&1
  signature_result=$?
  set -e
}
printf 'LOSPOR-HOSPITAL-RELEASE-LOCK-V2\nrelease\t1.2.0\n' > "$work/site/r.lock"

# 8. What pinning buys: a release verifies itself, with no digest read out over
#    the phone before every update.
sign_with "$work/maintainer.key"
check_signature
[ "$signature_result" -eq 0 ] || fail "a genuine signature did not verify against the pinned key"
ok "a release signed by the pinned key verifies"

# Raw Ed25519 signatures have one unambiguous representation. Rejecting every
# other length prevents a transport wrapper or partial write from reaching the
# cryptographic parser as though it were a valid release asset.
printf 'short' > "$work/site/r.lock.sig"
check_signature
[ "$signature_result" -ne 0 ] || fail "a short signature was accepted"
grep -q "exactly 64 raw Ed25519 bytes" "$work/out" || fail "a short signature had no exact-length error"
ok "a release signature shorter than 64 raw bytes is refused"

sign_with "$work/maintainer.key"
printf x >> "$work/site/r.lock.sig"
check_signature
[ "$signature_result" -ne 0 ] || fail "an oversized signature was accepted"
grep -q "exactly 64 raw Ed25519 bytes" "$work/out" || fail "an oversized signature had no exact-length error"
ok "a release signature longer than 64 raw bytes is refused"

# 9. openssl pkeyutl -verify is one of the few openssl verbs whose exit status
#    is reliable, which is why it is trusted here rather than parsed.
sign_with "$work/attacker.key"
check_signature
[ "$signature_result" -ne 0 ] || fail "a signature by another key verified"
grep -q "DOES NOT VERIFY" "$work/out" || fail "no signature failure message"
ok "a release re-signed by another key does not verify"

# 10. Tampering after signing is the case the out-of-band digest catches today,
#     and the signature has to keep catching it once the digest is gone.
sign_with "$work/maintainer.key"
printf 'release\t9.9.9\n' >> "$work/site/r.lock"
check_signature
[ "$signature_result" -ne 0 ] || fail "a lock modified after signing still verified"
ok "a lock modified after signing does not verify"

# -- verify-release.sh: a pinned key makes a signature mandatory --------------

# verify-release.sh does much more than this and fails later on a stub lock.
# These assert only that the signature decision happens, and happens first --
# each case is identified by its own message, not by the exit status alone.
cp "$root/scripts/verify-release.sh" "$work/site/scripts/verify-release.sh"
chmod +x "$work/site/scripts/verify-release.sh"
mkdir -p "$work/site/artifacts"
printf 'LOSPOR-HOSPITAL-RELEASE-LOCK-V2\nrelease\t1.2.0\n' > "$work/site/v.lock"
lock_sha="$(sha256sum "$work/site/v.lock" | awk '{print $1}')"
printf '%s  v.lock\n' "$lock_sha" > "$work/site/v.lock.sha256"

verify_release() {
  set +e
  ( cd "$work/site" && env "$@" sh scripts/verify-release.sh v.lock v.lock.sha256 artifacts deployment ) \
    >"$work/out" 2>&1
  verify_result=$?
  set -e
}
sign_v_lock() {
  ( cd "$work/site" && printf '%s' "$(cat "$1")" | sh scripts/sign-release-lock.sh v.lock ) \
    >/dev/null 2>&1 || fail "signing failed"
}

# 11. The attack this closes. With a key pinned and the signature simply
#     deleted, the appliance must refuse -- not quietly fall back to the digest
#     alone, which is the weaker arrangement pinning exists to replace.
rm -f "$work/site/v.lock.sig"
[ -s "$pinned_key" ] || fail "the fixture lost its pinned key"
verify_release IGNORED=
[ "$verify_result" -ne 0 ] || fail "an unsigned release was accepted by a pinned appliance"
grep -q "THIS RELEASE IS NOT SIGNED" "$work/out" || fail "a stripped signature was not reported as such"
ok "a pinned appliance refuses a release whose signature was removed"

# 12. A forged signature fails for its own reason, not confused with the above.
sign_v_lock "$work/attacker.key"
verify_release IGNORED=
[ "$verify_result" -ne 0 ] || fail "a release signed by another key was accepted"
grep -q "DOES NOT VERIFY" "$work/out" || fail "a forged signature was not reported as such"
ok "a pinned appliance refuses a release signed by another key"

# 13. A genuine signature gets past the signature gate. It still fails later on
#     the stub lock, which is the point: the signature is checked early, before
#     any of the manifest work.
sign_v_lock "$work/maintainer.key"
verify_release IGNORED=
if grep -q "DOES NOT VERIFY" "$work/out"; then fail "a genuine signature was rejected"; fi
if grep -q "THIS RELEASE IS NOT SIGNED" "$work/out"; then fail "a present signature was called missing"; fi
ok "a genuine signature passes the signature gate"

# 14. A site that never pinned keeps working on the digest alone. Requiring a
#     signature everywhere would break every site still on the older
#     arrangement, which is why the pinned key is what decides.
rm -f "$pinned_key" "$work/site/v.lock.sig"
verify_release IGNORED=
if grep -q "THIS RELEASE IS NOT SIGNED" "$work/out"; then fail "an unpinned site was made to require a signature"; fi
ok "an unpinned site still installs an unsigned release on the digest alone"

# 15. Unless it has explicitly asked not to, which is how a site guarantees it
#     is not silently running unpinned.
verify_release HOSPITAL_REQUIRE_RELEASE_SIGNATURE=1
[ "$verify_result" -ne 0 ] || fail "HOSPITAL_REQUIRE_RELEASE_SIGNATURE=1 was ignored"
grep -q "no signing key is pinned" "$work/out" || fail "the unpinned refusal was not explained"
ok "a site may require signing even before it has pinned a key"

printf 'release signing tests passed (%s)\n' "$tests"
