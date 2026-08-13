#!/bin/sh
set -eu

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
command -v docker >/dev/null 2>&1 || { echo "Docker is required." >&2; exit 1; }

tab="$(printf '\t')"
verify_records() {
  lookup="$1"
  count=0
  while IFS="$tab" read -r kind name reference digest image_id platform extra; do
    [ "$kind" = image ] || continue
    test -z "${extra:-}" || { echo "Malformed image record." >&2; exit 1; }
    printf '%s\n' "$image_id" | grep -Eq '^sha256:[a-f0-9]{64}$' \
      || { echo "Malformed image ID: $name" >&2; exit 1; }
    test "$platform" = linux/amd64 || { echo "Unsupported image platform: $name" >&2; exit 1; }
    if [ "$lookup" = ids ]; then subject="$image_id"; else subject="$reference"; fi
    actual="$(docker image inspect --format '{{.Id}} {{.Os}}/{{.Architecture}}' "$subject" 2>/dev/null || true)"
    test "$actual" = "$image_id $platform" || {
      echo "Loaded image identity mismatch or missing image: $name" >&2
      exit 1
    }
    count=$((count + 1))
  done < "$lock"
  test "$count" -eq 10 || { echo "Verified lock did not contain ten images." >&2; exit 1; }
}

if [ "$mode" = restore-tags ]; then
  # A candidate can reuse a third-party version label with a newly approved
  # digest. Its launcher then moves that ordinary Docker tag to the new bytes.
  # Preflight every old content-addressed image before changing any tag, so a
  # missing rollback image fails without leaving a half-restored tag set.
  verify_records ids
  while IFS="$tab" read -r kind name reference digest image_id platform extra; do
    [ "$kind" = image ] || continue
    docker tag "$image_id" "$reference"
  done < "$lock"
fi

verify_records references
echo "All ten local images match the verified release lock."
