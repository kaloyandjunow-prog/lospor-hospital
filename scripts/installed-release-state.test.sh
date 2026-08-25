#!/bin/sh
set -eu

# This fixture links a release directory to its own ancestor, which is the real
# shape on an appliance: the release lives under $home/.data/releases/... and
# carries a .lospor-home symlink back to $home. Under MSYS, ln -s silently
# copies when it cannot create a native link, so that copy recurses into itself
# and dies with ELOOP -- a confusing failure for a test that is correct, and
# green on Linux where the variable is ignored. Ask for a real symlink, or a
# clear error saying why there isn't one.
MSYS="${MSYS:+$MSYS }winsymlinks:nativestrict"
export MSYS

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
. "$root/scripts/installed-release-state.sh"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT HUP INT TERM
empty_home="$fixture/empty-home"
mkdir -p "$empty_home"
set +e
release_state_apply "$empty_home"
missing_state=$?
set -e
[ "$missing_state" -eq 10 ]

version=1.0.0
relative=".data/releases/$version/lospor-hospital-$version"
release="$fixture/$relative"
mkdir -p "$release/.release"
touch "$release/compose.yaml" "$release/compose.release.yaml"
printf 'release\t1.0.0\n' > "$release/.release/release.lock"
lock_sha="$(sha256sum "$release/.release/release.lock" | awk '{print $1}')"
printf '%s  release.lock\n' "$lock_sha" > "$release/.release/release.lock.sha256"
ln -s "$release" "$fixture/current"
release_state_write "$fixture" "$version" "$relative" "$release/.release/release.lock"

release_state_read "$fixture"
[ "$state_version" = 1.0.0 ]
release_state_apply "$fixture"
[ "$HOSPITAL_RELEASE" = 1.0.0 ]
[ "$COMPOSE_FILE" = "$release/compose.yaml:$release/compose.release.yaml" ]

ln -s "$fixture" "$release/.lospor-home"
HOSPITAL_RELEASE_TRANSITION=1
HOSPITAL_IMAGES_VERIFIED=1
HOSPITAL_VERIFIED_RELEASE_LOCK="$release/.release/release.lock"
HOSPITAL_VERIFIED_RELEASE_LOCK_SHA256="$lock_sha"
HOSPITAL_RELEASE=1.0.0
COMPOSE_FILE="$release/compose.yaml:$release/compose.release.yaml"
LOSPOR_APPLIANCE_HOME="$fixture"
export HOSPITAL_RELEASE_TRANSITION HOSPITAL_IMAGES_VERIFIED HOSPITAL_VERIFIED_RELEASE_LOCK
export HOSPITAL_VERIFIED_RELEASE_LOCK_SHA256 HOSPITAL_RELEASE COMPOSE_FILE LOSPOR_APPLIANCE_HOME
release_state_assert_verified_transition "$release"
set +e
HOSPITAL_RELEASE=1.0.1 release_state_assert_verified_transition "$release"
bad_transition_version=$?
COMPOSE_FILE="$release/compose.yaml" release_state_assert_verified_transition "$release"
bad_transition_compose=$?
HOSPITAL_VERIFIED_RELEASE_LOCK="$fixture/different.lock" release_state_assert_verified_transition "$release"
bad_transition_lock=$?
HOSPITAL_VERIFIED_RELEASE_LOCK_SHA256="ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" release_state_assert_verified_transition "$release"
bad_transition_sha=$?
set -e
[ "$bad_transition_version" -eq 1 ]
[ "$bad_transition_compose" -eq 1 ]
[ "$bad_transition_lock" -eq 1 ]
[ "$bad_transition_sha" -eq 1 ]
unset HOSPITAL_RELEASE_TRANSITION HOSPITAL_IMAGES_VERIFIED HOSPITAL_VERIFIED_RELEASE_LOCK
unset HOSPITAL_VERIFIED_RELEASE_LOCK_SHA256 HOSPITAL_RELEASE COMPOSE_FILE LOSPOR_APPLIANCE_HOME

fresh_shell="$fixture/fresh-shell.sh"
cat > "$fresh_shell" <<'EOF'
#!/bin/sh
set -eu
. "$STATE_HELPER"
release_state_apply "$STATE_HOME"
[ "$HOSPITAL_RELEASE" = 1.0.0 ]
[ "$COMPOSE_FILE" = "$STATE_HOME/.data/releases/1.0.0/lospor-hospital-1.0.0/compose.yaml:$STATE_HOME/.data/releases/1.0.0/lospor-hospital-1.0.0/compose.release.yaml" ]
EOF
STATE_HELPER="$root/scripts/installed-release-state.sh" STATE_HOME="$fixture" sh "$fresh_shell"

set +e
release_state_assert_transition "$fixture" 0.9.0 "$release/.release/release.lock"
downgrade=$?
release_state_assert_transition "$fixture" 1.0.0 "$release/.release/release.lock"
same=$?
printf 'different-lock\n' > "$fixture/different.lock"
release_state_assert_transition "$fixture" 1.0.0 "$fixture/different.lock"
mismatch=$?
release_state_assert_transition "$fixture" 1.0.1 "$fixture/different.lock"
upgrade=$?
bad_home="$fixture/bad-home"
mkdir -p "$bad_home/.data"
printf 'damaged\n' > "$bad_home/.data/installed-release.tsv"
release_state_apply "$bad_home"
bad_apply=$?
release_state_assert_transition "$bad_home" 1.0.1 "$fixture/different.lock"
bad_transition_state=$?
set -e
[ "$downgrade" -eq 1 ]
[ "$same" -eq 20 ]
[ "$mismatch" -eq 1 ]
[ "$upgrade" -eq 0 ]
[ "$bad_apply" -eq 1 ]
[ "$bad_transition_state" -eq 1 ]

printf '%s  wrong.lock\n' "$lock_sha" > "$release/.release/release.lock.sha256"
if release_state_read "$fixture"; then
  echo "FAIL: malformed installed checksum sidecar was accepted" >&2
  exit 1
fi
printf '%s  release.lock\n' "$lock_sha" > "$release/.release/release.lock.sha256"

printf 'tampered\n' >> "$release/.release/release.lock"
if release_state_read "$fixture"; then
  echo "FAIL: tampered installed lock was accepted" >&2
  exit 1
fi
echo "installed release state tests passed"
