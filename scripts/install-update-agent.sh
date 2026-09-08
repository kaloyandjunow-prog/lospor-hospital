#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$root/scripts/operator-locale.sh"
. "$root/scripts/update-pipeline-lib.sh"
home="${LOSPOR_APPLIANCE_HOME:-/opt/lospor-hospital}"
operator_locale_load "$home"
mode="${1:-install}"
case "$mode" in install|--console-only|--uninstall) ;; *) operator_error "Usage: install-update-agent.sh [--console-only|--uninstall]" "Употреба: install-update-agent.sh [--console-only|--uninstall]"; exit 2 ;; esac
[ "$(id -u)" -eq 0 ] || { operator_error "Run this command as root." "Изпълнете командата като root."; exit 1; }
[ "$home" = /opt/lospor-hospital ] || { operator_error "The installed update agent requires /opt/lospor-hospital." "Инсталираният агент изисква /opt/lospor-hospital."; exit 1; }
state_dir="$home/.data/runtime/update/state"
marker="$state_dir/update-agent-installation.v1.json"
mkdir -p "$state_dir"

write_installation_marker() {
  marker_mode="$1"
  marker_tmp="$marker.tmp.$$"
  umask 022
  printf '{"schemaVersion":1,"signalType":"update-agent-installation","observedAt":"%s","mode":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$marker_mode" > "$marker_tmp"
  chmod 0644 "$marker_tmp"
  update_durable_replace "$marker_tmp" "$marker"
}

if [ "$mode" != install ]; then
  systemctl disable --now lospor-update-agent.service >/dev/null 2>&1 || true
  rm -f /etc/systemd/system/lospor-update-agent.service /etc/lospor-hospital/update-agent.env
  systemctl daemon-reload
  write_installation_marker console-only
  operator_say "Browser update controls are disabled; console updates remain available." "Управлението на обновяванията от браузъра е изключено; обновяването от конзолата остава достъпно."
  exit 0
fi

[ -L "$home/current" ] && [ -x "$home/current/scripts/update-agent-loop.sh" ] \
  || { operator_error "The canonical current release is missing." "Липсва каноничната връзка към текущата версия."; exit 1; }
command -v systemctl >/dev/null 2>&1 && command -v systemd-analyze >/dev/null 2>&1 \
  || { operator_error "systemd is required for browser-managed updates." "За управление на обновяванията от браузъра е необходим systemd."; exit 1; }
command -v flock >/dev/null 2>&1 \
  || { operator_error "flock is required for browser-managed updates." "За управление на обновяванията от браузъра е необходима командата flock."; exit 1; }
sh "$home/current/scripts/write-update-agent-env.sh" "$home" /etc/lospor-hospital/update-agent.env
install -m 0644 "$home/current/infra/systemd/lospor-update-agent.service" /etc/systemd/system/lospor-update-agent.service
systemd-analyze verify /etc/systemd/system/lospor-update-agent.service
write_installation_marker agent
systemctl daemon-reload
systemctl enable --now lospor-update-agent.service

attempt=0
while [ "$attempt" -lt 30 ]; do
  if systemctl is-active --quiet lospor-update-agent.service \
    && [ -s "$state_dir/update-agent.v2.json" ] \
    && find "$state_dir/update-agent.v2.json" -mmin -1 -print -quit | grep -q .; then
    operator_say "The update agent is installed, enabled, active, and reporting." "Агентът за обновяване е инсталиран, включен, активен и подава състояние."
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 1
done
operator_error "The update agent was configured but did not produce a fresh heartbeat." "Агентът за обновяване е настроен, но не подаде нов сигнал за състояние."
exit 1
