#!/bin/sh
set -eu

# Exercises the exact image that performs production database migrations. The
# test owns its network, container and databases; it never connects to a local
# appliance or a production database.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"

# Git Bash otherwise rewrites container paths such as /bin/sh into Windows
# host paths before invoking Docker.
MSYS_NO_PATHCONV=1
export MSYS_NO_PATHCONV

command -v docker >/dev/null 2>&1 || {
  echo "Docker is required for the migrator image gate." >&2
  exit 1
}

suffix="$$"
network="lospor-migrator-test-${suffix}"
postgres_container="lospor-migrator-postgres-${suffix}"
migrator_image="${MIGRATOR_IMAGE:-lospor-hospital-migrator-test:${suffix}}"
migrator_image_owned=0
[ -n "${MIGRATOR_IMAGE:-}" ] || migrator_image_owned=1
postgres_image="${POSTGRES_IMAGE:-postgres:17.6-bookworm}"
node_base_image="${NODE_API_BASE_IMAGE:-node:24-bookworm-slim}"
password="migrator-test-only-${suffix}"
build_log="${TMPDIR:-/tmp}/lospor-migrator-build-${suffix}.log"
probe_log="${TMPDIR:-/tmp}/lospor-migrator-probe-${suffix}.log"

cleanup() {
  docker rm -f "$postgres_container" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  if [ "$migrator_image_owned" -eq 1 ]; then
    docker image rm "$migrator_image" >/dev/null 2>&1 || true
  fi
  rm -f "$build_log" "$probe_log"
}
trap cleanup EXIT HUP INT TERM

if [ "$migrator_image_owned" -eq 1 ]; then
  echo "Building the production migrator target ..."
  if docker build --progress=plain \
    --build-arg "NODE_API_BASE_IMAGE=${node_base_image}" \
    --target migrator \
    --tag "$migrator_image" \
    --file infra/docker/api.Dockerfile . >"$build_log" 2>&1; then
    cat "$build_log"
  else
    cat "$build_log" >&2
    exit 1
  fi

  if grep -Eiq 'failed to detect.*openssl|defaulting to.*openssl' "$build_log"; then
    echo "Prisma used an OpenSSL fallback while building the migrator." >&2
    exit 1
  fi
else
  platform="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$migrator_image" 2>/dev/null || true)"
  if [ "$platform" != "linux/amd64" ]; then
    echo "MIGRATOR_IMAGE must already exist locally as linux/amd64; got '${platform:-missing}'." >&2
    exit 1
  fi
  echo "Testing prebuilt migrator image ${migrator_image} (${platform}) ..."
fi

if docker run --rm --entrypoint /bin/sh \
    -e DATABASE_URL=postgresql://probe:probe@127.0.0.1:5432/probe \
    -e DIRECT_URL=postgresql://probe:probe@127.0.0.1:5432/probe \
    "$migrator_image" -ec '
      openssl version
      npx prisma generate
      npx prisma validate
    ' >"$probe_log" 2>&1; then
  cat "$probe_log"
else
  cat "$probe_log" >&2
  exit 1
fi
if grep -Eiq 'failed to detect.*openssl|defaulting to.*openssl' "$probe_log"; then
  echo "Prisma used an OpenSSL fallback inside the migrator image." >&2
  exit 1
fi

docker network create "$network" >/dev/null
docker run -d --name "$postgres_container" --network "$network" \
  -e POSTGRES_DB=lospor_fresh \
  -e POSTGRES_USER=lospor \
  -e "POSTGRES_PASSWORD=${password}" \
  "$postgres_image" >/dev/null

attempt=0
until docker exec "$postgres_container" pg_isready -U lospor -d lospor_fresh >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "Disposable PostgreSQL did not become ready." >&2
    docker logs "$postgres_container" >&2 || true
    exit 1
  fi
  sleep 1
done

database_url() {
  printf 'postgresql://lospor:%s@%s:5432/%s' "$password" "$postgres_container" "$1"
}

run_migrator() {
  database="$1"
  url="$(database_url "$database")"
  docker run --rm --network "$network" \
    -e "DATABASE_URL=${url}" -e "DIRECT_URL=${url}" \
    "$migrator_image"
}

echo "Applying every migration to a fresh database ..."
run_migrator lospor_fresh
run_migrator lospor_fresh

expected_migrations="$(find apps/api/prisma/migrations -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d '[:space:]')"
actual_migrations="$(docker exec "$postgres_container" psql -U lospor -d lospor_fresh -tAc \
  'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')"
test "$actual_migrations" = "$expected_migrations" || {
  echo "Expected ${expected_migrations} applied migrations; found ${actual_migrations}." >&2
  exit 1
}

