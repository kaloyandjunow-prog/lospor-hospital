#!/bin/sh
set -eu

# The only privileged terminology dispatcher used by the Status host agent.
# It accepts a fixed enum and a direct package-directory label; it never
# evaluates input and never accepts a path, URL, database name or command.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$root/scripts/installed-release-state.sh"
appliance_home="$(release_state_appliance_home "$root")"
if release_state_apply "$appliance_home"; then root="$state_release_root"; fi
. "$root/scripts/update-pipeline-lib.sh"
update_pipeline_init "$root" "$appliance_home"

action="${1:-}"
package="${2:-}"
operator="${3:-}"
[ "$#" -eq 3 ] || { echo TERMINOLOGY_HOST_OPERATION_INVALID >&2; exit 2; }
case "$action" in import|resume|rollback|finalize) ;; *) echo TERMINOLOGY_HOST_OPERATION_INVALID >&2; exit 2 ;; esac
printf '%s\n' "$operator" | grep -Eq '^status-operator-[a-f0-9]{16}$' \
  || { echo TERMINOLOGY_HOST_OPERATION_INVALID >&2; exit 2; }
case "$action" in
  import|resume)
    printf '%s\n' "$package" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$' \
      || { echo TERMINOLOGY_HOST_OPERATION_INVALID >&2; exit 2; }
    [ -d "$root/reference-data/$package" ] && [ ! -L "$root/reference-data/$package" ] \
      || { echo TERMINOLOGY_HOST_PACKAGE_UNSAFE >&2; exit 2; }
    ;;
  rollback|finalize)
    [ "$package" = - ] || { echo TERMINOLOGY_HOST_OPERATION_INVALID >&2; exit 2; }
    ;;
esac

update_io_lock_acquire terminology || exit 75
trap 'update_io_lock_release' EXIT HUP INT TERM
case "$action" in
  import)
    sh "$root/scripts/import-terminology.sh" "$package" --operator "$operator"
    ;;
  resume)
    sh "$root/scripts/import-terminology.sh" "$package" --operator "$operator" --resume
    ;;
  rollback)
    sh "$root/scripts/rollback-terminology.sh" --confirm
    sh "$root/scripts/terminology-status.sh" --go-live
    ;;
  finalize)
    # Never discard the only rollback generation while the active generation
    # itself cannot pass the strict database-bound readiness proof.
    sh "$root/scripts/terminology-status.sh" --go-live
    sh "$root/scripts/finalize-terminology.sh" --confirm-drop-rollback
    sh "$root/scripts/terminology-status.sh" --go-live
    ;;
esac
update_io_lock_release
trap - EXIT HUP INT TERM
