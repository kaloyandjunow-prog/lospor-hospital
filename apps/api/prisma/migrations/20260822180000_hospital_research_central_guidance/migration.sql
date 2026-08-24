-- LOSPOR Hospital 1.2.0 control-plane policy.
-- Status issues immutable, expiring research grants; OMOP needs one exact
-- dataset approval; Central transport and clinical export approval remain
-- separate; dosing guidance is persistent appliance policy.

-- "canQuery" was added by 20260822130000_research_case_pseudonyms, which
-- ships first. That upstream migration also pinned it permanently true via
-- ResearchAccessGrant_permission_dependency_check -- a generic-product
-- assumption that every grant keeps aggregate-query ability forever. Status
-- grants finer-grained access than that: an operator may issue
-- inspect-only or export-only research access with query explicitly off,
-- which the appliance's own ResearchAccessGrant_permission_check below
-- already covers (at least one of six permissions, not query specifically).
-- Drop the inherited constraint rather than carry a column the appliance's
-- own control plane cannot legally set to false.
ALTER TABLE "ResearchAccessGrant"
  DROP CONSTRAINT "ResearchAccessGrant_permission_dependency_check";

ALTER TABLE "ResearchAccessGrant"
  ADD COLUMN "canExportCsv" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canExportJson" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canShare" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'Legacy research access',
  ADD COLUMN "supersededAt" TIMESTAMP(3),
  ADD COLUMN "supersededById" TEXT;

UPDATE "ResearchAccessGrant"
SET "canExportCsv" = "canExport", "canExportJson" = "canExport"
WHERE "canExport" = true;

-- Older screens could persist the OMOP bit without the base export bit even
-- though runtime authorization always required both. Preserve effective access
-- (none) instead of silently widening those inconsistent legacy rows.
UPDATE "ResearchAccessGrant"
SET "canExportOmop" = false
WHERE "canExportOmop" = true AND "canExport" = false;

ALTER TABLE "ResearchAccessGrant"
  ADD CONSTRAINT "ResearchAccessGrant_export_bits_check"
    CHECK ("canExport" = ("canExportCsv" OR "canExportJson")),
  ADD CONSTRAINT "ResearchAccessGrant_omop_export_check"
    CHECK (NOT "canExportOmop" OR ("canExportCsv" OR "canExportJson")),
  ADD CONSTRAINT "ResearchAccessGrant_share_query_check"
    CHECK (NOT "canShare" OR "canQuery"),
  ADD CONSTRAINT "ResearchAccessGrant_scope_check"
    CHECK (("allInstitutions" AND "institutionId" IS NULL)
      OR (NOT "allInstitutions" AND "institutionId" IS NOT NULL)),
  ADD CONSTRAINT "ResearchAccessGrant_permission_check"
    CHECK ("canQuery" OR "canInspectCases" OR "canExportCsv"
      OR "canExportJson" OR "canExportOmop" OR "canShare"),
  ADD CONSTRAINT "ResearchAccessGrant_purpose_check"
    CHECK (length(btrim("purpose")) BETWEEN 3 AND 500),
  ADD CONSTRAINT "ResearchAccessGrant_supersession_check"
    CHECK (("supersededAt" IS NULL AND "supersededById" IS NULL)
      OR ("supersededAt" IS NOT NULL AND "supersededById" IS NOT NULL
        AND "revokedAt" = "supersededAt"));

CREATE INDEX "ResearchAccessGrant_supersededById_idx"
  ON "ResearchAccessGrant"("supersededById");

CREATE OR REPLACE FUNCTION hospital_validate_research_grant_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_kind "AccountKind";
  target_role "UserRole";
  target_active BOOLEAN;
BEGIN
  SELECT "accountKind", role,
    ("deletedAt" IS NULL AND "emailVerifiedAt" IS NOT NULL)
  INTO target_kind, target_role, target_active
  FROM "User" WHERE id = NEW."userId";
  IF target_active IS DISTINCT FROM true OR NOT (
    target_kind = 'RESEARCH_ONLY'::"AccountKind"
    OR (target_kind = 'CLINICAL'::"AccountKind" AND target_role IN (
      'MEMBER'::"UserRole", 'HEAD_OF_DEPT'::"UserRole", 'ADMIN'::"UserRole"
    ))
  ) THEN
    RAISE EXCEPTION 'HOSPITAL_RESEARCH_PRINCIPAL_NOT_ELIGIBLE';
  END IF;
  IF NEW."expiresAt" IS NULL
    OR NEW."expiresAt" <= NEW."createdAt"
    OR NEW."expiresAt" > NEW."createdAt" + INTERVAL '365 days' THEN
    RAISE EXCEPTION 'HOSPITAL_RESEARCH_GRANT_EXPIRY_INVALID';
  END IF;
  IF NEW."revokedAt" IS NOT NULL OR NEW."supersededAt" IS NOT NULL
    OR NEW."supersededById" IS NOT NULL THEN
    RAISE EXCEPTION 'HOSPITAL_RESEARCH_GRANT_MUST_START_ACTIVE';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER hospital_research_grant_insert_guard
