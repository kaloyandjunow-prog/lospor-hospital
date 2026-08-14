#!/bin/sh
set -eu

# Extract a verified deployment archive into a fresh versioned directory,
# execute that candidate's installer/updater, and only then atomically make it
# the active deployment. Persistent site configuration and data remain outside
# the immutable release directory.

bootstrap_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$bootstrap_root/scripts/installed-release-state.sh"

lock="${1:-}"
lock_checksum="${2:-}"
artifact_directory="${3:-}"
shift 3 || true
[ "${1:-}" != -- ] || shift

[ -s "$lock" ] && [ -s "$lock_checksum" ] && [ -d "$artifact_directory" ] || {
  echo "Usage: activate-verified-release.sh <release.lock> <release.lock.sha256> <artifact-directory>" >&2
  exit 2
}

appliance_home="$(release_state_appliance_home "$bootstrap_root")"
case "$appliance_home" in ""|/) echo "Refusing an unsafe appliance home: '$appliance_home'" >&2; exit 1 ;; esac
sh "$bootstrap_root/scripts/verify-release.sh" "$lock" "$lock_checksum" "$artifact_directory" deployment
verified_lock_sha="$(sha256sum "$lock" | awk '{print $1}')"
version="$(awk -F '\t' '$1 == "release" { print $2 }' "$lock")"
deployment_file="$(awk -F '\t' '$1 == "artifact" && $2 == "deployment" { print $4 }' "$lock")"
[ -n "$version" ] && [ -n "$deployment_file" ] || { echo "Verified lock lacks deployment identity." >&2; exit 1; }

set +e
release_state_assert_transition "$appliance_home" "$version" "$lock"
transition_result=$?
set -e
case "$transition_result" in
  0) ;;
  20) echo "Hospital $version with this exact release identity is already installed."; exit 0 ;;
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
new_current="$appliance_home/.data/current.$$"
rollback_current="$appliance_home/.data/current.rollback.$$"
old_state_backup="$appliance_home/.data/installed-release.before.$$"
state_restore_temporary="$appliance_home/.data/installed-release.restore.$$"
keep_activation_lock=0
cleanup_activation() {
  rm -rf "$temporary_root" 2>/dev/null || true
  if [ "$keep_activation_lock" -eq 0 ]; then
    rm -f "$new_current" "$rollback_current" "$old_state_backup" "$state_restore_temporary" 2>/dev/null || true
    rm -f "$appliance_home/.data/installed-release.tsv.tmp.$$" 2>/dev/null || true
    rmdir "$activation_lock" 2>/dev/null || true
  fi
}
trap 'cleanup_activation' EXIT HUP INT TERM
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
printf '%s  release.lock\n' "$verified_lock_sha" > "$candidate/.release/release.lock.sha256"
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
  old_lock_sha="$state_lock_sha"
  cp "$(release_state_file "$appliance_home")" "$old_state_backup"
  chmod 0600 "$old_state_backup"
  [ -L "$appliance_home/current" ] \
    || { echo "Installed release state exists but current is not a symlink." >&2; exit 1; }
  current_root="$(CDPATH= cd -- "$appliance_home/current" 2>/dev/null && pwd -P)" \
    || { echo "Installed release current symlink is inaccessible." >&2; exit 1; }
  [ "$current_root" = "$old_root" ] \
    || { echo "Installed release state and current symlink disagree." >&2; exit 1; }
else
  old_state_result=$?
  [ "$old_state_result" -eq 10 ] || exit "$old_state_result"
  if [ -e "$appliance_home/current" ] || [ -L "$appliance_home/current" ]; then
    echo "Refusing an untracked current path without installed release state." >&2
    exit 1
  fi
fi

export HOSPITAL_RELEASE="$version"
export HOSPITAL_IMAGES_VERIFIED=1
export HOSPITAL_VERIFIED_RELEASE_LOCK="$target/.release/release.lock"
export HOSPITAL_VERIFIED_RELEASE_LOCK_SHA256="$verified_lock_sha"
export HOSPITAL_RELEASE_TRANSITION=1
export LOSPOR_APPLIANCE_HOME="$appliance_home"
export COMPOSE_FILE="$target/compose.yaml:$target/compose.release.yaml"
export POSTGRES_IMAGE="ghcr.io/kaloyandjunow-prog/lospor-hospital-postgres:$version"
export CADDY_IMAGE="ghcr.io/kaloyandjunow-prog/lospor-hospital-caddy:$version"
export CURL_WORKER_IMAGE="ghcr.io/kaloyandjunow-prog/lospor-hospital-curl-worker:$version"

