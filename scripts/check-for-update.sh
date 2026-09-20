#!/bin/sh
set -eu
set +x

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
# Exit 1 means it could not be answered -- no network, a registry that refused.
# The recorded state is then "unknown", never "current":
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
. "$root/scripts/update-pipeline-lib.sh"

quiet=0
[ "${1:-}" != --quiet ] || quiet=1

registry_origin="${HOSPITAL_REGISTRY_ORIGIN:-https://ghcr.io}"
registry_package="${HOSPITAL_UPDATE_PACKAGE:-kaloyandjunow-prog/lospor-hospital-api}"
registry_proto=https
case "$registry_origin" in
  https://ghcr.io) ;;
  http://127.0.0.1:*)
    [ "${HOSPITAL_UPDATE_TEST_ONLY:-0}" = 1 ] \
      && printf '%s\n' "$registry_origin" | grep -Eq '^http://127\.0\.0\.1:[1-9][0-9]{0,4}$' \
      || { echo "Unsupported registry origin." >&2; exit 2; }
    registry_proto=http
    ;;
  *) echo "Unsupported registry origin." >&2; exit 2 ;;
esac
printf '%s\n' "$registry_package" | grep -Eq '^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$' \
  || { echo "Invalid registry package." >&2; exit 2; }

# Normally derived from where this script lives, exactly as the installer and
# the release launcher derive it. LOSPOR_APPLIANCE_HOME overrides it for an
# operator inspecting a specific appliance home, and for the integration test.
# Only this read-only check honours the override: the launcher deliberately
# distrusts it, because there the value decides what gets overwritten.
appliance_home="${LOSPOR_APPLIANCE_HOME:-$(release_state_appliance_home "$root")}"
. "$root/scripts/operator-locale.sh"
operator_locale_load "$appliance_home"
[ -d "$appliance_home" ] || { operator_error "Appliance home does not exist: $appliance_home" "Директорията на болничната система не съществува: $appliance_home"; exit 2; }
status_path="$appliance_home/.data/update-status.tsv"

# Held for the whole check, not just the write. This reads the fetched field,
# decides, and rewrites the file -- a fetch landing in between would be read
# before and overwritten after, so a downloaded release would look
# unavailable.
release_state_lock_update_status "$appliance_home" || exit 2
work=""
cleanup() {
  [ -z "$work" ] || rm -rf "$work"
  release_state_unlock_update_status "$appliance_home"
}
trap cleanup EXIT HUP INT TERM

say() { [ "$quiet" -eq 1 ] || echo "$@"; }
say_pair() { [ "$quiet" -eq 1 ] || operator_say "$1" "$2"; }

command -v curl >/dev/null 2>&1 || { operator_error "curl is required." "Необходим е curl."; exit 2; }

work="$(mktemp -d)"

# Preserve whatever the fetch step last staged, and which exact release it was.
# This script has no business changing either, and losing them would make a
# downloaded update look unavailable.
fetched="-"
fetched_lock_sha="-"
if [ -f "$status_path" ]; then
  existing_fetched="$(awk -F '\t' 'NR == 1 && $1 == "LOSPOR-HOSPITAL-UPDATE-STATUS-V1" { print $6 }' "$status_path" || true)"
  [ -z "${existing_fetched:-}" ] || fetched="$existing_fetched"
  # Field seven, written by run-online-release.sh --fetch-only. The status page
  # will not offer to apply a release it cannot name exactly, so without this
  # the Apply button never appears however many releases have been downloaded.
  existing_fetched_sha="$(awk -F '\t' 'NR == 1 && $1 == "LOSPOR-HOSPITAL-UPDATE-STATUS-V1" { print $7 }' "$status_path" || true)"
  case "${existing_fetched_sha:-}" in
    '') ;;
    *[!a-f0-9]*) ;;
    *) [ "${#existing_fetched_sha}" -eq 64 ] && fetched_lock_sha="$existing_fetched_sha" ;;
  esac
