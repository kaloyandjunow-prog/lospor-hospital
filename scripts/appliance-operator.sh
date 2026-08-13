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

usage() {
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
  exit 2
}

action="${1:-}"
[ "$#" -eq 1 ] || usage
case "$action" in
  initialize|rotate|transfer|repair-status|reconcile-restore|abort-pending|recovery-token|state|verify) ;;
  *) usage ;;
esac

test -f .env || {
  echo "Hospital is not configured." >&2
  exit 1
}
./scripts/ensure-status-secrets.sh >/dev/null

if [ -n "${HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD:-}" ]; then
  echo "Password environment variables are not accepted." >&2
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
  CLINICAL_OPERATOR_EMAIL_HASH="$3"
}

load_status_state() {
  state_record="$(printf '{}\n' | status_cli auth-state | sh scripts/container-node.sh scripts/parse-operator-state.mjs status)" || return 1
  set -- $state_record
  STATUS_INITIALIZED="$1"
  STATUS_GENERATION="$2"
  STATUS_OPERATOR_EMAIL_HASH="$3"
  STATUS_PENDING_TRANSACTION="$4"
  STATUS_PENDING_GENERATION="$5"
}

prompt_email_and_password() {
  label="$1"
  printf "%s email: " "$label" >&2
  IFS= read -r OPERATOR_EMAIL
  [ -n "$OPERATOR_EMAIL" ] || {
    echo "An operator email is required." >&2
    exit 2
  }

  printf "%s password: " "$label" >&2
  if [ -t 0 ]; then stty -echo; fi
  IFS= read -r OPERATOR_PASSWORD
  if [ -t 0 ]; then stty echo; fi
  printf "\nConfirm password: " >&2
  if [ -t 0 ]; then stty -echo; fi
  IFS= read -r OPERATOR_PASSWORD_CONFIRM
  if [ -t 0 ]; then stty echo; fi
  printf "\n" >&2

  if [ "$OPERATOR_PASSWORD" != "$OPERATOR_PASSWORD_CONFIRM" ]; then
    unset OPERATOR_PASSWORD OPERATOR_PASSWORD_CONFIRM
    echo "Passwords did not match." >&2
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
    echo "Another appliance-operator operation is already running." >&2
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
      || [ "$STATUS_GENERATION" -ne "$CLINICAL_GENERATION" ] \
      || [ "$STATUS_OPERATOR_EMAIL_HASH" != "$CLINICAL_OPERATOR_EMAIL_HASH" ]; then
      echo "Status and clinical operator state must be synchronized before this change." >&2
      echo "Run: sh scripts/appliance-operator.sh state" >&2
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
      echo "Appliance operator credential synchronized at generation $pending_generation."
      return 0
    fi
    echo "The clinical credential changed, but Status still has the matching pending change." >&2
    echo "Re-run the same action with the same credential to finish safely." >&2
    return 1
  fi

  unset OPERATOR_PASSWORD
  # A command can lose its connection after the DB transaction committed. Read
  # the monotonic generation before deciding whether aborting is safe.
  if load_clinical_state; then
    if [ "$CLINICAL_GENERATION" -eq "$pending_generation" ]; then
      commit_status_transaction "$transaction_id"
      docker compose restart api >/dev/null 2>&1 || true
      echo "Recovered a committed clinical change at generation $pending_generation."
      return 0
    fi
    if [ "$CLINICAL_GENERATION" -lt "$pending_generation" ]; then
      abort_status_transaction "$transaction_id"
      echo "Clinical credential change was rejected; the Status pending change was safely aborted." >&2
      return 1
    fi
  fi

  echo "Credential state could not be proven after the failure." >&2
  echo "The pending Status credential remains usable; do not guess or delete it." >&2
  echo "Restore database access, then re-run the same action with the same credential." >&2
  return 1
}