echo "Creating a populated database at the pre-operator-migration boundary ..."
docker exec "$postgres_container" createdb -U lospor -T lospor_fresh lospor_upgrade
docker exec -i "$postgres_container" psql -v ON_ERROR_STOP=1 -U lospor -d lospor_upgrade <<'SQL'
ALTER TABLE "HospitalInstallation"
  DROP CONSTRAINT "HospitalInstallation_applianceOperatorUserId_fkey";
DROP INDEX "HospitalInstallation_applianceOperatorUserId_key";
ALTER TABLE "HospitalInstallation"
  DROP COLUMN "applianceOperatorUserId",
  DROP COLUMN "operatorCredentialGeneration";
DELETE FROM "_prisma_migrations"
  WHERE migration_name = '20260812160000_appliance_operator_status';

INSERT INTO "Institution" ("id", "name", "city", "country")
VALUES ('fixture-institution', 'Synthetic Hospital', 'Test City', 'Bulgaria');

INSERT INTO "User" (
  "id", "email", "name", "firstName", "lastName", "passwordHash", "role",
  "institutionId", "approvedAt", "emailVerifiedAt", "createdAt"
) VALUES (
  'fixture-operator', 'fixture-operator@example.invalid', 'Synthetic Operator',
  'Synthetic', 'Operator', '$2b$12$synthetic.not.a.real.credential', 'ADMIN',
  'fixture-institution', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "Case" (
  "id", "caseCode", "notes", "userId", "institutionId", "status",
  "clinicalRevision", "eventRevision", "relationalRevision", "createdAt", "updatedAt"
) VALUES (
  'fixture-case', 'FIXTURE-1', 'Non-clinical migration sentinel',
  'fixture-operator', 'fixture-institution', 'DRAFT', 3, 2, 1,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "AuditLog" ("id", "userId", "action", "entityId", "detail", "createdAt")
VALUES (
  'fixture-audit', 'fixture-operator', 'MIGRATION_FIXTURE', 'fixture-case',
  '{"synthetic":true}'::jsonb, CURRENT_TIMESTAMP
);

INSERT INTO "ResearchExport" (
  "id", "ownerId", "institutionId", "name", "format", "status",
  "definition", "attemptCount", "createdAt"
) VALUES (
  'fixture-export', 'fixture-operator', 'fixture-institution',
  'Synthetic export', 'csv', 'PENDING', '{"synthetic":true}'::jsonb, 0,
  CURRENT_TIMESTAMP
);

INSERT INTO "HospitalInstallation" (
  "id", "institutionId", "centralEnabled", "nextSequence", "createdAt", "updatedAt"
) VALUES (
  'local', 'fixture-institution', false, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
SQL

run_migrator lospor_upgrade

fixture_result="$(docker exec -i "$postgres_container" psql -U lospor -d lospor_upgrade -tA <<'SQL'
SELECT concat_ws(':',
  (SELECT count(*) FROM "User" WHERE id = 'fixture-operator'),
  (SELECT count(*) FROM "Case" WHERE id = 'fixture-case' AND "clinicalRevision" = 3),
  (SELECT count(*) FROM "AuditLog" WHERE id = 'fixture-audit'),
  (SELECT count(*) FROM "ResearchExport" WHERE id = 'fixture-export' AND status = 'PENDING'),
  (SELECT "nextSequence" FROM "HospitalInstallation" WHERE id = 'local'),
  (SELECT "operatorCredentialGeneration" FROM "HospitalInstallation" WHERE id = 'local'),
  (SELECT CASE WHEN "applianceOperatorUserId" IS NULL THEN 1 ELSE 0 END
     FROM "HospitalInstallation" WHERE id = 'local')
);
SQL
)"
test "$fixture_result" = "1:1:1:1:7:0:1" || {
  echo "Populated migration fixture was not preserved: ${fixture_result}" >&2
  exit 1
}

# Once initialized, later idempotent deploys must preserve the protected
# operator identity and its monotonic credential generation.
docker exec -i "$postgres_container" psql -v ON_ERROR_STOP=1 -U lospor -d lospor_upgrade >/dev/null <<'SQL'
UPDATE "HospitalInstallation"
SET "applianceOperatorUserId" = 'fixture-operator',
    "operatorCredentialGeneration" = 7
WHERE id = 'local';
SQL
run_migrator lospor_upgrade
operator_result="$(docker exec -i "$postgres_container" psql -U lospor -d lospor_upgrade -tA <<'SQL'
SELECT "applianceOperatorUserId" || ':' || "operatorCredentialGeneration"
FROM "HospitalInstallation"
WHERE id = 'local';
SQL
)"
test "$operator_result" = "fixture-operator:7" || {
  echo "Operator credential state changed during idempotent migration: ${operator_result}" >&2
  exit 1
}

echo "Migrator image gate passed: OpenSSL, fresh deploy, idempotency and populated upgrade preservation."
