#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM
site="$work/site"
home="$site/.lospor-home"
mkdir -p "$site/scripts" "$home"
for name in installed-release-state.sh operator-locale.sh update-pipeline-lib.sh provision-update-credentials.sh; do
  cp "$root/scripts/$name" "$site/scripts/$name"
done
chmod +x "$site/scripts/"*.sh
command="$site/scripts/provision-update-credentials.sh"
mode_checks=1
: > "$work/mode-probe"; chmod 0600 "$work/mode-probe"
[ "$(stat -c %a "$work/mode-probe" 2>/dev/null || echo -)" = 600 ] || mode_checks=0
tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { echo "FAIL: $1" >&2; [ ! -f "$work/out" ] || sed 's/^/    /' "$work/out" >&2; exit 1; }
run_input() {
  input="$1"; shift
  printf '%b' "$input" | HOSPITAL_CREDENTIAL_TEST_ONLY=1 LOSPOR_DEFAULT_LOCALE=en \
    sh "$command" "$@" > "$work/out" 2>&1
}

release_one=github_pat_AAAAAAAAAAAAAAAAAAAAAAAA
run_input "$release_one\n" github-release || fail "valid release credential was refused"
[ "$(cat "$home/secrets/registry/github-release-token")" = "$release_one" ] \
  || fail "release credential was not stored exactly"
[ "$mode_checks" -eq 0 ] || [ "$(stat -c %a "$home/secrets/registry/github-release-token")" = 600 ] \
  || fail "release credential mode is not 0600"
! grep -Fq "$release_one" "$work/out" || fail "release credential was printed"
ok "GitHub Releases credential is stored exactly once with mode 0600"

release_two=github_pat_BBBBBBBBBBBBBBBBBBBBBBBB
run_input "$release_two\n" github-release || fail "release credential rotation failed"
[ "$(cat "$home/secrets/registry/github-release-token")" = "$release_two" ] \
  || fail "release credential was not rotated"
! grep -Fq "$release_two" "$work/out" || fail "rotated credential was printed"
ok "credential rotation durably replaces the prior value without displaying it"

if run_input "github_pat_CCCCCCCCCCCCCCCCCCCCCCCC\nextra\n" github-release; then
  fail "extra credential input was accepted"
fi
[ "$(cat "$home/secrets/registry/github-release-token")" = "$release_two" ] \
  || fail "invalid input changed the prior credential"
ok "extra stdin lines fail before changing the existing credential"

ghcr_token=github_pat_DDDDDDDDDDDDDDDDDDDDDDDD
run_input "site-42\n$ghcr_token\n" ghcr || fail "valid GHCR credential was refused"
[ "$(cat "$home/secrets/registry/ghcr-user")" = site-42 ] \
  && [ "$(cat "$home/secrets/registry/ghcr-token")" = "$ghcr_token" ] \
  || fail "GHCR credential pair was not stored exactly"
[ "$mode_checks" -eq 0 ] || { [ "$(stat -c %a "$home/secrets/registry/ghcr-user")" = 600 ] \
  && [ "$(stat -c %a "$home/secrets/registry/ghcr-token")" = 600 ]; } \
  || fail "GHCR credential modes are not 0600"
! grep -Fq "$ghcr_token" "$work/out" || fail "GHCR token was printed"
ok "GHCR user and read token are accepted only as a two-line stdin pair"

if run_input "bad--user\n$ghcr_token\n" ghcr; then fail "invalid GHCR username was accepted"; fi
[ "$(cat "$home/secrets/registry/ghcr-user")" = site-42 ] \
  || fail "invalid GHCR input changed the prior pair"
ok "invalid GHCR identity leaves the prior working pair intact"

credential_path="$home/secrets/registry/github-release-token"
alias_path="$work/release-token-alias"
ln "$credential_path" "$alias_path"
if run_input "github_pat_EEEEEEEEEEEEEEEEEEEEEEEE\n" github-release; then
  fail "hard-linked credential target was replaced"
fi
[ "$(cat "$alias_path")" = "$release_two" ] || fail "hard-link refusal changed the existing object"
rm -f "$alias_path"
ok "hard-linked credential targets are rejected rather than overwritten"

trace_token=github_pat_FFFFFFFFFFFFFFFFFFFFFFFF
printf '%s\n' "$trace_token" | HOSPITAL_CREDENTIAL_TEST_ONLY=1 LOSPOR_DEFAULT_LOCALE=en \
  sh -x "$command" github-release > "$work/out" 2>&1 \
  || fail "credential provisioning under inherited xtrace failed"
! grep -Fq "$trace_token" "$work/out" || fail "inherited shell tracing exposed the token"
ok "the command disables inherited xtrace before it reads stdin"

if printf '%s\n' "$trace_token" | HOSPITAL_CREDENTIAL_TEST_ONLY=1 sh "$command" \
  github-release forbidden-argv > "$work/out" 2>&1; then
  fail "credential value could be supplied through argv"
fi
! grep -Fq "$trace_token" "$work/out" || fail "refused argv flow printed stdin"
ok "the interface accepts only a credential kind in argv"

printf 'credential provisioning tests passed (%s)\n' "$tests"
