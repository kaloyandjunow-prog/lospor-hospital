#!/bin/sh
set -eu

# Writes every appliance image to a single file for a site with no registry
# access — a hospital network that does not reach ghcr.io, which is the normal
# case rather than the exception.
#
# The point is not convenience. It is that the site runs the same bytes that
# were built once and tested once, instead of compiling its own copy of four
# Next.js applications and hoping the result matches. `docker load` restores
# exactly what `docker save` wrote, checksum included.
#
# Run it on a machine that has already built the images:
#
#   docker compose --profile tools build
#   ./scripts/bundle-offline.sh 8.5.0
#
# then carry the .tar.gz and its .sha256 to the site and run
# ./scripts/load-offline.sh against them.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"

version="${1:-}"
test -n "$version" || {
  echo "Usage: ./scripts/bundle-offline.sh <version>" >&2
  echo "Example: ./scripts/bundle-offline.sh 8.5.0" >&2
  exit 1
}

registry="${HOSPITAL_IMAGE_REGISTRY:-ghcr.io/kaloyandjunow-prog}"
services="api web pwa browser migrate tools"

refs=""
for service in $services; do
  local_tag="lospor-hospital-${service}:latest"
  docker image inspect "$local_tag" >/dev/null 2>&1 || {
    echo "Missing image: $local_tag" >&2
    echo "Build first: docker compose --profile tools build" >&2
    exit 1
  }
  release_tag="${registry}/lospor-hospital-${service}:${version}"
  docker tag "$local_tag" "$release_tag"
  refs="$refs $release_tag"
done

mkdir -p dist
archive="dist/lospor-hospital-${version}.images.tar.gz"

echo "Writing ${archive} ..."
# One save call for all of them: images built from shared stages also share
# layers, and a single stream stores each layer once.
#
# Level 6, not 9. These images are several gigabytes of already-compressed npm
# artefacts, where -9 costs a great deal of time for very little size. Override
# with HOSPITAL_BUNDLE_COMPRESSION when the transfer medium matters more than
# the wait.
docker save $refs | gzip "-${HOSPITAL_BUNDLE_COMPRESSION:-6}" > "$archive"

( cd dist && sha256sum "$(basename "$archive")" > "$(basename "$archive").sha256" )

echo
echo "Bundle:   ${archive}"
echo "Size:     $(du -h "$archive" | cut -f1)"
echo "Checksum: ${archive}.sha256"
echo
echo "At the site:"
echo "  ./scripts/load-offline.sh ${archive}"
echo "  HOSPITAL_RELEASE=${version} COMPOSE_FILE=compose.yaml:compose.release.yaml ./scripts/update.sh"
