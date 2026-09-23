-- What a hospital's local vital-sign codes mean.
--
-- Kept separate from the laboratory map because the destination is a scalar
-- PREOP field, not a laboratory test.

CREATE TABLE "HospitalEhrVitalCodeMap" (
    "id" TEXT NOT NULL,
    "system" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "reportedLabel" TEXT,
    "field" TEXT NOT NULL,
    "mappedAt" TIMESTAMP(3),
    "mappedById" TEXT,
    "seenCount" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalEhrVitalCodeMap_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HospitalEhrVitalCodeMap_system_code_key"
    ON "HospitalEhrVitalCodeMap"("system", "code");
CREATE INDEX "HospitalEhrVitalCodeMap_field_idx"
    ON "HospitalEhrVitalCodeMap"("field");
CREATE INDEX "HospitalEhrVitalCodeMap_lastSeenAt_idx"
    ON "HospitalEhrVitalCodeMap"("lastSeenAt");

ALTER TABLE "HospitalEhrVitalCodeMap"
    ADD CONSTRAINT "HospitalEhrVitalCodeMap_mappedById_fkey"
    FOREIGN KEY ("mappedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
