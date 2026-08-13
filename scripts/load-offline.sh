#!/bin/sh
set -eu

# Verify and restore a complete offline release without Node, npm, jq, or a
# registry. The exact SHA-256 selected by the operator binds both the image
# parts and the deployment kit that will perform installation/update.

bootstrap_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$bootstrap_root/scripts/installed-release-state.sh"

lock="${1:-}"
lock_checksum="${2:-}"
artifact_directory="${3:-}"
[ -n "$lock" ] && [ -n "$lock_checksum" ] && [ -n "$artifact_directory" ] || {
  echo "Usage: ./scripts/load-offline.sh <release.lock> <release.lock.sha256> <artifact-directory>" >&2
  exit 2
}
shift 3
[ "${1:-}" != -- ] || shift

absolute_path() {
  target="$1"
  directory="$(CDPATH= cd -- "$(dirname "$target")" 2>/dev/null && pwd)" \
    || { echo "Cannot resolve path: $target" >&2; exit 1; }
  printf '%s/%s\n' "$directory" "$(basename "$target")"
}
lock="$(absolute_path "$lock")"
lock_checksum="$(absolute_path "$lock_checksum")"
artifact_directory="$(CDPATH= cd -- "$artifact_directory" 2>/dev/null && pwd)" \
  || { echo "Cannot resolve artifact directory: $artifact_directory" >&2; exit 1; }

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
    echo "Hospital $version with this exact release identity is already installed."
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
  exec sh "$bootstrap_root/scripts/activate-verified-release.sh" \
    "$lock" "$lock_checksum" "$artifact_directory" -- "$@"
fi
exec sh "$bootstrap_root/scripts/activate-verified-release.sh" \
  "$lock" "$lock_checksum" "$artifact_directory"
