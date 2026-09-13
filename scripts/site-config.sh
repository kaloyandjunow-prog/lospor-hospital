#!/bin/sh
# Hospital configuration has two owners, and .env used to hide that.
#
#   site.env                  what hospital IT decides and may edit: names,
#                             certificate mode, network allowlists, ports,
#                             e-mail sender, support contact, update window.
#   secrets/appliance.env     what the appliance generates and owns: secrets,
#                             pseudonym keys, backup identity, fingerprints,
#                             versions and tuning. Root-only; never edited.
#   .env                      generated from both for Compose and every script
#                             that reads configuration. Never edited either.
#
# Sourced by the scripts that change configuration, and runnable directly:
#
#   sh scripts/site-config.sh compile [appliance-home]
#
# A key may live in exactly one of the two sources. Compilation refuses a site
# key in appliance.env, a generated key in site.env, a duplicate, or a malformed
# line, and writes .env only as a whole, atomically.

SITE_CONFIG_KEYS="LOSPOR_DEFAULT_LOCALE ACME_EMAIL HOSPITAL_CLINICAL_DOMAIN HOSPITAL_RESEARCH_DOMAIN HOSPITAL_SUPPORT_URL HOSPITAL_TLS_MODE HOSPITAL_TLS_VERIFY_CA HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE HOSPITAL_RESEARCH_ALLOWED_CIDRS HOSPITAL_STATUS_ALLOWED_CIDRS HOSPITAL_HTTPS_PORT HOSPITAL_STATUS_PORT AUTH_EMAIL_FROM AUTH_EMAIL_FROM_NAME HOSPITAL_UPDATE_SUPPLY_MODE HOSPITAL_UPDATE_WINDOW_START HOSPITAL_UPDATE_WINDOW_END HOSPITAL_UPDATE_TIMEZONE"

site_config_is_site_key() {
  case " $SITE_CONFIG_KEYS " in *" $1 "*) return 0 ;; esac
  return 1
}

site_config_regular_file() {
  [ -f "$1" ] && [ ! -L "$1" ] && [ "$(stat -c %h "$1" 2>/dev/null || echo 1)" = 1 ]
}

