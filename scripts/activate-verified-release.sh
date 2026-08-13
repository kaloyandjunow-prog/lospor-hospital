#!/bin/sh
set -eu

# Extract a verified deployment archive into a fresh versioned directory,
# execute that candidate's installer/updater, and only then atomically make it
# the active deployment. Persistent site configuration and data remain outside
# the immutable release directory.

bootstrap_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$bootstrap_root/scripts/installed-release-state.sh"

lock="${1:-}"
signature="${2:-}"
public_key="${3:-}"
artifact_directory="${4:-}"
shift 4 || true
[ "${1:-}" != -- ] || shift

[ -s "$lock" ] && [ -s "$signature" ] && [ -s "$public_key" ] && [ -d "$artifact_directory" ] || {
  echo "Usage: activate-verified-release.sh <lock> <signature> <trusted-public-key> <artifact-directory>" >&2
  exit 2
}

appliance_home="$(release_state_appliance_home "$bootstrap_root")"
case "$appliance_home" in ""|/) echo "Refusing an unsafe appliance home: '$appliance_home'" >&2; exit 1 ;; esac
sh "$bootstrap_root/scripts/verify-release.sh" "$lock" "$signature" "$public_key" "$artifact_directory" deployment
version="$(awk -F '\t' '$1 == "release" { print $2 }' "$lock")"
deployment_file="$(awk -F '\t' '$1 == "artifact" && $2 == "deployment" { print $4 }' "$lock")"
[ -n "$version" ] && [ -n "$deployment_file" ] || { echo "Verified lock lacks deployment identity." >&2; exit 1; }

set +e
release_state_assert_transition "$appliance_home" "$version" "$lock"
transition_result=$?
set -e
case "$transition_result" in
  0) ;;
  20) echo "Hospital $version with this exact signed identity is already installed."; exit 0 ;;
  *) exit "$transition_result" ;;
esac

mkdir -p "$appliance_home/.data" "$appliance_home/.data/releases/$version"
activation_lock="$appliance_home/.data/release-activation.lock"
if ! mkdir "$activation_lock" 2>/dev/null; then
  echo "Another release activation is running, or a prior activation needs operator review: $activation_lock" >&2
  exit 1
fi
temporary_root="$appliance_home/.data/releases/$version/.staging.$$"
case "$temporary_root" in "$appliance_home/.data/releases/$version/.staging."*) ;; *) echo "Unsafe staging path." >&2; exit 1 ;; esac
trap 'rm -rf "$temporary_root" 2>/dev/null || true; rmdir "$activation_lock" 2>/dev/null || true' EXIT HUP INT TERM
mkdir "$temporary_root"

archive="$artifact_directory/$deployment_file"
prefix="lospor-hospital-$version"
tar -tzf "$archive" | awk -v prefix="$prefix/" '
  index($0, prefix) != 1 { bad = 1 }
  $0 ~ /(^|\/)\.\.?($|\/)/ { bad = 1 }
  END { exit bad }
' || { echo "Deployment archive contains an unsafe or unexpected path." >&2; exit 1; }
tar -tvzf "$archive" | awk 'substr($0, 1, 1) != "-" && substr($0, 1, 1) != "d" { bad = 1 } END { exit bad }' \
  || { echo "Deployment archive contains links or special files." >&2; exit 1; }
tar -xzf "$archive" --no-same-owner --no-same-permissions -C "$temporary_root"
candidate="$temporary_root/$prefix"
[ -d "$candidate" ] && [ -f "$candidate/compose.yaml" ] && [ -f "$candidate/compose.release.yaml" ] \
  || { echo "Deployment archive did not contain the expected release root." >&2; exit 1; }

# Replace only known empty distribution placeholders inside the fresh staging
# tree. Site-owned directories live at the appliance home and are linked into
# every immutable release.
for private_directory in backups secrets; do
  [ -d "$candidate/$private_directory" ] || { echo "Deployment kit lacks $private_directory placeholder." >&2; exit 1; }
  unexpected="$(find "$candidate/$private_directory" -mindepth 1 -maxdepth 1 ! -name .gitkeep -print -quit)"
  [ -z "$unexpected" ] || { echo "Deployment kit contains private $private_directory content." >&2; exit 1; }
  rm -f "$candidate/$private_directory/.gitkeep"
  rmdir "$candidate/$private_directory"
done
mkdir -p "$appliance_home/backups" "$appliance_home/secrets" "$appliance_home/reference-data" "$appliance_home/.data/runtime"
if [ -d "$candidate/reference-data" ]; then
  unexpected="$(find "$candidate/reference-data" -mindepth 1 -maxdepth 1 ! -name README.md -print -quit)"
  [ -z "$unexpected" ] || { echo "Deployment kit contains licensed or private reference data." >&2; exit 1; }
  if [ -f "$candidate/reference-data/README.md" ] && [ ! -f "$appliance_home/reference-data/README.md" ]; then
    cp "$candidate/reference-data/README.md" "$appliance_home/reference-data/README.md"
  fi
  rm -f "$candidate/reference-data/README.md"
  rmdir "$candidate/reference-data"
