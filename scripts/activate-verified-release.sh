#!/bin/sh
set -eu

# Extract a verified deployment archive into a fresh versioned directory,
# execute that candidate's installer/updater, and only then atomically make it
# the active deployment. Persistent site configuration and data remain outside
# the immutable release directory.

bootstrap_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$bootstrap_root/scripts/installed-release-state.sh"
. "$bootstrap_root/scripts/update-pipeline-lib.sh"

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
old_state_backup="$activation_lock/installed-release.before.tsv"
state_restore_temporary="$appliance_home/.data/installed-release.restore.$$"
keep_activation_lock=0
activation_journal="$activation_lock/journal.v1.tsv"
activation_history="$appliance_home/.data/release-activation-history"
mkdir -p "$activation_history"
chmod 0700 "$activation_lock" "$activation_history"
if ! update_sync_path "$activation_lock" \
  || ! update_sync_path "$(dirname "$activation_lock")"; then
  rmdir "$activation_lock" 2>/dev/null || true
  exit 1
fi
journal_boot_id="$(cat /proc/sys/kernel/random/boot_id 2>/dev/null || echo unknown)"
journal_process_start="$(awk '{print $22}' "/proc/$$/stat" 2>/dev/null || echo 0)"
journal_old_version="-"; journal_old_root="-"; journal_old_lock_sha="-"
journal_candidate_root="$appliance_home/.data/releases/$version/lospor-hospital-$version"
journal_rollback_policy="${HOSPITAL_ROLLBACK_POLICY:--}"
journal_doctor="-"
journal_write() {
  journal_phase="$1"
  case "$journal_phase" in
    LOCKED|CANDIDATE_STAGED|PRE_MUTATION_VERIFIED|MUTATION_STARTED|CANDIDATE_SUCCEEDED|STATE_COMMITTED|CURRENT_SWITCHED|VERIFIED|ROLLBACK_STARTED|ROLLBACK_VERIFIED|ROLLBACK_INCOMPLETE|BACKUP_RECOVERY_REQUIRED) ;;
    *) echo "Invalid activation journal phase." >&2; return 1 ;;
  esac
  journal_backup="$(cat "$activation_lock/pre-update-backup" 2>/dev/null || echo -)"
  printf '%s\n' "$journal_backup" | grep -Eq '^(-|lospor-[A-Za-z0-9._-]{1,180})$' || journal_backup="invalid"
  journal_tmp="$activation_journal.tmp.$$"
  journal_prior_umask="$(umask)"
  umask 077
  printf 'LOSPOR-HOSPITAL-ACTIVATION-JOURNAL-V1\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$(date -u +%s)" "$journal_phase" "$journal_boot_id" "$$" "$journal_process_start" \
    "$journal_old_version" "$journal_old_root" "$journal_old_lock_sha" "$version" \
      "$journal_candidate_root" "$verified_lock_sha" "$journal_rollback_policy" "$journal_backup" \
      "$journal_doctor" > "$journal_tmp" || { umask "$journal_prior_umask"; return 1; }
  umask "$journal_prior_umask"
  chmod 0600 "$journal_tmp" || return 1
  update_durable_replace "$journal_tmp" "$activation_journal" || return 1
  if [ "${HOSPITAL_RELEASE_TEST_ONLY:-0}" = 1 ] \
    && [ "${HOSPITAL_RELEASE_TEST_CRASH_AFTER_PHASE:-}" = "$journal_phase" ]; then
    keep_activation_lock=1
    echo "Injected activation crash after durable phase $journal_phase" >&2
    exit 97
  fi
}
cleanup_activation() {
  rm -rf "$temporary_root" 2>/dev/null || true
  if [ "$keep_activation_lock" -eq 0 ]; then
    if [ -s "$activation_journal" ]; then
      history_copy="$activation_history/$(date -u +%Y%m%dT%H%M%SZ)-$version-$$.tsv"
      if cp "$activation_journal" "$history_copy" 2>/dev/null; then
        chmod 0600 "$history_copy" 2>/dev/null || true
        update_sync_path "$history_copy" 2>/dev/null || true
        update_sync_path "$activation_history" 2>/dev/null || true
      fi
    fi
    rm -f "$new_current" "$rollback_current" "$old_state_backup" "$state_restore_temporary" 2>/dev/null || true
    rm -f "$appliance_home/.data/installed-release.tsv.tmp.$$" 2>/dev/null || true
    rm -f "$activation_lock/pre-update-backup" "$activation_journal" "$activation_journal.tmp.$$" 2>/dev/null || true
    rmdir "$activation_lock" 2>/dev/null || true
    update_sync_path "$(dirname "$activation_lock")" 2>/dev/null || true
  fi
}
trap 'cleanup_activation' EXIT HUP INT TERM
journal_write LOCKED
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
# The update request channel. Created here rather than left to Docker: a bind
# mount whose host path does not exist is created by the daemon as root, and
# the one-shot that owns it holds CHOWN but not FOWNER -- it could never take
# the mode back, so Status would silently have nowhere to write.
mkdir -p "$appliance_home/.data/runtime/update/requests" "$appliance_home/.data/runtime/update/state"
io_mutation_lock="$appliance_home/.data/io-mutation.lock"
if [ -L "$io_mutation_lock" ] || { [ -e "$io_mutation_lock" ] && [ ! -f "$io_mutation_lock" ]; }; then
  echo "The shared maintenance lock path is not a regular file: $io_mutation_lock" >&2
  exit 1
