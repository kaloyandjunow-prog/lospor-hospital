#!/bin/sh
set -eu
set +x

# losporctl: one console command for hospital IT.
#
# It orchestrates the appliance's existing, tested scripts and adds only two
# things of its own: a plain-language status summary and a privacy-safe support
# bundle. /usr/local/bin/losporctl is a fixed launcher for
# /opt/lospor-hospital/current/scripts/losporctl.sh, so the command always
# comes from the active verified release.
#
# Exit status: 0 ok, 1 failed, 2 wrong usage, 3 blocked by a lock or state,
# 4 needs root, 75 deferred. A script this command runs keeps its own status.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$root/scripts/installed-release-state.sh"
. "$root/scripts/operator-locale.sh"
appliance_home="$(release_state_appliance_home "$root")"
operator_locale_load "$appliance_home"
export LOSPOR_OPERATOR_LOCALE
test_only="${HOSPITAL_LOSPORCTL_TEST_ONLY:-0}"

# The families below are the whole command. docs-commands.test.mjs reads this
# line to check that every documented `losporctl` command exists.
LOSPORCTL_FAMILIES="status check backup support-bundle update config accounts secrets help version"

say() { operator_say "$1" "$2"; }
fail_usage() { operator_error "$1" "$2"; exit 2; }

assume_yes=0
json=0
arguments=""
for argument in "$@"; do
  case "$argument" in
    --yes) assume_yes=1 ;;
    --json) json=1 ;;
    *) arguments="$arguments '$(printf '%s' "$argument" | sed "s/'/'\\\\''/g")'" ;;
  esac
done
eval "set -- $arguments"

family="${1:-help}"
[ "$#" -eq 0 ] || shift

usage() {
  if [ "$LOSPOR_OPERATOR_LOCALE" = en ]; then
    cat <<'EOF'
Usage: sudo losporctl COMMAND

  status [--json]                   How the appliance is doing, in plain words
  check [--go-live]                 Run the full health check
  backup run | list | drill [NAME]  Take a backup, list them, or test-restore one
  support-bundle create             Write a privacy-safe file for LOSPOR support
  update check | download [VERSION] | apply [VERSION] | offline DIRECTORY | recover
  config show | plan | apply        Change site.env safely
  accounts operator state | verify | rotate | transfer | repair | recovery-token
  secrets state | rotate | commit | rollback | cleanup
  version

Changes that restart services show what will happen and ask for yes;
add --yes to confirm in advance.
EOF
  else
    cat <<'EOF'
Употреба: sudo losporctl КОМАНДА

  status [--json]                   Състояние на системата с обикновени думи
  check [--go-live]                 Пълна проверка на изправността
  backup run | list | drill [ИМЕ]   Резервно копие, списък или пробно възстановяване
  support-bundle create             Файл за поддръжката на LOSPOR без лични данни
  update check | download [ВЕРСИЯ] | apply [ВЕРСИЯ] | offline ДИРЕКТОРИЯ | recover
  config show | plan | apply        Безопасна промяна на site.env
  accounts operator state | verify | rotate | transfer | repair | recovery-token
  secrets state | rotate | commit | rollback | cleanup
  version

Промените, които рестартират услуги, показват какво ще стане и искат yes;
добавете --yes, за да потвърдите предварително.
EOF
  fi
}

case "$family" in
  help|-h|--help) usage; exit 0 ;;
  version)
    if release_state_read "$appliance_home" 2>/dev/null; then printf '%s\n' "$state_version"; else
      say "No release is installed." "Няма инсталирана версия."; exit 1
    fi
    exit 0
    ;;
esac

# One rule: every command except help and version runs as root, because the
# appliance state it reads and changes is root-only.
if [ "$test_only" != 1 ] && [ "$(id -u)" -ne 0 ]; then
  operator_error "Run it with sudo: sudo losporctl $family" "Изпълнете я със sudo: sudo losporctl $family"
  exit 4
fi

