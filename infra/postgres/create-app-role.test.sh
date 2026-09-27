#!/bin/sh
# create-app-role.sh against a real PostgreSQL (coverage review 1.4.13).
#
# The running API connects as lospor_app, and this script is all that decides
# what that role may do. So the checks are made as lospor_app, on a throwaway
# cluster with password authentication: it can read and write the
# application's rows and nothing else, it keeps that after a migration adds a
# table, it cannot touch the migration history, and its password is never on a
# command line or in any output.
#
# Needs the PostgreSQL server binaries: $PG_BIN, or those on PATH, or the
# Ubuntu layout (/usr/lib/postgresql/<n>/bin). Without them this FAILS -- a
# check that skips itself where it is needed is not a check.
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
script="$root/infra/postgres/create-app-role.sh"
failures=0
pass() { printf 'PASS  %s\n' "$1"; }
fail() { failures=$((failures + 1)); printf 'FAIL  %s\n' "$1" >&2; }

bin="${PG_BIN:-}"
if [ -z "$bin" ] && command -v initdb >/dev/null 2>&1; then bin="$(dirname "$(command -v initdb)")"; fi
if [ -z "$bin" ]; then
  for candidate in /usr/lib/postgresql/*/bin; do [ -x "$candidate/initdb" ] && bin="$candidate"; done
fi
[ -n "$bin" ] && [ -x "$bin/initdb" ] || [ -x "$bin/initdb.exe" ] || {
  echo "FAIL  PostgreSQL server binaries not found (set PG_BIN)" >&2
  exit 1
}

work="$(mktemp -d)"
port=$((20000 + $$ % 20000))
superpass=super-fixture-password
stop() { "$bin/pg_ctl" -D "$work/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf -- "$work"; }
trap stop EXIT HUP INT TERM

printf '%s\n' "$superpass" > "$work/pw"
"$bin/initdb" -D "$work/data" -U lospor --pwfile="$work/pw" -A scram-sha-256 -E UTF8 --no-locale >/dev/null
"$bin/pg_ctl" -D "$work/data" -o "-p $port -c listen_addresses=127.0.0.1" -l "$work/log" -w start >/dev/null

export PGHOST=127.0.0.1 PGPORT="$port" PGPASSWORD="$superpass" PGCLIENTENCODING=UTF8
as_owner() { "$bin/psql" -X -q -t -A -U lospor -v ON_ERROR_STOP=1 "$@"; }
as_app() { PGPASSWORD="$1" "$bin/psql" -X -q -t -A -U lospor_app -d lospor -v ON_ERROR_STOP=1 -c "$2" 2>&1 || true; }

as_owner -d postgres -c "CREATE DATABASE lospor" >/dev/null
as_owner -d lospor >/dev/null <<'SQL'
CREATE TABLE public."Case" (id serial PRIMARY KEY, note text);
CREATE FUNCTION public.case_count() RETURNS bigint LANGUAGE sql AS 'SELECT count(*) FROM public."Case"';
-- Locked down the way a hardening migration would: only an explicit grant
-- lets the API call it.
REVOKE EXECUTE ON FUNCTION public.case_count() FROM PUBLIC;
CREATE SCHEMA terminology;
CREATE TABLE terminology.concept (id int PRIMARY KEY);
CREATE TABLE public._prisma_migrations (id text PRIMARY KEY, migration_name text);
INSERT INTO public._prisma_migrations VALUES ('1', 'init');
SQL

# The script as Compose runs it, but dialling the test cluster. The wrapper
# also keeps every argument psql was given, to prove no secret was among them.
mkdir -p "$work/bin"
cat > "$work/bin/psql" <<STUB
#!/bin/sh
printf '%s\n' "\$@" >> "$work/argv"
args=""
for arg in "\$@"; do
  [ "\$arg" = "--host=postgres" ] && arg="--host=127.0.0.1"
  set -- "\$@" "\$arg"; shift
done
exec "$bin/psql" "\$@"
STUB
chmod +x "$work/bin/psql"
run_script() {
  PATH="$work/bin:$PATH" POSTGRES_USER=lospor POSTGRES_DB=lospor HOSPITAL_POSTGRES_APP_PASSWORD="$1" \
    sh "$script" > "$work/out" 2>&1
}

password=$(printf 'a%.0s' $(seq 1 64))
second=$(printf 'b%.0s' $(seq 1 64))

# 1. Secrets it must refuse, before anything reaches the database.
for bad in "" short "$(printf 'A%.0s' $(seq 1 64))" "$(printf 'g%.0s' $(seq 1 64))" "${password}0"; do
  : > "$work/argv"
  if run_script "$bad"; then fail "accepted an invalid secret of length ${#bad}"
  elif [ -s "$work/argv" ]; then fail "called psql with an invalid secret"
  else pass "refuses an invalid secret (length ${#bad}) before psql"; fi
done

# 2. A valid secret configures the role; nothing secret is in argv or output.
: > "$work/argv"
if run_script "$password"; then pass "configures the role"; else fail "valid run failed: $(cat "$work/out")"; fi
if grep -q "$password" "$work/argv" "$work/out"; then fail "the password appeared in argv or output"; else pass "the password is never in argv or output"; fi

# 3. What the role is: a plain login, limited connections.
attrs="$(as_owner -d lospor -c "SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolconnlimit FROM pg_roles WHERE rolname = 'lospor_app'")"
[ "$attrs" = "f|f|f|f|f|80" ] && pass "lospor_app is a plain role with 80 connections" || fail "role attributes are $attrs"

# 4. What it can do: the application's rows, in every schema the migrations own.
out="$(as_app "$password" "INSERT INTO public.\"Case\" (note) VALUES ('x'); UPDATE public.\"Case\" SET note = 'y'; SELECT public.case_count(); SELECT count(*) FROM terminology.concept; DELETE FROM public.\"Case\";")"
printf '%s' "$out" | grep -q ERROR && fail "row access refused: $out" || pass "reads and writes rows, sequences and functions in every owned schema"

# 5. What it cannot: change the schema, write the migration history, reach other databases.
out="$(as_app "$password" 'CREATE TABLE public.intruder (id int)')"
printf '%s' "$out" | grep -q "permission denied" && pass "cannot create tables" || fail "created a table: $out"
out="$(as_app "$password" 'DROP TABLE public."Case"')"
printf '%s' "$out" | grep -q "must be owner" && pass "cannot drop tables" || fail "dropped a table: $out"
out="$(as_app "$password" 'SELECT count(*) FROM public._prisma_migrations')"
[ "$out" = 1 ] && pass "reads the migration history" || fail "cannot read the migration history: $out"
out="$(as_app "$password" "INSERT INTO public._prisma_migrations VALUES ('2', 'forged')")"
printf '%s' "$out" | grep -q "permission denied" && pass "cannot write the migration history" || fail "wrote the migration history: $out"
out="$(PGPASSWORD="$password" "$bin/psql" -X -q -t -A -U lospor_app -d postgres -c 'SELECT 1' 2>&1 || true)"
printf '%s' "$out" | grep -q "permission denied" && pass "cannot connect to the maintenance database" || fail "connected to postgres: $out"

# 6. A table a later migration adds is the API's without anyone re-granting.
as_owner -d lospor -c 'CREATE TABLE public."Later" (id int)' >/dev/null
out="$(as_app "$password" 'INSERT INTO public."Later" VALUES (1)')"
printf '%s' "$out" | grep -q ERROR && fail "a new table was not granted: $out" || pass "a table added later is writable"

# 7. Every start re-applies it: a rotated secret replaces the old one.
if run_script "$second"; then pass "runs again on an existing role"; else fail "second run failed: $(cat "$work/out")"; fi
out="$(as_app "$second" 'SELECT 1')"
[ "$out" = 1 ] && pass "the new secret logs in" || fail "the new secret did not log in: $out"
out="$(as_app "$password" 'SELECT 1' || true)"
printf '%s' "$out" | grep -q "password authentication failed" && pass "the old secret no longer logs in" || fail "the old secret still logs in: $out"

if [ "$failures" -gt 0 ]; then
  echo "$failures create-app-role check(s) failed" >&2
  exit 1
fi
echo "create-app-role: ok"
