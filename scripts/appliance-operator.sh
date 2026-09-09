#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
. "$root/scripts/installed-release-state.sh"
if [ "${HOSPITAL_RELEASE_TRANSITION:-}" = 1 ]; then
  release_state_assert_verified_transition "$root"
else
  appliance_home="$(release_state_appliance_home "$root")"
  set +e
  release_state_apply "$appliance_home"
  release_state_result=$?
  set -e
  case "$release_state_result" in
    0) root="$state_release_root" ;;
    10) ;;
    *) exit "$release_state_result" ;;
  esac
fi
cd "$root"
. "$root/scripts/operator-locale.sh"
operator_locale_load "$root"

usage() {
  if [ "$LOSPOR_OPERATOR_LOCALE" = en ]; then
    cat >&2 <<'EOF'
Usage: scripts/appliance-operator.sh ACTION

Actions:
  initialize         Select an existing ADMIN during an appliance upgrade
  rotate             Change the current operator password
  transfer           Move operator responsibility to another existing ADMIN
  repair-status      Rebuild an empty Status credential store from clinical truth
  reconcile-restore  Re-synchronize credentials after restoring an older backup
  abort-pending      Safely abort a change that was not applied to the clinical DB
  recovery-token     Issue a one-use, 15-minute Status login token
  state              Show only credential generations and pending state
  verify             Silently verify that both credential stores agree
EOF
  else
    cat >&2 <<'EOF'
Употреба: scripts/appliance-operator.sh ДЕЙСТВИЕ

Действия:
  initialize         Избор на съществуващ ADMIN при обновяване на системата
  rotate             Промяна на паролата на текущия оператор
  transfer           Прехвърляне на отговорността към друг съществуващ ADMIN
  repair-status      Възстановяване на празното хранилище за достъп на Status от клиничните данни
  reconcile-restore  Синхронизиране на достъпа след възстановяване на по-старо резервно копие
  abort-pending      Безопасно прекратяване на промяна, която не е приложена в клиничната база
  recovery-token     Издаване на еднократен код за 15-минутен достъп до Status
  state              Показване само на поколенията и чакащото състояние на достъпа
  verify             Тиха проверка, че двете хранилища за достъп съвпадат
EOF
  fi
  exit 2
}

action="${1:-}"
[ "$#" -eq 1 ] || usage
case "$action" in
  initialize|rotate|transfer|repair-status|reconcile-restore|abort-pending|recovery-token|state|verify) ;;
  *) usage ;;
esac

test -f .env || {
  operator_error "Hospital is not configured." "Болничната система не е конфигурирана."
  exit 1
}
./scripts/ensure-status-secrets.sh >/dev/null
# Ordinary operator maintenance is also a supported certificate-maintenance
# entry point. A no-op check leaves Status untouched; a replaced pair is
# restarted and fingerprint-verified before the requested account action.
sh scripts/renew-status-fallback-certificate.sh >/dev/null

if [ -n "${HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD:-}" ]; then
  operator_error "Password environment variables are not accepted." "Не се приемат пароли чрез променливи на средата."
  exit 2
fi

status_cli() {
  docker compose run --rm --no-deps -T status node dist/cli.js "$@"
}

clinical_operator() {
  docker compose --profile tools run --rm --no-deps -T tools \
    ./node_modules/.bin/tsx --conditions=react-server scripts/appliance-operator.ts
}

clinical_state_json() {
  docker compose --profile tools run --rm --no-deps -T tools \
    ./node_modules/.bin/tsx --conditions=react-server scripts/appliance-operator-state.ts
}

load_clinical_state() {
  state_record="$(clinical_state_json | sh scripts/container-node.sh scripts/parse-operator-state.mjs clinical)" || return 1
  set -- $state_record
  CLINICAL_INITIALIZED="$1"
  CLINICAL_GENERATION="$2"
}

load_status_state() {
  state_record="$(printf '{}\n' | status_cli auth-state | sh scripts/container-node.sh scripts/parse-operator-state.mjs status)" || return 1
  set -- $state_record
  STATUS_INITIALIZED="$1"
  STATUS_GENERATION="$2"
  STATUS_PENDING_TRANSACTION="$3"
  STATUS_PENDING_GENERATION="$4"
}