run() { script="$1"; shift; sh "$root/scripts/$script" "$@"; }

# Ask before a change that restarts services or cannot be taken back quietly.
confirm() {
  operator_say "$1" "$2"
  [ "$assume_yes" -eq 0 ] || return 0
  if [ -t 0 ]; then
    operator_printf 'Type yes to continue: ' 'Напишете yes, за да продължите: '
    IFS= read -r answer || answer=""
    [ "$answer" = yes ] && return 0
    say "Nothing was changed." "Нищо не е променено."
    exit 1
  fi
  fail_usage "Add --yes to confirm." "Добавете --yes за потвърждение."
}

signal_file="$appliance_home/.data/runtime/update/state/host-observability.v2.json"
update_status_file="$appliance_home/.data/update-status.tsv"

signal_field() { sed -n "s/.*\"$1\":\"\\([A-Za-z0-9:.-]*\\)\".*/\\1/p" "$signal_file" | head -n 1; }

# Fields of the recorded update check: observed, installed, latest, state, fetched.
read_update_status() {
  update_checked=-; update_latest=-; update_state=unknown; update_fetched=-
  [ -f "$update_status_file" ] || return 0
  IFS="$(printf '\t')" read -r update_header update_checked update_installed update_latest update_state update_fetched update_rest \
    < "$update_status_file" || return 0
  [ "$update_header" = LOSPOR-HOSPITAL-UPDATE-STATUS-V1 ] || { update_checked=-; update_latest=-; update_state=unknown; update_fetched=-; }
}

# grade VALUE -> ok | attention | action
grade() {
  case "$1:$2" in
    services:healthy|storage:ok|clock:synchronized|backup:fresh|offHostBackup:acknowledged) echo ok ;;
    keyEscrow:acknowledged|certificate:valid|updateAgent:healthy|updateAgent:not-installed) echo ok ;;
    updateSupply:connected|updateSupply:offline|restoreLock:clear|activationLock:clear) echo ok ;;
    storage:low|storage:unknown|clock:*|backup:aging|offHostBackup:aging|offHostBackup:pending) echo attention ;;
    offHostBackup:not-configured|keyEscrow:stale|certificate:expiring|certificate:unknown|updateAgent:*) echo attention ;;
    *) echo action ;;
  esac
}

label() {
  case "$1" in
    services) operator_text "Services" "Услуги" ;;
    storage) operator_text "Disk space" "Дисково пространство" ;;
    clock) operator_text "Clock" "Часовник" ;;
    backup) operator_text "Backup on this server" "Резервно копие на сървъра" ;;
    offHostBackup) operator_text "Backup copy elsewhere" "Копие на друго място" ;;
    keyEscrow) operator_text "Secrets kept elsewhere" "Тайни, пазени другаде" ;;
    certificate) operator_text "Certificate" "Сертификат" ;;
    updateAgent) operator_text "Update agent" "Агент за обновяване" ;;
    updateSupply) operator_text "Update route" "Път за обновяване" ;;
    restoreLock) operator_text "Restore in progress" "Текущо възстановяване" ;;
    activationLock) operator_text "Update in progress" "Текущо обновяване" ;;
  esac
}

word() {
  case "$1:$2" in
    *:healthy) operator_text "working" "работят" ;;
    *:degraded) operator_text "some are not working" "някои не работят" ;;
    *:ok) operator_text "enough" "достатъчно" ;;
    *:low) operator_text "running low" "намалява" ;;
    *:critical) operator_text "almost full" "почти запълнено" ;;
    *:synchronized) operator_text "correct" "вярно" ;;
    *:unsynchronized) operator_text "not synchronized" "не е синхронизиран" ;;
    *:fresh) operator_text "recent" "скорошно" ;;
    *:aging) operator_text "getting old" "остарява" ;;
    *:overdue) operator_text "overdue" "закъсняло" ;;
    *:missing) operator_text "missing" "липсва" ;;
    *:pending) operator_text "being copied" "копира се" ;;
    *:acknowledged) operator_text "confirmed" "потвърдено" ;;
    *:not-configured) operator_text "not set up" "не е настроено" ;;
    *:stale) operator_text "out of date" "неактуално" ;;
    *:valid) operator_text "valid" "валиден" ;;
    *:expiring) operator_text "expires soon" "изтича скоро" ;;
    *:expired) operator_text "expired" "изтекъл" ;;
    *:not-installed) operator_text "not used (console updates)" "не се използва (обновяване от конзолата)" ;;
    *:connected) operator_text "internet" "интернет" ;;
    *:offline) operator_text "offline media" "офлайн носител" ;;
    *:clear) operator_text "no" "не" ;;
    *:present) operator_text "yes" "да" ;;
    *:invalid) operator_text "damaged" "повредено" ;;
    *) operator_text "unknown" "неизвестно" ;;
  esac
}

