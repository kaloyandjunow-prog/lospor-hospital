#!/bin/sh
set -eu

# Apply exactly one root-owned descriptor.  No caller-supplied path, digest,
# repository, tag, or command reaches activation.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$root/scripts/installed-release-state.sh"
. "$root/scripts/update-pipeline-lib.sh"
. "$root/scripts/operator-locale.sh"
version="${1:-}"
request_id="${2:--}"
update_valid_version "$version" || {
  operator_error "Usage: apply-prepared-release.sh <version> [request-id]" "Употреба: apply-prepared-release.sh <версия> [номер-на-заявка]"
  exit 2
}
printf '%s\n' "$request_id" | grep -Eq '^(-|[a-f0-9]{32})$' || { echo UPDATE_REQUEST_MALFORMED >&2; exit 2; }
appliance_home="$(release_state_appliance_home "$root")"
operator_locale_load "$appliance_home"
update_pipeline_init "$root" "$appliance_home"

[ ! -e "$update_activation_lock" ] || { echo UPDATE_ACTIVATION_LOCK_PRESENT >&2; exit 1; }
[ ! -e "$appliance_home/backups/.lospor-backup.lock" ] || { echo UPDATE_BACKUP_BUSY >&2; exit 1; }
update_descriptor_for_version "$version" \
  || { echo UPDATE_PREPARED_DESCRIPTOR_INVALID >&2; exit 1; }

if release_state_read "$appliance_home"; then
  if [ "$state_version" = "$version" ] && [ "$state_lock_sha" = "$descriptor_lock_sha" ]; then
    update_transition_write COMPLETED apply "$request_id" "$version" UPDATE_ALREADY_INSTALLED "$descriptor_lock_sha"
    update_projection_write completed UPDATE_ALREADY_INSTALLED "$version"
    update_remove_prepared_version "$version"
    exit 0
  fi
  [ "$descriptor_installed_version" = "$state_version" ] \
    || { echo UPDATE_PREPARED_FROM_DIFFERENT_RELEASE >&2; exit 1; }
  current_version="$state_version"
  current_lock="$state_release_lock"
  current_lock_sha="$state_lock_sha"
else
  state_result=$?
  [ "$state_result" -eq 10 ] || exit "$state_result"
  [ "$descriptor_installed_version" = - ] \
    || { echo UPDATE_PREPARED_FROM_DIFFERENT_RELEASE >&2; exit 1; }
  current_version="-"
  current_lock=""
  current_lock_sha="-"
fi

set +e
release_state_assert_transition "$appliance_home" "$version" "$descriptor_lock"
transition_result=$?
set -e
case "$transition_result" in
  0) ;;
  20)
    update_transition_write COMPLETED apply "$request_id" "$version" UPDATE_ALREADY_INSTALLED "$descriptor_lock_sha"
    update_projection_write completed UPDATE_ALREADY_INSTALLED "$version"
    update_remove_prepared_version "$version"
    exit 0
    ;;
  *) exit "$transition_result" ;;
esac

sh "$root/scripts/update-capacity.sh" apply 0 >/dev/null
sh "$root/scripts/verify-loaded-release-images.sh" "$descriptor_lock"
if [ -n "$current_lock" ]; then
  # The exact prior images are the rollback boundary. Even a backup-required
  # transition retains them; an operator may still need the old services after
  # restoring the verified pre-update backup.
  sh "$root/scripts/verify-loaded-release-images.sh" "$current_lock"
fi

update_transition_write APPLYING apply "$request_id" "$version" UPDATE_APPLYING "$descriptor_lock_sha"
update_projection_write applying UPDATE_APPLYING "$version" "" \
  "$descriptor_version" "$descriptor_lock_sha" "$descriptor_rollback_policy"
apply_log="$update_private_dir/apply-$request_id.log"
set +e
HOSPITAL_PREPARED_DESCRIPTOR="$update_prepared_dir/$version/prepared-release.v2.tsv" \
HOSPITAL_ROLLBACK_POLICY="$descriptor_rollback_policy" \
HOSPITAL_ROLLBACK_PROOF_SHA256="$descriptor_proof_sha" \
  sh "$root/scripts/activate-verified-release.sh" \
    "$descriptor_lock" "$descriptor_checksum" "$descriptor_root" > "$apply_log" 2>&1
result=$?
set -e
chmod 0600 "$apply_log" 2>/dev/null || true
update_sync_path "$apply_log" 2>/dev/null || true

if [ "$result" -ne 0 ]; then
  # Say why, where the operator is already looking.
  #
  # The activation's whole output goes to a 0600 file, which is right -- it
  # carries paths, digests and image identities. But nothing named that file
  # or quoted a line of it, so a failed update told the operator only that
  # one had "stopped part way": Status said it, losporctl status said it, and
  # recover said it. The reason -- a permission denied on one bind-mounted
  # script -- sat unread on disk while three commands in a row declined to
  # mention it.
  #
  # The tail goes to stderr, which is the agent's journal: root-readable,
  # already where an operator looks for a failed service, and not a surface
  # a non-root Status viewer can reach.
  echo "Activation failed. The last lines of $apply_log were:" >&2
  tail -n 20 "$apply_log" 2>/dev/null | sed "s/^/  /" >&2 || true
  echo "Full output: $apply_log (root-only)" >&2
  if [ -e "$update_activation_lock" ]; then
    update_transition_write NEEDS_OPERATOR apply "$request_id" "$version" UPDATE_ACTIVATION_NEEDS_RECOVERY "$descriptor_lock_sha"
    update_projection_write needs-operator UPDATE_ACTIVATION_NEEDS_RECOVERY "$version" "" \
      "$descriptor_version" "$descriptor_lock_sha" "$descriptor_rollback_policy"
  else
    update_transition_write FAILED apply "$request_id" "$version" UPDATE_APPLY_FAILED "$descriptor_lock_sha"
    update_projection_write failed UPDATE_APPLY_FAILED "$version" "" \
      "$descriptor_version" "$descriptor_lock_sha" "$descriptor_rollback_policy"
  fi
  exit "$result"
fi

release_state_read "$appliance_home" \
  && [ "$state_version" = "$version" ] \
  && [ "$state_lock_sha" = "$descriptor_lock_sha" ] \
  || { update_transition_write NEEDS_OPERATOR apply "$request_id" "$version" UPDATE_COMMIT_MISMATCH "$descriptor_lock_sha"; exit 1; }

update_transition_write COMPLETED apply "$request_id" "$version" UPDATE_COMPLETED "$descriptor_lock_sha"
update_projection_write completed UPDATE_COMPLETED "$version"

# Active identity is now durably represented by installed-release.tsv and the
# immutable release root. Delete only the consumed prepared download; never an
# active or previous release root and never an image tag.
update_remove_prepared_version "$version"
retention_result=1
set +e
sh "$root/scripts/prune-update-retention.sh" >/dev/null
retention_result=$?
set -e
if [ "$retention_result" -ne 0 ]; then
  operator_error \
    "The release is active, but obsolete release cleanup needs Hospital IT review." \
    "Версията е активна, но почистването на остарелите версии изисква преглед от болничния ИТ екип."
fi
operator_say "Hospital $version is active and verified." "Hospital $version е активна и проверена."
