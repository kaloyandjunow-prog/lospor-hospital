#!/bin/sh
set -eu

# Verify portable OCI identity. Docker's local .Id is intentionally never read
# from the release lock: classic and containerd-backed engines may expose
# different local identifiers for the same config and root filesystem.

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
  test "$actual_platform" = "$expected_platform" || return 1
  actual_diff_ids="$(docker image inspect --format '{{join .RootFS.Layers ","}}' "$subject" 2>/dev/null || true)"
  test "$actual_diff_ids" = "$expected_diff_ids" || return 1
}

portable_config_digest() {
  subject="$1"
  expected_config_digest="$2"
  config_hex="${expected_config_digest#sha256:}"
  archive_entries="$(docker image save "$subject" 2>/dev/null | tar -tf - 2>/dev/null)" || return 1
  config_path="$(printf '%s\n' "$archive_entries" | awk -v classic="$config_hex.json" -v oci="blobs/sha256/$config_hex" '
    $0 == classic || $0 == oci { count += 1; path = $0 }
    END { if (count == 1) print path; else exit 1 }
  ')" || {
    # `docker image save` does not always write every blob its own manifest
    # references. Confirmed on Docker 29 with the containerd image store
    # active (features.containerd-snapshotter=true): saving a single image
    # writes only the top-level manifest -- the config and layer blobs that
    # manifest itself names are simply absent from the tar, even though
    # `docker image inspect` on the same image reports them correctly. The
    # bytes are not lost -- they live in containerd's own content store,
    # which is what this image store is backed by -- so read them from there
    # directly, in the "moby" namespace the Docker Engine itself uses,
    # instead of trusting `docker save` to have written what it claims to.
    # Absent under the classic store, where this path is never reached.
    containerd_socket=/run/containerd/containerd.sock
    [ -S "$containerd_socket" ] && command -v ctr >/dev/null 2>&1 || return 1
    ctr --address "$containerd_socket" --namespace moby content get "sha256:$config_hex" 2>/dev/null \
      | sha256sum | awk '{ print "sha256:" $1 }'
    return
  }
  actual_hex="$(docker image save "$subject" 2>/dev/null \
    | tar -xOf - "$config_path" 2>/dev/null \
    | sha256sum \
    | awk '{ print $1 }')"
  printf 'sha256:%s\n' "$actual_hex"
}

portable_matches() {
  subject="$1"
  expected_config_digest="$2"
  expected_platform="$3"
  expected_diff_ids="$4"
  portable_prefilter_matches "$subject" "$expected_platform" "$expected_diff_ids" || return 1
  actual_config_digest="$(portable_config_digest "$subject" "$expected_config_digest")" || return 1
  test "$actual_config_digest" = "$expected_config_digest"
}

verify_references() {
  count=0
  while IFS="$tab" read -r kind name reference registry_digest platform_digest config_digest platform diff_ids extra; do
    test "$kind" = image || continue
    test -z "${extra:-}" || { operator_error "Malformed image record." "Невалиден запис за образ."; return 1; }
    validate_image_record "$name" "$reference" "$registry_digest" "$platform_digest" "$config_digest" "$platform" "$diff_ids"
    portable_matches "$reference" "$config_digest" "$platform" "$diff_ids" || {
      operator_error "Loaded portable image identity mismatch or missing image: $name" "Самоличността на заредения преносим образ не съвпада или образът липсва: $name"
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
