#!/bin/sh
set -eu

# Verify and restore a complete offline release without Node, npm, jq, or a
# registry. The exact SHA-256 selected by the operator binds both the image
# parts and the deployment kit that will perform installation/update.

bootstrap_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$bootstrap_root/scripts/installed-release-state.sh"
. "$bootstrap_root/scripts/operator-locale.sh"
operator_locale_load "$(release_state_appliance_home "$bootstrap_root")"

lock="${1:-}"
lock_checksum="${2:-}"
artifact_directory="${3:-}"
[ -n "$lock" ] && [ -n "$lock_checksum" ] && [ -n "$artifact_directory" ] || {
  operator_error \
    "Usage: ./scripts/load-offline.sh <release.lock> <release.lock.sha256> <artifact-directory>" \
    "Употреба: ./scripts/load-offline.sh <release.lock> <release.lock.sha256> <директория-с-артефакти>"
  exit 2
}
shift 3
[ "${1:-}" != -- ] || shift

absolute_path() {
  target="$1"
  directory="$(CDPATH= cd -- "$(dirname "$target")" 2>/dev/null && pwd)" \
    || { operator_error "Cannot resolve path: $target" "Пътят не може да бъде определен: $target"; exit 1; }
  printf '%s/%s\n' "$directory" "$(basename "$target")"
}
lock="$(absolute_path "$lock")"
lock_checksum="$(absolute_path "$lock_checksum")"
artifact_directory="$(CDPATH= cd -- "$artifact_directory" 2>/dev/null && pwd)" \
  || { operator_error "Cannot resolve artifact directory: $artifact_directory" "Директорията с артефакти не може да бъде определена: $artifact_directory"; exit 1; }

sh "$bootstrap_root/scripts/verify-release.sh" "$lock" "$lock_checksum" "$artifact_directory" all
version="$(awk -F '\t' '$1 == "release" { print $2 }' "$lock")"
appliance_home="$(release_state_appliance_home "$bootstrap_root")"
set +e
release_state_assert_transition "$appliance_home" "$version" "$lock"
transition_result=$?
set -e
case "$transition_result" in
  0) ;;
  20)
    release_state_read "$appliance_home"
    sh "$state_release_root/scripts/verify-loaded-release-images.sh" "$state_release_lock"
    operator_say "Hospital $version with this exact release identity is already installed." "Hospital $version с точно тази самоличност на версията вече е инсталирана."
    exit 0
    ;;
  *) exit "$transition_result" ;;
esac

stream_parts() {
  awk -F '\t' '$1 == "artifact" && $2 == "offline-part" { print $4 }' "$lock" \
    | while IFS= read -r file; do cat "$artifact_directory/$file"; done
}
stream_parts | gzip -t
stream_parts | gzip -dc | docker load
sh "$bootstrap_root/scripts/verify-loaded-release-images.sh" "$lock"

if [ "$#" -gt 0 ]; then
  HOSPITAL_UPDATE_SUPPLY_MODE=offline
  export HOSPITAL_UPDATE_SUPPLY_MODE
  exec sh "$bootstrap_root/scripts/activate-verified-release.sh" \
    "$lock" "$lock_checksum" "$artifact_directory" -- "$@"
fi
HOSPITAL_UPDATE_SUPPLY_MODE=offline
export HOSPITAL_UPDATE_SUPPLY_MODE
exec sh "$bootstrap_root/scripts/activate-verified-release.sh" \
  "$lock" "$lock_checksum" "$artifact_directory"