case "$action" in
  state)
    load_status_state
    load_clinical_state
    echo "Status: initialized=$STATUS_INITIALIZED generation=$STATUS_GENERATION pending_generation=$STATUS_PENDING_GENERATION"
    echo "Clinical DB: initialized=$CLINICAL_INITIALIZED generation=$CLINICAL_GENERATION"
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
    if [ "$STATUS_OPERATOR_EMAIL_HASH" != "$CLINICAL_OPERATOR_EMAIL_HASH" ]; then exit 15; fi
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
      echo "No Status credential change is pending."
      exit 0
    }
    load_clinical_state
    if [ "$CLINICAL_GENERATION" -ge "$STATUS_PENDING_GENERATION" ]; then
      echo "Refusing to abort: the clinical DB has reached or passed the pending generation." >&2
      echo "Re-run the original change so Status can commit it." >&2
      exit 1
    fi
    abort_status_transaction "$STATUS_PENDING_TRANSACTION"
    echo "Pending Status credential change aborted."
    exit 0
    ;;
esac

acquire_operation_lock

case "$action" in
  initialize)
    load_status_state
    load_clinical_state
    if [ "$STATUS_GENERATION" -gt 1 ] || [ "$CLINICAL_GENERATION" -gt 1 ]; then
      echo "Initialization is only valid before the first credential generation." >&2
      exit 1
    fi
    prompt_email_and_password "Existing ADMIN selected as appliance operator"
    printf '%s\n%s\n%s\n' "$OPERATOR_EMAIL" "$OPERATOR_PASSWORD" 1 \
      | sh scripts/container-node.sh scripts/credential-json.mjs status-init \
      | sh scripts/container-node.sh scripts/validate-operator-credential.mjs \
      | status_cli init-auth >/dev/null
    if printf '%s\n%s\n%s\n%s\n' initialize "$OPERATOR_EMAIL" "$OPERATOR_PASSWORD" 1 \
        | sh scripts/container-node.sh scripts/credential-json.mjs clinical-operator \
        | clinical_operator; then
      unset OPERATOR_PASSWORD
      docker compose restart api >/dev/null 2>&1 || true
      echo "Appliance operator initialized."
    else
      unset OPERATOR_PASSWORD
      echo "Status was initialized, but the clinical selection failed." >&2
      echo "Correct the clinical ADMIN account and re-run initialize with the same credential." >&2
      exit 1
    fi
    ;;
  repair-status)
    load_status_state
    load_clinical_state
    [ "$STATUS_INITIALIZED" = false ] || {
      echo "Status credentials already exist; repair is not permitted." >&2
      exit 1
    }
    [ "$CLINICAL_INITIALIZED" = true ] || {
      echo "The clinical appliance operator has not been initialized." >&2
      exit 1
    }
    prompt_email_and_password "Current appliance operator"
    printf '%s\n%s\n%s\n%s\n' rotate "$OPERATOR_EMAIL" "$OPERATOR_PASSWORD" "$CLINICAL_GENERATION" \
      | sh scripts/container-node.sh scripts/credential-json.mjs clinical-operator \
      | clinical_operator >/dev/null
    printf '%s\n%s\n%s\n' "$OPERATOR_EMAIL" "$OPERATOR_PASSWORD" "$CLINICAL_GENERATION" \
      | sh scripts/container-node.sh scripts/credential-json.mjs status-init \
      | sh scripts/container-node.sh scripts/validate-operator-credential.mjs \
      | status_cli init-auth >/dev/null
    unset OPERATOR_PASSWORD
    echo "Status credentials rebuilt at clinical generation $CLINICAL_GENERATION."
    ;;
  rotate)
    prompt_email_and_password "Current appliance operator"
    coordinated_change rotate
    ;;
  transfer)
    echo "The target must already be an active clinical ADMIN." >&2
    prompt_email_and_password "New appliance operator"
    coordinated_change transfer
    ;;
  reconcile-restore)
    echo "Select an active ADMIN present in the restored database." >&2
    prompt_email_and_password "Restored appliance operator"
    coordinated_change reconcile
    ;;
esac
