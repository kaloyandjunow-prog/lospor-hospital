#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
. "$root/scripts/operator-locale.sh"

tests=0
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
assert_equal() {
  label="$1"; expected="$2"; actual="$3"
  [ "$actual" = "$expected" ] || fail "$label (expected '$expected', got '$actual')"
  ok "$label"
}

fixture="$(mktemp -d "${TMPDIR:-/tmp}/lospor-operator-locale.XXXXXX")"
trap 'rm -rf "$fixture"' EXIT HUP INT TERM

unset LOSPOR_DEFAULT_LOCALE || true
operator_locale_load "$fixture"
assert_equal "Bulgarian is the fallback language" bg "$LOSPOR_OPERATOR_LOCALE"
assert_equal "Bulgarian fallback renders Bulgarian" "Проверка" "$(operator_text Check Проверка)"

printf 'LOSPOR_DEFAULT_LOCALE=en\n' > "$fixture/.env"
unset LOSPOR_DEFAULT_LOCALE || true
operator_locale_load "$fixture"
assert_equal "the appliance setting selects English" en "$LOSPOR_OPERATOR_LOCALE"
assert_equal "English setting renders English" Check "$(operator_text Check Проверка)"

printf 'LOSPOR_DEFAULT_LOCALE=invalid\n' > "$fixture/.env"
unset LOSPOR_DEFAULT_LOCALE || true
operator_locale_load "$fixture"
assert_equal "an invalid appliance setting fails safely to Bulgarian" bg "$LOSPOR_OPERATOR_LOCALE"

LOSPOR_DEFAULT_LOCALE=en operator_locale_load "$fixture"
assert_equal "a technician can explicitly select English" en "$LOSPOR_OPERATOR_LOCALE"

localized_scripts="
doctor.sh
appliance-operator.sh
install.sh
update.sh
check-for-update.sh
run-online-release.sh
load-offline.sh
enroll-central.sh
postgres-update-gate.sh
verify-loaded-release-images.sh
ensure-status-secrets.sh
backup-now.sh
restore-backup.sh
ensure-backup-configuration.sh
rotate-operational-secrets.sh
"

for script in $localized_scripts; do
  sh -n "$root/scripts/$script" || fail "$script is not valid POSIX shell syntax"
  grep -Fq 'scripts/operator-locale.sh"' "$root/scripts/$script" \
    || fail "$script does not load the shared operator locale"
done
ok "all localized operator commands load the shared locale and parse"

# Prompts and summaries in these commands must be bilingual calls. This catches
# a newly added direct English-only message without treating command names,
# protocol fields, or comments as translatable prose.
for script in $localized_scripts; do
  if grep -nE "^[[:space:]]*(echo|printf)[[:space:]]+[\\\"'](Usage:|Warning:|Hospital |Installation |Running |No |Could |Reason:|Status |Clinical |Select |Finish |A credential|Run:|Import |Outage |Source |Using |TEST ONLY|Central |The |Restore |Backup |Invalid |Unsafe |Patient |Export |PostgreSQL |Set |Type |Emergency |Journal:|Database |Protected |Python |HOSPITAL_.* (is|must|requires)|Missing |Administrator |Appliance )" \
      "$root/scripts/$script"; then
    fail "$script contains a direct English-only operator message"
  fi
done
ok "localized commands contain no direct English-only prompt or summary"

for script in \
  appliance-operator.sh \
  run-online-release.sh \
  load-offline.sh \
  postgres-update-gate.sh \
  verify-loaded-release-images.sh
do
  bg_usage="$(LOSPOR_DEFAULT_LOCALE=bg sh "$root/scripts/$script" 2>&1 || true)"
  case "$bg_usage" in
    *"Употреба:"*) ;;
    *) fail "$script does not render its usage in Bulgarian" ;;
  esac
  en_usage="$(LOSPOR_DEFAULT_LOCALE=en sh "$root/scripts/$script" 2>&1 || true)"
  case "$en_usage" in
    *"Usage:"*) ;;
    *) fail "$script does not render its usage in English" ;;
  esac
done
ok "safe usage screens render in Bulgarian and English"

bg_enrollment="$(LOSPOR_DEFAULT_LOCALE=bg sh "$root/scripts/enroll-central.sh" 2>&1 || true)"
en_enrollment="$(LOSPOR_DEFAULT_LOCALE=en sh "$root/scripts/enroll-central.sh" 2>&1 || true)"
case "$bg_enrollment:$en_enrollment" in
  *"Свързването с Central"*"Central enrollment moved"*) ;;
  *) fail "enroll-central.sh does not render its migration notice in Bulgarian and English" ;;
esac
ok "Central enrollment migration notice renders in Bulgarian and English"

assert_safe_usage() {
  script="$1"
  shift
  bg_usage="$(LOSPOR_DEFAULT_LOCALE=bg sh "$root/scripts/$script" "$@" 2>&1 || true)"
  case "$bg_usage" in
    *"Употреба:"*) ;;
    *) fail "$script does not render its usage in Bulgarian" ;;
  esac
  en_usage="$(LOSPOR_DEFAULT_LOCALE=en sh "$root/scripts/$script" "$@" 2>&1 || true)"
  case "$en_usage" in
    *"Usage:"*) ;;
    *) fail "$script does not render its usage in English" ;;
  esac
}

assert_safe_usage restore-backup.sh
assert_safe_usage backup-now.sh --unsupported
ok "backup and restore usage screens render in Bulgarian and English"

configuration_fixture="$fixture/backup-configuration"
mkdir -p "$configuration_fixture/scripts"
cp "$root/scripts/ensure-backup-configuration.sh" "$configuration_fixture/scripts/"
cp "$root/scripts/site-config.sh" "$configuration_fixture/scripts/"
cp "$root/scripts/operator-locale.sh" "$configuration_fixture/scripts/"
bg_configuration="$(LOSPOR_DEFAULT_LOCALE=bg sh "$configuration_fixture/scripts/ensure-backup-configuration.sh" 2>&1 || true)"
en_configuration="$(LOSPOR_DEFAULT_LOCALE=en sh "$configuration_fixture/scripts/ensure-backup-configuration.sh" 2>&1 || true)"
case "$bg_configuration:$en_configuration" in
  *"Болничната система не е конфигурирана"*"Hospital is not configured"*) ;;
  *) fail "ensure-backup-configuration.sh does not render failures in Bulgarian and English" ;;
esac
ok "backup-configuration failures render in Bulgarian and English"

grep -Fq 'def operator_text(english: str, bulgarian: str)' \
  "$root/scripts/rotate-operational-secrets.py" \
  || fail "rotate-operational-secrets.py does not define bilingual operator text"
if command -v python3 >/dev/null 2>&1 \
  && python3 -c 'import sys' >/dev/null 2>&1; then
  bg_rotation_usage="$(LOSPOR_OPERATOR_LOCALE=bg python3 "$root/scripts/rotate-operational-secrets.py" 2>&1 || true)"
  en_rotation_usage="$(LOSPOR_OPERATOR_LOCALE=en python3 "$root/scripts/rotate-operational-secrets.py" 2>&1 || true)"
  case "$bg_rotation_usage:$en_rotation_usage" in
    *"Употреба:"*"Usage:"*"sessions|workers|status-tokens|database|ordinary"*) ;;
    *) fail "credential-rotation usage is not bilingual or changed its stable scope tokens" ;;
  esac
fi
ok "credential-rotation helper has bilingual usage with stable scope tokens"

printf 'operator locale tests passed (%s)\n' "$tests"