fi

observed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Publish the same verdict as a status signal, so the appliance status page can
# show it without anyone reading a file over SSH. The signals volume is only
# writable from inside the appliance, so this goes through the tools container;
# a host that cannot do that still gets the recorded TSV and the printed answer.
publish_signal() {
  signal_state="$1"; signal_installed="$2"; signal_latest="$3"; signal_fetched="$4"
  signal_fetched_sha="${5:--}"
  command -v docker >/dev/null 2>&1 || return 0
  # Only publish to an appliance that is actually running. Without this the
  # `docker compose run` below would BUILD the tools image on a host where the
  # appliance has never been started -- minutes of work to deliver a status
  # update to a status page that does not exist. There is nobody to inform, so
  # recording the answer locally is the whole job.
  [ -n "$(docker compose ps --quiet status 2>/dev/null || true)" ] || return 0
  printf '{"schemaVersion":1,"signalType":"appliance-update","observedAt":"%s","state":"%s","installedVersion":"%s"%s%s%s}\n' \
    "$observed_at" "$signal_state" "$signal_installed" \
    "$([ "$signal_latest" = "-" ] || printf ',"latestVersion":"%s"' "$signal_latest")" \
    "$([ "$signal_fetched" = "-" ] || printf ',"fetchedVersion":"%s"' "$signal_fetched")" \
    "$([ "$signal_fetched_sha" = "-" ] || printf ',"fetchedLockSha256":"%s"' "$signal_fetched_sha")" \
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
      say_pair \
        "(Could not publish the status signal; the recorded answer below is still correct.)" \
        "(Сигналът към Status не можа да бъде публикуван; записаният по-долу резултат остава верен.)"
      return 0
    }
}

write_status() {
  mkdir -p "$appliance_home/.data"
  temporary="$status_path.tmp.$$"
  umask 077
  printf 'LOSPOR-HOSPITAL-UPDATE-STATUS-V1\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$observed_at" "$1" "$2" "$3" "$fetched" "$fetched_lock_sha" > "$temporary"
  chmod 0600 "$temporary"
  update_durable_replace "$temporary" "$status_path"
  publish_signal "$3" "$1" "$2" "$fetched" "$fetched_lock_sha"
}

installed=""
if release_state_read "$appliance_home"; then
  installed="$state_version"
else
  read_result=$?
  [ "$read_result" -eq 10 ] || exit "$read_result"
  say_pair "No release is installed yet; nothing to compare against." "Все още няма инсталирана версия; няма с какво да се сравни."
  write_status "-" "-" unknown
  exit 1
fi

fail_unknown() {
  reason_en="$1"
  reason_bg="$2"
  say_pair "Could not reach the release registry; the available version is unknown." "Регистърът с версии не е достъпен; наличната версия е неизвестна."
  say_pair "Reason: $reason_en" "Причина: $reason_bg"
  write_status "$installed" "-" unknown
  exit 1
}

# The release images are public, so the registry issues an anonymous pull
# token. A refusal is still reported as "unknown", never as "no updates".
token_scope="repository:${registry_package}:pull"
umask 077
curl --fail --silent --show-error --max-time 30 --max-redirs 0 --proto "=$registry_proto" --tlsv1.2 \
  "${registry_origin}/token?service=ghcr.io&scope=${token_scope}" \
  > "$work/token.json" 2>"$work/token.err" \
  || fail_unknown \
    "the registry refused an anonymous token ($(tr -d '\r\n' < "$work/token.err"))" \
    "регистърът отказа анонимен код за достъп ($(tr -d '\r\n' < "$work/token.err"))"

