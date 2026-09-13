#!/bin/sh
set -eu
set +x

# Change what hospital IT owns, safely.
#
#   sudo sh /opt/lospor-hospital/current/scripts/apply-site-config.sh --plan
#   sudo sh /opt/lospor-hospital/current/scripts/apply-site-config.sh --yes
#
# Edit /opt/lospor-hospital/site.env (or advanced.env, whose tuning values have
# fixed limits) first. --plan validates it, compiles a
# private candidate, checks it with Compose, and lists which site settings would
# change -- never a secret. Applying takes the shared maintenance lock, keeps
# the last known good configuration, lets Compose recreate only the services
# whose configuration changed, and runs doctor. If the appliance does not come
# back healthy, the previous site.env and .env are restored and started again.
#
# Exit 0 applied or nothing to change, 1 refused or rolled back, 2 wrong usage,
# 3 recovery required (the rollback itself failed), 4 not root.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
. "$root/scripts/installed-release-state.sh"
appliance_home="$(release_state_appliance_home "$root")"
if release_state_apply "$appliance_home"; then root="$state_release_root"; fi
cd "$root"
. "$root/scripts/operator-locale.sh"
operator_locale_load "$appliance_home"
. "$root/scripts/update-pipeline-lib.sh"
. "$root/scripts/site-config.sh"

mode=""
case "${1:-}" in
  --plan) mode=plan ;;
  --yes) mode=apply ;;
  *)
    operator_error \
      "Usage: apply-site-config.sh --plan | --yes" \
      "Употреба: apply-site-config.sh --plan | --yes"
    exit 2
    ;;
esac
[ "$#" -eq 1 ] || { operator_error "Usage: apply-site-config.sh --plan | --yes" "Употреба: apply-site-config.sh --plan | --yes"; exit 2; }
test_only="${HOSPITAL_SITE_CONFIG_TEST_ONLY:-0}"
if [ "$test_only" != 1 ] && [ "$(id -u)" -ne 0 ]; then
  operator_error "Run this command with sudo." "Изпълнете командата със sudo."
  exit 4
fi

site_config_ensure_split "$appliance_home"
site="$appliance_home/site.env"
site_config_check_source "$site" site || { operator_error "site.env is invalid; nothing was changed." "site.env е невалиден; нищо не е променено."; exit 1; }
advanced="$appliance_home/advanced.env"
site_config_check_advanced "$advanced" \
  || { operator_error "advanced.env is invalid or outside its limits; nothing was changed." "advanced.env е невалиден или извън допустимите граници; нищо не е променено."; exit 1; }

value() { site_config_value "$site" "$1"; }
problems=0
problem() { problems=$((problems + 1)); operator_error "  $1" "  $2"; }