next_step() {
  case "$1:$2" in
    services:*) operator_text "Run: sudo losporctl check" "Изпълнете: sudo losporctl check" ;;
    storage:*) operator_text "Free disk space or add storage." "Освободете или добавете дисково пространство." ;;
    clock:*) operator_text "Turn on time synchronization: sudo timedatectl set-ntp true" "Включете синхронизацията на часа: sudo timedatectl set-ntp true" ;;
    backup:*) operator_text "Run: sudo losporctl backup run" "Изпълнете: sudo losporctl backup run" ;;
    offHostBackup:*) operator_text "Set up the copy elsewhere: see Backups in the documentation." "Настройте копието на друго място: вижте „Резервни копия“ в документацията." ;;
    keyEscrow:*) operator_text "Copy site.env, .env and secrets/ to the hospital's safe, then run: sudo sh /opt/lospor-hospital/current/scripts/acknowledge-secrets-escrow.sh" "Копирайте site.env, .env и secrets/ в сейфа на болницата и изпълнете: sudo sh /opt/lospor-hospital/current/scripts/acknowledge-secrets-escrow.sh" ;;
    certificate:*) operator_text "Renew or replace the certificate before it expires." "Подновете или сменете сертификата, преди да изтече." ;;
    updateAgent:*) operator_text "Run: sudo systemctl restart lospor-update-agent" "Изпълнете: sudo systemctl restart lospor-update-agent" ;;
    activationLock:*) operator_text "Run: sudo losporctl update recover" "Изпълнете: sudo losporctl update recover" ;;
    restoreLock:*) operator_text "A restore is running or was interrupted; see Backups in the documentation." "Възстановяване тече или е прекъснато; вижте „Резервни копия“ в документацията." ;;
    *) operator_text "Run: sudo losporctl check" "Изпълнете: sudo losporctl check" ;;
  esac
}

STATUS_CHECKS="services storage clock backup offHostBackup keyEscrow certificate updateAgent updateSupply restoreLock activationLock"

# Refresh the host observation, then read it. The probe is the same one Status
# reads every minute; its output is enums and a time, nothing identifying.
observe() {
  sh "$root/scripts/host-observability-probe.sh" >/dev/null 2>&1 || true
  [ -s "$signal_file" ] && [ -n "$(signal_field observedAt)" ] || {
    operator_error "The appliance could not be observed. Run: sudo losporctl check" "Състоянието на системата не може да бъде наблюдавано. Изпълнете: sudo losporctl check"
    exit 1
  }
  overall=ok
  for check in $STATUS_CHECKS; do
    case "$(grade "$check" "$(signal_field "$check")")" in
      action) overall=action-required ;;
      attention) [ "$overall" = action-required ] || overall=attention ;;
    esac
  done
  read_update_status
  [ "$update_state" != update-available ] || [ "$overall" != ok ] || overall=attention
  release=none
  if release_state_read "$appliance_home" 2>/dev/null; then release="$state_version"; fi
}

