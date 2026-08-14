#!/bin/sh
set -eu

# Verify portable OCI identity. Docker's local .Id is intentionally never read
# from the release lock: classic and containerd-backed engines may expose
# different local identifiers for the same config and root filesystem.

lock="${1:-}"
mode="${2:-verify}"
test -s "$lock" || {
  echo "Usage: ./scripts/verify-loaded-release-images.sh <verified-release.lock> [restore-tags]" >&2
  exit 2
}
case "$mode" in
  verify|restore-tags) ;;
  *) echo "Unknown image verification mode: $mode" >&2; exit 2 ;;
esac
for required_command in docker tar sha256sum awk grep mktemp; do
  command -v "$required_command" >/dev/null 2>&1 || { echo "$required_command is required." >&2; exit 1; }
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
    || { echo "Malformed registry digest: $record_name" >&2; return 1; }
  printf '%s\n' "$record_platform_digest" | grep -Eq "$sha256_pattern" \
    || { echo "Malformed platform manifest digest: $record_name" >&2; return 1; }
  printf '%s\n' "$record_config_digest" | grep -Eq "$sha256_pattern" \
    || { echo "Malformed config digest: $record_name" >&2; return 1; }
  printf '%s\n' "$record_diff_ids" | grep -Eq "$diff_ids_pattern" \
    || { echo "Malformed rootfs diff IDs: $record_name" >&2; return 1; }
  test "$record_platform" = linux/amd64 \
    || { echo "Unsupported image platform: $record_name" >&2; return 1; }
  case "$record_reference" in
    ghcr.io/kaloyandjunow-prog/lospor-hospital-*:*) ;;
    ghcr.io/kaloyandjunow-prog/lospor-hospital-*@sha256:[a-f0-9]*) ;;
    *) echo "Unsafe image reference: $record_name" >&2; return 1 ;;
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
  ')" || return 1
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
    test -z "${extra:-}" || { echo "Malformed image record." >&2; return 1; }
    validate_image_record "$name" "$reference" "$registry_digest" "$platform_digest" "$config_digest" "$platform" "$diff_ids"
    portable_matches "$reference" "$config_digest" "$platform" "$diff_ids" || {
      echo "Loaded portable image identity mismatch or missing image: $name" >&2
      return 1
    }
    count=$((count + 1))
  done < "$lock"
  test "$count" -eq 10 || { echo "Verified lock did not contain ten images." >&2; return 1; }
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
    test -z "${extra:-}" || { echo "Malformed image record." >&2; exit 1; }
    validate_image_record "$name" "$reference" "$registry_digest" "$platform_digest" "$config_digest" "$platform" "$diff_ids"
    matching_subject=""
    while IFS= read -r local_subject; do
      if portable_matches "$local_subject" "$config_digest" "$platform" "$diff_ids"; then
        matching_subject="$local_subject"
        break
      fi
    done < "$temporary_directory/local-subjects"
    test -n "$matching_subject" || {
      echo "Could not resolve rollback image by portable identity: $name" >&2
      exit 1
    }
    printf '%s\t%s\n' "$matching_subject" "$reference" >> "$temporary_directory/restore-tags"
    count=$((count + 1))
  done < "$lock"
  test "$count" -eq 10 || { echo "Verified lock did not contain ten images." >&2; exit 1; }
  while IFS="$tab" read -r matching_subject reference extra; do
    test -z "${extra:-}" || exit 1
    docker tag "$matching_subject" "$reference"
  done < "$temporary_directory/restore-tags"
  trap - EXIT HUP INT TERM
  rm -rf "$temporary_directory"
fi

verify_references
echo "All ten local images match the verified release lock by portable OCI identity."
