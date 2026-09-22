-- CreateTable
CREATE TABLE "HospitalEhrMedicationCodeMap" (
    "id" TEXT NOT NULL,
    "system" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "reportedLabel" TEXT,
    "drugId" TEXT,
    "mappedAt" TIMESTAMP(3),
    "mappedById" TEXT,
    "seenCount" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalEhrMedicationCodeMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HospitalEhrMedicationCodeMap_system_code_key"
    ON "HospitalEhrMedicationCodeMap"("system", "code");

-- CreateIndex
CREATE INDEX "HospitalEhrMedicationCodeMap_drugId_idx"
    ON "HospitalEhrMedicationCodeMap"("drugId");

-- CreateIndex
CREATE INDEX "HospitalEhrMedicationCodeMap_lastSeenAt_idx"
    ON "HospitalEhrMedicationCodeMap"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "HospitalEhrMedicationCodeMap"
    ADD CONSTRAINT "HospitalEhrMedicationCodeMap_drugId_fkey"
    FOREIGN KEY ("drugId") REFERENCES "Drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalEhrMedicationCodeMap"
    ADD CONSTRAINT "HospitalEhrMedicationCodeMap_mappedById_fkey"
    FOREIGN KEY ("mappedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
