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
    "Usage: sh scripts/load-offline.sh <release.lock> <release.lock.sha256> <artifact-directory>" \
    "Употреба: sh scripts/load-offline.sh <release.lock> <release.lock.sha256> <директория-с-артефакти>"
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
same_version_recovery=0
case "$transition_result" in
  0) ;;
  20)
    release_state_read "$appliance_home"
    # A pruned or partially-pruned image cache used to be unrecoverable from
    # here: this check ran under set -eu with nothing catching its failure,
    # so it took the whole script down before ever reaching the docker load
    # below -- which exists, verified, and simply could not be reached from
    # this branch. Recover instead: fall through past this case (deliberately
    # not exiting) into that load, using the same complete offline media this
    # script already verified, then come back and finish what this branch
    # does once the images are back.
    set +e
    sh "$state_release_root/scripts/verify-loaded-release-images.sh" "$state_release_lock"
    images_verified=$?
    set -e
    if [ "$images_verified" -ne 0 ]; then
      operator_say "Hospital $version is installed but its images are missing or damaged; re-loading them." "Hospital $version е инсталирана, но образите ѝ липсват или са повредени; повторно зареждане."
      same_version_recovery=1
    else
      # Installed is not the same as running. Reporting completion on an
      # appliance with no services was a success message on a dead system, and
      # nothing else would start it again.
      #
      # Counting to exactly zero was too narrow: a stack with one of ten services
      # up is equally broken and equally unfixable by any supported command, but
      # took the "already installed" branch. `up -d` is a no-op for an unchanged
      # release -- it is the same recreate step every update performs, and
      # containers hold no state -- so reconcile unconditionally and let the
      # message report what was actually found.
      running_before="$(release_state_running_service_count "$state_release_root")"
      if [ "$running_before" -eq 0 ]; then
        operator_say "Hospital $version is installed but no services are running; starting them." "Hospital $version е инсталирана, но не работят услуги; стартиране."
      fi
      release_state_start_installed_services \
        "$appliance_home" "$state_release_root" "$state_version" \
        "$state_release_lock" "$state_lock_sha" \
        || { operator_error "Installed services could not be started." "Инсталираните услуги не можаха да бъдат стартирани."; exit 1; }
      (cd "$state_release_root" && sh scripts/doctor.sh)
      if [ "$running_before" -eq 0 ]; then
        operator_say "Hospital $version services were restarted from the installed release." "Услугите на Hospital $version бяха рестартирани от инсталираната версия."
      else
        operator_say "Hospital $version with this exact release identity is already installed; services were reconciled." "Hospital $version с точно тази самоличност на версията вече е инсталирана; услугите бяха съгласувани."
      fi
      exit 0
    fi
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

if [ "$same_version_recovery" -eq 1 ]; then
  # The already-installed release's images are back and verified. There is no
  # new candidate to activate -- finish exactly what the transition_result=20
  # branch above would have done for an already-healthy image set.
  release_state_read "$appliance_home"
  running_before="$(release_state_running_service_count "$state_release_root")"
  release_state_start_installed_services \
    "$appliance_home" "$state_release_root" "$state_version" \
    "$state_release_lock" "$state_lock_sha" \
    || { operator_error "Installed services could not be started." "Инсталираните услуги не можаха да бъдат стартирани."; exit 1; }
  (cd "$state_release_root" && sh scripts/doctor.sh)
  if [ "$running_before" -eq 0 ]; then
    operator_say "Hospital $version's images were re-loaded and its services restarted." "Образите на Hospital $version бяха презаредени и услугите ѝ бяха рестартирани."
  else
    operator_say "Hospital $version's images were re-loaded and its services reconciled." "Образите на Hospital $version бяха презаредени и услугите ѝ бяха съгласувани."
  fi
  exit 0
fi

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
