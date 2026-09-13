#!/bin/sh
set -eu

# Verify portable OCI identity. Docker's local .Id is intentionally never read
# from the release lock: classic and containerd-backed engines may expose
# different local identifiers for the same config and root filesystem.
#
# No mocked test suite exists for this script: its entire job is reacting
# correctly to real `docker`/`ctr`/containerd behaviour, and a mock would only
# encode assumptions about that behaviour back into the test -- which is how
# the containerd-store config-digest bug shipped undetected in the first
# place. It is instead verified live, against both storage backends and the
# real signed release lock, before each change; see 1.3.0's work-in-progress
# notes for the verification record.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
. "$root/scripts/operator-locale.sh"
operator_locale_load "$root"

lock="${1:-}"
mode="${2:-verify}"
test -s "$lock" || {
  operator_error \
    "Usage: ./scripts/verify-loaded-release-images.sh <verified-release.lock> [restore-tags]" \
    "Употреба: ./scripts/verify-loaded-release-images.sh <проверен-release.lock> [restore-tags]"
  exit 2
}
case "$mode" in
  verify|restore-tags) ;;
  *) operator_error "Unknown image verification mode: $mode" "Неизвестен режим за проверка на образите: $mode"; exit 2 ;;
esac
for required_command in docker tar sha256sum awk grep mktemp; do
  command -v "$required_command" >/dev/null 2>&1 \
    || { operator_error "$required_command is required." "Необходима е командата $required_command."; exit 1; }
done

tab="$(printf '\t')"
sha256_pattern='^sha256:[a-f0-9]{64}$'
diff_ids_pattern='^sha256:[a-f0-9]{64}(,sha256:[a-f0-9]{64})*$'

validate_image_record() {
  record_name="$1"
  record_reference="$2"
  record_registry_digest="$3"
  record_platform_digest="$4"
  record_config_digest="$5"
  record_platform="$6"
  record_diff_ids="$7"
  printf '%s\n' "$record_registry_digest" | grep -Eq "$sha256_pattern" \
    || { operator_error "Malformed registry digest: $record_name" "Невалиден digest на регистъра: $record_name"; return 1; }
  printf '%s\n' "$record_platform_digest" | grep -Eq "$sha256_pattern" \
    || { operator_error "Malformed platform manifest digest: $record_name" "Невалиден digest на манифеста за платформата: $record_name"; return 1; }
  printf '%s\n' "$record_config_digest" | grep -Eq "$sha256_pattern" \
    || { operator_error "Malformed config digest: $record_name" "Невалиден digest на конфигурацията: $record_name"; return 1; }
  printf '%s\n' "$record_diff_ids" | grep -Eq "$diff_ids_pattern" \
    || { operator_error "Malformed rootfs diff IDs: $record_name" "Невалидни rootfs diff ID: $record_name"; return 1; }
  test "$record_platform" = linux/amd64 \
    || { operator_error "Unsupported image platform: $record_name" "Неподдържана платформа на образа: $record_name"; return 1; }
  case "$record_reference" in
    ghcr.io/kaloyandjunow-prog/lospor-hospital-*:*) ;;
    ghcr.io/kaloyandjunow-prog/lospor-hospital-*@sha256:[a-f0-9]*) ;;
    *) operator_error "Unsafe image reference: $record_name" "Небезопасна референция към образ: $record_name"; return 1 ;;
  esac
}

portable_prefilter_matches() {
  subject="$1"
  expected_platform="$2"
  expected_diff_ids="$3"
  actual_platform="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$subject" 2>/dev/null || true)"
  if [ -z "$actual_platform" ]; then
    portable_mismatch_reason=missing
    return 1
  fi
  if [ "$actual_platform" != "$expected_platform" ]; then
    portable_mismatch_reason=platform
    return 1
  fi
  actual_diff_ids="$(docker image inspect --format '{{join .RootFS.Layers ","}}' "$subject" 2>/dev/null || true)"
  if [ "$actual_diff_ids" != "$expected_diff_ids" ]; then
    portable_mismatch_reason=diff_ids
    return 1
  fi
}