status_json() {
  printf '{"schemaVersion":1,"release":"%s","overall":"%s","observedAt":"%s","checks":{' "$release" "$overall" "$(signal_field observedAt)"
  separator=""
  for check in $STATUS_CHECKS; do
    printf '%s"%s":"%s"' "$separator" "$check" "$(signal_field "$check")"
    separator=","
  done
  printf '},"updates":{"state":"%s","latestVersion":"%s","checkedAt":"%s"}}' "$update_state" "$update_latest" "$update_checked"
}

status_command() {
  [ "$#" -eq 0 ] || fail_usage "Usage: sudo losporctl status [--json]" "Употреба: sudo losporctl status [--json]"
  observe
  if [ "$json" -eq 1 ]; then status_json; printf '\n'; return 0; fi
  if [ "$release" = none ]; then
    say "LOSPOR Hospital: no release is installed." "LOSPOR Hospital: няма инсталирана версия."
  else
    say "LOSPOR Hospital $release" "LOSPOR Hospital $release"
  fi
  case "$overall" in
    ok) say "Overall: all good" "Общо: всичко е наред" ;;
    attention) say "Overall: needs attention soon" "Общо: скоро е нужно внимание" ;;
    *) say "Overall: action required" "Общо: нужно е действие" ;;
  esac
  for check in $STATUS_CHECKS; do
    value="$(signal_field "$check")"
    marker="  "
    case "$(grade "$check" "$value")" in attention) marker="! " ;; action) marker="X " ;; esac
    printf '%s%s: %s\n' "$marker" "$(label "$check")" "$(word "$check" "$value")"
  done
  case "$update_state" in
    update-available) printf '! %s: %s\n' "$(operator_text Updates Обновявания)" "$(operator_text "release $update_latest is available" "има версия $update_latest")" ;;
    current) printf '  %s: %s\n' "$(operator_text Updates Обновявания)" "$(operator_text "up to date" "актуална")" ;;
    *)
      if [ "$update_checked" = - ]; then
        printf '  %s: %s\n' "$(operator_text Updates Обновявания)" "$(operator_text "not checked yet" "още не е проверено")"
      else
        printf '! %s: %s\n' "$(operator_text Updates Обновявания)" "$(operator_text "the last check at $update_checked failed" "последната проверка в $update_checked не успя")"
      fi
      ;;
  esac
  printed=0
  for check in $STATUS_CHECKS; do
    [ "$(grade "$check" "$(signal_field "$check")")" != ok ] || continue
    [ "$printed" -eq 1 ] || { say "" ""; say "Next steps:" "Следващи стъпки:"; printed=1; }
    printf '  - %s\n' "$(next_step "$check" "$(signal_field "$check")")"
  done
  if [ "$update_state" = update-available ]; then
    [ "$printed" -eq 1 ] || { say "" ""; say "Next steps:" "Следващи стъпки:"; }
    printf '  - %s\n' "$(operator_text "Download the update: sudo losporctl update download" "Изтеглете обновяването: sudo losporctl update download")"
  fi
}

# A token that can go in a support bundle: short, and nothing that can carry a
# name, an address, a path or free text.
safe_token() {
  printf '%s' "$1" | tr -d '\r\n' | grep -Eqx '[A-Za-z0-9._+:-]{1,64}' && { printf '%s' "$1"; return 0; }
  printf 'redacted'
}

