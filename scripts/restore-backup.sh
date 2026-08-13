#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: scripts/restore-backup.sh backups/lospor-YYYYMMDDTHHMMSSZ.dump" >&2
  exit 2
fi

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
. "$root/scripts/installed-release-state.sh"
if [ "${HOSPITAL_RELEASE_TRANSITION:-}" = 1 ]; then
  release_state_assert_verified_transition "$root"
else
  appliance_home="$(release_state_appliance_home "$root")"
  set +e
  release_state_apply "$appliance_home"
  release_state_result=$?
  set -e
  case "$release_state_result" in
    0) root="$state_release_root" ;;
    10) ;;
    *) exit "$release_state_result" ;;
  esac
fi
cd "$root"
artifact="/backups/$(basename "$1")"

# Status and Caddy deliberately remain running throughout the restore. Once the
# restored schema is migrated, clinical services can be restarted even if the
# operator needs another reconciliation attempt.
restart_allowed=0
restart_after_restore() {
  if [ "$restart_allowed" -eq 1 ]; then
    docker compose up -d >/dev/null 2>&1 || true
  fi
}
trap restart_after_restore EXIT HUP INT TERM

docker compose stop api delivery-worker web pwa browser backup
docker compose run --rm \
  -e LOSPOR_RESTORE_CONFIRM=RESTORE \
  --entrypoint /usr/local/bin/restore.sh \
  backup "$artifact"
docker compose run --rm -T migrate
docker compose --profile tools run --rm -T status-db-init
restart_allowed=1

echo "The database may contain an older appliance credential generation."
echo "Re-select an active ADMIN from the restored database to synchronize it with Status."
sh scripts/appliance-operator.sh reconcile-restore

docker compose up -d
restart_allowed=0
trap - EXIT HUP INT TERM
./scripts/doctor.sh
