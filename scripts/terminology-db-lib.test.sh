#!/bin/sh
set -eu
root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
. "$root/scripts/terminology-db-lib.sh"

MIN_ICD10_CODES=10
MIN_ICD10_BULGARIAN_LABELS=8
MIN_ATC_CODES=5
MIN_LAB_LOINC=4
MIN_OMOP_CONCEPTS=20
MIN_OMOP_RELATIONSHIPS=10
MIN_OMOP_ANCESTORS=5
MIN_CONCEPT_MAPS=6

terminology_counts_parse '10|8|5|4|20|10|5|6|0|0|0|1'
terminology_counts_valid

terminology_counts_parse '9|8|5|4|20|10|5|6|0|0|0|1'
if terminology_counts_valid; then
  echo "FAIL: below-minimum ICD count passed" >&2
  exit 1
fi
terminology_counts_parse '10|8|5|4|20|10|5|6|1|0|0|1'
if terminology_counts_valid; then
  echo "FAIL: broken relationship passed" >&2
  exit 1
fi
terminology_counts_parse '10|8|5|4|20|10|5|6|0|0|0|0'
if terminology_counts_valid; then
  echo "FAIL: package with no mapped concept passed" >&2
  exit 1
fi
if terminology_counts_parse '10|8|not-a-count'; then
  echo "FAIL: malformed count record passed" >&2
  exit 1
fi
terminology_database_name lospor_term_abcdef012345
if terminology_database_name 'lospor; DROP DATABASE lospor'; then
  echo "FAIL: unsafe database name passed" >&2
  exit 1
fi
grep -Fq 'hospital-approved' "$root/scripts/terminology-db-lib.sh"
grep -Fq 'hospitalManifestEvidence' "$root/scripts/terminology-db-lib.sh"
grep -Fq 'minimumsSha256' "$root/scripts/terminology-db-lib.sh"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM
printf '%s\n' '{"manifestSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","packageId":"fixture.pkg","version":"2026.1"}' > "$work/evidence.json"
printf '%s\n' 'minimums' > "$work/minimums.tsv"
printf '%s\n' 'counts' > "$work/counts.tsv"
docker() {
  printf '%s\n' "$*" > "$work/docker-call"
  case "$*" in *'SELECT'*)
    printf '%s\n' 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa|bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb|cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc|dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd|fixture.pkg|2026.1' ;;
  esac
}
MANIFEST_SHA256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
terminology_record_approved_manifest lospor_term_fixture \
  "$work/evidence.json" "$work/minimums.tsv" "$work/counts.tsv" run-fixture
grep -Fq 'hospital-approved' "$work/docker-call"
marker="$(terminology_query_approved_manifest lospor)"
case "$marker" in "$MANIFEST_SHA256|"*) ;; *) echo "FAIL: marker query was not returned" >&2; exit 1 ;; esac
echo "terminology database helper tests passed"
