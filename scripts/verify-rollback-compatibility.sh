#!/bin/sh
set -eu

root="${1:-$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)}"
. "$root/scripts/release-compatibility.sh"
release_compatibility_read "$root/release-compatibility.tsv"
if [ "$compatibility_rollback_policy" = backup-required ]; then
  echo "ROLLBACK_REQUIRES_VERIFIED_BACKUP"
  exit 20
fi
evidence="$root/rollback-compatibility-proof.json"
[ -f "$evidence" ] && [ ! -L "$evidence" ] \
  || { echo "Rollback compatibility evidence is missing." >&2; exit 1; }
[ "$(sha256sum "$evidence" | awk '{print $1}')" = "$compatibility_proof_sha256" ] \
  || { echo "Rollback compatibility evidence digest does not match release policy." >&2; exit 1; }
python3 "$root/scripts/rollback-compatibility-evidence.py" \
  "$evidence" "$compatibility_version" "$compatibility_schema_max"
echo "ROLLBACK_SERVICE_COMPATIBILITY_PROVED"