prompt_email_and_password() {
  label="$1"
  operator_eprintf "%s email: " "%s — имейл: " "$label"
  IFS= read -r OPERATOR_EMAIL
  [ -n "$OPERATOR_EMAIL" ] || {
    operator_error "An operator email is required." "Имейлът на оператора е задължителен."
    exit 2
  }

  operator_eprintf "%s password: " "%s — парола: " "$label"
  if [ -t 0 ]; then stty -echo; fi
  IFS= read -r OPERATOR_PASSWORD
  if [ -t 0 ]; then stty echo; fi
  operator_eprintf "\nConfirm password: " "\nПотвърдете паролата: "
  if [ -t 0 ]; then stty -echo; fi
  IFS= read -r OPERATOR_PASSWORD_CONFIRM
  if [ -t 0 ]; then stty echo; fi
  printf "\n" >&2

  if [ "$OPERATOR_PASSWORD" != "$OPERATOR_PASSWORD_CONFIRM" ]; then
    unset OPERATOR_PASSWORD OPERATOR_PASSWORD_CONFIRM
    operator_error "Passwords did not match." "Паролите не съвпадат."
    exit 2
  fi
  unset OPERATOR_PASSWORD_CONFIRM
}

commit_status_transaction() {
  transaction_id="$1"
  printf '%s\n' "$transaction_id" \
    | sh scripts/container-node.sh scripts/credential-json.mjs transaction \
    | status_cli auth-commit >/dev/null
}

abort_status_transaction() {
  transaction_id="$1"
  printf '%s\n' "$transaction_id" \
    | sh scripts/container-node.sh scripts/credential-json.mjs transaction \
    | status_cli auth-abort >/dev/null
}

acquire_operation_lock() {
  lock_dir="secrets/status/.operator-operation.lock"
  if ! mkdir "$lock_dir" 2>/dev/null; then
    operator_error "Another appliance-operator operation is already running." "Вече се изпълнява друга операция за управление на системния оператор."
    exit 1
  fi
  trap 'rmdir "$lock_dir" 2>/dev/null || true' EXIT HUP INT TERM
}

