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
printf 'reached\n' > "$INSTALL_RECORD"
STUB
chmod +x "$work/scripts/"*.sh

# Everything except the digest and the password is pinned, so stdin carries a
# fixed number of answers whether or not .env exists. That variability is the
# fragility this installer exists to remove; a test depending on it would be
# testing its own fixture.
pinned="ACME_EMAIL=it@test.invalid AUTH_EMAIL_FROM=no-reply@c.test.invalid HOSPITAL_CLINICAL_DOMAIN=c.test.invalid HOSPITAL_RESEARCH_DOMAIN=r.test.invalid HOSPITAL_INSTITUTION_NAME=Test HOSPITAL_INSTITUTION_CITY=City HOSPITAL_INSTITUTION_COUNTRY=Country HOSPITAL_BOOTSTRAP_ADMIN_EMAIL=a@b.invalid HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME=A HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME=B"

run_guided() {
  ( cd "$work" && env $pinned "$@" INSTALL_RECORD="$work/record" \
      sh scripts/install-guided.sh lock lock.sha256 . ) >"$work/out" 2>&1
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

# 4. A failing readiness check stops the install.
rm -f "$work/record"
printf '%s\nsame-secret\nsame-secret\n' "$real_digest" > "$work/answers"
if run_guided STUB_READINESS_FAILS=1 < "$work/answers"; then fail "a failing readiness check did not stop the install"; fi
[ ! -f "$work/record" ] || fail "the launcher ran despite a failing readiness check"
ok "a failing readiness check stops the install"

# 5. The happy path reaches the real launcher, with the password on stdin.
rm -f "$work/record"
printf '%s\ngood-secret\ngood-secret\n' "$real_digest" > "$work/answers"
run_guided < "$work/answers" || fail "the happy path did not complete"
[ -f "$work/record" ] || fail "the launcher was never reached"
printf 'good-secret\ngood-secret\n' | cmp -s - "$work/record.stdin" \
  || fail "the launcher did not receive the password twice on standard input"
ok "the happy path reaches the launcher with the password on standard input"

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
  grep -q "ask_value $variable " "$root/scripts/install-guided.sh" \
    || missing="$missing $variable"
done
[ -z "$missing" ] || fail "generate-secrets.sh prompts for$missing, which install-guided.sh never asks for"
ok "every value the generator prompts for is collected by the installer"



printf 'guided installer tests passed (%s)\n' "$tests"
