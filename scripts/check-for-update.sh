#!/bin/sh
set -eu

# Ask the registry whether a newer Hospital release exists, and publish the
# answer where the status page can show it.
#
#   ./scripts/check-for-update.sh            check, record, publish a status signal
#   ./scripts/check-for-update.sh --quiet    same, without the human summary
#
# This only ever reads. It pulls no image, touches no container, and changes
# nothing about what is installed. Applying an update stays a separate,
# deliberate command run by a person, because a restart during a case and a
# one-way database migration are both clinical events.
#
# Exit 0 means the question was answered, whether or not an update exists.
# Exit 1 means it could not be answered -- no network, no credentials, a
# registry that refused. The recorded state is then "unknown", never "current":
# telling a hospital it is up to date because its network was down is the one
# failure this script exists to prevent.
#
# The query runs here on the host, with curl, and not inside a container. The
# appliance's `backend` network is `internal: true`, so no clinical container
# can reach the internet, and the host deliberately has no Node runtime. curl on
# the host is the only place that has both the network and the tooling; it is a
# required host command, checked by scripts/readiness-check.sh.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
cd "$root"
. "$root/scripts/installed-release-state.sh"

quiet=0
[ "${1:-}" != --quiet ] || quiet=1

registry_origin="${HOSPITAL_REGISTRY_ORIGIN:-https://ghcr.io}"
registry_package="${HOSPITAL_UPDATE_PACKAGE:-kaloyandjunow-prog/lospor-hospital-api}"

# Normally derived from where this script lives, exactly as the installer and
# the release launcher derive it. LOSPOR_APPLIANCE_HOME overrides it for an
# operator inspecting a specific appliance home, and for the integration test.
# Only this read-only check honours the override: the launcher deliberately
# distrusts it, because there the value decides what gets overwritten.
appliance_home="${LOSPOR_APPLIANCE_HOME:-$(release_state_appliance_home "$root")}"
[ -d "$appliance_home" ] || { echo "Appliance home does not exist: $appliance_home" >&2; exit 2; }
status_path="$appliance_home/.data/update-status.tsv"

# Held for the whole check, not just the write. This reads the fetched field,
# decides, and rewrites the file -- a fetch landing in between would be read
# before and overwritten after, so a downloaded release would look
# unavailable.
release_state_lock_update_status "$appliance_home" || exit 2
trap 'release_state_unlock_update_status "$appliance_home"' EXIT HUP INT TERM

say() { [ "$quiet" -eq 1 ] || echo "$@"; }

command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 2; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM

# Credentials come from the environment, or from this site's own read-only
# registry credential. Each hospital gets a separate revocable one so it can be
# withdrawn alone; see docs/release-validation.md.
if [ -z "${HOSPITAL_GHCR_USER:-}" ] && [ -r secrets/registry/ghcr-user ]; then
  HOSPITAL_GHCR_USER="$(head -n 1 secrets/registry/ghcr-user | tr -d '\r\n')"
fi
if [ -z "${HOSPITAL_GHCR_READ_TOKEN:-}" ] && [ -r secrets/registry/ghcr-token ]; then
  HOSPITAL_GHCR_READ_TOKEN="$(head -n 1 secrets/registry/ghcr-token | tr -d '\r\n')"
fi

# Preserve whatever the fetch step last staged. This script has no business
# changing it, and losing it would make a downloaded update look unavailable.
fetched="-"
if [ -f "$status_path" ]; then
  existing_fetched="$(awk -F '\t' 'NR == 1 && $1 == "LOSPOR-HOSPITAL-UPDATE-STATUS-V1" { print $6 }' "$status_path" || true)"
  [ -z "${existing_fetched:-}" ] || fetched="$existing_fetched"
fi

observed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Publish the same verdict as a status signal, so the appliance status page can
# show it without anyone reading a file over SSH. The signals volume is only
# writable from inside the appliance, so this goes through the tools container;
# a host that cannot do that still gets the recorded TSV and the printed answer.
publish_signal() {
  signal_state="$1"; signal_installed="$2"; signal_latest="$3"; signal_fetched="$4"
  command -v docker >/dev/null 2>&1 || return 0
  # Only publish to an appliance that is actually running. Without this the
  # `docker compose run` below would BUILD the tools image on a host where the
  # appliance has never been started -- minutes of work to deliver a status
  # update to a status page that does not exist. There is nobody to inform, so
  # recording the answer locally is the whole job.
  [ -n "$(docker compose ps --quiet status 2>/dev/null || true)" ] || return 0
  printf '{"schemaVersion":1,"signalType":"appliance-update","observedAt":"%s","state":"%s","installedVersion":"%s"%s%s}\n' \
    "$observed_at" "$signal_state" "$signal_installed" \
    "$([ "$signal_latest" = "-" ] || printf ',"latestVersion":"%s"' "$signal_latest")" \
    "$([ "$signal_fetched" = "-" ] || printf ',"fetchedVersion":"%s"' "$signal_fetched")" \
    > "$work/appliance-update.v1.json"
  # umask 022, not 077. The tools container writes as root; the status service
  # is hardened and runs unprivileged, so a 0600 file is one it silently cannot
  # read -- the page then reports "never checked" while a perfectly good signal
  # sits beside it. This file carries two version numbers and a state word, no
  # secret, and the other signals in this directory are world-readable for the
  # same reason. Tightening this is not a hardening improvement; it is an outage
  # of the status page's release row.
  MSYS_NO_PATHCONV=1 docker compose --profile tools run --rm --no-deps -T \
    tools sh -c 'umask 022; cat > /signals/.appliance-update.v1.json.tmp \
      && mv /signals/.appliance-update.v1.json.tmp /signals/appliance-update.v1.json' \
    < "$work/appliance-update.v1.json" >/dev/null 2>&1 || {
      say "(Could not publish the status signal; the recorded answer below is still correct.)"
      return 0
    }
}

