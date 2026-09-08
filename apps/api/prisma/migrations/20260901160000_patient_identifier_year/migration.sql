-- ИЗ № restarts at 1 every January.
--
-- The number alone is therefore not unique within an institution: ИЗ № 42 from
-- last year and ИЗ № 42 from this year are different admissions, and under the
-- previous key they hashed identically and would have become one patient link.
-- Unlike the identifier-type collision, this one is not hypothetical — it
-- happens to some number every year.
--
-- 0 means the identifier is not year-scoped. ЕГН is issued once for life, so it
-- carries no year. A sentinel rather than NULL because PostgreSQL treats NULLs
-- as distinct in a unique index, which would let two identical ЕГН links exist.

ALTER TABLE "PatientLink"
  ADD COLUMN "identifierYear" INTEGER NOT NULL DEFAULT 0;

-- Rows written before the year existed are all record numbers, and the number
-- they hold was issued in the year the link was created. Attributing them that
-- way costs no decryption and lets the legacy lookup stay year-correct: without
-- it, a 2025 link would be returned for a 2026 number that happens to match.
UPDATE "PatientLink"
  SET "identifierYear" = EXTRACT(YEAR FROM "createdAt")::INTEGER
  WHERE "identifierType" = 'IZ';

DROP INDEX IF EXISTS "PatientLink_institutionId_identifierType_identifierHash_key";

CREATE UNIQUE INDEX "PatientLink_institutionId_identifierType_identifierYear_hash_key"
  ON "PatientLink" ("institutionId", "identifierType", "identifierYear", "identifierHash");