support_bundle_command() {
  [ "${1:-}" = create ] && [ "$#" -eq 1 ] \
    || fail_usage "Usage: sudo losporctl support-bundle create" "Употреба: sudo losporctl support-bundle create"
  observe
  created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  doctor_result=0
  sh "$root/scripts/doctor.sh" >/dev/null 2>&1 || doctor_result=$?
  lock_sha=-
  [ "$release" = none ] || lock_sha="$state_lock_sha"
  os_id="$(sed -n 's/^ID=//p' /etc/os-release 2>/dev/null | tr -d '"' | head -n 1)"
  os_version="$(sed -n 's/^VERSION_ID=//p' /etc/os-release 2>/dev/null | tr -d '"' | head -n 1)"
  docker_version="$(docker version --format '{{.Server.Version}}' 2>/dev/null || true)"
  compose_version="$(docker compose version --short 2>/dev/null || true)"
  services_report="$(cd "$root" && docker compose ps --all --format '{{.Service}}|{{.State}}|{{.Health}}' 2>/dev/null || true)"
  applied_log="$appliance_home/.data/config/applied.v1.tsv"
  applied_count=0; applied_last=-
  if [ -f "$applied_log" ]; then
    applied_count="$(wc -l < "$applied_log" | tr -d '[:space:]')"
    applied_last="$(tail -n 1 "$applied_log" | cut -f 1)"
  fi

  bundle_directory="$appliance_home/.data/support"
  (umask 077; mkdir -p "$bundle_directory")
  chmod 700 "$bundle_directory"
  bundle="$bundle_directory/lospor-support-$(date -u +%Y%m%dT%H%M%SZ).json"
  (umask 077
    {
      printf '{"schemaVersion":1,"bundleType":"lospor-hospital-support","createdAt":"%s",' "$created_at"
      printf '"release":"%s","releaseLockSha256":"%s",' "$(safe_token "$release")" "$(safe_token "$lock_sha")"
      printf '"host":{"os":"%s","osVersion":"%s","kernel":"%s","architecture":"%s","docker":"%s","compose":"%s"},' \
        "$(safe_token "$os_id")" "$(safe_token "$os_version")" "$(safe_token "$(uname -r 2>/dev/null)")" \
        "$(safe_token "$(uname -m 2>/dev/null)")" "$(safe_token "$docker_version")" "$(safe_token "$compose_version")"
      printf '"status":'
      status_json
      printf ',"services":{'
      separator=""
      for service in api web pwa browser status caddy postgres backup delivery-worker; do
        record="$(printf '%s\n' "$services_report" | awk -F'|' -v service="$service" '$1 == service { print $2 ":" $3; exit }')"
        printf '%s"%s":"%s"' "$separator" "$service" "$(safe_token "${record:-absent}")"
        separator=","
      done
      printf '},"checks":{"doctorExitCode":%s},' "$doctor_result"
      printf '"configuration":{"appliedChanges":%s,"lastAppliedAt":"%s"}}\n' "$applied_count" "$(safe_token "$applied_last")"
    } > "$bundle")
  chmod 600 "$bundle"
  say "Support bundle written to $bundle" "Файлът за поддръжка е записан в $bundle"
  say "It holds only the fields below: no patients, cases, accounts, names, addresses or secrets." \
      "Съдържа само полетата по-долу: без пациенти, случаи, акаунти, имена, адреси или тайни."
  cat "$bundle"
}

backup_command() {
  action="${1:-}"
  [ "$#" -eq 0 ] || shift
  case "$action" in
    run) [ "$#" -eq 0 ] || fail_usage "Usage: sudo losporctl backup run" "Употреба: sudo losporctl backup run"; run backup-now.sh ;;
    list)
      [ "$#" -eq 0 ] || fail_usage "Usage: sudo losporctl backup list" "Употреба: sudo losporctl backup list"
      found=0
      for backup in "$appliance_home"/backups/lospor-*.backup; do
        [ -e "$backup" ] || continue
        printf '%s\n' "${backup##*/}"; found=1
      done
      [ "$found" -eq 1 ] || say "There are no backups yet. Run: sudo losporctl backup run" "Все още няма резервни копия. Изпълнете: sudo losporctl backup run"
      ;;
    drill)
      [ "$#" -le 1 ] || fail_usage "Usage: sudo losporctl backup drill [NAME]" "Употреба: sudo losporctl backup drill [ИМЕ]"
      name="${1:-}"
      if [ -z "$name" ]; then
        for backup in "$appliance_home"/backups/lospor-*.backup; do [ -e "$backup" ] && name="${backup##*/}"; done
        [ -n "$name" ] || { say "There is no backup to test. Run: sudo losporctl backup run" "Няма резервно копие за проверка. Изпълнете: sudo losporctl backup run"; exit 1; }
      fi
      say "Test-restoring $name into a temporary database. Clinical services keep running." \
          "Пробно възстановяване на $name във временна база данни. Клиничните услуги продължават да работят."
      run restore-backup.sh --temporary "backups/${name##*/}"
      ;;
    *) fail_usage "Usage: sudo losporctl backup run | list | drill [NAME]" "Употреба: sudo losporctl backup run | list | drill [ИМЕ]" ;;
  esac
}

