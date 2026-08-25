#!/bin/sh

# Database checks shared by the staged importer and the go-live doctor gate.
# Counts contain no clinical rows or identifiers.

terminology_database_name() {
  printf '%s\n' "${1:-}" | grep -Eq '^[a-z][a-z0-9_]{0,62}$'
}

terminology_query_counts() {
  terminology_database="$1"
  terminology_database_name "$terminology_database" || return 1
  docker compose exec -T postgres psql -X -v ON_ERROR_STOP=1 \
    -U lospor -d "$terminology_database" -At -F '|' -c '
      SELECT
        (SELECT count(*) FROM "Icd10Code"),
        (SELECT count(*) FROM "Icd10Code" WHERE "labelBg" IS NOT NULL AND btrim("labelBg") <> '\''\''),
        (SELECT count(*) FROM "Atc"),
        (SELECT count(*) FROM "LabLoinc"),
        (SELECT count(*) FROM "OmopConcept"),
        (SELECT count(*) FROM "OmopConceptRelationship"),
        (SELECT count(*) FROM "OmopConceptAncestor"),
        (SELECT count(*) FROM "ConceptMap" WHERE "active" = true),
        (SELECT count(*) FROM "OmopConceptRelationship" r
          LEFT JOIN "OmopConcept" c1 ON c1."conceptId" = r."conceptId1"
          LEFT JOIN "OmopConcept" c2 ON c2."conceptId" = r."conceptId2"
          WHERE c1."conceptId" IS NULL OR c2."conceptId" IS NULL),
        (SELECT count(*) FROM "OmopConceptAncestor" a
          LEFT JOIN "OmopConcept" c1 ON c1."conceptId" = a."ancestorConceptId"
          LEFT JOIN "OmopConcept" c2 ON c2."conceptId" = a."descendantConceptId"
          WHERE c1."conceptId" IS NULL OR c2."conceptId" IS NULL),
        (SELECT count(*) FROM "ConceptMap" m
          LEFT JOIN "OmopConcept" c ON c."conceptId" = m."standardConceptId"
          WHERE m."active" = true
            AND m."mappingStatus" IN ('\''MAPPED'\''::"ConceptMappingStatus", '\''MANUALLY_CURATED'\''::"ConceptMappingStatus")
            AND (m."standardConceptId" IS NULL OR c."conceptId" IS NULL)),
        (SELECT count(*) FROM "ConceptMap" m
          WHERE m."active" = true
            AND m."mappingStatus" IN ('\''MAPPED'\''::"ConceptMappingStatus", '\''MANUALLY_CURATED'\''::"ConceptMappingStatus"));
    '
}

terminology_counts_parse() {
  terminology_counts_line="$1"
  old_ifs="$IFS"; IFS='|'; set -- $terminology_counts_line; IFS="$old_ifs"
  [ "$#" -eq 12 ] || return 1
  TERMINOLOGY_ICD10="$1"
  TERMINOLOGY_ICD10_BG="$2"
  TERMINOLOGY_ATC="$3"
  TERMINOLOGY_LOINC="$4"
  TERMINOLOGY_CONCEPTS="$5"
  TERMINOLOGY_RELATIONSHIPS="$6"
  TERMINOLOGY_ANCESTORS="$7"
  TERMINOLOGY_MAPS="$8"
  TERMINOLOGY_BAD_RELATIONSHIPS="$9"
  shift 9
  TERMINOLOGY_BAD_ANCESTORS="$1"
  TERMINOLOGY_BAD_MAPPINGS="$2"
  TERMINOLOGY_MAPPED="$3"
  for terminology_number in \
    "$TERMINOLOGY_ICD10" "$TERMINOLOGY_ICD10_BG" "$TERMINOLOGY_ATC" "$TERMINOLOGY_LOINC" \
    "$TERMINOLOGY_CONCEPTS" "$TERMINOLOGY_RELATIONSHIPS" "$TERMINOLOGY_ANCESTORS" "$TERMINOLOGY_MAPS" \
    "$TERMINOLOGY_BAD_RELATIONSHIPS" "$TERMINOLOGY_BAD_ANCESTORS" "$TERMINOLOGY_BAD_MAPPINGS" "$TERMINOLOGY_MAPPED"
  do
    case "$terminology_number" in ''|*[!0-9]*) return 1 ;; esac
  done
}

terminology_counts_valid() {
  [ "$TERMINOLOGY_ICD10" -ge "$MIN_ICD10_CODES" ] \
    && [ "$TERMINOLOGY_ICD10_BG" -ge "$MIN_ICD10_BULGARIAN_LABELS" ] \
    && [ "$TERMINOLOGY_ATC" -ge "$MIN_ATC_CODES" ] \
    && [ "$TERMINOLOGY_LOINC" -ge "$MIN_LAB_LOINC" ] \
    && [ "$TERMINOLOGY_CONCEPTS" -ge "$MIN_OMOP_CONCEPTS" ] \
    && [ "$TERMINOLOGY_RELATIONSHIPS" -ge "$MIN_OMOP_RELATIONSHIPS" ] \
    && [ "$TERMINOLOGY_ANCESTORS" -ge "$MIN_OMOP_ANCESTORS" ] \
    && [ "$TERMINOLOGY_MAPS" -ge "$MIN_CONCEPT_MAPS" ] \
    && [ "$TERMINOLOGY_BAD_RELATIONSHIPS" -eq 0 ] \
    && [ "$TERMINOLOGY_BAD_ANCESTORS" -eq 0 ] \
    && [ "$TERMINOLOGY_BAD_MAPPINGS" -eq 0 ] \
    && [ "$TERMINOLOGY_MAPPED" -ge 1 ]
}

