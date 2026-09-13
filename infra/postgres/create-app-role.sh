#!/bin/sh
set -eu

# The clinical API's own database role.
#
# Until 1.4.0 the API connected as `lospor`, the superuser the official image
# creates: every request could have altered the schema, read any database on
# the server, or dropped it. Migrations, backups, restores and terminology
# builds still use `lospor`; the running API uses `lospor_app`, which can read
# and write the application's rows and nothing else.
#
# This runs before the API every time Compose starts it, after migrations. That
# is what keeps the grants true after a migration adds tables, after a restore
# replaces the database, and after a terminology generation is swapped in: all
# of them start the API through Compose.

app_password="${HOSPITAL_POSTGRES_APP_PASSWORD:-}"
test "${#app_password}" -eq 64 || {
  echo "The API database role secret is missing or invalid." >&2
  exit 1
}
case "$app_password" in
  *[!0-9a-f]*)
    echo "The API database role secret is missing or invalid." >&2
    exit 1
    ;;
esac

# The password is validated as exactly 64 lowercase hexadecimal characters and
# delivered on psql's stdin, never in argv or output.
psql \
  --host=postgres \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --no-psqlrc \
  --set=ON_ERROR_STOP=1 <<SQL
DO \$block\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lospor_app') THEN
    CREATE ROLE lospor_app LOGIN;
  END IF;
END
\$block\$;
ALTER ROLE lospor_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 80 PASSWORD '$app_password';

GRANT CONNECT, TEMPORARY ON DATABASE lospor TO lospor_app;
-- The maintenance databases hold nothing the API needs; only the owning role
-- (a superuser) connects to them.
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;

-- Every schema the migrations own, today and after a later migration adds one.
DO \$block\$
DECLARE
  target_schema text;
BEGIN
  FOR target_schema IN
    SELECT nspname FROM pg_namespace
    WHERE nspname = 'public'
       OR (nspowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
           AND nspname NOT LIKE 'pg\_%' AND nspname <> 'information_schema')
  LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO lospor_app', target_schema);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO lospor_app', target_schema);
    EXECUTE format('GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA %I TO lospor_app', target_schema);
    EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA %I TO lospor_app', target_schema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lospor_app', current_user, target_schema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO lospor_app', current_user, target_schema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT EXECUTE ON FUNCTIONS TO lospor_app', current_user, target_schema);
  END LOOP;
END
\$block\$;

-- The migration history is the migrator's: the API may read it, never write it.
DO \$block\$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public._prisma_migrations FROM lospor_app;
  END IF;
END
\$block\$;
SQL

unset app_password
echo "The API database role is configured."