update_command() {
  action="${1:-}"
  [ "$#" -eq 0 ] || shift
  case "$action" in
    check) [ "$#" -eq 0 ] || fail_usage "Usage: sudo losporctl update check" "Употреба: sudo losporctl update check"; run check-for-update.sh ;;
    download)
      [ "$#" -le 1 ] || fail_usage "Usage: sudo losporctl update download [VERSION]" "Употреба: sudo losporctl update download [ВЕРСИЯ]"
      version="${1:-}"
      if [ -z "$version" ]; then
        read_update_status
        [ "$update_state" = update-available ] && [ "$update_latest" != - ] || {
          say "No newer release is known. Run: sudo losporctl update check" "Не е известна по-нова версия. Изпълнете: sudo losporctl update check"
          exit 1
        }
        version="$update_latest"
      fi
      say "Downloading and verifying release $version. Nothing running is changed." \
          "Изтегляне и проверка на версия $version. Нищо работещо не се променя."
      run prepare-verified-release.sh "$version" -
      ;;
    apply)
      [ "$#" -le 1 ] || fail_usage "Usage: sudo losporctl update apply [VERSION]" "Употреба: sudo losporctl update apply [ВЕРСИЯ]"
      version="${1:-}"
      if [ -z "$version" ]; then
        read_update_status
        [ "$update_fetched" != - ] || {
          say "No release has been downloaded. Run: sudo losporctl update download" "Няма изтеглена версия. Изпълнете: sudo losporctl update download"
          exit 1
        }
        version="$update_fetched"
      fi
      installed=none
      if release_state_read "$appliance_home" 2>/dev/null; then installed="$state_version"; fi
      confirm "Update $installed to $version. A backup is taken first, and services restart: choose a gap between lists." \
              "Обновяване от $installed до $version. Първо се прави резервно копие и услугите се рестартират: изберете време между листите."
      run apply-prepared-release.sh "$version" -
      ;;
    offline)
      [ "$#" -eq 1 ] || fail_usage "Usage: sudo losporctl update offline DIRECTORY" "Употреба: sudo losporctl update offline ДИРЕКТОРИЯ"
      media="$(CDPATH= cd -- "$1" 2>/dev/null && pwd -P)" \
        || { operator_error "The directory does not exist: $1" "Директорията не съществува: $1"; exit 2; }
      set -- "$media"/lospor-hospital-*-release.lock
      [ -f "$1" ] && [ "$#" -eq 1 ] \
        || { operator_error "The directory must hold exactly one release.lock." "Директорията трябва да съдържа точно един release.lock."; exit 2; }
      lock="$1"
      version="${lock##*/lospor-hospital-}"; version="${version%-release.lock}"
      confirm "Install release $version from $media. It is verified first, a backup is taken, and services restart." \
              "Инсталиране на версия $version от $media. Първо се проверява, прави се резервно копие и услугите се рестартират."
      run load-offline.sh "$lock" "$lock.sha256" "$media"
      ;;
    recover)
      case "${1:-inspect}" in
        inspect) run recover-release-activation.sh inspect ;;
        resume-rollback|verify-and-clear) run recover-release-activation.sh "$@" ;;
        *) fail_usage "Usage: sudo losporctl update recover [inspect | resume-rollback --confirm | verify-and-clear --confirm-clear]" \
                      "Употреба: sudo losporctl update recover [inspect | resume-rollback --confirm | verify-and-clear --confirm-clear]" ;;
      esac
      ;;
    *) fail_usage "Usage: sudo losporctl update check | download [VERSION] | apply [VERSION] | offline DIRECTORY | recover" \
                  "Употреба: sudo losporctl update check | download [ВЕРСИЯ] | apply [ВЕРСИЯ] | offline ДИРЕКТОРИЯ | recover" ;;
  esac
}

