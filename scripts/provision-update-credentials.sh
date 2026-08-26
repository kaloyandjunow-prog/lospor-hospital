#!/bin/sh
set -eu
set +x

# Provision or rotate this appliance's two independent, read-only publication
# credentials. Secret values are accepted only on stdin: never argv, the
# environment, a command trace, Status, or a persistent Docker config.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$root/scripts/installed-release-state.sh"
. "$root/scripts/operator-locale.sh"
. "$root/scripts/update-pipeline-lib.sh"

kind="${1:-}"
[ "$#" -eq 1 ] || kind=""
case "$kind" in github-release|ghcr) ;;
  *)
    operator_error \
      "Usage: sudo sh scripts/provision-update-credentials.sh <github-release|ghcr> (credential data on stdin)" \
      "Употреба: sudo sh scripts/provision-update-credentials.sh <github-release|ghcr> (данните се подават чрез стандартния вход)"
    exit 2
    ;;
esac
if [ "${HOSPITAL_CREDENTIAL_TEST_ONLY:-0}" != 1 ] && [ "$(id -u)" -ne 0 ]; then
  operator_error "This credential operation must run as root." "Тази операция с данни за достъп трябва да се изпълни като root."
  exit 1
fi

appliance_home="$(release_state_appliance_home "$root")"
operator_locale_load "$appliance_home"
case "$appliance_home" in ""|/) operator_error "Unsafe appliance home." "Небезопасна основна директория на системата."; exit 1 ;; esac
secrets_root="$appliance_home/secrets"
registry_dir="$secrets_root/registry"
for directory in "$secrets_root" "$registry_dir"; do
  [ ! -L "$directory" ] && { [ ! -e "$directory" ] || [ -d "$directory" ]; } \
    || { operator_error "Credential directory is unsafe." "Директорията за данни за достъп е небезопасна."; exit 1; }
  mkdir -p "$directory"
  chmod 0700 "$directory"
  if [ "${HOSPITAL_CREDENTIAL_TEST_ONLY:-0}" != 1 ]; then
    chown 0:0 "$directory"
    [ "$(stat -c %u "$directory" 2>/dev/null || echo -)" = 0 ] \
      && [ "$(stat -c %a "$directory" 2>/dev/null || echo -)" = 700 ] \
      || { operator_error "Credential directory ownership or mode is unsafe." "Собственикът или правата на директорията за достъп са небезопасни."; exit 1; }
  fi
done

input_echo_disabled=0
read_line() {
  hidden="${1:-0}"
  if [ "$hidden" = 1 ] && [ -t 0 ]; then
    command -v stty >/dev/null 2>&1 \
      || { operator_error "Cannot safely disable terminal echo." "Ехото на терминала не може да бъде изключено безопасно."; return 1; }
    stty -echo
    input_echo_disabled=1
  fi
  read_result=""
  read_status=0
  IFS= read -r read_result || read_status=$?
  if [ "$input_echo_disabled" -eq 1 ]; then
    stty echo
    input_echo_disabled=0
    printf '\n' >&2
  fi
  [ "$read_status" -eq 0 ] || [ -n "$read_result" ]
}

reject_extra_input() {
  [ ! -t 0 ] || return 0
  extra_input=""
  if IFS= read -r extra_input || [ -n "$extra_input" ]; then
    operator_error "Credential input contains unexpected extra lines." "Входът с данни за достъп съдържа неочаквани допълнителни редове."
    return 1
  fi
}

target_is_safe() {
  target="$1"
  [ ! -L "$target" ] && { [ ! -e "$target" ] || [ -f "$target" ]; } \
    && { [ ! -e "$target" ] || [ "$(stat -c %h "$target" 2>/dev/null || echo 0)" = 1 ]; }
}

write_temporary() {
  temporary_path="$1"
  temporary_value="$2"
  umask 077
  (set +x; printf '%s\n' "$temporary_value") > "$temporary_path"
  chmod 0600 "$temporary_path"
  if [ "${HOSPITAL_CREDENTIAL_TEST_ONLY:-0}" != 1 ]; then chown 0:0 "$temporary_path"; fi
  update_sync_path "$temporary_path"
}

temporary_one="$registry_dir/.${kind}-one.tmp.$$"
temporary_two="$registry_dir/.${kind}-two.tmp.$$"
cleanup_credentials() {
  if [ "$input_echo_disabled" -eq 1 ]; then stty echo 2>/dev/null || true; fi
  rm -f "$temporary_one" "$temporary_two" 2>/dev/null || true
  github_token=""; ghcr_user=""; ghcr_token=""; read_result=""; temporary_value=""
}
trap cleanup_credentials EXIT HUP INT TERM

