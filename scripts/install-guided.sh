#!/bin/sh
set -eu

# A guided front end for the supported install. It collects what the install
# needs, shows what the checks found, and then runs the ordinary scripts.
#
# It is a front end and nothing more. run-online-release.sh still verifies the
# lock, still pulls every image by digest, still refuses a mismatch; install.sh
# still creates the secrets and the first administrator. Nothing here can
# approve anything on the operator's behalf, and every failure below ends the
# run rather than offering to continue -- an installer whose checks can be
# clicked past is worse than no installer, because it looks like assurance.
#
# whiptail ships with Ubuntu Server. Without it, or without a terminal, this
# falls back to the plain prompts rather than requiring anything to be
# installed on a clinical host.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"

usage() {
  echo "Usage: sh scripts/install-guided.sh <release.lock> <release.lock.sha256> <artifact-directory>" >&2
  exit 2
}
lock="${1:-}"; sidecar="${2:-}"; media="${3:-}"
[ -n "$lock" ] && [ -n "$sidecar" ] && [ -n "$media" ] || usage

have_ui=0
if command -v whiptail >/dev/null 2>&1 && [ -t 0 ] && [ -t 2 ]; then have_ui=1; fi

TITLE="LOSPOR Hospital installation"

say() {
  if [ "$have_ui" -eq 1 ]; then
    whiptail --title "$TITLE" --msgbox "$1" 16 74
  else
    printf '\n%s\n\n' "$1"
  fi
}

die() {
  if [ "$have_ui" -eq 1 ]; then
    whiptail --title "$TITLE — stopped" --msgbox "$1" 16 74
  fi
  printf '%s\n' "$1" >&2
  exit 1
}

ask_value() {
  # variable label default
  eval "current=\${$1:-}"
  if [ -n "${current:-}" ]; then return 0; fi
  if [ "$have_ui" -eq 1 ]; then
    value="$(whiptail --title "$TITLE" --inputbox "$2" 10 74 "$3" 3>&1 1>&2 2>&3)" \
      || die "Installation cancelled."
  else
    printf "%s [%s]: " "$2" "$3" >&2
    read -r value || value=""
  fi
  eval "$1=\"\${value:-$3}\""
  eval "export $1"
}

ask_secret() {
  # Two entries, compared. Never echoed, never exported, never written to .env:
  # install.sh takes it on standard input alone.
  if [ "$have_ui" -eq 1 ]; then
    first="$(whiptail --title "$TITLE" --passwordbox "$1" 10 74 3>&1 1>&2 2>&3)" \
      || die "Installation cancelled."
    second="$(whiptail --title "$TITLE" --passwordbox "$2" 10 74 3>&1 1>&2 2>&3)" \
      || die "Installation cancelled."
  else
    printf "%s: " "$1" >&2; stty -echo 2>/dev/null || true; read -r first;  stty echo 2>/dev/null || true; printf '\n' >&2
    printf "%s: " "$2" >&2; stty -echo 2>/dev/null || true; read -r second; stty echo 2>/dev/null || true; printf '\n' >&2
  fi
  [ -n "$first" ] || die "The administrator password cannot be empty."
  [ "$first" = "$second" ] || die "The administrator passwords did not match. Nothing was changed."
}

# ── 1. Welcome ───────────────────────────────────────────────────────────────
say "This installs the LOSPOR Hospital appliance from a verified release.

Before continuing you need:
  * the release files on this host
  * the release.lock SHA-256, sent to you separately
  * a read-only registry credential for the images

Nothing is written until every check below has passed."

# ── 2. The lock hash, compared against a separately carried value ────────────
# This is the root of trust. It is asked for rather than displayed, so the
# operator has to bring a value from somewhere other than the media -- a hash
# read off the same USB it is checking proves nothing.
expected=""
ask_value expected "Expected release.lock SHA-256 (from your separate record)" ""
printf '%s\n' "$expected" | grep -Eq '^[a-f0-9]{64}$' \
  || die "That is not a SHA-256 digest. Expected 64 hexadecimal characters."
actual="$(sha256sum "$lock" | awk '{print $1}')"
[ "$actual" = "$expected" ] || die "RELEASE LOCK DOES NOT MATCH.

  expected  $expected
  found     $actual

Do not install this release. Obtain the assets again from a trusted copy and
check the digest with whoever published it."
say "Release lock verified.

  $actual

Every other file is now checked against this lock."

# ── 3. Site configuration ────────────────────────────────────────────────────
if [ ! -f .env ]; then
  ask_value ACME_EMAIL "Address for certificate notices" "it@example-hospital.org"
  ask_value HOSPITAL_CLINICAL_DOMAIN "Clinical name (web, phone app, API)" "lospor.example-hospital.org"
  ask_value HOSPITAL_RESEARCH_DOMAIN "Research Browser name" "lospor-research.example-hospital.org"
fi

ask_value HOSPITAL_INSTITUTION_NAME "Hospital name" ""
ask_value HOSPITAL_INSTITUTION_CITY "City" ""
ask_value HOSPITAL_INSTITUTION_COUNTRY "Country" "Bulgaria"
ask_value HOSPITAL_BOOTSTRAP_ADMIN_EMAIL "First administrator's email" ""
ask_value HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME "Administrator's first name" ""
ask_value HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME "Administrator's last name" ""
ask_secret "Administrator password" "Confirm administrator password"

# ── 4. Readiness, reported in full ───────────────────────────────────────────
# The report is shown whether it passes or fails. A host that scrapes through
# with warnings is worth seeing before ten containers start, not afterwards.
report="$(mktemp)"
trap 'rm -f "$report"' EXIT HUP INT TERM
set +e
sh scripts/readiness-check.sh --strict >"$report" 2>&1
readiness=$?
set -e
if [ "$have_ui" -eq 1 ]; then
  whiptail --title "$TITLE — host readiness" --scrolltext --textbox "$report" 24 78
else
  cat "$report"
fi
[ "$readiness" -eq 0 ] || die "This host is not ready. Correct the failures above and run the installer again.

Nothing has been installed."

# ── 5. Install ───────────────────────────────────────────────────────────────
say "Installing. The images are downloaded and checked against the lock, then
the appliance is created. This takes several minutes and the output is shown
as it happens."

printf '%s\n%s\n' "$first" "$first" | sh scripts/run-online-release.sh "$lock" "$sidecar" "$media"

clinical="$(sed -n 's/^HOSPITAL_CLINICAL_DOMAIN=//p' .env | tail -n 1 | tr -d '\r' | sed 's/^"//; s/"$//')"
status_port="$(sed -n 's/^HOSPITAL_STATUS_PORT=//p' .env | tail -n 1 | tr -d '\r' | sed 's/^"//; s/"$//')"
status_port="${status_port:-3443}"
say "Installation complete.

  Clinicians      https://${clinical}/
  Phone app       https://${clinical}/app
  Appliance status https://${clinical}/status/

  Outage fallback, through an SSH tunnel:
    ssh -L ${status_port}:127.0.0.1:${status_port} <admin>@this-host
    https://localhost:${status_port}/status/

Import the licensed reference vocabulary package before clinical use."
