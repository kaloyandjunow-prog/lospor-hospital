#!/bin/sh
set -eu
set +x

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
. "$root/scripts/operator-locale.sh"
operator_locale_load "$root"
export LOSPOR_OPERATOR_LOCALE

command -v python3 >/dev/null 2>&1 || {
  operator_error \
    "Python 3 is required for protected credential rotation." \
    "За защитената смяна на данни за достъп е необходим Python 3."
  exit 1
}

exec python3 scripts/rotate-operational-secrets.py "$@"
