#!/bin/sh
set -eu

# Exercise the production backup and restore scripts against a database and
# volumes that exist only for this drill. No appliance Compose project, port,
# bind-mounted backup directory, or persistent database is ever selected.
root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
cd "$root"
model="infra/postgres/backup-restore.drill.compose.yaml"
project="lospor-restore-drill-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-0}-$$"

# Git Bash otherwise rewrites absolute container paths into Windows host paths
# before docker.exe sees them. Linux shells ignore this compatibility variable.
MSYS_NO_PATHCONV=1
export MSYS_NO_PATHCONV

case "$project" in *[!a-z0-9_-]*) echo "Unsafe disposable Compose project name: $project" >&2; exit 1 ;; esac

compose() {
  docker compose --project-name "$project" --file "$model" "$@"
}

cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

compose config --quiet
compose up -d --wait postgres

compose exec -T postgres psql --username lospor --dbname lospor --set ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE release_restore_drill (
  id integer PRIMARY KEY,
  value text NOT NULL
);
INSERT INTO release_restore_drill (id, value) VALUES (1, 'original');
SQL

backup_result="$(compose run --rm -T backup-tools /usr/local/bin/backup-once.sh)"
[ "$backup_result" = BACKUP_VERIFIED ] || {
  echo "Backup drill did not produce the verified-success contract." >&2
  exit 1
}
artifact="$(compose run --rm -T backup-tools -c \
  'find /backups -maxdepth 1 -type f -name "lospor-*.dump" -print | sort | tail -n 1')"
case "$artifact" in /backups/lospor-*.dump) ;; *) echo "Backup drill produced no safe dump path." >&2; exit 1 ;; esac

# Build a deliberately corrupted pair. The sidecar still has the genuine
# digest, but names the corrupted copy, so the production restore entrypoint
# must reject it before dropdb can run.
compose run --rm -T -e DRILL_ARTIFACT="$artifact" backup-tools -c '
  set -eu
  original_name="${DRILL_ARTIFACT##*/}"
  corrupt=/backups/lospor-corrupt.dump
  cp "$DRILL_ARTIFACT" "$corrupt"
  printf tampered >> "$corrupt"
  sed "s/  $original_name$/  lospor-corrupt.dump/" \
    "${DRILL_ARTIFACT}.sha256" > "${corrupt}.sha256"
'
compose exec -T postgres psql --username lospor --dbname lospor --set ON_ERROR_STOP=1 \
  --command="UPDATE release_restore_drill SET value = 'mutated' WHERE id = 1;"
if compose run --rm -T -e LOSPOR_RESTORE_CONFIRM=RESTORE backup-tools \
    /usr/local/bin/restore.sh /backups/lospor-corrupt.dump; then
  echo "Restore drill accepted a checksum-invalid backup." >&2
  exit 1
fi
mutated="$(compose exec -T postgres psql --username lospor --dbname lospor --tuples-only --no-align \
  --command='SELECT value FROM release_restore_drill WHERE id = 1;')"
[ "$mutated" = mutated ] || {
  echo "Checksum rejection altered the disposable database." >&2
  exit 1
}

compose exec -T postgres psql --username lospor --dbname lospor --set ON_ERROR_STOP=1 \
  --command='DROP TABLE release_restore_drill;'
compose run --rm -T -e LOSPOR_RESTORE_CONFIRM=RESTORE backup-tools \
  /usr/local/bin/restore.sh "$artifact"
restored="$(compose exec -T postgres psql --username lospor --dbname lospor --tuples-only --no-align \
  --command='SELECT value FROM release_restore_drill WHERE id = 1;')"
[ "$restored" = original ] || {
  echo "Restored database did not contain the original sentinel." >&2
  exit 1
}

echo "Disposable backup, checksum rejection, destructive mutation and restore drill passed."
