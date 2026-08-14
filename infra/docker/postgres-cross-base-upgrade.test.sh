#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd -P)"

# Prove that an existing Hospital PostgreSQL 17.6 Bookworm data directory can
# be opened in place by the hardened 17.11 Bookworm image. This deliberately
# exercises a glibc-backed locale and its btree index: switching the appliance
# to Alpine/musl would make this volume-level upgrade unsafe.

if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  echo "Usage: $0 <hardened-postgres-image>" >&2
  exit 2
fi

command -v docker >/dev/null 2>&1 || {
  echo "Docker is required for the PostgreSQL cross-base compatibility gate." >&2
  exit 1
}

MSYS_NO_PATHCONV=1
export MSYS_NO_PATHCONV

hardened_image="$1"
# This is the exact immutable manifest-list digest committed in the preceding
# release-inputs.json contract. On linux/amd64 it resolves to image config
# f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3.
legacy_image="${POSTGRES_LEGACY_IMAGE:-postgres:17.6-bookworm@sha256:45cd22f8d32e189d245403954882f88e7a8714301fda80dab6da90f1265b25a3}"
suffix="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-0}-$$"
legacy_container="lospor-postgres-legacy-${suffix}"
hardened_container="lospor-postgres-upgrade-${suffix}"
volume="lospor-postgres-upgrade-${suffix}"
database="lospor_upgrade"
username="lospor_upgrade"
password="not-a-production-secret"

cleanup() {
  docker rm -f "$legacy_container" "$hardened_container" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM

wait_for_postgres() {
  container="$1"
  wait_for_init_marker="${2:-0}"
  if [ "$wait_for_init_marker" = 1 ]; then
    attempt=0
    until docker logs "$container" 2>&1 \
      | grep -Fq 'PostgreSQL init process complete; ready for start up'; do
      attempt=$((attempt + 1))
      if [ "$attempt" -ge 60 ]; then
        docker logs "$container" >&2 || true
        echo "PostgreSQL container '$container' did not complete initialization." >&2
        exit 1
      fi
      sleep 1
    done
  fi
  attempt=0
  until docker exec "$container" pg_isready --username "$username" --dbname "$database" >/dev/null 2>&1 \
    && docker exec "$container" psql --username "$username" --dbname "$database" \
      --tuples-only --no-align --command 'SELECT 1' 2>/dev/null | grep -Fxq 1; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 60 ]; then
      docker logs "$container" >&2 || true
      echo "PostgreSQL container '$container' did not become ready." >&2
      exit 1
    fi
    sleep 1
  done
}

docker volume create "$volume" >/dev/null
docker run --detach --name "$legacy_container" \
  -e POSTGRES_DB="$database" \
  -e POSTGRES_USER="$username" \
  -e POSTGRES_PASSWORD="$password" \
  -e POSTGRES_INITDB_ARGS=--locale=en_US.utf8 \
  --volume "$volume:/var/lib/postgresql/data" \
  "$legacy_image" postgres -c archive_mode=off >/dev/null
wait_for_postgres "$legacy_container" 1

docker exec -i "$legacy_container" psql \
  --username "$username" --dbname "$database" --set ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE upgrade_probe (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label text NOT NULL UNIQUE,
  payload jsonb NOT NULL
);
INSERT INTO upgrade_probe(label, payload) VALUES
  ('alpha', '{"ordinal":1}'),
  ('Zulu', '{"ordinal":2}'),
  ('Ångström', '{"ordinal":3}'),
  ('äther', '{"ordinal":4}'),
  ('София', '{"ordinal":5}');
CREATE INDEX upgrade_probe_label_idx ON upgrade_probe(label);
CREATE EXTENSION pg_trgm;
CREATE TABLE gin_upgrade_probe (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label text NOT NULL
);
INSERT INTO gin_upgrade_probe(label) VALUES
  ('alpha'), ('beta'), ('gamma'), ('delta'), ('epsilon');
