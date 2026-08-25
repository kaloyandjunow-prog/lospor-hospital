#!/bin/sh
set -eu

# Retain the active release and one exact rollback release. Remove only older
# version roots whose own lock/checksum still validate, and only their exact
# unprotected image tags. This intentionally never invokes Docker's broad
# image/system prune operations.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$root/scripts/installed-release-state.sh"
. "$root/scripts/update-pipeline-lib.sh"
appliance_home="$(release_state_appliance_home "$root")"
update_pipeline_init "$root" "$appliance_home"
[ ! -e "$update_activation_lock" ] || { echo UPDATE_ACTIVATION_LOCK_PRESENT >&2; exit 1; }
update_io_lock_acquire retention
trap 'update_io_lock_release' EXIT HUP INT TERM
release_state_read "$appliance_home"
current_version="$state_version"
current_lock="$state_release_lock"
previous_version="-"
previous_lock=""
tab="$(printf '\t')"

previous_state="$appliance_home/.data/previous-installed-release.tsv"
if [ -e "$previous_state" ]; then
  [ -f "$previous_state" ] && [ ! -L "$previous_state" ] \
    && [ "$(wc -l < "$previous_state" | tr -d '[:space:]')" = 1 ] \
    && awk -F '\t' 'NR == 1 && NF == 4 { ok=1 } END { exit !(NR == 1 && ok) }' "$previous_state" \
    || { echo UPDATE_RETENTION_PREVIOUS_STATE_INVALID >&2; exit 1; }
  IFS="$tab" read -r previous_header previous_version previous_relative previous_sha previous_extra < "$previous_state"
  [ -z "${previous_extra:-}" ] \
    && [ "$previous_header" = LOSPOR-HOSPITAL-INSTALLED-RELEASE-V1 ] \
    && update_valid_version "$previous_version" \
    && [ "$previous_relative" = ".data/releases/$previous_version/lospor-hospital-$previous_version" ] \
    && update_valid_sha "$previous_sha" \
    || { echo UPDATE_RETENTION_PREVIOUS_STATE_INVALID >&2; exit 1; }
  previous_root="$appliance_home/$previous_relative"
  previous_lock="$previous_root/.release/release.lock"
  release_lock_checksum_verify "$previous_lock" "$previous_lock.sha256" \
    && [ "$release_lock_checksum_sha" = "$previous_sha" ] \
    || { echo UPDATE_RETENTION_PREVIOUS_STATE_INVALID >&2; exit 1; }
fi

image_is_protected() {
  retention_reference="$1"
  for retention_lock in "$current_lock" "$previous_lock"; do
    [ -n "$retention_lock" ] || continue
    awk -F '\t' -v reference="$retention_reference" \
      '$1 == "image" && $3 == reference { found=1 } END { exit !found }' "$retention_lock" \
      && return 0
  done
  return 1
}

releases_root="$appliance_home/.data/releases"
[ -d "$releases_root" ] && [ ! -L "$releases_root" ] \
  || { echo UPDATE_RETENTION_ROOT_INVALID >&2; exit 1; }
retention_failed=0
for release_directory in "$releases_root"/*; do
  [ -e "$release_directory" ] || continue
  [ -d "$release_directory" ] && [ ! -L "$release_directory" ] || {
    echo "UPDATE_RETENTION_OBJECT_SKIPPED $(basename "$release_directory")" >&2
    retention_failed=1
    continue
  }
  obsolete_version="$(basename "$release_directory")"
  if ! update_valid_version "$obsolete_version"; then
    echo "UPDATE_RETENTION_OBJECT_SKIPPED $obsolete_version" >&2
    retention_failed=1
    continue
  fi
  [ "$obsolete_version" != "$current_version" ] || continue
  [ "$obsolete_version" != "$previous_version" ] || continue
  obsolete_root="$release_directory/lospor-hospital-$obsolete_version"
  obsolete_lock="$obsolete_root/.release/release.lock"
  if ! [ -d "$obsolete_root" ] || [ -L "$obsolete_root" ] \
    || ! release_lock_checksum_verify "$obsolete_lock" "$obsolete_lock.sha256"; then
    echo "UPDATE_RETENTION_RELEASE_SKIPPED $obsolete_version" >&2
    retention_failed=1
    continue
  fi
  lock_version="$(awk -F '\t' '$1 == "release" { count += 1; value=$2 } END { if (count == 1) print value }' "$obsolete_lock")"
  if [ "$lock_version" != "$obsolete_version" ]; then
    echo "UPDATE_RETENTION_RELEASE_SKIPPED $obsolete_version" >&2
    retention_failed=1
    continue
  fi
  image_cleanup_failed=0
  while IFS="$tab" read -r kind image_name image_reference registry_digest \
    platform_digest config_digest platform diff_ids image_extra; do
    [ "$kind" = image ] || continue
    [ -z "${image_extra:-}" ] \
      && printf '%s\n' "$image_reference" | grep -Eq '^ghcr\.io/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]{1,128}$' \
      || { image_cleanup_failed=1; continue; }
    image_is_protected "$image_reference" && continue
    if docker image inspect "$image_reference" >/dev/null 2>&1; then
      docker image rm "$image_reference" >/dev/null 2>&1 || image_cleanup_failed=1
    fi
  done < "$obsolete_lock"
  if [ "$image_cleanup_failed" -ne 0 ]; then
    echo "UPDATE_RETENTION_IMAGES_SKIPPED $obsolete_version" >&2
    retention_failed=1
    continue
  fi
  case "$release_directory" in "$releases_root/"*) rm -rf "$release_directory" ;; *) exit 1 ;; esac
  update_sync_path "$releases_root"
done

[ "$retention_failed" -eq 0 ] || exit 1
update_io_lock_release
trap - EXIT HUP INT TERM
printf 'UPDATE_RETENTION_OK\t%s\t%s\n' "$current_version" "$previous_version"