fi
: >> "$io_mutation_lock"
chmod 0600 "$io_mutation_lock"
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
if [ -s "$lock.sig" ]; then
  cp "$lock.sig" "$candidate/.release/release.lock.sig"
fi
chmod 0444 "$candidate/.release/"*

target_parent="$appliance_home/.data/releases/$version"
target="$target_parent/$prefix"
if [ -e "$target" ]; then
  [ -d "$target" ] && [ ! -L "$target" ] \
    || { echo "Refusing an unsafe incomplete release stage: $target" >&2; exit 1; }
  # Preserve the immediately preceding failed stage for inspection, but do not
  # let repeated attempts grow this version directory without bound.
  for prior_failed in "$target_parent"/failed-*; do
    [ -e "$prior_failed" ] || continue
    printf '%s\n' "$(basename "$prior_failed")" \
      | grep -Eq '^failed-[0-9]{8}T[0-9]{6}Z-[0-9]{1,10}$' \
      || { echo "Refusing an unexpected failed-stage object: $prior_failed" >&2; exit 1; }
    [ -d "$prior_failed" ] && [ ! -L "$prior_failed" ] \
      || { echo "Refusing an unsafe failed-stage object: $prior_failed" >&2; exit 1; }
    rm -rf "$prior_failed"
  done
  failed="$target_parent/failed-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  mv "$target" "$failed"
  update_sync_path "$target_parent"
  echo "Moved an incomplete prior stage to $failed"
fi
mv "$candidate" "$target"
rmdir "$temporary_root"
update_sync_path "$target"
update_sync_path "$(dirname "$target")"
. "$target/scripts/release-compatibility.sh"
release_compatibility_read "$target/release-compatibility.tsv"
release_compatibility_assert_version "$version"
set +e
sh "$target/scripts/verify-rollback-compatibility.sh" "$target"
compatibility_verification=$?
set -e
case "$compatibility_rollback_policy:$compatibility_verification" in
  service-compatible:0|backup-required:20) ;;
  *) echo "Authenticated rollback compatibility policy failed verification." >&2; exit 1 ;;
esac
if [ "${HOSPITAL_ROLLBACK_POLICY:-}" != "" ] \
  && [ "$HOSPITAL_ROLLBACK_POLICY" != "$compatibility_rollback_policy" ]; then
  echo "Prepared rollback policy does not match the authenticated deployment." >&2
  exit 1