# The configuration digest the tag actually resolves to, read from the daemon's
# own store and bound to the tag at every step.
#
#   classic store     the image ID is the SHA-256 of the configuration itself.
#   containerd store  the tag's descriptor names a manifest or an index. Each
#                     blob is fetched by digest and re-hashed; an index must
#                     name exactly one manifest for the expected platform
#                     (attestations carry no real platform), and that manifest
#                     names the configuration, which is re-hashed too.
#
# This replaces `docker image save`, which streamed every layer -- gigabytes
# for the tools and migrate images -- twice per image in each pass and was most
# of an installation's wall-clock time. It also closes a gap that route had on
# the containerd store: save omitted the configuration, so the check fell back
# to fetching a blob named by the *expected* digest. Any such blob still in the
# content store matched, so a tag re-pointed at an image with identical layers
# but a changed configuration (entrypoint, environment, user) passed. Nothing
# here looks up a digest the tag itself did not lead to, and every failure is a
# refusal, never a fallback.
portable_config_digest() {
  subject="$1"
  expected_platform="$2"
  descriptor="$(docker image inspect --format '{{json .Descriptor}}' "$subject" 2>/dev/null || true)"
  case "$descriptor" in
    ''|null)
      image_id="$(docker image inspect --format '{{.Id}}' "$subject" 2>/dev/null || true)"
      printf '%s
' "$image_id" | grep -Eq '^sha256:[a-f0-9]{64}$' || return 1
      printf '%s
' "$image_id"
      return 0
      ;;
  esac
  containerd_socket=/run/containerd/containerd.sock
  [ -S "$containerd_socket" ] && command -v ctr >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1     || return 1
  python3 - "$descriptor" "$expected_platform" "$containerd_socket" <<'PY'
import hashlib
import json
import re
import subprocess
import sys

try:
    descriptor, platform, socket = json.loads(sys.argv[1]), sys.argv[2], sys.argv[3]
except ValueError:
    raise SystemExit(1)
want_os, _, want_architecture = platform.partition("/")
INDEX = {"application/vnd.oci.image.index.v1+json", "application/vnd.docker.distribution.manifest.list.v2+json"}
MANIFEST = {"application/vnd.oci.image.manifest.v1+json", "application/vnd.docker.distribution.manifest.v2+json"}


def blob(digest):
    if not isinstance(digest, str) or not re.fullmatch(r"sha256:[a-f0-9]{64}", digest):
        raise SystemExit(1)
    try:
        data = subprocess.run(
            ["ctr", "--address", socket, "--namespace", "moby", "content", "get", digest],
            capture_output=True, check=True,
        ).stdout
    except (OSError, subprocess.CalledProcessError):
        raise SystemExit(1)
    if "sha256:" + hashlib.sha256(data).hexdigest() != digest:
        raise SystemExit(1)
    try:
        document = json.loads(data)
    except ValueError:
        raise SystemExit(1)
    if not isinstance(document, dict):
        raise SystemExit(1)
    return document


if not isinstance(descriptor, dict):
    raise SystemExit(1)
document = blob(descriptor.get("digest"))
if descriptor.get("mediaType") in INDEX or document.get("mediaType") in INDEX:
    matches = [
        entry for entry in document.get("manifests", [])
        if isinstance(entry, dict)
        and entry.get("mediaType") in MANIFEST
        and (entry.get("platform") or {}).get("os") == want_os
        and (entry.get("platform") or {}).get("architecture") == want_architecture
    ]
    if len(matches) != 1:
        raise SystemExit(1)
    document = blob(matches[0].get("digest"))
config = (document.get("config") or {}).get("digest")
blob(config)
print(config)
PY
}

