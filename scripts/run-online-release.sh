#!/bin/sh
set -eu

# Verify the exact release metadata and deployment kit selected by the operator,
# pull exact registry digests, then execute the installer/updater from the newly
# staged integrity-verified kit.

bootstrap_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$bootstrap_root/scripts/installed-release-state.sh"

# --fetch-only downloads and verifies the exact release images, then stops
# without changing anything that is running. It exists so a site can pull
# gigabytes at a quiet hour and apply the update later, in seconds, at a moment
# a person has chosen -- rather than having the download and the restart happen
# together in the middle of a list.
fetch_only=0
if [ "${1:-}" = --fetch-only ]; then
  fetch_only=1
  shift
fi

lock="${1:-}"
lock_checksum="${2:-}"
artifact_directory="${3:-}"
[ -n "$lock" ] && [ -n "$lock_checksum" ] && [ -n "$artifact_directory" ] || {
  echo "Usage: ./scripts/run-online-release.sh [--fetch-only] <release.lock> <release.lock.sha256> <artifact-directory>" >&2
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

# The release packages are private, so pulling needs this site's own read-only
# registry credential. Authenticate into a throwaway Docker config rather than
# the operator's ~/.docker/config.json: `docker login` stores the token in
# recoverable base64, and a clinical appliance should not keep a credential on
# disk that nothing afterwards needs. Deleted with the temporary directory
# above, on every exit path including interruption.
if [ -z "${HOSPITAL_GHCR_USER:-}" ] && [ -r "$bootstrap_root/secrets/registry/ghcr-user" ]; then
  HOSPITAL_GHCR_USER="$(head -n 1 "$bootstrap_root/secrets/registry/ghcr-user" | tr -d '\r\n')"
fi
if [ -z "${HOSPITAL_GHCR_READ_TOKEN:-}" ] && [ -r "$bootstrap_root/secrets/registry/ghcr-token" ]; then
  HOSPITAL_GHCR_READ_TOKEN="$(head -n 1 "$bootstrap_root/secrets/registry/ghcr-token" | tr -d '\r\n')"
fi
if [ -n "${HOSPITAL_GHCR_USER:-}" ] && [ -n "${HOSPITAL_GHCR_READ_TOKEN:-}" ]; then
  DOCKER_CONFIG="$temporary_directory/docker-config"
  mkdir -p "$DOCKER_CONFIG"
  chmod 700 "$DOCKER_CONFIG"
  export DOCKER_CONFIG
  printf '%s' "$HOSPITAL_GHCR_READ_TOKEN" \
    | docker login ghcr.io --username "$HOSPITAL_GHCR_USER" --password-stdin >/dev/null \
    || { echo "Could not authenticate to ghcr.io with this site's registry credential." >&2; exit 1; }
  unset HOSPITAL_GHCR_READ_TOKEN
fi

while IFS="$tab" read -r kind name reference registry_digest platform_digest config_digest platform diff_ids extra; do
  [ "$kind" = image ] || continue
  [ -z "${extra:-}" ] || { echo "Malformed image record: $name" >&2; exit 1; }
  repository="${reference%:*}"
  immutable="$repository@$registry_digest"
  # Pulling by the top-level digest makes the registry prove the immutable
  # descriptor. Portable config/rootfs/platform verification happens before
  # any stable release tag is changed.
  docker pull --platform "$platform" "$immutable" >/dev/null
  printf 'image\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$name" "$immutable" "$registry_digest" "$platform_digest" "$config_digest" "$platform" "$diff_ids" \
    >> "$temporary_directory/pulled.lock"
  printf '%s\t%s\n' "$immutable" "$reference" >> "$temporary_directory/tags"
  count=$((count + 1))
done < "$lock"
[ "$count" -eq 10 ] || { echo "Verified lock did not contain ten images." >&2; exit 1; }
sh "$bootstrap_root/scripts/verify-loaded-release-images.sh" "$temporary_directory/pulled.lock"
while IFS="$tab" read -r immutable reference; do docker tag "$immutable" "$reference"; done < "$temporary_directory/tags"
sh "$bootstrap_root/scripts/verify-loaded-release-images.sh" "$lock"
trap - EXIT HUP INT TERM
rm -rf "$temporary_directory"

if [ "$fetch_only" -eq 1 ]; then
  # Record what is staged so the status page can say "downloaded and verified,
  # ready to apply" rather than leaving the operator to remember. The check
  # script owns the other fields, so preserve them.
  appliance_home="$(release_state_appliance_home "$bootstrap_root")"
  status_path="$appliance_home/.data/update-status.tsv"
  checked_at="-"; installed_version="-"; latest_version="-"; state="update-available"
  if [ -f "$status_path" ]; then
    existing="$(awk -F '\t' 'NR == 1 && $1 == "LOSPOR-HOSPITAL-UPDATE-STATUS-V1" { print $2 "\t" $3 "\t" $4 "\t" $5 }' "$status_path" || true)"
    if [ -n "${existing:-}" ]; then
      checked_at="$(printf '%s' "$existing" | cut -f1)"
      installed_version="$(printf '%s' "$existing" | cut -f2)"
      latest_version="$(printf '%s' "$existing" | cut -f3)"
      state="$(printf '%s' "$existing" | cut -f4)"
    fi
  fi
  mkdir -p "$appliance_home/.data"
  temporary_status="$status_path.tmp.$$"
  umask 077
  printf 'LOSPOR-HOSPITAL-UPDATE-STATUS-V1\t%s\t%s\t%s\t%s\t%s\n' \
    "$checked_at" "$installed_version" "$latest_version" "$state" "$version" > "$temporary_status"
  mv "$temporary_status" "$status_path"

  echo "Release $version is downloaded and verified. Nothing has been changed."
  echo "Every image matches the release lock by portable OCI identity."
  echo
  echo "To apply it — this stops and restarts the appliance and migrates the"
  echo "database, so choose the moment — run the same command without --fetch-only:"
  echo
  echo "  sh $0 $lock $lock_checksum $artifact_directory"
  exit 0
fi

if [ "$#" -gt 0 ]; then
  exec sh "$bootstrap_root/scripts/activate-verified-release.sh" \
    "$lock" "$lock_checksum" "$artifact_directory" -- "$@"
fi
exec sh "$bootstrap_root/scripts/activate-verified-release.sh" \
  "$lock" "$lock_checksum" "$artifact_directory"
