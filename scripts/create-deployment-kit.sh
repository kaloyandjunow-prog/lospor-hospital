#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"
version="${1:-}"
printf '%s\n' "$version" | grep -Eq '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' \
  || { echo "Usage: ./scripts/create-deployment-kit.sh <MAJOR.MINOR.PATCH>" >&2; exit 2; }
tag="hospital-${version}"
tag_commit="$(git rev-parse "${tag}^{commit}" 2>/dev/null || true)"
head_commit="$(git rev-parse HEAD)"
if [ -z "$tag_commit" ] || [ "$tag_commit" != "$head_commit" ]; then
  echo "${tag} must exist and point at HEAD before creating a deployment kit." >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "Refusing to package a dirty working tree." >&2
  exit 1
fi

mkdir -p dist
archive="dist/lospor-hospital-${version}-deployment.tar.gz"
temporary="${archive}.tmp.$$"
trap 'rm -f "$temporary"' EXIT HUP INT TERM
test ! -e "$archive" || { echo "Refusing to overwrite ${archive}" >&2; exit 1; }
git archive --format=tar --prefix="lospor-hospital-${version}/" "$tag" \
  | gzip -6 > "$temporary"
gzip -t "$temporary"
mv "$temporary" "$archive"
trap - EXIT HUP INT TERM
echo "Deployment kit: ${archive}"
