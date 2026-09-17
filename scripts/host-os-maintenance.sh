#!/bin/sh
set -eu
set +x

# Ubuntu maintenance for the server the appliance runs on.
#
#   sudo losporctl host state             what Ubuntu reports, in plain words
#   sudo losporctl host security-update   install Ubuntu security updates now
#   sudo losporctl host reboot            take a backup, then restart the server
#   sudo losporctl host upgrade           take a backup, install every update
#                                         (Docker included), restart the
#                                         services and run doctor
#
# Status reaches security-update and the restart through the systemd unit
# lospor-host-os-maintenance@.service (run-unit ACTION): the maintenance agent's
# own sandbox keeps /usr and /etc read-only, which is right for everything else
# it does. Ubuntu is updated the way it updates itself every night, through
# unattended-upgrades and its security origins; upgrade is the console-only
# exception, because updating Docker restarts every clinical service.
#
# Every operation takes the shared maintenance lock, so it never runs beside a
# backup, restore, update or terminology change, and appends one line of
# evidence to .data/host-os/operations.v1.tsv: when, what, and the result.
#
# Exit 0 done, 1 failed, 2 wrong usage, 4 not root, 75 another maintenance
# operation (or Ubuntu's own nightly update) is running; try again later.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$root/scripts/installed-release-state.sh"
. "$root/scripts/operator-locale.sh"
. "$root/scripts/update-pipeline-lib.sh"

test_only="${HOSPITAL_HOST_OS_TEST_ONLY:-0}"
if [ "$test_only" = 1 ]; then
  appliance_home="${LOSPOR_APPLIANCE_HOME:?LOSPOR_APPLIANCE_HOME is required in test mode}"
  host_root="${HOSPITAL_HOST_OS_TEST_ROOT:-}"
else
  appliance_home="$(release_state_appliance_home "$root")"
  host_root=""
fi
operator_locale_load "$appliance_home"
update_appliance_home="$appliance_home"

usage() {
  operator_error \
    "Usage: host-os-maintenance.sh state | security-update | reboot | reboot-now | upgrade | run-unit security-update|reboot-now" \
    "Употреба: host-os-maintenance.sh state | security-update | reboot | reboot-now | upgrade | run-unit security-update|reboot-now"
  exit 2
}

action="${1:-}"
case "$action:$#" in
  state:1|security-update:1|reboot:1|reboot-now:1|upgrade:1) ;;
  run-unit:2) case "$2" in security-update|reboot-now) ;; *) usage ;; esac ;;
  *) usage ;;
esac
if [ "$test_only" != 1 ] && [ "$(id -u)" -ne 0 ]; then
  operator_error "Run this command with sudo." "Изпълнете командата със sudo."
  exit 4
fi

evidence_dir="$appliance_home/.data/host-os"
evidence="$evidence_dir/operations.v1.tsv"
signal="$appliance_home/.data/runtime/update/state/host-os.v1.json"

record() {
  mkdir -p "$evidence_dir"
  chmod 0700 "$evidence_dir"
  printf 'LOSPOR-HOSPITAL-HOST-OS-OPERATION-V1\t%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" >> "$evidence"
  chmod 0600 "$evidence"
  update_sync_path "$evidence" 2>/dev/null || true
}

last_result() {
  [ -f "$evidence" ] || return 0
  awk -F '\t' -v action="$1" '$1 == "LOSPOR-HOSPITAL-HOST-OS-OPERATION-V1" && $3 == action { result = $4 } END { print result }' "$evidence"
}

take_lock() {
  lock_errors="$(mktemp)"
  if update_io_lock_acquire host-os 2> "$lock_errors"; then
    rm -f "$lock_errors"
    return 0
  fi
  if grep -Fxq UPDATE_MAINTENANCE_BUSY "$lock_errors"; then
    rm -f "$lock_errors"
    record "$1" busy
    operator_error "Another maintenance operation is running; nothing was changed. Try again when it finishes." "Изпълнява се друга операция по поддръжка; нищо не е променено. Опитайте отново, когато приключи."
    exit 75
  fi
  rm -f "$lock_errors"
  record "$1" failed
  operator_error "The maintenance lock is unavailable; nothing was changed." "Заключването за поддръжка не е достъпно; нищо не е променено."
  exit 1
}