CREATE INDEX gin_upgrade_probe_label_idx
  ON gin_upgrade_probe USING GIN (label gin_trgm_ops);
VACUUM (ANALYZE) upgrade_probe;
ANALYZE gin_upgrade_probe;
SQL

legacy_order="$(docker exec "$legacy_container" psql \
  --username "$username" --dbname "$database" --tuples-only --no-align \
  --command "SELECT string_agg(label, '|' ORDER BY label) FROM upgrade_probe;")"
legacy_collation="$(docker exec "$legacy_container" psql \
  --username "$username" --dbname "$database" --tuples-only --no-align \
  --command "SELECT datcollate || ':' || datcollversion || ':' || pg_database_collation_actual_version(oid) FROM pg_database WHERE datname = current_database();")"

docker stop "$legacy_container" >/dev/null
docker rm "$legacy_container" >/dev/null

docker run --detach --name "$hardened_container" \
  -e POSTGRES_DB="$database" \
  -e POSTGRES_USER="$username" \
  -e POSTGRES_PASSWORD="$password" \
  --volume "$volume:/var/lib/postgresql/data" \
  "$hardened_image" postgres -c archive_mode=off -c wal_level=logical \
    -c output_plugin_libraries=pgoutput,untrusted_decoder >/dev/null
wait_for_postgres "$hardened_container" 0

hardened_order="$(docker exec "$hardened_container" psql \
  --username "$username" --dbname "$database" --tuples-only --no-align \
  --command "SELECT string_agg(label, '|' ORDER BY label) FROM upgrade_probe;")"
[ "$hardened_order" = "$legacy_order" ] || {
  echo "Collation order changed across the in-place upgrade." >&2
  echo "17.6: $legacy_order" >&2
  echo "17.11: $hardened_order" >&2
  exit 1
}

hardened_collation="$(docker exec "$hardened_container" psql \
  --username "$username" --dbname "$database" --tuples-only --no-align \
  --command "SELECT datcollate || ':' || datcollversion || ':' || pg_database_collation_actual_version(oid) FROM pg_database WHERE datname = current_database();")"
[ "$hardened_collation" = "$legacy_collation" ] || {
  echo "Database collation metadata changed across the in-place upgrade." >&2
  echo "17.6: $legacy_collation" >&2
  echo "17.11: $hardened_collation" >&2
  exit 1
}

row_semantics="$(docker exec "$hardened_container" psql \
  --username "$username" --dbname "$database" --tuples-only --no-align \
  --command "SELECT count(*) || ':' || sum((payload->>'ordinal')::integer) || ':' || count(*) FILTER (WHERE label = 'Ångström') FROM upgrade_probe;")"
[ "$row_semantics" = "5:15:1" ] || {
  echo "Unexpected preserved row semantics: $row_semantics" >&2
  exit 1
}

index_plan="$(docker exec "$hardened_container" psql \
  --username "$username" --dbname "$database" --tuples-only --no-align \
  --command "SET enable_seqscan=off; EXPLAIN (COSTS OFF) SELECT label FROM upgrade_probe ORDER BY label;")"
printf '%s\n' "$index_plan" | grep -Eq 'Index Only Scan using (upgrade_probe_label_idx|upgrade_probe_label_key)'

# The real post-update gate must reject a custom decoder allowlist before it
# touches statistics. Hospital does not use logical decoding.
if docker exec -i "$hardened_container" psql \
    --username "$username" --dbname "$database" --set ON_ERROR_STOP=1 \
    < "$root/infra/postgres/pre-migration-security.sql" >/dev/null 2>&1; then
  echo "Post-update gate accepted a custom logical-decoding plugin." >&2
  exit 1
fi

docker stop "$hardened_container" >/dev/null
docker rm "$hardened_container" >/dev/null
docker run --detach --name "$hardened_container" \
  -e POSTGRES_DB="$database" \
  -e POSTGRES_USER="$username" \
  -e POSTGRES_PASSWORD="$password" \
  --volume "$volume:/var/lib/postgresql/data" \
  "$hardened_image" postgres -c archive_mode=off -c wal_level=logical >/dev/null
