#!/bin/sh
set -eu

# Restores an offline image bundle at a site with no registry access.
#
# The checksum is verified before anything is loaded, and a failure stops the
# script. A bundle that travelled on a USB stick between two buildings is
# exactly the kind of thing that arrives truncated, and a half-loaded image set
# would leave the appliance running a mixture of versions.
#
#   ./scripts/load-offline.sh dist/lospor-hospital-8.5.0.images.tar.gz

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"

archive="${1:-}"
test -n "$archive" || {
  echo "Usage: ./scripts/load-offline.sh <bundle.tar.gz>" >&2
  exit 1
}
test -s "$archive" || {
  echo "No such bundle: $archive" >&2
  exit 1
}
test -s "${archive}.sha256" || {
  echo "Missing checksum: ${archive}.sha256" >&2
  echo "Refusing to load an unverified image bundle." >&2
  exit 1
}

echo "Verifying ${archive} ..."
( cd "$(dirname "$archive")" && sha256sum -c "$(basename "$archive").sha256" )

echo "Loading images ..."
gunzip -c "$archive" | docker load

echo
echo "Loaded:"
docker images --format '  {{.Repository}}:{{.Tag}}' | grep "lospor-hospital-" | sort

echo
echo "Start the appliance with the loaded release, for example:"
echo "  export HOSPITAL_RELEASE=<version>"
echo "  export COMPOSE_FILE=compose.yaml:compose.release.yaml"
echo "  ./scripts/update.sh"