# Validate one source. $2 is "site" or "appliance". Prints nothing on success.
site_config_check_source() {
  site_config_regular_file "$1" || { echo "SITE_CONFIG_SOURCE_UNSAFE $(basename "$1")" >&2; return 1; }
  awk -v kind="$2" -v keys=" $SITE_CONFIG_KEYS " -v name="$(basename "$1")" '
    /^[[:space:]]*(#|$)/ { next }
    {
      sub(/\r$/, "")
      if ($0 !~ /^[A-Z][A-Z0-9_]*=/) { print "SITE_CONFIG_MALFORMED " name ":" NR > "/dev/stderr"; bad = 1; next }
      key = substr($0, 1, index($0, "=") - 1)
      if (seen[key]++) { print "SITE_CONFIG_DUPLICATE " name " " key > "/dev/stderr"; bad = 1 }
      site = index(keys, " " key " ") > 0
      if (key == "COMPOSE_PROFILES") { print "SITE_CONFIG_DERIVED_KEY " name " " key > "/dev/stderr"; bad = 1 }
      else if (kind == "site" && !site) { print "SITE_CONFIG_NOT_A_SITE_KEY " name " " key > "/dev/stderr"; bad = 1 }
      else if (kind == "appliance" && site) { print "SITE_CONFIG_SITE_KEY_IN_APPLIANCE " name " " key > "/dev/stderr"; bad = 1 }
    }
    END { exit bad }
  ' "$1"
}

site_config_value() {
  sed -n "s/^$2=//p" "$1" 2>/dev/null | tail -n 1 | tr -d '\r' | sed 's/^"//; s/"$//'
}

# Replace KEY's line in FILE, or append it, atomically and preserving the mode.
site_config_set() {
  set_file="$1"; set_key="$2"; set_value="$3"
  set_temporary="$set_file.set.$$"
  (umask 077; awk -v key="$set_key" -v value="$set_value" '
    index($0, key "=") == 1 { if (!done) print key "=" value; done = 1; next }
    { print }
    END { if (!done) print key "=" value }
  ' "$set_file" > "$set_temporary") || { rm -f "$set_temporary"; return 1; }
  chmod 600 "$set_temporary"
  mv -f "$set_temporary" "$set_file"
}

# .env is divided verbatim by key ownership. Nothing is rewritten or reordered
# beyond moving each line, and only a missing source is written.
site_config_split_legacy() {
  split_home="$1"
  split_env="$split_home/.env"
  site_config_regular_file "$split_env" || return 1
  mkdir -p "$split_home/secrets"
  chmod 700 "$split_home/secrets"
  (umask 077
    awk -v keys=" $SITE_CONFIG_KEYS " -v site="$split_home/site.env.split.$$" -v appliance="$split_home/secrets/appliance.env.split.$$" '
      /^[[:space:]]*(#|$)/ { next }
      { key = substr($0, 1, index($0, "=") - 1) }
      key == "COMPOSE_PROFILES" { next }
      index(keys, " " key " ") > 0 { print > site; next }
      { print > appliance }
    ' "$split_env")
  touch "$split_home/site.env.split.$$" "$split_home/secrets/appliance.env.split.$$"
  chmod 600 "$split_home/site.env.split.$$" "$split_home/secrets/appliance.env.split.$$"
  for split_pair in "site.env.split.$$ site.env" "secrets/appliance.env.split.$$ secrets/appliance.env"; do
    set -- $split_pair
    if [ -e "$split_home/$2" ]; then rm -f "$split_home/$1"; else mv -f "$split_home/$1" "$split_home/$2"; fi
  done
}

# A source missing next to a complete .env is rebuilt from it. That is both an
# appliance configured before the split and one rebuilt from escrow, where .env
# and secrets/ come back but site.env may not. An existing source is never
# replaced.
site_config_ensure_split() {
  if [ -f "$1/.env" ] && { [ ! -e "$1/site.env" ] || [ ! -e "$1/secrets/appliance.env" ]; }; then
    site_config_split_legacy "$1"
  fi
}

site_config_compile() {
  compile_home="$1"
  compile_site="$compile_home/site.env"
  compile_appliance="$compile_home/secrets/appliance.env"
  site_config_check_source "$compile_site" site || return 1
  site_config_check_source "$compile_appliance" appliance || return 1
  compile_profiles=""
  [ "$(site_config_value "$compile_site" HOSPITAL_TLS_MODE)" != acme ] || compile_profiles=tls-acme
  compile_target="$compile_home/.env"
  if [ -L "$compile_target" ] || { [ -e "$compile_target" ] && ! site_config_regular_file "$compile_target"; }; then
    echo "SITE_CONFIG_TARGET_UNSAFE .env" >&2
    return 1
  fi
  compile_temporary="$compile_target.compile.$$"
  (umask 077
    {
      printf '# GENERATED by scripts/site-config.sh -- do not edit.\n'
      printf '# Change site.env, then apply the configuration. Secrets live in secrets/appliance.env.\n'
      grep -Ev '^[[:space:]]*(#|$)' "$compile_site" | tr -d '\r'
      printf 'COMPOSE_PROFILES=%s\n' "$compile_profiles"
      grep -Ev '^[[:space:]]*(#|$)' "$compile_appliance" | tr -d '\r'
    } > "$compile_temporary") || { rm -f "$compile_temporary"; return 1; }
  chmod 600 "$compile_temporary"
  mv -f "$compile_temporary" "$compile_target"
}

if [ "${0##*/}" = site-config.sh ]; then
  set -eu
  command="${1:-}"
  home="${2:-}"
  if [ -z "$home" ]; then
    script_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
    if [ -d "$script_root/.lospor-home" ]; then home="$(CDPATH= cd -- "$script_root/.lospor-home" && pwd -P)"; else home="$script_root"; fi
  fi
  case "$command" in
    compile) site_config_ensure_split "$home"; site_config_compile "$home" ;;
    check)
      site_config_check_source "$home/site.env" site
      site_config_check_source "$home/secrets/appliance.env" appliance
      ;;
    *) echo "Usage: sh scripts/site-config.sh compile|check [appliance-home]" >&2; exit 2 ;;
  esac
fi
