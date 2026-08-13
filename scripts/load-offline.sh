#!/bin/sh
set -eu

# Verify and restore a complete offline release without Node, npm, jq, or a
# registry. The separately trusted public key authenticates both the image
# parts and the deployment kit that will perform installation/update.

bootstrap_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$bootstrap_root/scripts/installed-release-state.sh"

lock="${1:-}"
signature="${2:-}"
public_key="${3:-}"
artifact_directory="${4:-}"
[ -n "$lock" ] && [ -n "$signature" ] && [ -n "$public_key" ] && [ -n "$artifact_directory" ] || {
  echo "Usage: ./scripts/load-offline.sh <release.lock> <release.lock.sig> <trusted-public-key.pem> <artifact-directory>" >&2
  exit 2
}
shift 4
[ "${1:-}" != -- ] || shift

absolute_path() {
  target="$1"
  directory="$(CDPATH= cd -- "$(dirname "$target")" 2>/dev/null && pwd)" \
    || { echo "Cannot resolve path: $target" >&2; exit 1; }
  printf '%s/%s\n' "$directory" "$(basename "$target")"
}
lock="$(absolute_path "$lock")"
signature="$(absolute_path "$signature")"
public_key="$(absolute_path "$public_key")"
artifact_directory="$(CDPATH= cd -- "$artifact_directory" 2>/dev/null && pwd)" \
  || { echo "Cannot resolve artifact directory: $artifact_directory" >&2; exit 1; }

sh "$bootstrap_root/scripts/verify-release.sh" "$lock" "$signature" "$public_key" "$artifact_directory" all
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
    echo "Hospital $version with this exact signed identity is already installed."
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
    "$lock" "$signature" "$public_key" "$artifact_directory" -- "$@"
fi
exec sh "$bootstrap_root/scripts/activate-verified-release.sh" \
  "$lock" "$signature" "$public_key" "$artifact_directory"