wait_for_postgres "$hardened_container" 0

# Prove the exact PostgreSQL 17.11 remediation: a non-finite estimate is
# detected and repaired by the postflight's ANALYZE, then must satisfy the
# finite five-row postcondition.
docker exec "$hardened_container" psql \
  --username "$username" --dbname "$database" --set ON_ERROR_STOP=1 \
  --command "UPDATE pg_class SET reltuples = 'Infinity'::real WHERE oid = 'gin_upgrade_probe'::regclass;" \
  >/dev/null
docker exec -i "$hardened_container" psql \
  --username "$username" --dbname "$database" --set ON_ERROR_STOP=1 \
  < "$root/infra/postgres/post-migration-gin-statistics.sql" >/dev/null
gin_repaired="$(docker exec "$hardened_container" psql \
  --username "$username" --dbname "$database" --tuples-only --no-align \
  --command "SELECT reltuples::bigint FROM pg_class WHERE oid = 'gin_upgrade_probe'::regclass;")"
[ "$gin_repaired" = 5 ] || {
  echo "Post-update gate did not repair non-finite GIN-table statistics: $gin_repaired" >&2
  exit 1
}

docker exec "$hardened_container" psql \
  --username "$username" --dbname "$database" --set ON_ERROR_STOP=1 \
  --command "SELECT pg_create_logical_replication_slot('lospor_upgrade_gate', 'pgoutput');" \
  >/dev/null
if docker exec -i "$hardened_container" psql \
    --username "$username" --dbname "$database" --set ON_ERROR_STOP=1 \
    < "$root/infra/postgres/pre-migration-security.sql" >/dev/null 2>&1; then
  echo "Post-update gate accepted an existing logical-decoding slot." >&2
  exit 1
fi
docker exec "$hardened_container" psql \
  --username "$username" --dbname "$database" --set ON_ERROR_STOP=1 \
  --command "SELECT pg_drop_replication_slot('lospor_upgrade_gate');" >/dev/null

# Make the previously analyzed five-row estimate observably stale without
# crossing autovacuum's analyze threshold. The postflight must refresh it to
# ten; merely validating a finite pre-existing estimate is insufficient.
docker exec "$hardened_container" psql \
  --username "$username" --dbname "$database" --set ON_ERROR_STOP=1 \
  --command "INSERT INTO gin_upgrade_probe(label) VALUES ('zeta'), ('eta'), ('theta'), ('iota'), ('kappa');" \
  >/dev/null
docker exec -i "$hardened_container" psql \
  --username "$username" --dbname "$database" --set ON_ERROR_STOP=1 \
  < "$root/infra/postgres/pre-migration-security.sql" >/dev/null
docker exec -i "$hardened_container" psql \
  --username "$username" --dbname "$database" --set ON_ERROR_STOP=1 \
  < "$root/infra/postgres/post-migration-gin-statistics.sql" >/dev/null

gin_semantics="$(docker exec "$hardened_container" psql \
  --username "$username" --dbname "$database" --tuples-only --no-align \
  --command "SELECT count(*) || ':' || (SELECT reltuples::bigint FROM pg_class WHERE oid = 'gin_upgrade_probe'::regclass) FROM gin_upgrade_probe;")"
[ "$gin_semantics" = "10:10" ] || {
  echo "Unexpected GIN-table statistics after the post-update gate: $gin_semantics" >&2
  exit 1
}

logs="$(docker logs "$hardened_container" 2>&1)"
if printf '%s\n' "$logs" | grep -Eiq 'collation version mismatch|database .* has a collation version mismatch'; then
  printf '%s\n' "$logs" >&2
  echo "PostgreSQL reported a collation-version warning after the in-place upgrade." >&2
  exit 1
fi

echo "POSTGRES_CROSS_BASE_UPGRADE_OK"
