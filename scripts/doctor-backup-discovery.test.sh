#!/bin/sh
# doctor.sh must find backups through the `backups` symlink.
#
# This exists because it did not, on every appliance, for at least two shipped
# releases. Inside a release root `backups` is a symlink to the appliance
# home's directory -- activate-verified-release.sh creates it with
#
#   ln -s "$appliance_home/backups" "$candidate/backups"
#
# and `find` does not follow a symlinked starting point unless told to. The
# search therefore returned nothing however many verified backups existed, so
# doctor reported "no completed database backup exists yet" forever, never ran
# backup_verify_object at all (making a corrupt recovery object undetectable),
# and printed the bare off-host CRITICAL without the local-backup reassurance
# that exists specifically to stop operators hunting for a backup that is in
# fact complete.
#
# Verified on a live appliance holding two real backups:
#   find    backups ... -> (empty)
#   find -L backups ... -> backups/lospor-20260830T123404Z-2VE4XURP.backup
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM
tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }

# Reproduce the real layout: an appliance home holding the backups, and a
# release root reaching them only through a symlink.
mkdir -p "$work/home/backups/lospor-20260830T123404Z-EXAMPLE.backup"
mkdir -p "$work/release"
ln -s "$work/home/backups" "$work/release/backups"

cd "$work/release"

# The trap itself. If this ever stops being true, the -L below is no longer
# load-bearing and this test should be revisited rather than deleted.
if [ -n "$(find backups -maxdepth 1 -type d -name 'lospor-*.backup' -print)" ]; then
  fail "find without -L unexpectedly followed the symlink; the guarantee this test protects has changed"
fi
ok "a symlinked backups directory is invisible to find without -L"

found="$(find -L backups -maxdepth 1 -type d -name 'lospor-*.backup' -print | sort | tail -n 1)"
[ -n "$found" ] \
  || fail "find -L did not discover the backup through the symlink"
ok "find -L discovers a backup through the symlink"

# Bind the guarantee to the source, so a future edit that drops -L fails here
# rather than silently on every appliance.
grep -q "find -L backups -maxdepth 1 -type d -name 'lospor-\*\.backup'" "$root/scripts/doctor.sh" \
  || fail "doctor.sh no longer discovers backups with 'find -L backups'"
ok "doctor.sh discovers backups with find -L"

printf 'doctor backup discovery tests passed (%s)\n' "$tests"
