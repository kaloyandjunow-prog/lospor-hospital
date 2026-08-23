#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM
site="$work/site"; home="$site/.lospor-home"; bin="$work/bin"
mkdir -p "$site/scripts" "$home/.data/releases" "$home/.data" "$bin"
for name in installed-release-state.sh update-pipeline-lib.sh prune-update-retention.sh; do
  cp "$root/scripts/$name" "$site/scripts/$name"
done
# Retention holds the same persistent maintenance lock as an update and a
# backup. The stub here was unconditional, so it shadowed the real flock even on
# hosts that have one, and the exclusion it is supposed to demonstrate was never
# exercised anywhere.
if ! command -v flock >/dev/null 2>&1; then
  if [ "${HOSPITAL_REQUIRE_FULL_UPDATE_TESTS:-0}" = 1 ]; then
    printf 'Bail out! flock is unavailable and HOSPITAL_REQUIRE_FULL_UPDATE_TESTS=1.\n'
    exit 1
  fi
  printf '1..0 # SKIP the update retention suite needs flock, which %s does not provide\n' \
    "$(uname -s 2>/dev/null || echo this platform)"
  printf 'SKIPPED: 0 of 3 update retention assertions ran; they still need a host with flock.\n' >&2
  exit 0
fi
cat > "$bin/docker" <<'STUB'
#!/bin/sh
case "${1:-}:${2:-}" in
  image:inspect) exit 0 ;;
  image:rm) printf '%s\n' "$3" >> "$PRUNE_RECORD"; exit 0 ;;
esac
exit 1
STUB
chmod +x "$bin/"*
: > "$home/.data/io-mutation.lock"
chmod 0600 "$home/.data/io-mutation.lock"
tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { echo "FAIL: $1" >&2; [ ! -f "$work/out" ] || sed 's/^/    /' "$work/out" >&2; exit 1; }

make_release() {
  version="$1"; unique="$2"
  release_root="$home/.data/releases/$version/lospor-hospital-$version"
  mkdir -p "$release_root/.release"
  : > "$release_root/compose.yaml"; : > "$release_root/compose.release.yaml"
  lock="$release_root/.release/release.lock"
  {
    printf 'release\t%s\n' "$version"
    printf 'image\tshared\tghcr.io/lospor/shared:stable\tsha256:%064d\tsha256:%064d\tsha256:%064d\tlinux/amd64\t-\n' 1 2 3
    printf 'image\tunique\tghcr.io/lospor/unique:%s\tsha256:%064d\tsha256:%064d\tsha256:%064d\tlinux/amd64\t-\n' "$unique" 4 5 6
  } > "$lock"
  digest="$(sha256sum "$lock" | awk '{print $1}')"
  printf '%s  release.lock\n' "$digest" > "$lock.sha256"
}

make_release 1.1.0 old
make_release 1.2.0 rollback
make_release 1.3.0 current
current_lock="$home/.data/releases/1.3.0/lospor-hospital-1.3.0/.release/release.lock"
current_sha="$(sha256sum "$current_lock" | awk '{print $1}')"
printf 'LOSPOR-HOSPITAL-INSTALLED-RELEASE-V1\t1.3.0\t.data/releases/1.3.0/lospor-hospital-1.3.0\t%s\n' \
  "$current_sha" > "$home/.data/installed-release.tsv"
previous_lock="$home/.data/releases/1.2.0/lospor-hospital-1.2.0/.release/release.lock"
previous_sha="$(sha256sum "$previous_lock" | awk '{print $1}')"
printf 'LOSPOR-HOSPITAL-INSTALLED-RELEASE-V1\t1.2.0\t.data/releases/1.2.0/lospor-hospital-1.2.0\t%s\n' \
  "$previous_sha" > "$home/.data/previous-installed-release.tsv"

: > "$work/removed"
PATH="$bin:$PATH" PRUNE_RECORD="$work/removed" HOSPITAL_UPDATE_TEST_ONLY=1 \
  sh "$site/scripts/prune-update-retention.sh" > "$work/out" 2>&1 \
  || fail "valid obsolete release was not pruned"
[ -d "$home/.data/releases/1.3.0" ] && [ -d "$home/.data/releases/1.2.0" ] \
  && [ ! -e "$home/.data/releases/1.1.0" ] \
  || fail "retention did not keep exactly current and rollback roots"
grep -Fxq 'ghcr.io/lospor/unique:old' "$work/removed" \
  || fail "obsolete exact image tag was not removed"
! grep -Fxq 'ghcr.io/lospor/shared:stable' "$work/removed" \
  || fail "a tag protected by the active lock was removed"
ok "retention keeps current and rollback roots and removes only obsolete exact tags"

make_release 1.0.0 corrupt
printf 'not a checksum\n' > "$home/.data/releases/1.0.0/lospor-hospital-1.0.0/.release/release.lock.sha256"
: > "$work/removed"
if PATH="$bin:$PATH" PRUNE_RECORD="$work/removed" HOSPITAL_UPDATE_TEST_ONLY=1 \
  sh "$site/scripts/prune-update-retention.sh" > "$work/out" 2>&1; then
  fail "corrupt obsolete identity was treated as safe to prune"
fi
[ -d "$home/.data/releases/1.0.0" ] && [ ! -s "$work/removed" ] \
  || fail "corrupt release or one of its tags was removed"
ok "corrupt obsolete identity is retained for operator review"

mkdir "$home/.data/release-activation.lock"
if PATH="$bin:$PATH" PRUNE_RECORD="$work/removed" HOSPITAL_UPDATE_TEST_ONLY=1 \
  sh "$site/scripts/prune-update-retention.sh" > "$work/out" 2>&1; then
  fail "retention ran during activation"
fi
[ -d "$home/.data/releases/1.3.0" ] && [ -d "$home/.data/release-activation.lock" ] \
  || fail "activation-lock refusal changed release state"
ok "retention refuses to run during activation"

printf 'update retention tests passed (%s)\n' "$tests"