case "$(value LOSPOR_DEFAULT_LOCALE)" in bg|en) ;; *) problem "LOSPOR_DEFAULT_LOCALE must be bg or en" "LOSPOR_DEFAULT_LOCALE трябва да бъде bg или en" ;; esac
hostname_pattern='^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$'
clinical="$(value HOSPITAL_CLINICAL_DOMAIN)"
research="$(value HOSPITAL_RESEARCH_DOMAIN)"
printf '%s\n' "$clinical" | grep -Eq "$hostname_pattern" || problem "HOSPITAL_CLINICAL_DOMAIN is not a DNS name" "HOSPITAL_CLINICAL_DOMAIN не е DNS име"
printf '%s\n' "$research" | grep -Eq "$hostname_pattern" || problem "HOSPITAL_RESEARCH_DOMAIN is not a DNS name" "HOSPITAL_RESEARCH_DOMAIN не е DNS име"
[ "$clinical" != "$research" ] || problem "the clinical and research names must differ" "клиничното и изследователското име трябва да се различават"
tls_mode="$(value HOSPITAL_TLS_MODE)"
case "$tls_mode" in
  operator) case "$(value HOSPITAL_TLS_VERIFY_CA)" in /*) ;; *) problem "HOSPITAL_TLS_VERIFY_CA must be an absolute path" "HOSPITAL_TLS_VERIFY_CA трябва да бъде абсолютен път" ;; esac ;;
  acme|local) ;;
  *) problem "HOSPITAL_TLS_MODE must be operator, acme or local" "HOSPITAL_TLS_MODE трябва да бъде operator, acme или local" ;;
esac
email_pattern='^[^@[:space:]"]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
for key in AUTH_EMAIL_FROM ACME_EMAIL; do
  printf '%s\n' "$(value "$key")" | grep -Eq "$email_pattern" || problem "$key is not an e-mail address" "$key не е имейл адрес"
done
https_port="$(value HOSPITAL_HTTPS_PORT)"; https_port="${https_port:-443}"
status_port="$(value HOSPITAL_STATUS_PORT)"; status_port="${status_port:-3443}"
for port in "$https_port" "$status_port"; do
  case "$port" in ''|*[!0-9]*) problem "ports must be numbers" "портовете трябва да бъдат числа" ;; *) [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || problem "port $port is out of range" "порт $port е извън допустимия обхват" ;; esac
done
[ "$https_port" != "$status_port" ] || problem "the HTTPS and Status ports must differ" "портовете за HTTPS и Status трябва да се различават"
allow_all=""
[ "$(value HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE)" != confirmed ] || allow_all="--allow-all-rfc1918"
locale="${LOSPOR_OPERATOR_LOCALE:-bg}"
for key in HOSPITAL_RESEARCH_ALLOWED_CIDRS HOSPITAL_STATUS_ALLOWED_CIDRS; do
  python3 scripts/network-boundaries.py --locale "$locale" $allow_all "$(value "$key")" >/dev/null 2>&1 \
    || problem "$key is not an exact, safe network list" "$key не е точен и безопасен списък с мрежи"
done
python3 scripts/support-url.py --locale "$locale" "$(value HOSPITAL_SUPPORT_URL)" >/dev/null 2>&1 \
  || problem "HOSPITAL_SUPPORT_URL must be blank, an internal HTTPS URL, or a mailto: address" "HOSPITAL_SUPPORT_URL трябва да е празно, вътрешен HTTPS адрес или mailto: адрес"
case "$(value HOSPITAL_UPDATE_SUPPLY_MODE)" in connected|offline) ;; *) problem "HOSPITAL_UPDATE_SUPPLY_MODE must be connected or offline" "HOSPITAL_UPDATE_SUPPLY_MODE трябва да бъде connected или offline" ;; esac
for key in HOSPITAL_UPDATE_WINDOW_START HOSPITAL_UPDATE_WINDOW_END; do
  window="$(value "$key")"
  [ -z "$window" ] || printf '%s\n' "$window" | grep -Eq '^([01][0-9]|2[0-3]):[0-5][0-9]$' \
    || problem "$key must be HH:MM" "$key трябва да бъде ЧЧ:ММ"
done
case "$(value HOSPITAL_HOST_REBOOT_POLICY)" in
  ''|manual|window) ;;
  *) problem "HOSPITAL_HOST_REBOOT_POLICY must be manual or window" "HOSPITAL_HOST_REBOOT_POLICY трябва да бъде manual или window" ;;
esac
timezone="$(value HOSPITAL_UPDATE_TIMEZONE)"
[ -z "$timezone" ] || { printf '%s\n' "$timezone" | grep -Eq '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)*$' && [ -f "/usr/share/zoneinfo/$timezone" ]; } \
  || problem "HOSPITAL_UPDATE_TIMEZONE is not a known time zone" "HOSPITAL_UPDATE_TIMEZONE не е позната часова зона"
if [ "$problems" -gt 0 ]; then
  operator_error "site.env has $problems problem(s); nothing was changed." "site.env има $problems проблем(а); нищо не е променено."
  exit 1
fi

work="$(mktemp -d)"
io_owned=0
cleanup() {
  [ "$io_owned" -eq 0 ] || update_io_lock_release
  rm -rf "$work"
}
trap cleanup EXIT HUP INT TERM
mkdir "$work/secrets"
cp "$site" "$work/site.env"
cp "$appliance_home/secrets/appliance.env" "$work/secrets/appliance.env"
[ ! -f "$advanced" ] || cp "$advanced" "$work/advanced.env"
site_config_compile "$work" || { operator_error "The configuration could not be compiled; nothing was changed." "Конфигурацията не можа да бъде компилирана; нищо не е променено."; exit 1; }
docker compose --env-file "$work/.env" config --quiet \
  || { operator_error "Compose rejected the new configuration; nothing was changed." "Compose отхвърли новата конфигурация; нищо не е променено."; exit 1; }

current_env="$appliance_home/.env"
changes=""
for key in $SITE_CONFIG_KEYS $ADVANCED_CONFIG_KEYS; do
  [ "$(site_config_value "$current_env" "$key")" = "$(site_config_value "$work/.env" "$key")" ] \
    || changes="$changes $key"
done
if [ -z "$changes" ]; then
  operator_say "site.env and advanced.env match the running configuration; nothing to change." "site.env и advanced.env съвпадат с текущата конфигурация; няма какво да се променя."
  exit 0
fi
operator_say "These settings will change:" "Тези настройки ще се променят:"
# Printed directly rather than parsed back from a delimited list: splitting on
# whitespace would silently shift a blank old value into the new column.
for key in $changes; do
  old="$(site_config_value "$current_env" "$key")"
  new="$(site_config_value "$work/.env" "$key")"
  printf '  %s: %s -> %s\n' "$key" "${old:-(blank)}" "${new:-(blank)}"
done
if [ "$mode" = plan ]; then
  operator_say "Plan only; nothing was changed. Apply with --yes." "Само план; нищо не е променено. Приложете с --yes."
  exit 0
fi

update_appliance_home="$appliance_home"
update_io_lock_acquire config || { operator_error "Another maintenance operation is running; nothing was changed." "Изпълнява се друга операция по поддръжка; нищо не е променено."; exit 1; }
io_owned=1

good="$appliance_home/.data/config/last-known-good"
mkdir -p "$good"
chmod 700 "$appliance_home/.data/config" "$good"
cp "$current_env" "$good/.env.tmp.$$" && mv -f "$good/.env.tmp.$$" "$good/.env"
# site.env has already been edited, so the running site settings are recovered
# from the running .env, not copied from the file about to be applied.
(umask 077; awk -v keys=" $SITE_CONFIG_KEYS " '
  /^[A-Z][A-Z0-9_]*=/ { key = substr($0, 1, index($0, "=") - 1); if (index(keys, " " key " ") > 0) print }
' "$current_env" > "$good/site.env.tmp.$$") && mv -f "$good/site.env.tmp.$$" "$good/site.env"
# The running advanced settings are recovered the same way: every advanced value
# that is running and differs from the appliance's own.
(umask 077
  for key in $ADVANCED_CONFIG_KEYS; do
    running="$(site_config_value "$current_env" "$key")"
    [ -n "$running" ] || continue
    [ "$running" = "$(site_config_value "$appliance_home/secrets/appliance.env" "$key")" ] \
      || printf '%s=%s\n' "$key" "$running"
  done > "$good/advanced.env.tmp.$$") && mv -f "$good/advanced.env.tmp.$$" "$good/advanced.env"
chmod 600 "$good/.env" "$good/site.env" "$good/advanced.env"

cp "$work/.env" "$current_env.apply.$$"
chmod 600 "$current_env.apply.$$"
mv -f "$current_env.apply.$$" "$current_env"

healthy=1
# --wait: doctor must see services that have finished starting, not ones Compose
# has only just recreated.
docker compose up -d --wait --wait-timeout 300 >/dev/null 2>&1 || healthy=0
# The lock covers changing .env and restarting, and is released before doctor:
# doctor verifies the latest backup through the backup service, which takes the
# same lock. Held across doctor, that check waited out its timeout and every
# apply on a real appliance rolled back.
update_io_lock_release
io_owned=0
[ "$healthy" -eq 0 ] || sh scripts/doctor.sh >/dev/null 2>&1 || healthy=0
if [ "$healthy" -eq 1 ]; then
  printf '%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${changes# }" \
    >> "$appliance_home/.data/config/applied.v1.tsv"
  chmod 600 "$appliance_home/.data/config/applied.v1.tsv"
  operator_say "Configuration applied and doctor passed." "Конфигурацията е приложена и проверката doctor премина."
  exit 0
fi

operator_error "The appliance did not come back healthy; restoring the previous configuration." "Системата не се възстанови в изправно състояние; връщане на предишната конфигурация."
update_io_lock_acquire config || {
  operator_error "RECOVERY REQUIRED: another maintenance operation started before the previous configuration could be restored. The last known good files are in .data/config/last-known-good." "НУЖНО Е ВЪЗСТАНОВЯВАНЕ: друга операция по поддръжка започна, преди предишната конфигурация да бъде върната. Последните работещи файлове са в .data/config/last-known-good."
  exit 3
}
io_owned=1
cp "$site" "$appliance_home/.data/config/site.env.rejected"
cp "$good/site.env" "$site"
cp "$good/.env" "$current_env"
chmod 600 "$site" "$current_env" "$appliance_home/.data/config/site.env.rejected"
if [ -f "$advanced" ]; then
  cp "$advanced" "$appliance_home/.data/config/advanced.env.rejected"
  chmod 600 "$appliance_home/.data/config/advanced.env.rejected"
fi
if [ -s "$good/advanced.env" ]; then
  cp "$good/advanced.env" "$advanced"
  chmod 600 "$advanced"
else
  rm -f "$advanced"
fi
restarted=1
docker compose up -d --wait --wait-timeout 300 >/dev/null 2>&1 || restarted=0
update_io_lock_release
io_owned=0
if [ "$restarted" -eq 1 ] && sh scripts/doctor.sh >/dev/null 2>&1; then
  operator_error "The previous configuration is running again. The rejected edit is kept at .data/config/site.env.rejected for review." "Предишната конфигурация работи отново. Отхвърлената промяна е запазена в .data/config/site.env.rejected за преглед."
  exit 1
fi
operator_error "RECOVERY REQUIRED: the previous configuration was restored but the appliance is still not healthy. Run doctor on the console." "НУЖНО Е ВЪЗСТАНОВЯВАНЕ: предишната конфигурация е върната, но системата все още не е изправна. Изпълнете doctor от конзолата."
exit 3
