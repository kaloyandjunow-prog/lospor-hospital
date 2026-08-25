#!/bin/sh

# Shared language selection for commands intended to be read by a hospital
# operator. Do not source .env: it is configuration, not shell code. An
# explicit process value is useful for a visiting technician; otherwise the
# appliance setting written by the guided installer is authoritative.
operator_locale_load() {
  _operator_locale_root="${1:-.}"
  _operator_locale_value="${LOSPOR_DEFAULT_LOCALE:-}"
  if [ -z "$_operator_locale_value" ] && [ -f "$_operator_locale_root/.env" ]; then
    _operator_locale_value="$(
      sed -n 's/^LOSPOR_DEFAULT_LOCALE=//p' "$_operator_locale_root/.env" 2>/dev/null \
        | tail -n 1 | tr -d '\r' | sed 's/^"//; s/"$//'
    )"
  fi
  case "$_operator_locale_value" in
    en) LOSPOR_OPERATOR_LOCALE=en ;;
    bg|*) LOSPOR_OPERATOR_LOCALE=bg ;;
  esac
}

operator_text() {
  if [ "${LOSPOR_OPERATOR_LOCALE:-bg}" = en ]; then
    printf '%s' "$1"
  else
    printf '%s' "$2"
  fi
}

operator_say() {
  operator_text "$1" "$2"
  printf '\n'
}

operator_error() {
  operator_text "$1" "$2" >&2
  printf '\n' >&2
}

operator_printf() {
  _operator_printf_en="$1"
  _operator_printf_bg="$2"
  shift 2
  if [ "${LOSPOR_OPERATOR_LOCALE:-bg}" = en ]; then
    printf "$_operator_printf_en" "$@"
  else
    printf "$_operator_printf_bg" "$@"
  fi
}

operator_eprintf() {
  operator_printf "$@" >&2
}