fi
ln -s "$appliance_home/.env" "$candidate/.env"
ln -s "$appliance_home/backups" "$candidate/backups"
ln -s "$appliance_home/secrets" "$candidate/secrets"
ln -s "$appliance_home/reference-data" "$candidate/reference-data"
ln -s "$appliance_home/.data/runtime" "$candidate/.data"
ln -s "$appliance_home" "$candidate/.lospor-home"
mkdir "$candidate/.release"
cp "$lock" "$candidate/.release/release.lock"
cp "$signature" "$candidate/.release/release.lock.sig"
cp "$public_key" "$candidate/.release/trusted-public-key.pem"
chmod 0444 "$candidate/.release/"*

target_parent="$appliance_home/.data/releases/$version"
target="$target_parent/$prefix"
if [ -e "$target" ]; then
  failed="$target_parent/failed-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  mv "$target" "$failed"
  echo "Moved an incomplete prior stage to $failed"
fi
mv "$candidate" "$target"
rmdir "$temporary_root"

old_available=0
if release_state_read "$appliance_home"; then
  old_available=1
  old_version="$state_version"
  old_root="$state_release_root"
  old_lock="$state_release_lock"
fi

export HOSPITAL_RELEASE="$version"
export HOSPITAL_IMAGES_VERIFIED=1
export HOSPITAL_VERIFIED_RELEASE_LOCK="$target/.release/release.lock"
export HOSPITAL_RELEASE_TRANSITION=1
export LOSPOR_APPLIANCE_HOME="$appliance_home"
export COMPOSE_FILE="$target/compose.yaml:$target/compose.release.yaml"
export POSTGRES_IMAGE="postgres:17.6-bookworm"
export CADDY_IMAGE="caddy:2.10.2-alpine"
export CURL_WORKER_IMAGE="curlimages/curl:8.17.0"

if [ "$#" -gt 0 ]; then
  [ "${HOSPITAL_RELEASE_TEST_ONLY:-}" = 1 ] || { echo "Custom activation commands are test-only." >&2; exit 1; }
  set +e
  (cd "$target" && "$@")
  operation_result=$?
  set -e
else
  if [ "$old_available" -eq 1 ]; then operation=update.sh; else operation=install.sh; fi
  set +e
  (cd "$target" && sh "scripts/$operation")
  operation_result=$?
  set -e
fi
if [ "$operation_result" -ne 0 ]; then
  echo "Candidate Hospital $version failed; installed release state was not changed." >&2
  if [ "$old_available" -eq 1 ]; then
    echo "Attempting service rollback to Hospital $old_version ..." >&2
    # The candidate launcher may have moved a shared third-party tag (for
    # example postgres:17.6-bookworm) to a newly approved digest. Restore every
    # old tag from the exact image IDs authenticated by the prior signed lock
    # before asking Compose to recreate an old service.
    sh "$target/scripts/verify-loaded-release-images.sh" "$old_lock" restore-tags
    HOSPITAL_RELEASE="$old_version" \
    HOSPITAL_IMAGES_VERIFIED=1 \
    HOSPITAL_VERIFIED_RELEASE_LOCK="$old_lock" \
    COMPOSE_FILE="$old_root/compose.yaml:$old_root/compose.release.yaml" \
      docker compose up -d --force-recreate
    # The old release is still authoritative in installed-release.tsv. Clear
    # the candidate's one-shot transition authorization before asking an
    # operational script to load that state from a fresh shell.
    (
      unset HOSPITAL_RELEASE_TRANSITION HOSPITAL_IMAGES_VERIFIED HOSPITAL_VERIFIED_RELEASE_LOCK
      unset HOSPITAL_RELEASE COMPOSE_FILE
      cd "$old_root"
      sh scripts/doctor.sh
    ) || true
  fi
  exit "$operation_result"
fi

relative=".data/releases/$version/$prefix"
new_current="$appliance_home/.data/current.$$"
[ ! -e "$appliance_home/current" ] || [ -L "$appliance_home/current" ] \
  || { echo "Refusing to replace non-symlink appliance path: $appliance_home/current" >&2; exit 1; }
ln -s "$target" "$new_current"
release_state_write "$appliance_home" "$version" "$relative" "$target/.release/release.lock"
mv -Tf "$new_current" "$appliance_home/current"
release_state_read "$appliance_home"
echo "Hospital $version is now the active signed deployment at $appliance_home/current"
