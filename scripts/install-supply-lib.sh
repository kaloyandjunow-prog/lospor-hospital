#!/bin/sh

install_detect_supply() {
  if printf '%s' "$1" | grep -Eq '"build"[[:space:]]*:'; then
    printf '%s\n' source
  else
    printf '%s\n' verified-release
  fi
}

install_supply_authorized() {
  mode="${1:-}"
  verified="${2:-}"
  case "$mode:$verified" in
    verified-release:1|source:"") return 0 ;;
    *) return 1 ;;
  esac
}
