-- What a hospital's coding-system addresses mean.
--
-- NHIS publishes no FHIR address for its code lists, so each hospital system
-- invents its own. An address that names the list is recognised without this
-- table; any other is recorded when it arrives and an operator says once, in
-- Status, which list it is. The operator who answered is in the audit log.

CREATE TYPE "HospitalEhrCodeList" AS ENUM ('ICD10', 'KSMP', 'NHIS_CL013', 'NHIS_CL046', 'NHIS_CL024', 'OTHER');

CREATE TABLE "HospitalEhrCodeSystem" (
    "id" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "list" "HospitalEhrCodeList",
    "seenIn" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sampleCode" TEXT,
    "sampleLabel" TEXT,
    "seenCount" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalEhrCodeSystem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HospitalEhrCodeSystem_system_key" ON "HospitalEhrCodeSystem"("system");
CREATE INDEX "HospitalEhrCodeSystem_lastSeenAt_idx" ON "HospitalEhrCodeSystem"("lastSeenAt");