portable_matches() {
  subject="$1"
  expected_config_digest="$2"
  expected_platform="$3"
  expected_diff_ids="$4"
  portable_mismatch_reason=""
  portable_prefilter_matches "$subject" "$expected_platform" "$expected_diff_ids" || return 1
  actual_config_digest="$(portable_config_digest "$subject" "$expected_platform")" || {
    : "${portable_mismatch_reason:=config_digest}"
    return 1
  }
  if [ "$actual_config_digest" != "$expected_config_digest" ]; then
    portable_mismatch_reason=config_digest
    return 1
  fi
}

verify_references() {
  count=0
  while IFS="$tab" read -r kind name reference registry_digest platform_digest config_digest platform diff_ids extra; do
    test "$kind" = image || continue
    test -z "${extra:-}" || { operator_error "Malformed image record." "Невалиден запис за образ."; return 1; }
    validate_image_record "$name" "$reference" "$registry_digest" "$platform_digest" "$config_digest" "$platform" "$diff_ids"
    portable_matches "$reference" "$config_digest" "$platform" "$diff_ids" || {
      case "${portable_mismatch_reason:-}" in
        missing)
          operator_error "Loaded image not found locally: $name" "Зареденият образ не е намерен локално: $name" ;;
        platform)
          operator_error "Loaded image platform does not match the release lock: $name" "Платформата на заредения образ не съвпада с release lock: $name" ;;
        diff_ids)
          operator_error "Loaded image root filesystem does not match the release lock: $name" "Root файловата система на заредения образ не съвпада с release lock: $name" ;;
        *)
          operator_error "Loaded image configuration does not match the release lock: $name" "Конфигурацията на заредения образ не съвпада с release lock: $name" ;;
      esac
      return 1
    }
    count=$((count + 1))
  done < "$lock"
  test "$count" -eq 10 || { operator_error "Verified lock did not contain ten images." "Провереният заключващ файл не съдържа десет образа."; return 1; }
}

if test "$mode" = restore-tags; then
  temporary_directory="$(mktemp -d)"
  trap 'rm -rf "$temporary_directory"' EXIT HUP INT TERM
  docker image ls --all --no-trunc --quiet \
    | grep -E '^sha256:[a-f0-9]{64}$' \
    | awk '!seen[$0]++' > "$temporary_directory/local-subjects"
  : > "$temporary_directory/restore-tags"
  count=0
  while IFS="$tab" read -r kind name reference registry_digest platform_digest config_digest platform diff_ids extra; do
    test "$kind" = image || continue
    test -z "${extra:-}" || { operator_error "Malformed image record." "Невалиден запис за образ."; exit 1; }
    validate_image_record "$name" "$reference" "$registry_digest" "$platform_digest" "$config_digest" "$platform" "$diff_ids"
    matching_subject=""
    while IFS= read -r local_subject; do
      if portable_matches "$local_subject" "$config_digest" "$platform" "$diff_ids"; then
        matching_subject="$local_subject"
        break
      fi
    done < "$temporary_directory/local-subjects"
    test -n "$matching_subject" || {
      operator_error "Could not resolve rollback image by portable identity: $name" "Образът за връщане не може да бъде определен по преносимата му самоличност: $name"
      exit 1
    }
    printf '%s\t%s\n' "$matching_subject" "$reference" >> "$temporary_directory/restore-tags"
    count=$((count + 1))
  done < "$lock"
  test "$count" -eq 10 || { operator_error "Verified lock did not contain ten images." "Провереният заключващ файл не съдържа десет образа."; exit 1; }
  while IFS="$tab" read -r matching_subject reference extra; do
    test -z "${extra:-}" || exit 1
    docker tag "$matching_subject" "$reference"
  done < "$temporary_directory/restore-tags"
  trap - EXIT HUP INT TERM
  rm -rf "$temporary_directory"
fi

verify_references
operator_say \
  "All ten local images match the verified release lock by portable OCI identity." \
  "И десетте локални образа съвпадат с проверения заключващ файл по преносимата си OCI самоличност."
