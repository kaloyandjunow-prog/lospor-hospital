#!/bin/sh
set -eu

# Explicitly cancel durable update intent before any mutation begins. The same
# kernel lock is held by the agent while it consumes or acts on a request, so a
# successful cancellation cannot race an apply across the maintenance-window
# boundary.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$root/scripts/installed-release-state.sh"
. "$root/scripts/update-pipeline-lib.sh"
appliance_home="$(release_state_appliance_home "$root")"
update_pipeline_init "$root" "$appliance_home"
. "$root/scripts/operator-locale.sh"
operator_locale_load "$appliance_home"

action="${1:-}"
expected_id="${2:-}"
case "$action" in prepare|apply) ;; *)
  operator_error \
    "Usage: $0 prepare|apply [exact-request-id]" \
    "Употреба: $0 prepare|apply [точен-идентификатор-на-заявката]"
  exit 2
  ;;
esac
[ -z "$expected_id" ] || printf '%s\n' "$expected_id" | grep -Eq '^[a-f0-9]{32}$' \
  || { operator_error "Invalid request ID." "Невалиден идентификатор на заявка."; exit 2; }
[ "${HOSPITAL_UPDATE_TEST_ONLY:-0}" = 1 ] || [ "$(id -u)" -eq 0 ] \
  || { operator_error "Run this command as root." "Изпълнете командата като root."; exit 2; }
command -v flock >/dev/null 2>&1 \
  || { operator_error "The host command flock is required." "Необходима е системната команда flock."; exit 2; }

lock="$update_private_dir/request-agent.lock"
umask 077
[ ! -L "$lock" ] && { [ ! -e "$lock" ] || [ -f "$lock" ]; } \
  || { operator_error "The update request lock is unsafe." "Заключването на заявките за обновяване е небезопасно."; exit 1; }
: >> "$lock"
chmod 0600 "$lock"
[ "$(stat -c %h "$lock" 2>/dev/null || echo 0)" = 1 ] \
  || { operator_error "The update request lock is unsafe." "Заключването на заявките за обновяване е небезопасно."; exit 1; }
if [ "${HOSPITAL_UPDATE_TEST_ONLY:-0}" != 1 ]; then
  [ "$(stat -c %u "$lock" 2>/dev/null || echo -)" = 0 ] \
    && [ "$(stat -c %a "$lock" 2>/dev/null || echo -)" = 600 ] \
    || { operator_error "The update request lock is unsafe." "Заключването на заявките за обновяване е небезопасно."; exit 1; }
fi
exec 9>"$lock"
cancel_wait="${HOSPITAL_UPDATE_CANCEL_WAIT_SECONDS:-30}"
case "$cancel_wait" in ''|*[!0-9]*) operator_error "Invalid cancellation wait." "Невалидно време за изчакване при отмяна."; exit 2 ;; esac
[ "$cancel_wait" -ge 1 ] && [ "$cancel_wait" -le 300 ] \
  || { operator_error "Invalid cancellation wait." "Невалидно време за изчакване при отмяна."; exit 2; }
flock -w "$cancel_wait" 9 \
  || { operator_error \
    "The update agent is busy. Nothing was cancelled; inspect its state and try again." \
    "Агентът за обновяване е зает. Нищо не е отменено; проверете състоянието и опитайте отново."; exit 1; }

if [ -e "$update_activation_lock" ]; then
  operator_error \
    "Activation has already started. This request cannot be cancelled; inspect the activation lock." \
    "Активирането вече е започнало. Заявката не може да бъде отменена; проверете заключването за активиране."
  exit 1
fi
if update_transition_read; then
  case "$transition_phase" in
    PREPARING|APPLYING)
      operator_error \
        "The request is already active and cannot be cancelled safely." \
        "Заявката вече се изпълнява и не може да бъде отменена безопасно."
      exit 1
      ;;
  esac
fi

pending="$update_requests_dir/$action.request.v2.tsv"
inflight="$update_inflight_dir/$action.request.v2.tsv"
if [ -e "$pending" ] && [ -e "$inflight" ]; then
  operator_error \
    "Both pending and in-flight requests exist. Nothing was changed; inspect the update state." \
    "Има едновременно чакаща и започната заявка. Нищо не е променено; проверете състоянието на обновяването."
  exit 1
fi
request="$pending"
[ -e "$request" ] || request="$inflight"
[ -e "$request" ] || {
  operator_error "There is no cancellable $action request." "Няма заявка за $action, която може да бъде отменена."
  exit 1
}
[ -f "$request" ] && [ ! -L "$request" ] \
  && [ "$(stat -c %h "$request" 2>/dev/null || echo 0)" = 1 ] \
  || { operator_error "The request is unsafe. Nothing was changed." "Заявката е небезопасна. Нищо не е променено."; exit 1; }
if ! update_parse_request "$request" "$action"; then
  operator_error \
    "The request is malformed. Nothing was changed; inspect it as root." \
    "Заявката е невалидна. Нищо не е променено; проверете я като root."
  exit 1
fi
[ -z "$expected_id" ] || [ "$request_id" = "$expected_id" ] || {
  operator_error \
    "The waiting request has a different ID. Nothing was cancelled." \
    "Чакащата заявка има друг идентификатор. Нищо не е отменено."
  exit 1
}

cancelled="$update_private_dir/.cancelled.$action.$request_id.$$"
mv "$request" "$cancelled"
update_transition_write FAILED "$action" "$request_id" "$request_target_version" UPDATE_CANCELLED -
update_projection_write failed UPDATE_CANCELLED "$request_target_version"
rm -f "$cancelled"
update_sync_path "$update_private_dir"
operator_say \
  "Cancelled $action request $request_id for $request_target_version. No release was changed." \
  "Отменена е заявката за $action с идентификатор $request_id за версия $request_target_version. Няма променена версия."
