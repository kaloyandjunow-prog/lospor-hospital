#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
phase="${1:-}"

case "$phase" in
  preflight)
    sql="$root/infra/postgres/pre-migration-security.sql"
    description="pre-migration security"
    ;;
  postflight)
    sql="$root/infra/postgres/post-migration-gin-statistics.sql"
    description="post-migration GIN statistics"
    ;;
  *)
    echo "Usage: sh scripts/postgres-update-gate.sh <preflight|postflight>" >&2
    exit 2
    ;;
esac

test -s "$sql" || {
  echo "PostgreSQL ${description} gate is missing." >&2
  exit 1
}

ready_attempts="${LOSPOR_POSTGRES_GATE_READY_ATTEMPTS:-60}"
ready_interval="${LOSPOR_POSTGRES_GATE_READY_INTERVAL_SECONDS:-2}"

case "$ready_attempts" in
  ''|*[!0-9]*)
    echo "LOSPOR_POSTGRES_GATE_READY_ATTEMPTS must be an integer from 1 to 120." >&2
    exit 2
    ;;
esac
case "$ready_interval" in
  ''|*[!0-9]*)
    echo "LOSPOR_POSTGRES_GATE_READY_INTERVAL_SECONDS must be an integer from 0 to 10." >&2
    exit 2
    ;;
esac
[ "$ready_attempts" -ge 1 ] && [ "$ready_attempts" -le 120 ] || {
  echo "LOSPOR_POSTGRES_GATE_READY_ATTEMPTS must be an integer from 1 to 120." >&2
  exit 2
}
[ "$ready_interval" -le 10 ] || {
  echo "LOSPOR_POSTGRES_GATE_READY_INTERVAL_SECONDS must be an integer from 0 to 10." >&2
  exit 2
}

attempt=1
while :; do
  # The official image's entrypoint briefly runs an initialization server on
  # the Unix socket only. Requiring the final TCP listener prevents that
  # temporary server from being mistaken for production readiness; SELECT 1
  # then proves the configured user and database can execute a real query.
  if docker compose exec -T postgres \
      pg_isready --quiet --host=127.0.0.1 \
        --username=lospor --dbname=lospor >/dev/null 2>&1; then
    readiness_query="$(docker compose exec -T postgres \
      psql --username=lospor --dbname=lospor --tuples-only --no-align \
        --command='SELECT 1' 2>/dev/null || true)"
    [ "$readiness_query" = 1 ] && break
  fi
  if [ "$attempt" -ge "$ready_attempts" ]; then
    echo "PostgreSQL did not become ready for the ${description} gate after ${ready_attempts} attempts." >&2
    exit 1
  fi
  sleep "$ready_interval"
  attempt=$((attempt + 1))
done

docker compose exec -T postgres \
  psql --username=lospor --dbname=lospor --set=ON_ERROR_STOP=1 \
  < "$sql"

echo "PostgreSQL ${description} gate passed."