bearer="$(sed -n 's/.*"\(token\|access_token\)":"\([^"]\{16,\}\)".*/\2/p' "$work/token.json" | head -n 1)"
# GHCR's anonymous token is base64 and is routinely padded, so the trailing
# "=" has to be allowed. It was not, and the allowlist threw away every token
# the real registry issued: the check reported "the registry returned no
# usable access token" and recorded the available version as unknown, on an
# appliance whose network was fine. + and / are the remaining base64
# characters and are equally harmless here. What this guard is actually for
# is the line below, which writes the token into a curl config header, so
# what must stay excluded is whitespace, quotes, backslashes and newlines.
printf '%s\n' "$bearer" | grep -Eq '^[A-Za-z0-9._~+/-]{16,4096}={0,2}$' \
  || fail_unknown "the registry returned no usable access token" "регистърът не върна използваем код за достъп"
bearer_auth_config="$work/registry-bearer-auth.conf"
printf 'header = "Authorization: Bearer %s"\n' "$bearer" > "$bearer_auth_config"
chmod 0600 "$bearer_auth_config"
bearer=""

# Walk the tag list, following rel="next" so a package with more tags than fit
# on one page cannot hide its newest release. Bounded so a malformed or hostile
# Link header cannot spin here forever.
: > "$work/versions"
next="${registry_origin}/v2/${registry_package}/tags/list?n=100"
page=0
while [ -n "$next" ] && [ "$page" -lt 50 ]; do
  case "$next" in
    "${registry_origin}/v2/${registry_package}/tags/list?"*) ;;
    *) fail_unknown "the registry returned an unsafe pagination target" "регистърът върна небезопасен адрес за следваща страница" ;;
  esac
  curl --fail --silent --show-error --max-time 30 --max-redirs 0 --proto "=$registry_proto" --tlsv1.2 --dump-header "$work/headers" \
    --config "$bearer_auth_config" \
    "$next" > "$work/tags.json" 2>"$work/tags.err" \
    || fail_unknown \
      "the registry would not list published releases ($(tr -d '\r\n' < "$work/tags.err"))" \
      "регистърът не предостави списък на публикуваните версии ($(tr -d '\r\n' < "$work/tags.err"))"

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
    "/v2/${registry_package}/tags/list?"*) next="${registry_origin}${next}" ;;
    /*) fail_unknown "the registry returned an unsafe pagination path" "регистърът върна небезопасен път за следваща страница" ;;
  esac
  page=$((page + 1))
done
[ -z "$next" ] || fail_unknown "the registry pagination exceeded the safety limit" "страниците от регистъра надвишиха ограничението за безопасност"

latest="$(sort -t. -k1,1n -k2,2n -k3,3n -u "$work/versions" | tail -n 1)"
[ -n "$latest" ] || fail_unknown "the registry answered, but published no release versions" "регистърът отговори, но няма публикувани версии"

comparison="$(release_version_compare "$latest" "$installed")"
if [ "$comparison" -eq 1 ]; then
  write_status "$installed" "$latest" update-available
  say_pair "Running $installed. Release $latest is published." "Работи версия $installed. Публикувана е версия $latest."
  say_pair "Nothing on this appliance has changed." "Нищо в тази болнична система не е променено."
  say ""
  say_pair \
    "Use Download and verify on the authenticated Status release page." \
    "Използвайте „Изтегляне и проверка“ в удостоверената страница за версии в Status."
  say_pair \
    "In console-only mode, run:" \
    "В режим само от конзолата изпълнете:"
  say ""
  say "  sudo sh /opt/lospor-hospital/current/scripts/prepare-verified-release.sh '$latest' -"
  say ""
  say_pair \
    "The preparer authenticates the immutable release metadata, Ed25519 signature," \
    "Подготовката удостоверява непроменимите данни за версията, подписа Ed25519,"
  say_pair \
    "release lock, compatibility declaration, and exact OCI image identities." \
    "заключващия файл, декларацията за съвместимост и точните OCI образи."
else
  write_status "$installed" "$latest" current
  say_pair "Running $installed, which is the newest published release." "Работи версия $installed — най-новата публикувана версия."
fi