config_command() {
  action="${1:-}"
  [ "$#" -le 1 ] || fail_usage "Usage: sudo losporctl config show | plan | apply" "Употреба: sudo losporctl config show | plan | apply"
  case "$action" in
    show)
      [ -f "$appliance_home/site.env" ] || { say "site.env does not exist yet." "site.env все още не съществува."; exit 1; }
      cat "$appliance_home/site.env"
      ;;
    plan) run apply-site-config.sh --plan ;;
    apply)
      if [ "$assume_yes" -eq 0 ]; then
        run apply-site-config.sh --plan
        confirm "Services whose settings changed will restart." "Услугите с променени настройки ще се рестартират."
      fi
      run apply-site-config.sh --yes
      ;;
    *) fail_usage "Usage: sudo losporctl config show | plan | apply" "Употреба: sudo losporctl config show | plan | apply" ;;
  esac
}

accounts_command() {
  [ "${1:-}" = operator ] && [ "$#" -eq 2 ] || fail_usage \
    "Usage: sudo losporctl accounts operator state | verify | rotate | transfer | repair | recovery-token" \
    "Употреба: sudo losporctl accounts operator state | verify | rotate | transfer | repair | recovery-token"
  case "$2" in
    state|verify|rotate|transfer|recovery-token|abort-pending|reconcile-restore) run appliance-operator.sh "$2" ;;
    repair) run appliance-operator.sh repair-status ;;
    *) fail_usage "Usage: sudo losporctl accounts operator state | verify | rotate | transfer | repair | recovery-token" \
                  "Употреба: sudo losporctl accounts operator state | verify | rotate | transfer | repair | recovery-token" ;;
  esac
}

secrets_command() {
  [ "$#" -eq 1 ] || fail_usage "Usage: sudo losporctl secrets state | rotate | commit | rollback | cleanup" \
                               "Употреба: sudo losporctl secrets state | rotate | commit | rollback | cleanup"
  case "$1" in
    state|cleanup) run rotate-operational-secrets.sh "$1" ;;
    rotate)
      say "Preparing a rotation of the ordinary credentials. Nothing running changes until: sudo losporctl secrets commit" \
          "Подготовка на смяна на обикновените данни за достъп. Нищо работещо не се променя до: sudo losporctl secrets commit"
      run rotate-operational-secrets.sh prepare ordinary
      ;;
    commit)
      confirm "Commit the prepared rotation. Everyone signs in again, and services restart." \
              "Прилагане на подготвената смяна. Всички влизат отново и услугите се рестартират."
      run rotate-operational-secrets.sh commit
      ;;
    rollback)
      confirm "Discard or reverse the prepared rotation." "Отказ или връщане на подготвената смяна."
      run rotate-operational-secrets.sh rollback
      ;;
    *) fail_usage "Usage: sudo losporctl secrets state | rotate | commit | rollback | cleanup" \
                  "Употреба: sudo losporctl secrets state | rotate | commit | rollback | cleanup" ;;
  esac
}

case "$family" in
  status) status_command "$@" ;;
  check)
    case "$#:${1:-}" in
      0:) run doctor.sh ;;
      1:--go-live) run doctor.sh --go-live ;;
      *) fail_usage "Usage: sudo losporctl check [--go-live]" "Употреба: sudo losporctl check [--go-live]" ;;
    esac
    ;;
  backup) backup_command "$@" ;;
  support-bundle) support_bundle_command "$@" ;;
  update) update_command "$@" ;;
  config) config_command "$@" ;;
  accounts) accounts_command "$@" ;;
  secrets) secrets_command "$@" ;;
  *) usage >&2; exit 2 ;;
esac
