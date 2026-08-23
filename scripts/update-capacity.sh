#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$root/scripts/installed-release-state.sh"
appliance_home="$(release_state_appliance_home "$root")"
phase="${1:-}"
download_bytes="${2:-0}"
case "$phase" in prepare|apply) ;; *) echo "Usage: update-capacity.sh prepare|apply [download-bytes]" >&2; exit 2 ;; esac
for value in "$download_bytes" \
  "${HOSPITAL_UPDATE_IMAGE_UPPER_BOUND_BYTES:-42949672960}" \
  "${HOSPITAL_UPDATE_DOCKER_RESERVE_BYTES:-21474836480}" \
  "${HOSPITAL_UPDATE_DATA_RESERVE_BYTES:-10737418240}" \
  "${HOSPITAL_UPDATE_BACKUP_RESERVE_BYTES:-10737418240}"; do
  case "$value" in ''|*[!0-9]*) echo UPDATE_CAPACITY_POLICY_INVALID >&2; exit 2 ;; esac
  [ "${#value}" -le 15 ] && [ "$value" -le 999999999999999 ] \
    || { echo UPDATE_CAPACITY_POLICY_INVALID >&2; exit 2; }
done
image_upper="${HOSPITAL_UPDATE_IMAGE_UPPER_BOUND_BYTES:-42949672960}"
docker_reserve="${HOSPITAL_UPDATE_DOCKER_RESERVE_BYTES:-21474836480}"
data_reserve="${HOSPITAL_UPDATE_DATA_RESERVE_BYTES:-10737418240}"
backup_reserve="${HOSPITAL_UPDATE_BACKUP_RESERVE_BYTES:-10737418240}"

available_bytes() {
  capacity_path="$1"
  [ -d "$capacity_path" ] && [ ! -L "$capacity_path" ] || return 1
  capacity_kib="$(df -Pk "$capacity_path" 2>/dev/null | awk 'NR > 1 { value=$4 } END { print value }')"
  case "$capacity_kib" in ''|*[!0-9]*) return 1 ;; esac
  printf '%s\n' "$((capacity_kib * 1024))"
}

command -v docker >/dev/null 2>&1 || { echo UPDATE_DOCKER_UNAVAILABLE >&2; exit 1; }
docker_root="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null)"
case "$docker_root" in /*) ;; *) echo UPDATE_DOCKER_CAPACITY_UNKNOWN >&2; exit 1 ;; esac
docker_free="$(available_bytes "$docker_root")" || { echo UPDATE_DOCKER_CAPACITY_UNKNOWN >&2; exit 1; }
data_free="$(available_bytes "$appliance_home/.data")" || { echo UPDATE_DATA_CAPACITY_UNKNOWN >&2; exit 1; }
backup_free="$(available_bytes "$appliance_home/backups")" || { echo UPDATE_BACKUP_CAPACITY_UNKNOWN >&2; exit 1; }
if [ "$phase" = prepare ]; then
  docker_required=$((image_upper + docker_reserve))
  data_required=$((download_bytes + data_reserve))
else
  docker_required=$docker_reserve
  data_required=$data_reserve
fi
[ "$docker_free" -ge "$docker_required" ] || { echo UPDATE_DOCKER_CAPACITY_REFUSED >&2; exit 1; }
[ "$data_free" -ge "$data_required" ] || { echo UPDATE_DATA_CAPACITY_REFUSED >&2; exit 1; }
[ "$backup_free" -ge "$backup_reserve" ] || { echo UPDATE_BACKUP_CAPACITY_REFUSED >&2; exit 1; }
printf 'UPDATE_CAPACITY_OK\t%s\t%s\t%s\n' "$docker_free" "$data_free" "$backup_free"
