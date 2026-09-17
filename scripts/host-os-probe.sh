#!/bin/sh
set -eu
set +x

# Privacy-safe facts about Ubuntu for Status: its release and when standard
# support ends, how many updates are waiting, whether automatic security
# updates are on and how their last run went, and whether a restart is needed.
# Counts, fixed words and UTC times only: no package name, version, path or
# command output crosses into Status.
#
#   sh scripts/host-os-probe.sh APPLIANCE-HOME
#
# Run by host-observability-probe.sh inside its sandbox, which is read-only
# except for the state directory. apt only simulates here, and at most every 15
# minutes unless the package lists or the installed packages changed since.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$root/scripts/update-pipeline-lib.sh"

appliance_home="${1:?usage: host-os-probe.sh APPLIANCE-HOME}"
host_root=""
[ "${HOSPITAL_OBSERVABILITY_TEST_ONLY:-0}" != 1 ] || host_root="${HOSPITAL_HOST_OS_TEST_ROOT:-}"
now_epoch="${HOSPITAL_OBSERVABILITY_NOW_EPOCH:-$(date -u +%s)}"
case "$now_epoch" in ''|*[!0-9]*) echo HOST_OS_CLOCK_INVALID >&2; exit 2 ;; esac

state_dir="$appliance_home/.data/runtime/update/state"
cache="$state_dir/.host-os-updates.v1"
signal="$state_dir/host-os.v1.json"
mkdir -p "$state_dir"

iso() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null; }
json_string() { if [ -n "$1" ]; then printf '"%s"' "$1"; else printf null; fi; }
json_number() { case "$1" in ''|*[!0-9]*) printf null ;; *) printf '%s' "$1" ;; esac; }
mtime() { stat -c %Y "$1" 2>/dev/null || true; }

# Release and the end of its standard support, from Canonical's published LTS
# lifecycle. An interim or unknown release has no date and Status says so.
release="$(sed -n 's/^VERSION_ID="\{0,1\}\([0-9][0-9]\.[0-9][0-9]\)"\{0,1\}$/\1/p' "$host_root/etc/os-release" 2>/dev/null | head -n 1)"
case "$release" in
  22.04) support_ends=2027-04-30 ;;
  24.04) support_ends=2029-04-30 ;;
  26.04) support_ends=2031-04-30 ;;
  *) support_ends="" ;;
esac

# Waiting updates. A simulated dist-upgrade lists everything that would be
# installed; a line from a -security pocket is a security update, and Docker's
# own packages are counted apart because updating them restarts every service.
# Only upgrades of installed packages count ("Inst name [installed] (new)"): a
# brand-new package a full upgrade would pull in is not a missing fix, and
# unattended-upgrades never installs one, so counting it would warn forever.
security_updates=""; other_updates=""; docker_updates=""
lists_changed="$(mtime "$host_root/var/lib/apt/lists")"
status_changed="$(mtime "$host_root/var/lib/dpkg/status")"
cache_changed="$(mtime "$cache")"
refresh=1
if [ -n "$cache_changed" ] && [ "$((now_epoch - cache_changed))" -lt 900 ] \
    && [ "${lists_changed:-0}" -le "$cache_changed" ] && [ "${status_changed:-0}" -le "$cache_changed" ]; then
  refresh=0
fi
if [ "$refresh" -eq 1 ] && command -v apt-get >/dev/null 2>&1; then
  simulated="$(mktemp)"
  if apt-get -s -q -o Debug::NoLocking=true -o Dir::Cache::pkgcache= -o Dir::Cache::srcpkgcache= dist-upgrade \
      > "$simulated" 2>/dev/null; then
    awk '
      /^Inst [^ ]+ \[/ {
        if ($2 ~ /^(docker-ce|docker-ce-cli|docker-ce-rootless-extras|containerd\.io|docker-compose-plugin|docker-buildx-plugin)$/) docker = 1
        if ($0 ~ /-security[ ,\]]/) security += 1; else other += 1
      }
      END { printf "%d %d %s\n", security, other, docker ? "true" : "false" }
    ' "$simulated" > "$cache.tmp.$$" && chmod 0600 "$cache.tmp.$$" && mv -f "$cache.tmp.$$" "$cache"
  fi
  rm -f "$simulated" "$cache.tmp.$$"
fi
if [ -f "$cache" ]; then
  read -r security_updates other_updates docker_updates < "$cache" || true
  case "$docker_updates" in true|false) ;; *) security_updates=""; other_updates=""; docker_updates="" ;; esac
fi
checked_epoch="$(mtime "$host_root/var/lib/apt/periodic/update-success-stamp")"
[ -n "$checked_epoch" ] || checked_epoch="$lists_changed"
updates_checked_at=""; [ -z "$checked_epoch" ] || updates_checked_at="$(iso "$checked_epoch")"

