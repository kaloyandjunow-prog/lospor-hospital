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

# The same failure one layer down: not the mode git records, but the mode the
# release lands with.
#
# losporctl-install.sh extracts the deployment archive with
# --no-same-permissions, which applies the caller's umask to every file. The
# first-boot installer runs the whole installation under `umask 077` because it
# handles the administrator password and the TLS private key, so without a
# narrower umask around the extraction the payload arrives owner-only: 100644
# becomes 0600 and 100755 becomes 0700. compose.yaml bind-mounts eleven scripts
# from that payload into containers running as other users, so 1.4.0 died on the
# first one it reached -- "cannot open /usr/local/bin/create-status-probe.sh:
# Permission denied" -- and rolled back after every image had been pulled and
# every migration applied.
# Both of them. The install path was fixed after 1.4.0 and guarded here; the
# activation path extracts the same payload the same way and was not, so the
# identical failure waited there until an update ran from the agent, which
# carries UMask=0077, rather than from an operator's shell, which does not.
check_extraction() {
  file="$1"; pattern="$2"
  line="$(grep -n "$pattern" "$file" || true)"
  if [ -z "$line" ]; then
    echo "Could not find the deployment extraction in $file." >&2
    fail=1
    return
  fi
  case "$line" in
    *"umask 022"*) ;;
    *)
      echo "The deployment extraction in $file must run under an explicit umask 022." >&2
      echo "Without it the payload inherits the caller's umask -- 077 for the" >&2
      echo "first-boot installer and for the update agent -- and every" >&2
      echo "bind-mounted script becomes unreadable to its container." >&2
      echo "Found: $line" >&2
      fail=1
      ;;
  esac
}

check_extraction scripts/losporctl-install.sh 'tar -xzf "$deployment"'
check_extraction scripts/activate-verified-release.sh 'tar -xzf "$archive"'

# Every script compose.yaml bind-mounts has to survive that extraction readable.
# Listing them here is not the point -- the umask check above is what keeps them
# readable -- but a script that is missing entirely would fail the same way, at
# the same late moment, so the set is checked for existence.
compose_scripts="$(grep -oE '\./[A-Za-z0-9_./-]+\.sh:' compose.yaml | sed 's|^\./||; s|:$||' | sort -u)"
if [ -z "$compose_scripts" ]; then
  echo "No bind-mounted scripts found in compose.yaml -- has the format changed?" >&2
  fail=1
fi
for mounted in $compose_scripts; do
  [ -f "$mounted" ] || { echo "compose.yaml bind-mounts a missing script: $mounted" >&2; fail=1; }
done

# The checks above pin intent. This pins the tar behaviour the whole fix rests
# on, because that behaviour is counter-intuitive: as root, tar restores the
# archive's recorded modes and ignores umask entirely, so --no-same-permissions
# is what makes the umask apply at all. The flag WITHOUT a umask reset is
# therefore strictly worse than no flag -- which is exactly how 1.4.3 shipped,
# and why an agent-driven update landed the tree 0700/0600.
umask_fixture="$(mktemp -d)"
trap 'rm -rf "$umask_fixture"' EXIT
probe_path=lospor-hospital-0.0.0/infra/postgres/create-status-probe.sh
mkdir -p "$umask_fixture/src/$(dirname "$probe_path")"
printf '#!/bin/sh\n' > "$umask_fixture/src/$probe_path"
chmod 0644 "$umask_fixture/src/$probe_path"
(cd "$umask_fixture/src" && tar -czf "$umask_fixture/deployment.tar.gz" lospor-hospital-0.0.0)

# Guarded, the way activation extracts: the agent's 077 outside, 022 at the tar.
mkdir "$umask_fixture/guarded"
(umask 077; (umask 022; tar -xzf "$umask_fixture/deployment.tar.gz" \
  --no-same-owner --no-same-permissions -C "$umask_fixture/guarded"))
guarded_mode="$(stat -c %a "$umask_fixture/guarded/$probe_path")"
case "$guarded_mode" in
  *[4567]) ;;
  *)
    echo "Extraction under umask 077 produced mode $guarded_mode for the probe script." >&2
    echo "Containers that bind-mount it run as other users and cannot read it." >&2
    fail=1
    ;;
esac
for traversed in lospor-hospital-0.0.0 lospor-hospital-0.0.0/infra lospor-hospital-0.0.0/infra/postgres; do
  traversed_mode="$(stat -c %a "$umask_fixture/guarded/$traversed")"
  case "$traversed_mode" in
    *[1357]) ;;
    *)
      echo "Extraction produced directory mode $traversed_mode for $traversed; containers cannot traverse it." >&2
      fail=1
      ;;
  esac
done

# Control: without the inner umask the payload must still land owner-only. If
# this stops being true the guard above is passing vacuously and nobody would
# otherwise notice.
mkdir "$umask_fixture/unguarded"
(umask 077; tar -xzf "$umask_fixture/deployment.tar.gz" \
  --no-same-owner --no-same-permissions -C "$umask_fixture/unguarded")
unguarded_mode="$(stat -c %a "$umask_fixture/unguarded/$probe_path")"
case "$unguarded_mode" in
  *[4567])
    echo "tar --no-same-permissions no longer applies the caller's umask (got $unguarded_mode)." >&2
    echo "The umask guard around the extraction now proves nothing; re-derive this test." >&2
    fail=1
    ;;
esac

# And the activation script must not rely on its caller for that umask at all.
grep -Eq '^umask 022$' "$root/scripts/activate-verified-release.sh" \
  || { echo "activate-verified-release.sh must set its own umask 022: everything it creates outside the guarded private writes is read by containers or by Status." >&2; fail=1; }

[ "$fail" -eq 0 ]
echo "Both systemd-managed scripts are committed executable."
echo "The deployment extraction is umask-guarded, and all $(printf '%s\n' $compose_scripts | wc -l | tr -d ' ') bind-mounted scripts exist."
