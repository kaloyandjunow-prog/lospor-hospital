#!/bin/sh
set -eu

# install-host-observability.sh and install-update-agent.sh each refuse to
# install their systemd unit unless the release's own copy of the script they
# manage is executable ("The canonical current release is missing."). The
# deployment archive is built straight from `git archive`, which packages
# exactly the mode git has recorded -- so a script these installers depend on
# being executable must be committed that way, not merely `chmod +x`'d on a
# working copy that never gets committed. 1.3.0 shipped both scripts below at
# mode 100644, which passed every gate because nothing checked this, and only
# failed a real installation at its very last step, well after every
# container was healthy and the database was fully migrated and seeded.
root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
cd "$root"

fail=0
check_executable() {
  path="$1"
  mode="$(git ls-files -s -- "$path" | cut -d' ' -f1)"
  case "$mode" in
    100755) ;;
    "") echo "Not a tracked file: $path" >&2; fail=1 ;;
    *) echo "$path is committed as mode $mode, not 100755 (executable)." >&2; fail=1 ;;
  esac
}

check_executable scripts/host-observability-probe.sh
check_executable scripts/install-update-agent.sh

[ "$fail" -eq 0 ]
echo "Both systemd-managed scripts are committed executable."
