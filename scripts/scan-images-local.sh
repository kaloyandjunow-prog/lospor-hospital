#!/bin/sh
# Scan the release images locally before cutting a candidate (Hospital 1.9.0).
#
#   sh scripts/scan-images-local.sh <X.Y.Z> [service ...]
#
# Builds the ten release images from this checkout the way release.yml does
# (the digest-pinned base images in release-inputs.json, compose.yaml plus
# compose.publish.yaml), scans each with the same pinned Trivy for HIGH and
# CRITICAL, and reports against release-risk-exceptions.json:
#   - findings no exception covers (fix them, or record a dated exception),
#   - exceptions no finding needs any more (release.yml refuses unused ones),
#   - exceptions still recorded for an older release (re-key them).
# Then runs release.yml's own policy check on a copy of the exceptions
# re-keyed to <X.Y.Z>, so a pass here means the candidate's scan step passes
# on the same findings. Nothing is pushed and the repository is not changed.
#
# Needs Docker (the test machine; the Windows host has none). The first build
# takes 30-60 minutes; layers and the Trivy database are cached after that.
# Naming services rebuilds only those and scans whatever images exist.
#
# Exit status: 0 when the policy check passes, 1 when it does not.
set -eu

release=${1:?usage: sh scripts/scan-images-local.sh <X.Y.Z> [service ...]}
shift
cd "$(dirname "$0")/.."

out=".data/local-scan/$release"
mkdir -p "$out/vulnerabilities" .data/trivy-cache

# The same digest-pinned base images and scanner the candidate uses.
node scripts/release-inputs.mjs env release-inputs.json > "$out/build.env"
set -a
. "./$out/build.env"
set +a
HOSPITAL_IMAGE_TAG="local-scan-$release"
export HOSPITAL_IMAGE_TAG

services=${*:-"postgres migrate api delivery-worker web pwa browser status tools caddy"}
for service in $services; do
  echo "== build $service"
  docker compose -f compose.yaml -f compose.publish.yaml --profile tools build "$service"
done

images="api browser caddy curl-worker migrate postgres pwa status tools web"
for name in $images; do
  echo "== scan $name"
  docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$PWD/.data/trivy-cache:/root/.cache" \
    -v "$PWD/$out:/reports" \
    "$TRIVY_IMAGE" image --scanners vuln --severity HIGH,CRITICAL --format json --quiet \
    --output "/reports/vulnerabilities/$name.json" \
    "ghcr.io/kaloyandjunow-prog/lospor-hospital-$name:$HOSPITAL_IMAGE_TAG"
done

reports=""
for name in $images; do reports="$reports $out/vulnerabilities/$name.json"; done
# shellcheck disable=SC2086 -- ten report paths, split on purpose
node scripts/scan-images-local-report.mjs "$release" release-risk-exceptions.json "$out" $reports
