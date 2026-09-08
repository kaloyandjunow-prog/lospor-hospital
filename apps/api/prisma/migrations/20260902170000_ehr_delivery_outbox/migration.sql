-- Messages queued for the hospital system.
--
-- There is no scheduler in the appliance, so "wait until later" is a WHERE
-- predicate rather than a job: a worker polls and asks for whatever is due.
--
-- deliverAfter exists because a case can be unfinalized and edited for
-- FINALIZE_UNDO_WINDOW_MS. Sending at the moment of finalization would make
-- every ordinary tidy-up inside that window a second message minutes after the
-- first, and would leave the hospital holding a version the appliance no longer
-- has. The same reasoning already gates Central delivery.

CREATE TYPE "EhrDeliveryKind" AS ENUM ('PROTOCOL', 'SAFETY_FINDINGS', 'CASE_START', 'CASE_END');
CREATE TYPE "EhrDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SUPERSEDED');

CREATE TABLE "EhrDelivery" (
  "id"             TEXT NOT NULL,
  "institutionId"  TEXT NOT NULL,
  "caseId"         TEXT NOT NULL,
  "finalizationId" TEXT NOT NULL,
  "sequence"       INTEGER NOT NULL,
  "kind"           "EhrDeliveryKind" NOT NULL,
  "status"         "EhrDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "deliverAfter"   TIMESTAMP(3) NOT NULL,
  "transport"      "EhrImportTransport" NOT NULL,
  "attemptCount"   INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt"  TIMESTAMP(3),
  "leaseOwner"     TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "sentAt"         TIMESTAMP(3),
  "errorCode"      TEXT,
  "supersedesId"   TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EhrDelivery_pkey" PRIMARY KEY ("id")
);

-- One message of each kind per finalization: a redelivery attempt must not
-- become a second message the hospital files twice.
CREATE UNIQUE INDEX "EhrDelivery_finalizationId_kind_key"
  ON "EhrDelivery" ("finalizationId", "kind");
CREATE UNIQUE INDEX "EhrDelivery_supersedesId_key"
  ON "EhrDelivery" ("supersedesId");
CREATE INDEX "EhrDelivery_status_deliverAfter_idx"
  ON "EhrDelivery" ("status", "deliverAfter");
CREATE INDEX "EhrDelivery_status_nextAttemptAt_idx"
  ON "EhrDelivery" ("status", "nextAttemptAt");
CREATE INDEX "EhrDelivery_caseId_kind_idx"
  ON "EhrDelivery" ("caseId", "kind");

ALTER TABLE "EhrDelivery"
  ADD CONSTRAINT "EhrDelivery_institutionId_fkey"
  FOREIGN KEY ("institutionId") REFERENCES "Institution"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EhrDelivery"
  ADD CONSTRAINT "EhrDelivery_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "Case"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EhrDelivery"
  ADD CONSTRAINT "EhrDelivery_supersedesId_fkey"
  FOREIGN KEY ("supersedesId") REFERENCES "EhrDelivery"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
