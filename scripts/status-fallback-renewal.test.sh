#!/bin/sh
set -eu

source_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
work="$(mktemp -d)"
cleanup() { rm -rf -- "$work"; }
trap cleanup EXIT HUP INT TERM

fixture="$work/release"
mock_bin="$work/bin"
mkdir -p "$fixture/scripts" "$fixture/secrets/status" "$fixture/.data" "$mock_bin"
cp "$source_root/scripts/ensure-status-secrets.sh" "$fixture/scripts/"
cp "$source_root/scripts/renew-status-fallback-certificate.sh" "$fixture/scripts/"
cp "$source_root/scripts/operator-locale.sh" "$fixture/scripts/"

docker_log="$work/docker.log"
flock_log="$work/flock.log"
cat > "$mock_bin/docker" <<'MOCK'
#!/bin/sh
printf '%s\n' "$*" >> "${MOCK_DOCKER_LOG:?}"
[ "$*" = "compose restart status" ]
MOCK
chmod +x "$mock_bin/docker"
cat > "$mock_bin/flock" <<'MOCK'
#!/bin/sh
printf '%s\n' "$*" >> "${MOCK_FLOCK_LOG:?}"
exit "${MOCK_FLOCK_EXIT:-0}"
MOCK
chmod +x "$mock_bin/flock"

(cd "$fixture" && sh scripts/ensure-status-secrets.sh >/dev/null)
certificate="$fixture/secrets/status/fallback-cert.pem"
marker="$fixture/.data/status-fallback-certificate.reload-required"
io_lock="$fixture/.data/io-mutation.lock"
: > "$io_lock"
[ -s "$marker" ]
rm -f "$fixture/secrets/status/snapshot-token"
PATH="$mock_bin:$PATH" MOCK_DOCKER_LOG="$docker_log" MOCK_FLOCK_LOG="$flock_log" \
  STATUS_FALLBACK_CERTIFICATE_TEST_ONLY=1 \
  STATUS_FALLBACK_CERTIFICATE_TEST_IO_LOCK_FILE="$io_lock" \
  STATUS_FALLBACK_CERTIFICATE_TEST_LIVE_CERT_FILE="$certificate" \
  sh "$fixture/scripts/renew-status-fallback-certificate.sh" >/dev/null
[ ! -e "$marker" ]
[ ! -e "$fixture/secrets/status/snapshot-token" ]
[ "$(grep -Fxc 'compose restart status' "$docker_log")" = 1 ]
[ "$(grep -Fxc -- '-w 60 8' "$flock_log")" = 1 ]
printf 'ok 1 - certificate-only maintenance reloads and acknowledges without regenerating unrelated secrets\n'

PATH="$mock_bin:$PATH" MOCK_DOCKER_LOG="$docker_log" MOCK_FLOCK_LOG="$flock_log" \
  STATUS_FALLBACK_CERTIFICATE_TEST_ONLY=1 \
  STATUS_FALLBACK_CERTIFICATE_TEST_IO_LOCK_FILE="$io_lock" \
  STATUS_FALLBACK_CERTIFICATE_TEST_LIVE_CERT_FILE="$certificate" \
  sh "$fixture/scripts/renew-status-fallback-certificate.sh" >/dev/null
[ "$(grep -Fxc 'compose restart status' "$docker_log")" = 1 ]
printf 'ok 2 - a current certificate without a reload marker does not restart Status\n'

printf '1\n' > "$marker"
if PATH="$mock_bin:$PATH" MOCK_DOCKER_LOG="$docker_log" MOCK_FLOCK_LOG="$flock_log" \
    MOCK_FLOCK_EXIT=1 STATUS_FALLBACK_CERTIFICATE_TEST_ONLY=1 \
    STATUS_FALLBACK_CERTIFICATE_TEST_IO_LOCK_FILE="$io_lock" \
    STATUS_FALLBACK_CERTIFICATE_TEST_LIVE_CERT_FILE="$certificate" \
    sh "$fixture/scripts/renew-status-fallback-certificate.sh" >/dev/null 2>&1; then
  echo 'busy maintenance lock unexpectedly passed' >&2
  exit 1
fi
[ "$(cat "$marker")" = 1 ]
printf 'ok 3 - backup or update contention defers restart and preserves the marker\n'

other_config="$work/other.cnf"
printf '%s\n' \
  '[req]' 'distinguished_name = dn' 'x509_extensions = extensions' 'prompt = no' \
  '[dn]' 'CN = localhost' \
  '[extensions]' 'subjectAltName = DNS:localhost,IP:127.0.0.1' > "$other_config"
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -config "$other_config" \
  -keyout "$work/other-key.pem" -out "$work/other-cert.pem" >/dev/null 2>&1
if PATH="$mock_bin:$PATH" MOCK_DOCKER_LOG="$docker_log" MOCK_FLOCK_LOG="$flock_log" \
  STATUS_FALLBACK_CERTIFICATE_TEST_ONLY=1 \
  STATUS_FALLBACK_CERTIFICATE_TEST_IO_LOCK_FILE="$io_lock" \
  STATUS_FALLBACK_CERTIFICATE_TEST_LIVE_CERT_FILE="$work/other-cert.pem" \
  sh "$fixture/scripts/renew-status-fallback-certificate.sh" >/dev/null 2>&1; then
  echo 'mismatched live certificate unexpectedly passed' >&2
  exit 1
fi
[ "$(cat "$marker")" = 1 ]
printf 'ok 4 - a listener serving the wrong certificate keeps the durable reload marker\n'

if (cd "$fixture" && STATUS_SECRET_MAINTENANCE_MODE=unknown \
    sh scripts/ensure-status-secrets.sh >/dev/null 2>&1); then
  echo 'unknown Status secret maintenance mode unexpectedly passed' >&2
  exit 1
fi
printf 'ok 5 - certificate maintenance accepts only the fixed narrow mode\n'

service="$source_root/infra/systemd/lospor-status-fallback-certificate.service"
timer="$source_root/infra/systemd/lospor-status-fallback-certificate.timer"
grep -Fxq 'Type=oneshot' "$service"
grep -Fxq 'ProtectSystem=strict' "$service"
grep -Fxq 'ReadWritePaths=/opt/lospor-hospital/secrets/status /opt/lospor-hospital/.data/runtime /opt/lospor-hospital/.data/io-mutation.lock' "$service"
grep -Fxq 'OnUnitActiveSec=12h' "$timer"
grep -Fxq 'Persistent=true' "$timer"
grep -Fq 'lospor-status-fallback-certificate.timer' "$source_root/scripts/install-host-observability.sh"
printf 'ok 6 - the twice-daily renewal unit is hardened, persistent, and installed with monitoring\n'

grep -Fq 'sh scripts/renew-status-fallback-certificate.sh' "$source_root/scripts/update.sh"
grep -Fq 'sh scripts/renew-status-fallback-certificate.sh' "$source_root/scripts/appliance-operator.sh"
lock_line="$(grep -n 'update_io_lock_acquire database-update' "$source_root/scripts/update.sh" | cut -d: -f1)"
reuse_line="$(grep -n 'export STATUS_FALLBACK_CERTIFICATE_IO_LOCK_HELD=1' "$source_root/scripts/update.sh" | cut -d: -f1)"
[ -n "$lock_line" ] && [ -n "$reuse_line" ] && [ "$reuse_line" -gt "$lock_line" ]
printf 'ok 7 - update and ordinary operator maintenance prove reload without racing the shared lock\n'

echo 'Status fallback renewal tests passed (7)'