case "$kind" in
  github-release)
    [ ! -t 0 ] || operator_eprintf "GitHub Releases read token: " "Токен за четене от GitHub Releases: "
    read_line 1 || { operator_error "A GitHub Releases token is required on stdin." "Чрез стандартния вход е необходим токен за GitHub Releases."; exit 2; }
    github_token="$read_result"; read_result=""
    reject_extra_input || exit 2
    printf '%s\n' "$github_token" | LC_ALL=C grep -Eq "$UPDATE_TOKEN_FORMAT_PATTERN" \
      || { operator_error "The GitHub Releases token format is invalid." "Форматът на токена за GitHub Releases е невалиден."; exit 2; }
    target="$registry_dir/github-release-token"
    target_is_safe "$target" \
      || { operator_error "The GitHub Releases credential path is unsafe." "Пътят на данните за достъп до GitHub Releases е небезопасен."; exit 1; }
    write_temporary "$temporary_one" "$github_token"
    github_token=""
    update_durable_replace "$temporary_one" "$target"
    if [ "${HOSPITAL_CREDENTIAL_TEST_ONLY:-0}" != 1 ]; then
      [ "$(stat -c %u "$target" 2>/dev/null || echo -)" = 0 ] \
        && [ "$(stat -c %a "$target" 2>/dev/null || echo -)" = 600 ] \
        || { operator_error "The stored credential ownership or mode is unsafe." "Собственикът или правата на записаните данни за достъп са небезопасни."; exit 1; }
    fi
    operator_say "The per-hospital GitHub Releases credential was stored or rotated." "Данните за достъп на тази болница до GitHub Releases са записани или подменени."
    ;;
  ghcr)
    [ ! -t 0 ] || operator_eprintf "GHCR username: " "Потребителско име за GHCR: "
    read_line 0 || { operator_error "The GHCR username is required as the first stdin line." "Потребителското име за GHCR е необходимо на първия ред от стандартния вход."; exit 2; }
    ghcr_user="$read_result"; read_result=""
    [ ! -t 0 ] || operator_eprintf "GHCR read token: " "Токен за четене от GHCR: "
    read_line 1 || { operator_error "The GHCR read token is required as the second stdin line." "Токенът за четене от GHCR е необходим на втория ред от стандартния вход."; exit 2; }
    ghcr_token="$read_result"; read_result=""
    reject_extra_input || exit 2
    printf '%s\n' "$ghcr_user" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?$' \
      && ! printf '%s\n' "$ghcr_user" | grep -q -- '--' \
      || { operator_error "The GHCR username format is invalid." "Форматът на потребителското име за GHCR е невалиден."; exit 2; }
    printf '%s\n' "$ghcr_token" | LC_ALL=C grep -Eq "$UPDATE_TOKEN_FORMAT_PATTERN" \
      || { operator_error "The GHCR read-token format is invalid." "Форматът на токена за четене от GHCR е невалиден."; exit 2; }
    user_target="$registry_dir/ghcr-user"
    token_target="$registry_dir/ghcr-token"
    target_is_safe "$user_target" && target_is_safe "$token_target" \
      || { operator_error "A GHCR credential path is unsafe." "Път на данните за достъп до GHCR е небезопасен."; exit 1; }
    write_temporary "$temporary_one" "$ghcr_user"
    write_temporary "$temporary_two" "$ghcr_token"
    ghcr_user=""; ghcr_token=""
    # The token is committed first. A power loss between these two durable
    # publications can only make authentication fail; it cannot select a
    # different release or expose either value.
    update_durable_replace "$temporary_two" "$token_target"
    update_durable_replace "$temporary_one" "$user_target"
    if [ "${HOSPITAL_CREDENTIAL_TEST_ONLY:-0}" != 1 ]; then
      for target in "$user_target" "$token_target"; do
        [ "$(stat -c %u "$target" 2>/dev/null || echo -)" = 0 ] \
          && [ "$(stat -c %a "$target" 2>/dev/null || echo -)" = 600 ] \
          || { operator_error "The stored credential ownership or mode is unsafe." "Собственикът или правата на записаните данни за достъп са небезопасни."; exit 1; }
      done
    fi
    operator_say "The per-hospital GHCR read credential was stored or rotated." "Данните за четене на тази болница от GHCR са записани или подменени."
    ;;
esac