coordinated_change() {
  clinical_operation="$1"

  if [ "$clinical_operation" != reconcile ]; then
    load_status_state
    load_clinical_state
    if [ "$STATUS_INITIALIZED" != true ] || [ "$CLINICAL_INITIALIZED" != true ] \
      || [ "$STATUS_PENDING_TRANSACTION" != "-" ] \
      || [ "$STATUS_GENERATION" -ne "$CLINICAL_GENERATION" ]; then
      operator_error "Status and clinical operator state must be synchronized before this change." "Състоянието на оператора в Status и клиничната система трябва да бъде синхронизирано преди тази промяна."
      operator_error "Run: sh scripts/appliance-operator.sh state" "Изпълнете: sh scripts/appliance-operator.sh state"
      exit 1
    fi
    expected_generation="$STATUS_GENERATION"
  else
    load_status_state
    expected_generation="$STATUS_GENERATION"
  fi

  prepare_result="$(
    printf '%s\n%s\n%s\n' "$OPERATOR_EMAIL" "$OPERATOR_PASSWORD" "$expected_generation" \
      | sh scripts/container-node.sh scripts/credential-json.mjs status-prepare \
      | sh scripts/container-node.sh scripts/validate-operator-credential.mjs \
      | status_cli auth-prepare \
      | sh scripts/container-node.sh scripts/parse-status-prepare.mjs
  )"
  set -- $prepare_result
  transaction_id="$1"
  pending_generation="$2"

  if printf '%s\n%s\n%s\n%s\n' \
      "$clinical_operation" "$OPERATOR_EMAIL" "$OPERATOR_PASSWORD" "$pending_generation" \
      | sh scripts/container-node.sh scripts/credential-json.mjs clinical-operator \
      | clinical_operator; then
    unset OPERATOR_PASSWORD
    if commit_status_transaction "$transaction_id"; then
      docker compose restart api >/dev/null 2>&1 || true
      operator_say "Appliance operator credential synchronized at generation $pending_generation." "Данните за достъп на системния оператор са синхронизирани до поколение $pending_generation."
      return 0
    fi
    operator_error "The clinical credential changed, but Status still has the matching pending change." "Клиничните данни за достъп са променени, но в Status още чака съответстващата промяна."
    operator_error "Re-run the same action with the same credential to finish safely." "Изпълнете отново същото действие със същите данни за достъп, за да завършите безопасно."
    return 1
  fi

  unset OPERATOR_PASSWORD
  # A command can lose its connection after the DB transaction committed. Read
  # the monotonic generation before deciding whether aborting is safe.
  if load_clinical_state; then
    if [ "$CLINICAL_GENERATION" -eq "$pending_generation" ]; then
      commit_status_transaction "$transaction_id"
      docker compose restart api >/dev/null 2>&1 || true
      operator_say "Recovered a committed clinical change at generation $pending_generation." "Възстановена е приложената клинична промяна от поколение $pending_generation."
      return 0
    fi
    if [ "$CLINICAL_GENERATION" -lt "$pending_generation" ]; then
      abort_status_transaction "$transaction_id"
      operator_error "Clinical credential change was rejected; the Status pending change was safely aborted." "Промяната на клиничните данни за достъп е отхвърлена; чакащата промяна в Status е прекратена безопасно."
      return 1
    fi
  fi

  operator_error "Credential state could not be proven after the failure." "След грешката състоянието на данните за достъп не може да бъде потвърдено."
  operator_error "The pending Status credential remains usable; do not guess or delete it." "Чакащите данни за достъп в Status остават използваеми; не ги отгатвайте и не ги изтривайте."
  operator_error "Restore database access, then re-run the same action with the same credential." "Възстановете достъпа до базата данни, след което изпълнете отново същото действие със същите данни за достъп."
  return 1
}

case "$action" in
  state)
    load_status_state
    load_clinical_state
    operator_printf \
      'Status: initialized=%s generation=%s pending_generation=%s\n' \
      'Status: инициализиран=%s поколение=%s чакащо_поколение=%s\n' \
      "$STATUS_INITIALIZED" "$STATUS_GENERATION" "$STATUS_PENDING_GENERATION"
    operator_printf \
      'Clinical DB: initialized=%s generation=%s\n' \
      'Клинична база: инициализирана=%s поколение=%s\n' \
      "$CLINICAL_INITIALIZED" "$CLINICAL_GENERATION"
    exit 0
    ;;
  verify)
    load_status_state
    load_clinical_state
    if [ "$STATUS_INITIALIZED" = false ] && [ "$CLINICAL_INITIALIZED" = false ]; then exit 10; fi
    if [ "$STATUS_INITIALIZED" = false ]; then exit 11; fi
    if [ "$CLINICAL_INITIALIZED" = false ]; then exit 12; fi
    if [ "$STATUS_PENDING_TRANSACTION" != "-" ]; then exit 13; fi
    if [ "$STATUS_GENERATION" -ne "$CLINICAL_GENERATION" ]; then exit 14; fi
    exit 0
    ;;
  recovery-token)
    acquire_operation_lock
    printf '{"ttlMinutes":15}\n' | status_cli recovery-token
    exit 0
    ;;
  abort-pending)
    acquire_operation_lock
    load_status_state
    [ "$STATUS_PENDING_TRANSACTION" != "-" ] || {
      operator_say "No Status credential change is pending." "Няма чакаща промяна на данните за достъп в Status."
      exit 0
    }
    load_clinical_state
    if [ "$CLINICAL_GENERATION" -ge "$STATUS_PENDING_GENERATION" ]; then
      operator_error "Refusing to abort: the clinical DB has reached or passed the pending generation." "Прекратяването е отказано: клиничната база е достигнала или надминала чакащото поколение."
      operator_error "Re-run the original change so Status can commit it." "Изпълнете отново първоначалната промяна, за да може Status да я потвърди."
      exit 1
    fi
    abort_status_transaction "$STATUS_PENDING_TRANSACTION"
    operator_say "Pending Status credential change aborted." "Чакащата промяна на данните за достъп в Status е прекратена."
    exit 0
    ;;
