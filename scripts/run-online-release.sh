#!/bin/sh
set -eu
set +x

# Verify the exact release metadata and deployment kit selected by the operator,
# pull exact registry digests, then execute the installer/updater from the newly
# staged integrity-verified kit.

bootstrap_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$bootstrap_root/scripts/installed-release-state.sh"
. "$bootstrap_root/scripts/operator-locale.sh"
. "$bootstrap_root/scripts/update-pipeline-lib.sh"
operator_locale_load "$(release_state_appliance_home "$bootstrap_root")"

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
  operator_error \
    "Usage: sh scripts/run-online-release.sh [--fetch-only] <release.lock> <release.lock.sha256> <artifact-directory>" \
    "Употреба: sh scripts/run-online-release.sh [--fetch-only] <release.lock> <release.lock.sha256> <директория-с-артефакти>"
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

sh "$bootstrap_root/scripts/verify-release.sh" "$lock" "$lock_checksum" "$artifact_directory" deployment
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
    # so it took the whole script down before ever reaching the pull loop
    # below -- which exists, verified, and simply could not be reached from
    # this branch. Recover instead: fall through past this case (deliberately
    # not exiting) into that exact loop, using the lock this script already
    # verified, then come back and finish what this branch does once the
    # images are back.
    set +e
    sh "$state_release_root/scripts/verify-loaded-release-images.sh" "$state_release_lock"
    images_verified=$?
    set -e
    if [ "$images_verified" -ne 0 ]; then
      operator_say "Hospital $version is installed but its images are missing or damaged; re-acquiring them." "Hospital $version е инсталирана, но образите ѝ липсват или са повредени; повторно изтегляне."
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

command -v docker >/dev/null 2>&1 || { operator_error "Docker is required." "Необходим е Docker."; exit 1; }
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
update_credential_read "$appliance_home/secrets/registry/ghcr-user" \
  '^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?$' 39 \
  || { operator_error "This site has no safe GHCR username configured." "За тази болница няма безопасно конфигурирано потребителско име за GHCR."; exit 1; }
ghcr_user="$update_credential_value"; update_credential_value=""
printf '%s\n' "$ghcr_user" | grep -q -- '--' \
  && { ghcr_user=""; operator_error "The GHCR username format is invalid." "Форматът на потребителското име за GHCR е невалиден."; exit 1; }
update_credential_read "$appliance_home/secrets/registry/ghcr-token" "$UPDATE_TOKEN_FORMAT_PATTERN" "$UPDATE_TOKEN_FORMAT_MAXIMUM" \
  || { ghcr_user=""; operator_error "This site has no safe GHCR read token configured." "За тази болница няма безопасно конфигуриран токен за четене от GHCR."; exit 1; }
ghcr_token="$update_credential_value"; update_credential_value=""
DOCKER_CONFIG="$temporary_directory/docker-config"
mkdir -p "$DOCKER_CONFIG"
chmod 700 "$DOCKER_CONFIG"
export DOCKER_CONFIG
printf '%s' "$ghcr_token" \
  | docker login ghcr.io --username "$ghcr_user" --password-stdin >/dev/null \
  || { ghcr_user=""; ghcr_token=""; operator_error "Could not authenticate to ghcr.io with this site's registry credential." "Удостоверяването в ghcr.io с данните за достъп на тази болница е неуспешно."; exit 1; }
ghcr_user=""; ghcr_token=""

while IFS="$tab" read -r kind name reference registry_digest platform_digest config_digest platform diff_ids extra; do
  [ "$kind" = image ] || continue
  [ -z "${extra:-}" ] || { operator_error "Malformed image record: $name" "Невалиден запис за образ: $name"; exit 1; }
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
[ "$count" -eq 10 ] || { operator_error "Verified lock did not contain ten images." "Провереният заключващ файл не съдържа десет образа."; exit 1; }
sh "$bootstrap_root/scripts/verify-loaded-release-images.sh" "$temporary_directory/pulled.lock"
while IFS="$tab" read -r immutable reference; do docker tag "$immutable" "$reference"; done < "$temporary_directory/tags"
sh "$bootstrap_root/scripts/verify-loaded-release-images.sh" "$lock"
trap - EXIT HUP INT TERM
rm -rf "$temporary_directory"

