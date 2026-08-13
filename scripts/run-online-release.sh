#!/bin/sh
set -eu

# Verify the exact release metadata and deployment kit selected by the operator,
# pull exact registry digests, then execute the installer/updater from the newly
# staged integrity-verified kit.

bootstrap_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$bootstrap_root/scripts/installed-release-state.sh"

lock="${1:-}"
lock_checksum="${2:-}"
artifact_directory="${3:-}"
[ -n "$lock" ] && [ -n "$lock_checksum" ] && [ -n "$artifact_directory" ] || {
  echo "Usage: ./scripts/run-online-release.sh <release.lock> <release.lock.sha256> <artifact-directory>" >&2
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

sh "$bootstrap_root/scripts/verify-release.sh" "$lock" "$lock_checksum" "$artifact_directory" deployment
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

command -v docker >/dev/null 2>&1 || { echo "Docker is required." >&2; exit 1; }
tab="$(printf '\t')"
count=0
temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT HUP INT TERM
while IFS="$tab" read -r kind name reference digest image_id platform extra; do
  [ "$kind" = image ] || continue
  repository="${reference%:*}"
  immutable="$repository@$digest"
  docker pull --platform linux/amd64 "$immutable" >/dev/null
  actual="$(docker image inspect --format '{{.Id}} {{.Os}}/{{.Architecture}}' "$immutable")"
  [ "$actual" = "$image_id $platform" ] || { echo "Downloaded image identity mismatch: $name" >&2; exit 1; }
  printf '%s\t%s\n' "$immutable" "$reference" >> "$temporary_directory/tags"
  count=$((count + 1))
done < "$lock"
[ "$count" -eq 10 ] || { echo "Verified lock did not contain ten images." >&2; exit 1; }
while IFS="$tab" read -r immutable reference; do docker tag "$immutable" "$reference"; done < "$temporary_directory/tags"
sh "$bootstrap_root/scripts/verify-loaded-release-images.sh" "$lock"
trap - EXIT HUP INT TERM
rm -rf "$temporary_directory"

if [ "$#" -gt 0 ]; then
  exec sh "$bootstrap_root/scripts/activate-verified-release.sh" \
    "$lock" "$lock_checksum" "$artifact_directory" -- "$@"
fi
exec sh "$bootstrap_root/scripts/activate-verified-release.sh" \
  "$lock" "$lock_checksum" "$artifact_directory"