reboot_hint() {
  if [ -e "$host_root/run/reboot-required" ]; then
    operator_say "Ubuntu asks for a restart to finish. Restart from Status, or: sudo losporctl host reboot" \
      "Ubuntu иска рестартиране, за да завърши. Рестартирайте от Status или: sudo losporctl host reboot"
  fi
}

security_update() {
  if ! command -v unattended-upgrade >/dev/null 2>&1; then
    record security-update failed
    operator_error "unattended-upgrades is not installed, so security updates cannot run: sudo apt-get install unattended-upgrades" \
      "unattended-upgrades не е инсталиран и обновленията за сигурност не могат да се изпълнят: sudo apt-get install unattended-upgrades"
    exit 1
  fi
  take_lock security-update
  mkdir -p "$evidence_dir"
  chmod 0700 "$evidence_dir"
  log="$evidence_dir/last-security-update.log"
  result=passed
  export DEBIAN_FRONTEND=noninteractive
  timeout 900 apt-get update -q > "$log" 2>&1 || result=failed
  if [ "$result" = passed ]; then
    timeout 3600 unattended-upgrade >> "$log" 2>&1 || result=failed
  fi
  chmod 0600 "$log"
  update_io_lock_release
  # Ubuntu's own nightly run holds the package lock while it works.
  if [ "$result" = failed ] && grep -Eq 'Could not get lock|Lock could not be acquired|is another process using it' "$log"; then
    record security-update busy
    operator_error "Ubuntu's own update is running right now; nothing was changed. Try again in a few minutes." \
      "В момента върви собственото обновяване на Ubuntu; нищо не е променено. Опитайте отново след няколко минути."
    exit 75
  fi
  record security-update "$result"
  if [ "$result" = failed ]; then
    operator_error "Installing security updates failed. The details are in .data/host-os/last-security-update.log." \
      "Инсталирането на обновленията за сигурност се провали. Подробностите са в .data/host-os/last-security-update.log."
    exit 1
  fi
  operator_say "Ubuntu security updates are installed." "Обновленията за сигурност на Ubuntu са инсталирани."
  reboot_hint
}

# The restart itself. Callers take a verified backup first: the maintenance
# agent before it starts the unit, reboot below at the console.
reboot_now() {
  take_lock reboot
  record reboot started
  sync
  operator_say "The server is restarting. Clinical services return on their own in a few minutes." \
    "Сървърът се рестартира. Клиничните услуги се връщат сами след няколко минути."
  if [ "$test_only" = 1 ]; then
    printf 'reboot\n' >> "${HOSPITAL_HOST_OS_TEST_CALLS:?}"
    exit 0
  fi
  systemctl reboot
}

backup_first() {
  if ! sh "$root/scripts/backup-now.sh"; then
    record "$1" failed
    operator_error "The backup taken first failed, so nothing else was done." \
      "Архивът, който се прави първо, се провали, затова нищо друго не е направено."
    exit 1
  fi
}

upgrade() {
  backup_first upgrade
  take_lock upgrade
  result=passed
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -q || result=failed
  if [ "$result" = passed ]; then
    apt-get -y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold upgrade || result=failed
  fi
  update_io_lock_release
  # Updating Docker restarts the daemon and every container with it: bring the
  # appliance back as it was and prove it healthy.
  release_root="$root"
  if release_state_apply "$appliance_home" 2>/dev/null; then release_root="$state_release_root"; fi
  (cd "$release_root" && docker compose up -d --wait --wait-timeout 300 >/dev/null 2>&1) || result=failed
  sh "$root/scripts/doctor.sh" >/dev/null 2>&1 || result=failed
  record upgrade "$result"
  if [ "$result" = failed ]; then
    operator_error "The upgrade or the health check afterwards failed. Run: sudo losporctl check" \
      "Надграждането или проверката след него се провали. Изпълнете: sudo losporctl check"
    exit 1
  fi
  operator_say "Ubuntu and Docker are up to date and the health check passed." \
    "Ubuntu и Docker са обновени и проверката на изправността премина."
  reboot_hint
}