write_status() {
  mkdir -p "$appliance_home/.data"
  temporary="$status_path.tmp.$$"
  umask 077
  printf 'LOSPOR-HOSPITAL-UPDATE-STATUS-V1\t%s\t%s\t%s\t%s\t%s\n' \
    "$observed_at" "$1" "$2" "$3" "$fetched" > "$temporary"
  mv "$temporary" "$status_path"
  publish_signal "$3" "$1" "$2" "$fetched"
}

installed=""
if release_state_read "$appliance_home"; then
  installed="$state_version"
else
  read_result=$?
  [ "$read_result" -eq 10 ] || exit "$read_result"
  say "No release is installed yet; nothing to compare against."
  write_status "-" "-" unknown
  exit 1
fi

fail_unknown() {
  say "Could not reach the release registry; the available version is unknown."
  say "Reason: $1"
  write_status "$installed" "-" unknown
  exit 1
}

# A registry bearer token. Anonymous access is not attempted: the packages are
# private by policy, so a request without this site's credential would be
# refused, and a refusal must never be reported as "no updates".
[ -n "${HOSPITAL_GHCR_USER:-}" ] && [ -n "${HOSPITAL_GHCR_READ_TOKEN:-}" ] \
  || fail_unknown "this site has no registry credential configured"

token_scope="repository:${registry_package}:pull"
curl --fail --silent --show-error --max-time 30 --location-trusted \
  --user "${HOSPITAL_GHCR_USER}:${HOSPITAL_GHCR_READ_TOKEN}" \
  "${registry_origin}/token?service=ghcr.io&scope=${token_scope}" \
  > "$work/token.json" 2>"$work/token.err" \
  || fail_unknown "the registry refused this site's credential ($(tr -d '\r\n' < "$work/token.err"))"

bearer="$(sed -n 's/.*"\(token\|access_token\)":"\([^"]\{16,\}\)".*/\2/p' "$work/token.json" | head -n 1)"
[ -n "$bearer" ] || fail_unknown "the registry returned no usable access token"

# Walk the tag list, following rel="next" so a package with more tags than fit
# on one page cannot hide its newest release. Bounded so a malformed or hostile
# Link header cannot spin here forever.
: > "$work/versions"
next="${registry_origin}/v2/${registry_package}/tags/list?n=100"
page=0
while [ -n "$next" ] && [ "$page" -lt 50 ]; do
  curl --fail --silent --show-error --max-time 30 --dump-header "$work/headers" \
    --header "Authorization: Bearer ${bearer}" \
    "$next" > "$work/tags.json" 2>"$work/tags.err" \
    || fail_unknown "the registry would not list published releases ($(tr -d '\r\n' < "$work/tags.err"))"

  # Only strictly-formed release tags are considered, so extracting them with a
  # pattern is safe: anything that is not exactly vX.Y.Z is ignored rather than
  # interpreted. Pre-releases are deliberately excluded.
  sed -n 's/.*"tags"[[:space:]]*:[[:space:]]*\[\([^]]*\)\].*/\1/p' "$work/tags.json" \
    | grep -oE '"v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)"' \
    | tr -d '"' | sed 's/^v//' >> "$work/versions" || true

  next="$(sed -n 's/^[Ll]ink:.*<\([^>]*\)>[[:space:]]*;[[:space:]]*rel="\?next"\?.*/\1/p' "$work/headers" \
    | head -n 1 | tr -d '\r')"
  case "$next" in
    "") ;;
    /*) next="${registry_origin}${next}" ;;
  esac
  page=$((page + 1))
done

latest="$(sort -t. -k1,1n -k2,2n -k3,3n -u "$work/versions" | tail -n 1)"
[ -n "$latest" ] || fail_unknown "the registry answered, but published no release versions"

comparison="$(release_version_compare "$latest" "$installed")"
if [ "$comparison" -eq 1 ]; then
  write_status "$installed" "$latest" update-available
  say "Running $installed. Release $latest is published."
  say "Nothing on this appliance has changed."
  say ""
  say "To download and verify $latest without applying it, you need the release"
  say "lock and its .sha256 for $latest from the maintainer. The registry is"
  say "deliberately not trusted to supply both the images and the fingerprint"
  say "that authenticates them. Then run:"
  say ""
  say "  ./scripts/run-online-release.sh --fetch-only <lock> <lock.sha256> <kit-directory>"
else
  write_status "$installed" "$latest" current
  say "Running $installed, which is the newest published release."
fi