# Automatic security updates: installed, switched on in apt, and their timer
# enabled. Their last run is the last exit of Ubuntu's apt-daily-upgrade.
automatic=unknown
if ! command -v unattended-upgrade >/dev/null 2>&1; then
  automatic=not-installed
elif command -v apt-config >/dev/null 2>&1; then
  periodic="$(apt-config shell value APT::Periodic::Unattended-Upgrade 2>/dev/null | sed -n "s/^value='\{0,1\}\([0-9]*\)'\{0,1\}$/\1/p")"
  timer="$(systemctl is-enabled apt-daily-upgrade.timer 2>/dev/null || true)"
  if [ "${periodic:-0}" = 0 ] || [ "$timer" = disabled ] || [ "$timer" = masked ]; then
    automatic=disabled
  else
    automatic=enabled
  fi
fi
last_run_at=""; last_result=unknown
run_stamp="$(systemctl show apt-daily-upgrade.service --property=ExecMainExitTimestamp --value 2>/dev/null || true)"
run_result="$(systemctl show apt-daily-upgrade.service --property=Result --value 2>/dev/null || true)"
if [ -z "$run_stamp" ] || [ "$run_stamp" = n/a ]; then
  [ -z "$run_result" ] || last_result=never
else
  run_epoch="$(date -u -d "$run_stamp" +%s 2>/dev/null || true)"
  if [ -n "$run_epoch" ]; then
    last_run_at="$(iso "$run_epoch")"
    case "$run_result" in success) last_result=success ;; '') last_result=unknown ;; *) last_result=failed ;; esac
  fi
fi

reboot_required=false; reboot_since=""
if [ -e "$host_root/run/reboot-required" ]; then
  reboot_required=true
  reboot_epoch="$(mtime "$host_root/run/reboot-required")"
  [ -z "$reboot_epoch" ] || reboot_since="$(iso "$reboot_epoch")"
fi
booted_at=""
boot_epoch="$(awk '$1 == "btime" { print $2 }' "$host_root/proc/stat" 2>/dev/null || true)"
case "$boot_epoch" in ''|*[!0-9]*) ;; *) booted_at="$(iso "$boot_epoch")" ;; esac

reboot_policy="$(sed -n 's/^HOSPITAL_HOST_REBOOT_POLICY=//p' "$appliance_home/.env" 2>/dev/null | tail -n 1 | tr -d '\r"')"
[ "$reboot_policy" = window ] || reboot_policy=manual

# The last Ubuntu operation LOSPOR ran, from host-os-maintenance.sh's evidence.
last_operation=""
operations="$appliance_home/.data/host-os/operations.v1.tsv"
if [ -f "$operations" ] && [ ! -L "$operations" ]; then
  last_operation="$(tail -n 50 "$operations" | awk -F '\t' '
    NF == 4 && $1 == "LOSPOR-HOSPITAL-HOST-OS-OPERATION-V1" \
      && $2 ~ /^20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]Z$/ \
      && $3 ~ /^(security-update|reboot|upgrade)$/ && $4 ~ /^(passed|failed|busy|started)$/ {
        line = sprintf(",\"lastOperation\":{\"action\":\"%s\",\"result\":\"%s\",\"at\":\"%s\"}", $3, $4, $2)
      }
    END { printf "%s", line }')"
fi

[ ! -L "$signal" ] && { [ ! -e "$signal" ] || [ -f "$signal" ]; } || { echo HOST_OS_SIGNAL_UNSAFE >&2; exit 1; }
signal_tmp="$state_dir/.host-os.v1.json.tmp.$$"
umask 022
printf '{"schemaVersion":1,"signalType":"host-os","observedAt":"%s","release":%s,"standardSupportEnds":%s,"securityUpdates":%s,"otherUpdates":%s,"dockerUpdates":%s,"updatesCheckedAt":%s,"automaticUpdates":"%s","lastAutomaticRunAt":%s,"lastAutomaticResult":"%s","rebootRequired":%s,"rebootRequiredSince":%s,"bootedAt":%s,"rebootPolicy":"%s"%s}\n' \
  "$(iso "$now_epoch")" "$(json_string "$release")" "$(json_string "$support_ends")" \
  "$(json_number "$security_updates")" "$(json_number "$other_updates")" "${docker_updates:-null}" \
  "$(json_string "$updates_checked_at")" "$automatic" "$(json_string "$last_run_at")" "$last_result" \
  "$reboot_required" "$(json_string "$reboot_since")" "$(json_string "$booted_at")" "$reboot_policy" \
  "$last_operation" > "$signal_tmp"
chmod 0644 "$signal_tmp"
update_durable_replace "$signal_tmp" "$signal" || { rm -f "$signal_tmp"; echo HOST_OS_SIGNAL_WRITE_FAILED >&2; exit 1; }
echo HOST_OS_PUBLISHED