state() {
  if [ ! -s "$signal" ]; then
    operator_error "Host monitoring has not reported Ubuntu's state yet." "Наблюдението на сървъра все още не е отчело състоянието на Ubuntu."
    exit 1
  fi
  python3 - "$signal" "${LOSPOR_OPERATOR_LOCALE:-bg}" <<'PY'
import json, sys
signal = json.load(open(sys.argv[1]))
bg = sys.argv[2] == "bg"
def say(en, bulgarian): print(bulgarian if bg else en)
unknown = "неизвестно" if bg else "unknown"
value = lambda key: unknown if signal.get(key) is None else signal[key]
say(f"Ubuntu {value('release')}, standard support until {value('standardSupportEnds')}",
    f"Ubuntu {value('release')}, стандартна поддръжка до {value('standardSupportEnds')}")
say(f"Security updates waiting: {value('securityUpdates')} (other updates: {value('otherUpdates')})",
    f"Чакащи обновления за сигурност: {value('securityUpdates')} (други обновления: {value('otherUpdates')})")
if signal.get("dockerUpdates"):
    say("Docker has updates. They restart every service: sudo losporctl host upgrade, in the maintenance window",
        "Има обновления на Docker. Те рестартират всички услуги: sudo losporctl host upgrade, в прозореца за поддръжка")
if signal.get("lastAutomaticResult") == "never":
    say(f"Automatic security updates: {value('automaticUpdates')}; they have not run since the server started",
        f"Автоматични обновления за сигурност: {value('automaticUpdates')}; не са се изпълнявали, откакто сървърът е стартиран")
else:
    say(f"Automatic security updates: {value('automaticUpdates')}, last run {value('lastAutomaticRunAt')} ({value('lastAutomaticResult')})",
        f"Автоматични обновления за сигурност: {value('automaticUpdates')}, последно {value('lastAutomaticRunAt')} ({value('lastAutomaticResult')})")
if signal.get("rebootRequired"):
    say(f"A restart is needed since {value('rebootRequiredSince')}; restart policy: {value('rebootPolicy')}",
        f"Нужно е рестартиране от {value('rebootRequiredSince')}; политика за рестартиране: {value('rebootPolicy')}")
else:
    say(f"No restart is needed. Running since {value('bootedAt')}", f"Не е нужно рестартиране. Работи от {value('bootedAt')}")
PY
}

# Started by the maintenance agent. A security update runs to the end and its
# result is read back from the evidence; a restart is started and not waited for.
run_unit() {
  unit="lospor-host-os-maintenance@$1.service"
  case "$1" in
    security-update)
      before=0; [ ! -f "$evidence" ] || before="$(wc -l < "$evidence" | tr -d '[:space:]')"
      systemctl start "$unit" || true
      after=0; [ ! -f "$evidence" ] || after="$(wc -l < "$evidence" | tr -d '[:space:]')"
      [ "$after" -gt "$before" ] || { echo HOST_OS_UNIT_DID_NOT_RECORD >&2; exit 1; }
      case "$(last_result security-update)" in
        passed) exit 0 ;;
        busy) echo UPDATE_MAINTENANCE_BUSY >&2; exit 75 ;;
        *) exit 1 ;;
      esac
      ;;
    reboot-now) systemctl start --no-block "$unit" ;;
  esac
}

case "$action" in
  state) state ;;
  security-update) security_update ;;
  reboot) backup_first reboot; reboot_now ;;
  reboot-now) reboot_now ;;
  upgrade) upgrade ;;
  run-unit) run_unit "$2" ;;
esac
