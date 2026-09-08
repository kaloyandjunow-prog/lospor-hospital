-- Give a patient identifier a numbering space.
--
-- Until now a PatientLink was unique on (institutionId, identifierHash) alone,
-- so a record number and a national identifier that happened to be the same
-- digits would have collided into one row and merged two patients. Supporting
-- both at once requires the type in the key.
--
-- Existing rows are all record numbers: ЕГН has never been storable. They are
-- backfilled to IZ and keep hashVersion 1, because their hash was derived
-- without the type. Rehashing them would mean decrypting every stored patient
-- identifier on the appliance, which is a larger exposure than the collision it
-- closes, so the lookup carries a legacy path instead.

CREATE TYPE "PatientIdentifierType" AS ENUM ('IZ', 'EGN');

ALTER TABLE "PatientLink"
  ADD COLUMN "identifierType" "PatientIdentifierType" NOT NULL DEFAULT 'IZ',
  ADD COLUMN "hashVersion" INTEGER NOT NULL DEFAULT 1;

-- Existing rows predate the type and were hashed without it.
UPDATE "PatientLink" SET "identifierType" = 'IZ', "hashVersion" = 1;

DROP INDEX IF EXISTS "PatientLink_institutionId_identifierHash_key";

CREATE UNIQUE INDEX "PatientLink_institutionId_identifierType_identifierHash_key"
  ON "PatientLink" ("institutionId", "identifierType", "identifierHash");
