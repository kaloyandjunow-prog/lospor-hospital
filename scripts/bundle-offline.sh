#!/bin/sh
set -eu

# Build the registry-independent image archive from already verified local
# release tags. This script never pulls and never builds: the seven application
# images and three third-party images must already match image-lock.json.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"

version="${1:-}"
image_lock="${2:-}"
test -n "$version" && test -s "$image_lock" || {
  echo "Usage: ./scripts/bundle-offline.sh <version> <image-lock.json>" >&2
  exit 2
}
for command_name in docker node gzip split mktemp; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "$command_name is required." >&2; exit 1; }
done

node scripts/image-lock.mjs verify-loaded-lock "$image_lock" "$version"
refs="$(node scripts/image-lock.mjs refs "$image_lock" "$version" | awk -F '\t' '{print $1}')"
test "$(printf '%s\n' "$refs" | grep -c .)" -eq 10 || { echo "Image lock did not resolve ten references." >&2; exit 1; }

mkdir -p dist
prefix="lospor-hospital-${version}-images.tar.gz.part-"
if find dist -maxdepth 1 -type f -name "${prefix}*" -print -quit | grep -q .; then
  echo "Refusing to overwrite existing offline parts for Hospital $version." >&2
  exit 1
fi

temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT HUP INT TERM
tar_path="$temporary_directory/images.tar"
gzip_path="$temporary_directory/images.tar.gz"

# docker save writes to a file so its exit status cannot be hidden by a
# compression pipeline. Shared layers are still stored once across all images.
# References are validated by image-lock.mjs and cannot contain whitespace.
# shellcheck disable=SC2086
docker save --output "$tar_path" $refs
gzip "-${HOSPITAL_BUNDLE_COMPRESSION:-6}" -c "$tar_path" > "$gzip_path"
gzip -t "$gzip_path"
split -b 1992294400 -d -a 3 "$gzip_path" "$temporary_directory/$prefix"

part_count=0
for part in "$temporary_directory"/"$prefix"*; do
  test -f "$part" || { echo "Offline bundle produced no parts." >&2; exit 1; }
  bytes="$(wc -c < "$part" | tr -d '[:space:]')"
  test "$bytes" -le 1992294400 || { echo "Offline part is larger than 1.9 GiB." >&2; exit 1; }
  mv "$part" "dist/$(basename "$part")"
  part_count=$((part_count + 1))
done
test "$part_count" -ge 1 || { echo "Offline bundle produced no parts." >&2; exit 1; }

echo "Created $part_count signed-manifest-ready offline part(s):"
find dist -maxdepth 1 -type f -name "${prefix}*" -print | sort
echo "The release workflow must record every ordered part in the signed manifest before distribution."
