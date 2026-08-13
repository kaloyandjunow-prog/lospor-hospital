#!/bin/sh
set -eu

password_file="${STATUS_POSTGRES_PROBE_PASSWORD_FILE:-/run/secrets/status-db-probe-password}"
test -s "$password_file" || {
  echo "Status database probe secret is missing." >&2
  exit 1
}
probe_password="$(tr -d '\r\n' < "$password_file")"
test "${#probe_password}" -eq 64 || {
  echo "Status database probe secret is invalid." >&2
  exit 1
}
case "$probe_password" in
  *[!0-9a-f]*)
    echo "Status database probe secret is invalid." >&2
    exit 1
    ;;
esac

# The generated password is validated as exactly 64 lowercase hexadecimal
# characters, then delivered through psql stdin. It never appears in argv,
# Compose configuration or output. This role can run SELECT 1 but receives no
# privileges on any clinical table.
psql \
  --host=postgres \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 <<SQL
DO \$block\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lospor_status_probe') THEN
    CREATE ROLE lospor_status_probe LOGIN;
  END IF;
END
\$block\$;
ALTER ROLE lospor_status_probe PASSWORD '$probe_password';
ALTER ROLE lospor_status_probe CONNECTION LIMIT 4;
ALTER ROLE lospor_status_probe SET default_transaction_read_only = on;
GRANT CONNECT ON DATABASE lospor TO lospor_status_probe;
REVOKE ALL ON SCHEMA public FROM lospor_status_probe;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM lospor_status_probe;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM lospor_status_probe;
SQL

unset probe_password
echo "Restricted Status database probe is configured."