fi
if [ "${HOSPITAL_ROLLBACK_PROOF_SHA256:-}" != "" ] \
  && [ "$HOSPITAL_ROLLBACK_PROOF_SHA256" != "$compatibility_proof_sha256" ]; then
  echo "Prepared rollback proof does not match the authenticated deployment." >&2
  exit 1
fi
journal_rollback_policy="$compatibility_rollback_policy"
journal_write CANDIDATE_STAGED

old_available=0
if release_state_read "$appliance_home"; then
  old_available=1
  old_version="$state_version"
  old_root="$state_release_root"
  old_lock="$state_release_lock"
  old_lock_sha="$state_lock_sha"
  journal_old_version="$old_version"
  journal_old_root="$old_root"
  journal_old_lock_sha="$old_lock_sha"
  cp "$(release_state_file "$appliance_home")" "$old_state_backup"
  chmod 0600 "$old_state_backup"
  update_sync_path "$old_state_backup"
  update_sync_path "$activation_lock"
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
journal_write PRE_MUTATION_VERIFIED

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
  journal_write ROLLBACK_STARTED || true
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

  if [ "$rollback_failure" -eq 0 ]; then
    journal_doctor=passed
    journal_write ROLLBACK_VERIFIED || true
    return 0
  fi
  journal_doctor=failed
  journal_write ROLLBACK_INCOMPLETE || true
  return 1
}

fail_after_candidate() {
  failure_message="$1"
  failure_status="$2"
  echo "$failure_message" >&2
  if [ "$old_available" -eq 1 ] && [ "$compatibility_rollback_policy" = backup-required ]; then
    keep_activation_lock=1
    journal_doctor=failed
    journal_write BACKUP_RECOVERY_REQUIRED || true
    echo "Automatic service rollback is not supported for this migrated schema." >&2
    echo "Restore the verified pre-update backup recorded inside the activation lock." >&2
    echo "Activation lock retained for supported recovery: $activation_lock" >&2
    exit 1
  fi
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

journal_write MUTATION_STARTED
if [ "$#" -gt 0 ]; then
  [ "${HOSPITAL_RELEASE_TEST_ONLY:-}" = 1 ] || { echo "Custom activation commands are test-only." >&2; exit 1; }
  set +e
  (cd "$target" && HOSPITAL_ACTIVATION_LOCK="$activation_lock" "$@")
  operation_result=$?
  set -e
else
  if [ "$old_available" -eq 1 ]; then operation=update.sh; else operation=install.sh; fi
  set +e
  (cd "$target" && HOSPITAL_ACTIVATION_LOCK="$activation_lock" sh "scripts/$operation")
  operation_result=$?
  set -e
fi
if [ "$operation_result" -ne 0 ]; then
  fail_after_candidate \
    "Candidate Hospital $version failed before activation commit." \
    "$operation_result"
fi
journal_doctor=passed
journal_write CANDIDATE_SUCCEEDED

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
journal_write STATE_COMMITTED
set +e
mv -Tf "$new_current" "$appliance_home/current"
commit_result=$?
set -e
if [ "$commit_result" -ne 0 ]; then
  fail_after_candidate "Could not atomically promote the new current symlink." "$commit_result"
fi
update_sync_path "$appliance_home"
journal_write CURRENT_SWITCHED
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
if [ "$old_available" -eq 1 ]; then
  previous_tmp="$appliance_home/.data/previous-installed-release.tsv.tmp.$$"
  cp "$old_state_backup" "$previous_tmp" \
    && chmod 0600 "$previous_tmp" \
    && update_durable_replace "$previous_tmp" "$appliance_home/.data/previous-installed-release.tsv" \
    || fail_after_candidate "Could not record the exact rollback release identity." 1
fi
journal_write VERIFIED
echo "Hospital $version is now the active integrity-verified deployment at $appliance_home/current"
