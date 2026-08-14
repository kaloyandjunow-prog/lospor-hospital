#!/usr/bin/env bash
set -euo pipefail

# Build the registry-independent image archive from already verified local
# release tags. This script never pulls and never builds: all ten images must
# already match image-lock.json.

export LC_ALL=C

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"

version="${1:-}"
image_lock="${2:-}"
if [[ -z "$version" || ! -s "$image_lock" ]]; then
  echo "Usage: bash scripts/bundle-offline.sh <version> <image-lock.json>" >&2
  exit 2
fi
if [[ ! "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  echo "Version must be exactly MAJOR.MINOR.PATCH; got '$version'." >&2
  exit 2
fi
for command_name in docker node gzip split mktemp; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "$command_name is required." >&2; exit 1; }
done

compression="${HOSPITAL_BUNDLE_COMPRESSION:-6}"
if [[ ! "$compression" =~ ^[1-9]$ ]]; then
  echo "HOSPITAL_BUNDLE_COMPRESSION must be one digit from 1 through 9." >&2
  exit 2
fi

node scripts/image-lock.mjs verify-loaded-lock "$image_lock" "$version"
refs_output="$(node scripts/image-lock.mjs refs "$image_lock" "$version")"
mapfile -t ref_records <<< "$refs_output"
refs=()
for record in "${ref_records[@]}"; do
  IFS=$'\t' read -r reference immutable_reference config_digest extra <<< "$record"
  if [[ -n "${extra:-}" || -z "$reference" || -z "$immutable_reference" || -z "$config_digest" ]]; then
    echo "Image lock returned a malformed reference record." >&2
    exit 1
  fi
  refs+=("$reference")
done
if (( ${#refs[@]} != 10 )); then
  echo "Image lock did not resolve ten references." >&2
  exit 1
fi
for reference in "${refs[@]}"; do
  if [[ -z "$reference" || "$reference" == *[[:space:]]* ]]; then
    echo "Image lock returned an unsafe reference." >&2
    exit 1
  fi
done

mkdir -p dist
prefix="lospor-hospital-${version}-images.tar.gz.part-"
shopt -s nullglob
existing_parts=(dist/"$prefix"*)
if (( ${#existing_parts[@]} != 0 )); then
  echo "Refusing to overwrite existing offline parts for Hospital $version." >&2
  exit 1
fi

# Keep staging on the dist filesystem so each validated part is published by
# an atomic rename. The EXIT cleanup rolls back any earlier rename if a later
# one fails, so an unsuccessful run leaves no newly published final parts.
temporary_directory="$(mktemp -d "dist/.${prefix}staging.XXXXXX")"
final_paths=()
committed=0
cleanup() {
  status=$?
  trap - EXIT
  if (( committed == 0 )); then
    for path in "${final_paths[@]}"; do
      rm -f -- "$path"
    done
  fi
  rm -rf -- "$temporary_directory"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

part_size=1992294400

# pipefail is essential: docker, gzip, or split failing must fail the release.
# Streaming avoids holding a second, uncompressed docker-save tar on the
# already constrained GitHub-hosted runner disk.
docker save "${refs[@]}" \
  | gzip "-$compression" -c \
  | split -b "$part_size" -d -a 3 - "$temporary_directory/$prefix"

parts=("$temporary_directory/$prefix"*)
if (( ${#parts[@]} == 0 )); then
  echo "Offline bundle produced no parts." >&2
  exit 1
fi

# Reassemble through stdin and test the complete gzip member before exposing
# any part under its final name. This detects truncation or corruption from
# any stage, including a split implementation that returns success.
cat -- "${parts[@]}" | gzip -t

for index in "${!parts[@]}"; do
  part="${parts[$index]}"
  expected_suffix="$(printf '%03d' "$index")"
  if [[ "${part##*/}" != "$prefix$expected_suffix" ]]; then
    echo "Offline bundle parts are missing, duplicated, or out of order." >&2
    exit 1
  fi
  bytes="$(wc -c < "$part" | tr -d '[:space:]')"
  if [[ ! "$bytes" =~ ^[1-9][0-9]*$ || "$bytes" -gt "$part_size" ]]; then
    echo "Offline part is empty or larger than 1.9 GiB." >&2
    exit 1
  fi
done

for part in "${parts[@]}"; do
  destination="dist/${part##*/}"
  final_paths+=("$destination")
  mv -- "$part" "$destination"
done
committed=1

echo "Created ${#final_paths[@]} release-lock-ready offline part(s):"
printf '%s\n' "${final_paths[@]}"
echo "The release workflow must record every ordered part in the canonical lock before distribution."
