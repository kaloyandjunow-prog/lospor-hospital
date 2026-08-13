#!/bin/sh
set -eu

# Run the small installer/operator transforms with the Node runtime supplied by
# the signed tools image. Client hosts intentionally do not install Node/npm.
script="${1:-}"
[ "$#" -ge 1 ] || {
  echo "Usage: scripts/container-node.sh scripts/<approved-helper>.mjs [args]" >&2
  exit 2
}
shift

case "$script" in
  scripts/credential-json.mjs|\
  scripts/validate-operator-credential.mjs|\
  scripts/parse-operator-state.mjs|\
  scripts/parse-status-prepare.mjs) ;;
  *)
    echo "Refusing unapproved container helper: $script" >&2
    exit 2
    ;;
esac

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
. "$root/scripts/installed-release-state.sh"
if [ "${HOSPITAL_RELEASE_TRANSITION:-}" = 1 ]; then
  release_state_assert_verified_transition "$root"
else
  appliance_home="$(release_state_appliance_home "$root")"
  set +e
  release_state_apply "$appliance_home"
  release_state_result=$?
  set -e
  case "$release_state_result" in
    0) root="$state_release_root" ;;
    10) ;;
    *) exit "$release_state_result" ;;
  esac
fi
cd "$root"
# Git Bash on Windows otherwise rewrites /workspace to its own installation
# directory before Docker sees the container working path. POSIX Linux ignores
# this compatibility setting.
MSYS_NO_PATHCONV=1
export MSYS_NO_PATHCONV
exec docker compose --profile tools run --rm --no-deps -T -w /workspace tools \
  node "$script" "$@"