BEFORE INSERT ON "ResearchAccessGrant"
FOR EACH ROW EXECUTE FUNCTION hospital_validate_research_grant_insert();

CREATE OR REPLACE FUNCTION hospital_validate_research_grant_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(
    NEW."id", NEW."userId", NEW."institutionId", NEW."allInstitutions",
    NEW."canQuery", NEW."canInspectCases", NEW."canExport", NEW."canExportCsv",
    NEW."canExportJson", NEW."canExportOmop", NEW."canShare", NEW."purpose",
    NEW."grantedById", NEW."expiresAt", NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."id", OLD."userId", OLD."institutionId", OLD."allInstitutions",
    OLD."canQuery", OLD."canInspectCases", OLD."canExport", OLD."canExportCsv",
    OLD."canExportJson", OLD."canExportOmop", OLD."canShare", OLD."purpose",
    OLD."grantedById", OLD."expiresAt", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'HOSPITAL_RESEARCH_GRANT_IMMUTABLE';
  END IF;
  IF OLD."revokedAt" IS NOT NULL AND ROW(
    NEW."revokedAt", NEW."supersededAt", NEW."supersededById"
  ) IS DISTINCT FROM ROW(
    OLD."revokedAt", OLD."supersededAt", OLD."supersededById"
  ) THEN
    RAISE EXCEPTION 'HOSPITAL_RESEARCH_GRANT_TERMINAL';
  END IF;
  IF NEW."revokedAt" IS NULL AND (
    NEW."supersededAt" IS NOT NULL OR NEW."supersededById" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'HOSPITAL_RESEARCH_GRANT_SUPERSESSION_INVALID';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER hospital_research_grant_update_guard
BEFORE UPDATE ON "ResearchAccessGrant"
FOR EACH ROW EXECUTE FUNCTION hospital_validate_research_grant_update();

ALTER TABLE "ResearchExport"
  ADD COLUMN "purpose" TEXT,
  ADD COLUMN "researchGrantId" TEXT;

ALTER TABLE "ResearchExport"
  ADD CONSTRAINT "ResearchExport_researchGrantId_fkey"
  FOREIGN KEY ("researchGrantId") REFERENCES "ResearchAccessGrant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ResearchOmopApproval" (
  "id" TEXT NOT NULL,
  "exportId" TEXT NOT NULL,
  "grantId" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "definitionHash" TEXT NOT NULL,
  "snapshotHash" TEXT NOT NULL,
  "snapshotCaseCount" INTEGER NOT NULL,
  "approvedById" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResearchOmopApproval_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ResearchOmopApproval_format_check"
    CHECK ("format" IN ('omop-csv', 'omop-json')),
  CONSTRAINT "ResearchOmopApproval_hashes_check"
    CHECK ("definitionHash" ~ '^[a-f0-9]{64}$' AND "snapshotHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "ResearchOmopApproval_count_check" CHECK ("snapshotCaseCount" >= 0),
  CONSTRAINT "ResearchOmopApproval_purpose_check"
    CHECK (length(btrim("purpose")) BETWEEN 3 AND 500),
  CONSTRAINT "ResearchOmopApproval_reason_check"
    CHECK (length(btrim("reason")) BETWEEN 10 AND 1000)
);

CREATE UNIQUE INDEX "ResearchOmopApproval_exportId_key"
  ON "ResearchOmopApproval"("exportId");
CREATE INDEX "ResearchOmopApproval_grantId_idx"
  ON "ResearchOmopApproval"("grantId");
CREATE INDEX "ResearchOmopApproval_requesterId_approvedAt_idx"
  ON "ResearchOmopApproval"("requesterId", "approvedAt");

ALTER TABLE "ResearchOmopApproval"
  ADD CONSTRAINT "ResearchOmopApproval_exportId_fkey"
    FOREIGN KEY ("exportId") REFERENCES "ResearchExport"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ResearchOmopApproval_grantId_fkey"
    FOREIGN KEY ("grantId") REFERENCES "ResearchAccessGrant"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ResearchOmopApproval_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ResearchOmopApproval_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION hospital_validate_omop_approval()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  record "ResearchExport"%ROWTYPE;
  access "ResearchAccessGrant"%ROWTYPE;
BEGIN
  SELECT * INTO record FROM "ResearchExport" WHERE id = NEW."exportId" FOR UPDATE;
  SELECT * INTO access FROM "ResearchAccessGrant" WHERE id = NEW."grantId" FOR SHARE;
  IF record.id IS NULL OR access.id IS NULL
    OR record."ownerId" <> NEW."requesterId"
    OR record."researchGrantId" <> NEW."grantId"
    OR record."purpose" <> NEW."purpose"
    OR record."format" <> NEW."format"
    OR record."definitionHash" <> NEW."definitionHash"
    OR record."snapshotHash" <> NEW."snapshotHash"
    OR record."snapshotCaseCount" <> NEW."snapshotCaseCount" THEN
    RAISE EXCEPTION 'HOSPITAL_OMOP_APPROVAL_DATASET_MISMATCH';
  END IF;
  IF record."status" <> 'PENDING'::"ResearchExportStatus"
    OR access."userId" <> NEW."requesterId"
    OR access."revokedAt" IS NOT NULL
    OR access."supersededAt" IS NOT NULL
    OR access."expiresAt" IS NULL
    OR access."expiresAt" <= CURRENT_TIMESTAMP
    OR NOT access."canExportOmop"
    OR (NEW."format" = 'omop-csv' AND NOT access."canExportCsv")
    OR (NEW."format" = 'omop-json' AND NOT access."canExportJson") THEN
    RAISE EXCEPTION 'HOSPITAL_OMOP_APPROVAL_PERMISSION_MISMATCH';
  END IF;
  IF NOT access."allInstitutions" AND (
    cardinality(record."scopeInstitutionIds") <> 1
    OR record."scopeInstitutionIds"[1] IS DISTINCT FROM access."institutionId"
  ) THEN
    RAISE EXCEPTION 'HOSPITAL_OMOP_APPROVAL_SCOPE_MISMATCH';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER hospital_omop_approval_insert_guard
BEFORE INSERT ON "ResearchOmopApproval"
FOR EACH ROW EXECUTE FUNCTION hospital_validate_omop_approval();

CREATE OR REPLACE FUNCTION hospital_immutable_omop_approval()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'HOSPITAL_OMOP_APPROVAL_IMMUTABLE';
END $$;

CREATE TRIGGER hospital_omop_approval_update_guard
BEFORE UPDATE OR DELETE ON "ResearchOmopApproval"
FOR EACH ROW EXECUTE FUNCTION hospital_immutable_omop_approval();

ALTER TABLE "HospitalInstallation"
  ADD COLUMN "transportConfigurationHash" TEXT,
  ADD COLUMN "transportConfiguredAt" TIMESTAMP(3),
  ADD COLUMN "transportConfiguredById" TEXT,
  ADD COLUMN "transportConfigurationReason" TEXT;

ALTER TABLE "HospitalInstallation"
  ADD CONSTRAINT "HospitalInstallation_transportConfiguredById_fkey"
  FOREIGN KEY ("transportConfiguredById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HospitalInstallation"
  ADD CONSTRAINT "HospitalInstallation_transport_lock_check" CHECK (
    ("transportConfigurationHash" IS NULL
      AND "transportConfiguredAt" IS NULL
      AND "transportConfiguredById" IS NULL
      AND "transportConfigurationReason" IS NULL)
    OR
    ("transportConfigurationHash" ~ '^[a-f0-9]{64}$'
      AND "transportConfiguredAt" IS NOT NULL
      AND "transportConfiguredById" IS NOT NULL
      AND length(btrim("transportConfigurationReason")) BETWEEN 10 AND 1000)
  );

CREATE TABLE "ClinicalGuidancePolicy" (
  "id" TEXT NOT NULL DEFAULT 'local',
  "adultEnabled" BOOLEAN NOT NULL DEFAULT true,
  "pediatricEnabled" BOOLEAN NOT NULL DEFAULT true,
  "changedById" TEXT,
  "changeReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClinicalGuidancePolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClinicalGuidancePolicy_singleton_check" CHECK ("id" = 'local'),
  CONSTRAINT "ClinicalGuidancePolicy_reason_check"
    CHECK ("changeReason" IS NULL OR length(btrim("changeReason")) BETWEEN 10 AND 1000)
);

ALTER TABLE "ClinicalGuidancePolicy"
  ADD CONSTRAINT "ClinicalGuidancePolicy_changedById_fkey"
  FOREIGN KEY ("changedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
