-- Where an inbound hospital-system message waits for a clinician.
--
-- Imported values are never written into a case on arrival. An unattended
-- importer would walk into the pediatric trap -- the server refuses any write
-- where age and clinical mode disagree -- and, because only the web app
-- surfaces a save conflict, an import landing on top of a bedside edit would be
-- resolved by silently discarding one of them. Staging the values and having a
-- clinician accept them field by field avoids both.
--
-- The patient is identified by the same hash a PatientLink uses, so the record
-- number itself is not stored a second time. Nothing here has a foreign key to
-- User: removing an account must not cascade into clinical provenance.

CREATE TYPE "EhrImportTransport" AS ENUM ('FOLDER', 'FHIR', 'HL7V2');
CREATE TYPE "EhrImportStatus" AS ENUM ('PENDING', 'REVIEWED', 'DISCARDED', 'EXPIRED');
CREATE TYPE "EhrImportFieldStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

CREATE TABLE "EhrImport" (
  "id"               TEXT NOT NULL,
  "institutionId"    TEXT NOT NULL,
  "identifierType"   "PatientIdentifierType" NOT NULL DEFAULT 'IZ',
  "identifierHash"   TEXT NOT NULL,
  "hashVersion"      INTEGER NOT NULL DEFAULT 2,
  "maskedIdentifier" TEXT NOT NULL,
  "transport"        "EhrImportTransport" NOT NULL,
  "sourceMessageId"  TEXT,
  "payloadHash"      TEXT NOT NULL,
  "receivedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"        TIMESTAMP(3) NOT NULL,
  "status"           "EhrImportStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedAt"       TIMESTAMP(3),
  "reviewedById"     TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EhrImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EhrImportField" (
  "id"            TEXT NOT NULL,
  "importId"      TEXT NOT NULL,
  "section"       TEXT NOT NULL,
  "fieldKey"      TEXT NOT NULL,
  "proposedValue" JSONB NOT NULL,
  "status"        "EhrImportFieldStatus" NOT NULL DEFAULT 'PENDING',
  "decidedAt"     TIMESTAMP(3),
  "decidedById"   TEXT,

  CONSTRAINT "EhrImportField_pkey" PRIMARY KEY ("id")
);

-- Redelivering the same message must not queue a second review of the same
-- values for the clinician.
CREATE UNIQUE INDEX "EhrImport_institutionId_payloadHash_key"
  ON "EhrImport" ("institutionId", "payloadHash");

-- The lookup a clinician's typed record number performs.
CREATE INDEX "EhrImport_institutionId_identifierType_identifierHash_status_idx"
  ON "EhrImport" ("institutionId", "identifierType", "identifierHash", "status");

-- Unclaimed imports hold clinical data for a patient who may have no case here
-- at all, so the retention sweep needs this to be cheap.
CREATE INDEX "EhrImport_expiresAt_idx" ON "EhrImport" ("expiresAt");

CREATE UNIQUE INDEX "EhrImportField_importId_section_fieldKey_key"
  ON "EhrImportField" ("importId", "section", "fieldKey");

CREATE INDEX "EhrImportField_importId_status_idx"
  ON "EhrImportField" ("importId", "status");

ALTER TABLE "EhrImport"
  ADD CONSTRAINT "EhrImport_institutionId_fkey"
  FOREIGN KEY ("institutionId") REFERENCES "Institution"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Deciding a field is meaningless once the message it belongs to is gone.
ALTER TABLE "EhrImportField"
  ADD CONSTRAINT "EhrImportField_importId_fkey"
  FOREIGN KEY ("importId") REFERENCES "EhrImport"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