esac

acquire_operation_lock

case "$action" in
  initialize)
    load_status_state
    load_clinical_state
    if [ "$STATUS_GENERATION" -gt 1 ] || [ "$CLINICAL_GENERATION" -gt 1 ]; then
      operator_error "Initialization is only valid before the first credential generation." "Инициализирането е допустимо само преди първото поколение данни за достъп."
      exit 1
    fi
    prompt_email_and_password "$(operator_text "Existing ADMIN selected as appliance operator" "Съществуващ ADMIN, избран за системен оператор")"
    printf '%s\n%s\n%s\n' "$OPERATOR_EMAIL" "$OPERATOR_PASSWORD" 1 \
      | sh scripts/container-node.sh scripts/credential-json.mjs status-init \
      | sh scripts/container-node.sh scripts/validate-operator-credential.mjs \
      | status_cli init-auth >/dev/null
    if printf '%s\n%s\n%s\n%s\n' initialize "$OPERATOR_EMAIL" "$OPERATOR_PASSWORD" 1 \
        | sh scripts/container-node.sh scripts/credential-json.mjs clinical-operator \
        | clinical_operator; then
      unset OPERATOR_PASSWORD
      docker compose restart api >/dev/null 2>&1 || true
      operator_say "Appliance operator initialized." "Системният оператор е инициализиран."
    else
      unset OPERATOR_PASSWORD
      operator_error "Status was initialized, but the clinical selection failed." "Status е инициализиран, но изборът в клиничната система е неуспешен."
      operator_error "Correct the clinical ADMIN account and re-run initialize with the same credential." "Коригирайте клиничния акаунт ADMIN и изпълнете отново initialize със същите данни за достъп."
      exit 1
    fi
    ;;
  repair-status)
    load_status_state
    load_clinical_state
    [ "$STATUS_INITIALIZED" = false ] || {
      operator_error "Status credentials already exist; repair is not permitted." "В Status вече има данни за достъп; възстановяването не е разрешено."
      exit 1
    }
    [ "$CLINICAL_INITIALIZED" = true ] || {
      operator_error "The clinical appliance operator has not been initialized." "Системният оператор в клиничната система не е инициализиран."
      exit 1
    }
    prompt_email_and_password "$(operator_text "Current appliance operator" "Текущ системен оператор")"
    printf '%s\n%s\n%s\n%s\n' rotate "$OPERATOR_EMAIL" "$OPERATOR_PASSWORD" "$CLINICAL_GENERATION" \
      | sh scripts/container-node.sh scripts/credential-json.mjs clinical-operator \
      | clinical_operator >/dev/null
    printf '%s\n%s\n%s\n' "$OPERATOR_EMAIL" "$OPERATOR_PASSWORD" "$CLINICAL_GENERATION" \
      | sh scripts/container-node.sh scripts/credential-json.mjs status-init \
      | sh scripts/container-node.sh scripts/validate-operator-credential.mjs \
      | status_cli init-auth >/dev/null
    unset OPERATOR_PASSWORD
    operator_say "Status credentials rebuilt at clinical generation $CLINICAL_GENERATION." "Данните за достъп в Status са възстановени до клинично поколение $CLINICAL_GENERATION."
    ;;
  rotate)
    prompt_email_and_password "$(operator_text "Current appliance operator" "Текущ системен оператор")"
    coordinated_change rotate
    ;;
  transfer)
    operator_error "The target must already be an active clinical ADMIN." "Избраният потребител трябва вече да е активен клиничен ADMIN."
    prompt_email_and_password "$(operator_text "New appliance operator" "Нов системен оператор")"
    coordinated_change transfer
    ;;
  reconcile-restore)
    operator_error "Select an active ADMIN present in the restored database." "Изберете активен ADMIN, който присъства във възстановената база данни."
    prompt_email_and_password "$(operator_text "Restored appliance operator" "Системен оператор след възстановяването")"
    coordinated_change reconcile
    ;;
esac
