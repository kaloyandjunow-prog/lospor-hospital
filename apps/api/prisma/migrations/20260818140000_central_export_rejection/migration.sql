-- Record the revision set Central refused, so it is not offered again unchanged.
--
-- A rejected batch is terminal, so reserveNextCentralBatch saw no active batch
-- for its cases -- but rejection wrote no per-case state either, so those cases
-- had no checkpoint, revisionsChanged() treated them as new, and they were
-- rebuilt into a fresh batch every sixty seconds. Each attempt consumed another
-- sequence number that Central would never accept, widening the gap against its
-- nextExpectedSequence for as long as the worker ran.
--
-- Kept separate from CentralExportCheckpoint deliberately: that table records
-- what Central accepted and its acceptedAt is NOT NULL, so writing a refusal
-- into it would mean storing a rejection as though it were an acceptance.

CREATE TABLE "CentralExportRejection" (
  "caseId"             TEXT         NOT NULL,
  "lastBatchId"        TEXT         NOT NULL,
  "clinicalRevision"   INTEGER      NOT NULL,
  "eventRevision"      INTEGER      NOT NULL,
  "relationalRevision" INTEGER      NOT NULL,
  "preopRevision"      INTEGER,
  "intraopRevision"    INTEGER,
  "postopRevision"     INTEGER,
  "errorCode"          TEXT         NOT NULL,
  "errorMessage"       TEXT,
  "rejectedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CentralExportRejection_pkey" PRIMARY KEY ("caseId")
);

CREATE INDEX "CentralExportRejection_lastBatchId_idx"
  ON "CentralExportRejection" ("lastBatchId");

ALTER TABLE "CentralExportRejection"
  ADD CONSTRAINT "CentralExportRejection_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
