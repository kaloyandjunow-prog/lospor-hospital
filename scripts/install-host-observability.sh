#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$root/scripts/operator-locale.sh"
home="${LOSPOR_APPLIANCE_HOME:-/opt/lospor-hospital}"
operator_locale_load "$home"
[ "$(id -u)" -eq 0 ] || { operator_error "Run this command as root." "Изпълнете командата като root."; exit 1; }
[ "$home" = /opt/lospor-hospital ] \
  || { operator_error "The installed host monitor requires /opt/lospor-hospital." "Инсталираното наблюдение на сървъра изисква /opt/lospor-hospital."; exit 1; }
[ -L "$home/current" ] && [ -x "$home/current/scripts/host-observability-probe.sh" ] \
  || { operator_error "The canonical current release is missing." "Липсва каноничната връзка към текущата версия."; exit 1; }
command -v systemctl >/dev/null 2>&1 && command -v systemd-analyze >/dev/null 2>&1 \
  || { operator_error "systemd is required for host monitoring." "За наблюдението на сървъра е необходим systemd."; exit 1; }

state_dir="$home/.data/runtime/update/state"
mkdir -p "$state_dir"
install -m 0644 "$home/current/infra/systemd/lospor-host-observability.service" \
  /etc/systemd/system/lospor-host-observability.service
install -m 0644 "$home/current/infra/systemd/lospor-host-observability.timer" \
  /etc/systemd/system/lospor-host-observability.timer
install -m 0644 "$home/current/infra/systemd/lospor-status-fallback-certificate.service" \
  /etc/systemd/system/lospor-status-fallback-certificate.service
install -m 0644 "$home/current/infra/systemd/lospor-status-fallback-certificate.timer" \
  /etc/systemd/system/lospor-status-fallback-certificate.timer
install -m 0644 "$home/current/infra/systemd/lospor-offhost-copy.service" \
  /etc/systemd/system/lospor-offhost-copy.service
install -m 0644 "$home/current/infra/systemd/lospor-offhost-copy.timer" \
  /etc/systemd/system/lospor-offhost-copy.timer
install -m 0644 "$home/current/infra/systemd/lospor-host-os-maintenance@.service" \
  /etc/systemd/system/lospor-host-os-maintenance@.service
systemd-analyze verify \
  /etc/systemd/system/lospor-offhost-copy.service \
  /etc/systemd/system/lospor-offhost-copy.timer \
  /etc/systemd/system/lospor-host-observability.service \
  /etc/systemd/system/lospor-host-observability.timer \
  /etc/systemd/system/lospor-status-fallback-certificate.service \
  /etc/systemd/system/lospor-status-fallback-certificate.timer
systemctl daemon-reload
systemctl enable --now lospor-host-observability.timer
systemctl enable --now lospor-status-fallback-certificate.timer
# Idle until off-host copies are configured; then it copies each new backup.
systemctl enable --now lospor-offhost-copy.timer
systemctl start lospor-status-fallback-certificate.service
systemctl start lospor-host-observability.service

signal="$state_dir/host-observability.v2.json"
if systemctl is-active --quiet lospor-host-observability.timer \
    && systemctl is-active --quiet lospor-status-fallback-certificate.timer \
    && [ -s "$signal" ] \
    && find "$signal" -mmin -2 -print -quit | grep -q .; then
  operator_say \
    "Privacy-safe host monitoring is installed, active, and reporting." \
    "Наблюдението на сървъра без лични данни е инсталирано, активно и подава състояние."
  exit 0
fi
operator_error \
  "Host monitoring was configured but did not publish a fresh signal." \
  "Наблюдението на сървъра е настроено, но не публикува нов сигнал."
exit 1