rollback_candidate() {
  rollback_failure=0
  state_file="$(release_state_file "$appliance_home")"

  rm -f "$new_current" "$rollback_current" "$state_restore_temporary" 2>/dev/null || rollback_failure=1
  if [ "$old_available" -eq 1 ]; then
    if ! cp "$old_state_backup" "$state_restore_temporary"; then
      echo "Could not prepare the prior installed-release state." >&2
      rollback_failure=1
    elif ! chmod 0600 "$state_restore_temporary"; then
      echo "Could not protect the prior installed-release state." >&2
      rollback_failure=1
    elif ! mv "$state_restore_temporary" "$state_file"; then
      echo "Could not restore the prior installed-release state." >&2
      rollback_failure=1
    fi
    if ! ln -s "$old_root" "$rollback_current"; then
      echo "Could not prepare the prior current symlink." >&2
      rollback_failure=1
    elif ! mv -Tf "$rollback_current" "$appliance_home/current"; then
      echo "Could not restore the prior current symlink." >&2
      rollback_failure=1
    fi

    # The candidate launcher may have moved a versioned release tag to newly
    # approved bytes. Restore every
    # old tag from the exact image IDs bound by the prior verified lock before
    # asking Compose to recreate the old services.
    if ! sh "$old_root/scripts/verify-loaded-release-images.sh" "$old_lock" restore-tags; then
      echo "Could not restore all prior release image tags." >&2
      rollback_failure=1
    fi
    if ! HOSPITAL_RELEASE="$old_version" \
      HOSPITAL_IMAGES_VERIFIED=1 \
      HOSPITAL_VERIFIED_RELEASE_LOCK="$old_lock" \
      HOSPITAL_VERIFIED_RELEASE_LOCK_SHA256="$old_lock_sha" \
      COMPOSE_FILE="$old_root/compose.yaml:$old_root/compose.release.yaml" \
        docker compose up -d --force-recreate; then
      echo "Could not restart all prior release services." >&2
      rollback_failure=1
    fi
    if ! (
      unset HOSPITAL_RELEASE_TRANSITION HOSPITAL_IMAGES_VERIFIED HOSPITAL_VERIFIED_RELEASE_LOCK
      unset HOSPITAL_VERIFIED_RELEASE_LOCK_SHA256
      unset HOSPITAL_RELEASE COMPOSE_FILE
      cd "$old_root"
      sh scripts/doctor.sh
    ); then
      echo "Prior release health verification failed after rollback." >&2
      rollback_failure=1
    fi

    if release_state_read "$appliance_home"; then
      [ "$state_version" = "$old_version" ] \
        && [ "$state_release_root" = "$old_root" ] \
        && [ "$state_lock_sha" = "$old_lock_sha" ] \
        || { echo "Prior installed-release state was not restored exactly." >&2; rollback_failure=1; }
    else
      echo "Prior installed-release state is unreadable after rollback." >&2
      rollback_failure=1
    fi
    if restored_current="$(CDPATH= cd -- "$appliance_home/current" 2>/dev/null && pwd -P)"; then
      [ "$restored_current" = "$old_root" ] \
        || { echo "Prior current symlink was not restored exactly." >&2; rollback_failure=1; }
    else
      echo "Prior current symlink is inaccessible after rollback." >&2
      rollback_failure=1
    fi
  else
    # A failed first installation has no previous services or metadata. Stop
    # the candidate without deleting persistent volumes, and remove only the
    # exact state/symlink paths this activation could have created.
    if ! COMPOSE_FILE="$target/compose.yaml:$target/compose.release.yaml" \
      docker compose down --remove-orphans; then
      echo "Could not stop candidate services after failed initial activation." >&2
      rollback_failure=1
    fi
    if [ -e "$state_file" ] || [ -L "$state_file" ]; then
      rm -f "$state_file" || rollback_failure=1
    fi
    if [ -L "$appliance_home/current" ]; then
      candidate_current="$(readlink "$appliance_home/current")"
      if [ "$candidate_current" = "$target" ]; then
        rm -f "$appliance_home/current" || rollback_failure=1
      else
        echo "Refusing to remove an unexpected current symlink during rollback." >&2
        rollback_failure=1
      fi
    elif [ -e "$appliance_home/current" ]; then
      echo "Refusing to remove an unexpected current path during rollback." >&2
      rollback_failure=1
    fi
    if release_state_read "$appliance_home"; then
      echo "Installed-release state still exists after initial rollback." >&2
      rollback_failure=1
    else
      rollback_state_result=$?
      [ "$rollback_state_result" -eq 10 ] \
        || { echo "Installed-release state is damaged after initial rollback." >&2; rollback_failure=1; }
    fi
  fi

  [ "$rollback_failure" -eq 0 ]
}

fail_after_candidate() {
  failure_message="$1"
  failure_status="$2"
  echo "$failure_message" >&2
  echo "Attempting full activation rollback ..." >&2
  if rollback_candidate; then
    echo "The prior activation state, image tags, and services were restored." >&2
    exit "$failure_status"
  fi
  keep_activation_lock=1
  echo "ROLLBACK INCOMPLETE: leaving activation lock for operator review: $activation_lock" >&2
  echo "Prior-state recovery snapshot, if available: $old_state_backup" >&2
  exit 1
}

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
  fail_after_candidate \
    "Candidate Hospital $version failed before activation commit." \
    "$operation_result"
fi

relative=".data/releases/$version/$prefix"
[ ! -e "$appliance_home/current" ] || [ -L "$appliance_home/current" ] \
  || fail_after_candidate "Refusing to replace non-symlink appliance path: $appliance_home/current" 1
if ! ln -s "$target" "$new_current"; then
  fail_after_candidate "Could not prepare the new current symlink." 1
fi
set +e
release_state_write "$appliance_home" "$version" "$relative" "$target/.release/release.lock"
commit_result=$?
set -e
if [ "$commit_result" -ne 0 ]; then
  fail_after_candidate "Could not commit the new installed-release state." "$commit_result"
fi
set +e
mv -Tf "$new_current" "$appliance_home/current"
commit_result=$?
set -e
if [ "$commit_result" -ne 0 ]; then
  fail_after_candidate "Could not atomically promote the new current symlink." "$commit_result"
fi
if ! release_state_read "$appliance_home" \
  || [ "$state_version" != "$version" ] \
  || [ "$state_release_root" != "$target" ] \
  || [ "$state_lock_sha" != "$verified_lock_sha" ]; then
  fail_after_candidate "Committed installed-release state failed verification." 1
fi
if ! committed_current="$(CDPATH= cd -- "$appliance_home/current" 2>/dev/null && pwd -P)" \
  || [ "$committed_current" != "$target" ]; then
  fail_after_candidate "Committed current symlink failed verification." 1
fi
echo "Hospital $version is now the active integrity-verified deployment at $appliance_home/current"
