#!/bin/sh
set -eu

# Exercise the production backup and non-disruptive restore scripts against a
# database and volumes that exist only for this drill. The live fixture database
# is deliberately never dropped or renamed; the restored copy is temporary.
root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
cd "$root"
model="infra/postgres/backup-restore.drill.compose.yaml"
project="lospor-restore-drill-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-0}-$$"

# Keep the fast failure/concurrency/retention/wrapper contracts in the same CI
# entrypoint as the disposable real-PostgreSQL drill. The drill proves the
# happy path with production tools; these suites prove adverse paths that are
# unsafe or impractical to induce against a real database in CI.
sh infra/postgres/backup-hardening.test.sh
sh infra/postgres/backup-retention.test.sh
sh infra/postgres/restore-hardening.test.sh
sh scripts/restore-backup.test.sh

MSYS_NO_PATHCONV=1
export MSYS_NO_PATHCONV
case "$project" in *[!a-z0-9_-]*) echo "Unsafe disposable Compose project name: $project" >&2; exit 1 ;; esac

compose() { docker compose --project-name "$project" --file "$model" "$@"; }
cleanup() { compose down --volumes --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

compose config --quiet
compose up -d --wait postgres
compose run --rm -T backup-tools -c 'umask 077; : > /locks/io-mutation.lock'

compose exec -T postgres psql --username lospor --dbname lospor --set ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE release_restore_drill (
  id integer PRIMARY KEY,
  value text NOT NULL
);
INSERT INTO release_restore_drill (id, value) VALUES (1, 'original');
CREATE TABLE "_prisma_migrations" (
  migration_name text PRIMARY KEY,
  checksum text NOT NULL,
  finished_at timestamptz,
  rolled_back_at timestamptz
);
INSERT INTO "_prisma_migrations" (migration_name, checksum, finished_at)
VALUES ('restore_drill_fixture', 'fixture-checksum', now());
SQL

backup_result="$(compose run --rm -T backup-tools /usr/local/bin/backup-once.sh)"
[ "$backup_result" = BACKUP_VERIFIED ] || {
  echo "Backup drill did not produce the verified-success contract." >&2
  exit 1
}
artifact="$(compose run --rm -T backup-tools -c \
  'find /backups -mindepth 1 -maxdepth 1 -type d -name "lospor-*.backup" -print | sort | tail -n 1')"
case "$artifact" in /backups/lospor-*.backup) ;; *) echo "Backup drill produced no safe object path." >&2; exit 1 ;; esac

# A copied object with an altered dump retains the genuine authenticated
# manifest, so full preflight must reject it before any database is created.
corrupt=/backups/lospor-20260822T120000Z-corrupt1.backup
compose run --rm -T -e DRILL_ARTIFACT="$artifact" -e DRILL_CORRUPT="$corrupt" backup-tools -c '
  set -eu
  cp -R "$DRILL_ARTIFACT" "$DRILL_CORRUPT"
  printf tampered >> "$DRILL_CORRUPT/database.dump"
'
compose exec -T postgres psql --username lospor --dbname lospor --set ON_ERROR_STOP=1 \
  --command="UPDATE release_restore_drill SET value = 'mutated' WHERE id = 1;"
if compose run --rm -T backup-tools /usr/local/bin/restore.sh verify "$corrupt"; then
  echo "Restore drill accepted an integrity-invalid recovery object." >&2
  exit 1
fi
mutated="$(compose exec -T postgres psql --username lospor --dbname lospor --tuples-only --no-align \
  --command='SELECT value FROM release_restore_drill WHERE id = 1;')"
[ "$mutated" = mutated ] || {
  echo "Preflight rejection altered the live disposable database." >&2
  exit 1
}

preflight="$(compose run --rm -T backup-tools /usr/local/bin/restore.sh verify "$artifact")"
site_id="$(printf '%s\n' "$preflight" | sed -n 's/^RESTORE_SITE_ID=//p')"
completed_at="$(printf '%s\n' "$preflight" | sed -n 's/^RESTORE_COMPLETED_AT=//p')"
[ "$site_id" = site-restore-drill ] && [ -n "$completed_at" ] || {
  echo "Restore drill preflight returned incomplete safe metadata." >&2
  exit 1
}
temporary_database=lospor_restore_drill01
confirmation="TEMPORARY RESTORE $site_id $completed_at"
compose run --rm -T -e LOSPOR_RESTORE_CONFIRM="$confirmation" backup-tools \
  /usr/local/bin/restore.sh temporary "$artifact" "$temporary_database"
compose run --rm -T backup-tools \
  /usr/local/bin/restore.sh validate "$artifact" "$temporary_database"

restored="$(compose exec -T postgres psql --username lospor --dbname="$temporary_database" \
  --tuples-only --no-align --command='SELECT value FROM release_restore_drill WHERE id = 1;')"
still_live="$(compose exec -T postgres psql --username lospor --dbname=lospor \
  --tuples-only --no-align --command='SELECT value FROM release_restore_drill WHERE id = 1;')"
[ "$restored" = original ] && [ "$still_live" = mutated ] || {
  echo "Temporary restore did not isolate restored and live data." >&2
  exit 1
}

echo "Disposable authenticated backup, corrupt-object refusal, and isolated temporary restore drill passed."