terminology_counts_record() {
  printf 'LOSPOR-HOSPITAL-TERMINOLOGY-COUNTS-V1\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$TERMINOLOGY_ICD10" "$TERMINOLOGY_ICD10_BG" "$TERMINOLOGY_ATC" "$TERMINOLOGY_LOINC" \
    "$TERMINOLOGY_CONCEPTS" "$TERMINOLOGY_RELATIONSHIPS" "$TERMINOLOGY_ANCESTORS" "$TERMINOLOGY_MAPS" \
    "$TERMINOLOGY_BAD_RELATIONSHIPS" "$TERMINOLOGY_BAD_ANCESTORS" "$TERMINOLOGY_BAD_MAPPINGS" "$TERMINOLOGY_MAPPED"
}

# Bind the verified package evidence to the database generation itself. This
# marker follows a PostgreSQL backup/restore or an atomic database rename, so a
# stale host-side active file cannot approve terminology from another database.
terminology_record_approved_manifest() {
  terminology_marker_database="$1"
  terminology_marker_manifest="$2"
  terminology_marker_minimums="$3"
  terminology_marker_counts="$4"
  terminology_marker_run_id="$5"
  terminology_database_name "$terminology_marker_database" || return 1
  [ -s "$terminology_marker_manifest" ] \
    && [ -s "$terminology_marker_minimums" ] \
    && [ -s "$terminology_marker_counts" ] || return 1
  terminology_marker_json="$(cat "$terminology_marker_manifest")"
  terminology_marker_manifest_sha="$(sha256sum "$terminology_marker_manifest" | awk '{ print $1 }')"
  terminology_marker_minimums_sha="$(sha256sum "$terminology_marker_minimums" | awk '{ print $1 }')"
  terminology_marker_counts_sha="$(sha256sum "$terminology_marker_counts" | awk '{ print $1 }')"
  docker compose exec -T postgres psql -X -v ON_ERROR_STOP=1 \
    -U lospor -d "$terminology_marker_database" \
    -v "manifest_sha=$MANIFEST_SHA256" \
    -v "evidence_json=$terminology_marker_json" \
    -v "evidence_sha=$terminology_marker_manifest_sha" \
    -v "minimums_sha=$terminology_marker_minimums_sha" \
    -v "counts_sha=$terminology_marker_counts_sha" \
    -v "run_id=$terminology_marker_run_id" \
    -c "
      INSERT INTO \"OmopVocabularyImport\"
        (\"id\", \"sourceDirectory\", \"vocabularyVersion\", \"importedTables\",
         \"startedAt\", \"completedAt\", \"status\")
      VALUES
        ('lospor-manifest-' || :'manifest_sha',
         'manifest-sha256:' || :'manifest_sha',
         (:'evidence_json'::jsonb ->> 'packageId') || '@' ||
           (:'evidence_json'::jsonb ->> 'version'),
         jsonb_build_object(
           'hospitalManifestEvidence', :'evidence_json'::jsonb,
           'evidenceSha256', :'evidence_sha',
           'minimumsSha256', :'minimums_sha',
           'countsSha256', :'counts_sha',
           'runId', :'run_id'),
         now(), now(), 'hospital-approved')
      ON CONFLICT (\"id\") DO UPDATE SET
        \"vocabularyVersion\" = EXCLUDED.\"vocabularyVersion\",
        \"importedTables\" = EXCLUDED.\"importedTables\",
        \"completedAt\" = EXCLUDED.\"completedAt\",
        \"status\" = EXCLUDED.\"status\";
    " >/dev/null
}

terminology_query_approved_manifest() {
  terminology_marker_database="$1"
  terminology_database_name "$terminology_marker_database" || return 1
  docker compose exec -T postgres psql -X -v ON_ERROR_STOP=1 \
    -U lospor -d "$terminology_marker_database" -At -F '|' -c '
      SELECT
        split_part("sourceDirectory", '\''manifest-sha256:'\'', 2),
        "importedTables" ->> '\''evidenceSha256'\'',
        "importedTables" ->> '\''minimumsSha256'\'',
        "importedTables" ->> '\''countsSha256'\'',
        "importedTables" #>> '\''{hospitalManifestEvidence,packageId}'\'',
        "importedTables" #>> '\''{hospitalManifestEvidence,version}'\''
      FROM "OmopVocabularyImport"
      WHERE "status" = '\''hospital-approved'\''
        AND "sourceDirectory" LIKE '\''manifest-sha256:%'\''
      ORDER BY "completedAt" DESC, "id" DESC
      LIMIT 1;
    '
}
