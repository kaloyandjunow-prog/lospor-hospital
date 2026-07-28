-- CreateEnum
CREATE TYPE "CentralExportDecision" AS ENUM ('DEFAULT', 'INCLUDE', 'EXCLUDE', 'WITHDRAW_REQUESTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "CentralDeliveryStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'UPLOADING', 'AWAITING_RECEIPT', 'ACCEPTED', 'REJECTED', 'RETRY', 'CANCELLED');

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "patientLinkId" TEXT;

-- CreateTable
CREATE TABLE "PatientLink" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "identifierHash" TEXT NOT NULL,
    "identifierCiphertext" TEXT NOT NULL,
    "identifierNonce" TEXT NOT NULL,
    "identifierAuthTag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "maskedIdentifier" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CentralExportPolicy" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "includeExactTimes" BOOLEAN NOT NULL DEFAULT true,
    "includeRedactedText" BOOLEAN NOT NULL DEFAULT true,
    "redactionProfile" TEXT NOT NULL DEFAULT 'bg-en-v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CentralExportPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseCentralExportControl" (
    "caseId" TEXT NOT NULL,
    "decision" "CentralExportDecision" NOT NULL DEFAULT 'DEFAULT',
    "reasonCode" TEXT,
    "reasonNote" TEXT,
    "decidedById" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseCentralExportControl_pkey" PRIMARY KEY ("caseId")
);

-- CreateTable
CREATE TABLE "HospitalInstallation" (
    "id" TEXT NOT NULL DEFAULT 'local',
    "siteId" TEXT,
    "siteCode" TEXT,
    "institutionId" TEXT,
    "centralBaseUrl" TEXT,
    "centralEnabled" BOOLEAN NOT NULL DEFAULT false,
    "signingKeyId" TEXT,
    "centralEncryptionKeyId" TEXT,
    "centralEncryptionPublicKeyPem" TEXT,
    "receiptSigningKeyId" TEXT,
    "receiptSigningPublicKeyPem" TEXT,
    "supportedManifestVersions" JSONB,
    "maximumUploadBytes" INTEGER,
    "multipartChunkBytes" INTEGER,
    "nextSequence" INTEGER NOT NULL DEFAULT 1,
    "lastAcceptedBatchId" TEXT,
    "enrolledAt" TIMESTAMP(3),
    "lastCapabilitiesAt" TIMESTAMP(3),
    "lastDeliveryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CentralDeliveryBatch" (
    "id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "previousBatchId" TEXT,
    "status" "CentralDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "cutoffFrom" TIMESTAMP(3),
    "cutoffTo" TIMESTAMP(3) NOT NULL,
    "manifest" JSONB,
    "manifestHash" TEXT,
    "plaintextArtifactPath" TEXT,
    "plaintextSha256" TEXT,
    "ciphertextArtifactPath" TEXT,
    "ciphertextSha256" TEXT,
    "ciphertextByteSize" BIGINT,
    "envelope" JSONB,
    "receipt" JSONB,
    "receiptHash" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "policyExcluded" INTEGER NOT NULL DEFAULT 0,
    "caseExcluded" INTEGER NOT NULL DEFAULT 0,
    "qualityRejected" INTEGER NOT NULL DEFAULT 0,
    "withdrawnCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CentralDeliveryBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CentralDeliveryCase" (
    "batchId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "casePseudonym" TEXT NOT NULL,
    "personPseudonym" TEXT NOT NULL,
    "sourcePersonId" TEXT NOT NULL,
    "sourceObservationPeriodId" TEXT NOT NULL,
    "sourceVisitId" TEXT NOT NULL,
    "clinicalRevision" INTEGER NOT NULL,
    "eventRevision" INTEGER NOT NULL,
    "relationalRevision" INTEGER NOT NULL,
    "preopRevision" INTEGER,
    "intraopRevision" INTEGER,
    "postopRevision" INTEGER,
    "finalizedAt" TIMESTAMP(3) NOT NULL,
    "operationStartedAt" TIMESTAMP(3),
    "exclusionReasonCode" TEXT,

    CONSTRAINT "CentralDeliveryCase_pkey" PRIMARY KEY ("batchId","caseId")
);

-- CreateTable
CREATE TABLE "CentralExportCheckpoint" (
    "caseId" TEXT NOT NULL,
    "lastBatchId" TEXT NOT NULL,
    "lastAction" TEXT NOT NULL,
    "clinicalRevision" INTEGER NOT NULL,
    "eventRevision" INTEGER NOT NULL,
    "relationalRevision" INTEGER NOT NULL,
    "preopRevision" INTEGER,
    "intraopRevision" INTEGER,
    "postopRevision" INTEGER,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CentralExportCheckpoint_pkey" PRIMARY KEY ("caseId")
);

-- CreateIndex
CREATE INDEX "PatientLink_institutionId_maskedIdentifier_idx" ON "PatientLink"("institutionId", "maskedIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "PatientLink_institutionId_identifierHash_key" ON "PatientLink"("institutionId", "identifierHash");

-- CreateIndex
CREATE UNIQUE INDEX "CentralExportPolicy_institutionId_key" ON "CentralExportPolicy"("institutionId");

-- CreateIndex
CREATE INDEX "CaseCentralExportControl_decision_updatedAt_idx" ON "CaseCentralExportControl"("decision", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CentralDeliveryBatch_sequence_key" ON "CentralDeliveryBatch"("sequence");

-- CreateIndex
CREATE INDEX "CentralDeliveryBatch_status_nextAttemptAt_idx" ON "CentralDeliveryBatch"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "CentralDeliveryBatch_status_leaseExpiresAt_idx" ON "CentralDeliveryBatch"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "CentralDeliveryCase_caseId_idx" ON "CentralDeliveryCase"("caseId");

-- CreateIndex
CREATE INDEX "CentralDeliveryCase_casePseudonym_idx" ON "CentralDeliveryCase"("casePseudonym");

-- CreateIndex
CREATE INDEX "CentralExportCheckpoint_lastBatchId_idx" ON "CentralExportCheckpoint"("lastBatchId");

-- CreateIndex
CREATE INDEX "Case_patientLinkId_idx" ON "Case"("patientLinkId");

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_patientLinkId_fkey" FOREIGN KEY ("patientLinkId") REFERENCES "PatientLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientLink" ADD CONSTRAINT "PatientLink_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CentralExportPolicy" ADD CONSTRAINT "CentralExportPolicy_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseCentralExportControl" ADD CONSTRAINT "CaseCentralExportControl_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CentralDeliveryCase" ADD CONSTRAINT "CentralDeliveryCase_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CentralDeliveryBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CentralDeliveryCase" ADD CONSTRAINT "CentralDeliveryCase_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CentralExportCheckpoint" ADD CONSTRAINT "CentralExportCheckpoint_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
