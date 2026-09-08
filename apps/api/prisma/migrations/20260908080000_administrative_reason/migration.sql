-- Somewhere governed for the explanations the audit detail cannot hold.
--
-- assertSafeAuditDetail rejects any audit detail key ending in "reason": free
-- text written by an operator is precisely what that guard keeps out of the
-- audit trail. Several acts nevertheless require an explanation, and until now
-- those explanations were validated and then dropped -- or, where the routes
-- passed them to the audit writer anyway, they threw inside the caller's
-- transaction and rolled the whole act back.
--
-- The audit row keeps recording that a reason exists. The reason itself lives
-- here, written in the same transaction as the act, so a rolled-back act cannot
-- leave an orphaned justification behind.
CREATE TABLE "AdministrativeReason" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdministrativeReason_pkey" PRIMARY KEY ("id")
);

-- "Why did this happen to this account/case", which is how it is read.
CREATE INDEX "AdministrativeReason_entityId_recordedAt_idx"
    ON "AdministrativeReason"("entityId", "recordedAt");

-- "Every suspension and why", for a governance review.
CREATE INDEX "AdministrativeReason_action_recordedAt_idx"
    ON "AdministrativeReason"("action", "recordedAt");