if [ "$same_version_recovery" -eq 1 ]; then
  # The already-installed release's images are back and verified. There is no
  # new candidate to activate -- finish exactly what the transition_result=20
  # branch above would have done for an already-healthy image set.
  if [ "$fetch_only" -eq 1 ]; then
    operator_say "Hospital $version's images are re-acquired and verified. Services were not started." "Образите на Hospital $version са изтеглени отново и проверени. Услугите не бяха стартирани."
    exit 0
  fi
  release_state_read "$appliance_home"
  running_before="$(release_state_running_service_count "$state_release_root")"
  release_state_start_installed_services \
    "$appliance_home" "$state_release_root" "$state_version" \
    "$state_release_lock" "$state_lock_sha" \
    || { operator_error "Installed services could not be started." "Инсталираните услуги не можаха да бъдат стартирани."; exit 1; }
  (cd "$state_release_root" && sh scripts/doctor.sh)
  if [ "$running_before" -eq 0 ]; then
    operator_say "Hospital $version's images were re-acquired and its services restarted." "Образите на Hospital $version бяха изтеглени отново и услугите ѝ бяха рестартирани."
  else
    operator_say "Hospital $version's images were re-acquired and its services reconciled." "Образите на Hospital $version бяха изтеглени отново и услугите ѝ бяха съгласувани."
  fi
  exit 0
fi

if [ "$fetch_only" -eq 1 ]; then
  # Record what is staged so the status page can say "downloaded and verified,
  # ready to apply" rather than leaving the operator to remember. The check
  # script owns the other fields, so preserve them.
  appliance_home="$(release_state_appliance_home "$bootstrap_root")"
  status_path="$appliance_home/.data/update-status.tsv"
  # The check script owns the other fields and preserves this one, so the read
  # and the write have to be one operation from its point of view.
  status_lock_owned=0
  temporary_status=""
  cleanup_fetch_status() {
    [ -z "$temporary_status" ] || rm -f "$temporary_status" 2>/dev/null || true
    [ "$status_lock_owned" -eq 0 ] || release_state_unlock_update_status "$appliance_home"
  }
  trap cleanup_fetch_status EXIT HUP INT TERM
  release_state_lock_update_status "$appliance_home" || exit 2
  status_lock_owned=1
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
  status_prior_umask="$(umask)"
  umask 077
  # Field seven is the digest of the lock that was staged.
  #
  # Without it the status page can say a release is downloaded but cannot offer
  # to apply it: what identifies a release through the whole apply path is its
  # lock digest, and the page will not put a button on a release it cannot name
  # exactly. Recording only the version would let an operator approve "1.3.0"
  # and get whichever 1.3.0 happened to be staged.
  fetched_lock_sha="$(sha256sum "$lock" | awk '{print $1}')"
  printf 'LOSPOR-HOSPITAL-UPDATE-STATUS-V1\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$checked_at" "$installed_version" "$latest_version" "$state" "$version" \
    "$fetched_lock_sha" > "$temporary_status"
  umask "$status_prior_umask"
  chmod 0600 "$temporary_status"
  update_durable_replace "$temporary_status" "$status_path"
  temporary_status=""
  release_state_unlock_update_status "$appliance_home"
  status_lock_owned=0
  trap - EXIT HUP INT TERM

  operator_say "Release $version is downloaded and verified. Nothing has been changed." "Версия $version е изтеглена и проверена. Нищо не е променено."
  operator_say "Every image matches the release lock by portable OCI identity." "Всеки образ съвпада със заключващия файл по преносимата си OCI самоличност."
  echo
  operator_say \
    "To apply it — this stops and restarts the appliance and migrates the" \
    "За да я приложите — това спира и стартира отново системата и мигрира"
  operator_say \
    "database, so choose the moment — run the same command without --fetch-only:" \
    "базата данни, затова изберете подходящ момент — изпълнете същата команда без --fetch-only:"
  echo
  echo "  sh $0 $lock $lock_checksum $artifact_directory"
  exit 0
fi

if [ "$#" -gt 0 ]; then
  HOSPITAL_UPDATE_SUPPLY_MODE=connected
  export HOSPITAL_UPDATE_SUPPLY_MODE
  exec sh "$bootstrap_root/scripts/activate-verified-release.sh" \
    "$lock" "$lock_checksum" "$artifact_directory" -- "$@"
fi
HOSPITAL_UPDATE_SUPPLY_MODE=connected
export HOSPITAL_UPDATE_SUPPLY_MODE
exec sh "$bootstrap_root/scripts/activate-verified-release.sh" \
  "$lock" "$lock_checksum" "$artifact_directory"
