#!/bin/sh
set -eu

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
# Git Bash on Windows otherwise rewrites this container path to a host path.
# The variable is ignored by ordinary POSIX shells.
MSYS_NO_PATHCONV=1 docker compose run --rm \
  --entrypoint /bin/sh backup /usr/local/bin/backup-cycle.sh
