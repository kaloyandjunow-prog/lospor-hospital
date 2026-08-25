#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$root/scripts/update-pipeline-lib.sh"

home="${1:-/opt/lospor-hospital}"
destination="${2:-/etc/lospor-hospital/update-agent.env}"
case "$home" in /*) ;; *) echo "Appliance home must be absolute." >&2; exit 2 ;; esac
[ -f "$home/.env" ] || { echo "Appliance .env is missing." >&2; exit 1; }
source_env="$home/.env"
temporary="$destination.tmp.$$"
mkdir -p "$(dirname "$destination")"
umask 077
cleanup_update_environment() { rm -f "$temporary" 2>/dev/null || true; }
trap cleanup_update_environment EXIT HUP INT TERM

read_value() {
  key="$1"; default="$2"
  count="$(awk -F= -v key="$key" '$1 == key { count += 1 } END { print count + 0 }' "$source_env")"
  [ "$count" -le 1 ] || { echo "Duplicate update setting: $key" >&2; exit 1; }
  if [ "$count" -eq 1 ]; then
    awk -F= -v key="$key" '$1 == key { print substr($0, length(key) + 2) }' "$source_env"
  else
    printf '%s\n' "$default"
  fi
}

poll="$(read_value HOSPITAL_UPDATE_AGENT_POLL_SECONDS 15)"
interval="$(read_value HOSPITAL_UPDATE_CHECK_INTERVAL_SECONDS 86400)"
window_start="$(read_value HOSPITAL_UPDATE_WINDOW_START 20:00)"
window_end="$(read_value HOSPITAL_UPDATE_WINDOW_END 06:00)"
timezone="$(read_value HOSPITAL_UPDATE_TIMEZONE Europe/Sofia)"
max_age="$(read_value HOSPITAL_UPDATE_REQUEST_MAX_AGE_DAYS 7)"
image_upper="$(read_value HOSPITAL_UPDATE_IMAGE_UPPER_BOUND_BYTES 42949672960)"
docker_reserve="$(read_value HOSPITAL_UPDATE_DOCKER_RESERVE_BYTES 21474836480)"
data_reserve="$(read_value HOSPITAL_UPDATE_DATA_RESERVE_BYTES 10737418240)"
backup_reserve="$(read_value HOSPITAL_UPDATE_BACKUP_RESERVE_BYTES 10737418240)"

for value in "$poll" "$interval" "$max_age" "$image_upper" "$docker_reserve" "$data_reserve" "$backup_reserve"; do
  case "$value" in ''|*[!0-9]*) echo "Update agent numeric setting is invalid." >&2; exit 1 ;; esac
done
for value in "$window_start" "$window_end"; do
  printf '%s\n' "$value" | grep -Eq '^([01][0-9]|2[0-3]):[0-5][0-9]$' \
    || { echo "Update maintenance window is invalid." >&2; exit 1; }
done
printf '%s\n' "$timezone" | grep -Eq '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+)+$' \
  && [ -f "/usr/share/zoneinfo/$timezone" ] \
  || { echo "Update timezone is invalid or unavailable." >&2; exit 1; }
[ "$poll" -ge 5 ] && [ "$poll" -le 3600 ] \
  && [ "$interval" -ge 300 ] && [ "$interval" -le 2678400 ] \
  && [ "$max_age" -ge 1 ] && [ "$max_age" -le 30 ] \
  || { echo "Update agent interval or request age is outside policy." >&2; exit 1; }

{
  printf 'LOSPOR_APPLIANCE_HOME=%s\n' "$home"
  printf 'HOSPITAL_UPDATE_AGENT_POLL_SECONDS=%s\n' "$poll"
  printf 'HOSPITAL_UPDATE_CHECK_INTERVAL_SECONDS=%s\n' "$interval"
  printf 'HOSPITAL_UPDATE_WINDOW_START=%s\n' "$window_start"
  printf 'HOSPITAL_UPDATE_WINDOW_END=%s\n' "$window_end"
  printf 'HOSPITAL_UPDATE_TIMEZONE=%s\n' "$timezone"
  printf 'HOSPITAL_UPDATE_REQUEST_MAX_AGE_DAYS=%s\n' "$max_age"
  printf 'HOSPITAL_UPDATE_IMAGE_UPPER_BOUND_BYTES=%s\n' "$image_upper"
  printf 'HOSPITAL_UPDATE_DOCKER_RESERVE_BYTES=%s\n' "$docker_reserve"
  printf 'HOSPITAL_UPDATE_DATA_RESERVE_BYTES=%s\n' "$data_reserve"
  printf 'HOSPITAL_UPDATE_BACKUP_RESERVE_BYTES=%s\n' "$backup_reserve"
} > "$temporary"
chmod 0600 "$temporary"
update_durable_replace "$temporary" "$destination"
trap - EXIT HUP INT TERM
