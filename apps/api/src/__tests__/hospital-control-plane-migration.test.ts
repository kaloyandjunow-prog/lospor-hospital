import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const migration = readFileSync(join(
  process.cwd(),
  "prisma/migrations/20260822180000_hospital_research_central_guidance/migration.sql",
), "utf8")

describe("Hospital research, Central and guidance migration", () => {
  it("makes grant scope and all six permissions explicit and immutable", () => {
    for (const field of [
      "canQuery",
      "canInspectCases",
      "canExportCsv",
      "canExportJson",
      "canExportOmop",
      "canShare",
    ]) expect(migration).toContain(`"${field}"`)
    expect(migration).toContain("ResearchAccessGrant_scope_check")
    expect(migration).toContain("ResearchAccessGrant_omop_export_check")
    expect(migration).toContain("ResearchAccessGrant_share_query_check")
    expect(migration).toContain("HOSPITAL_RESEARCH_GRANT_IMMUTABLE")
    expect(migration).toContain("INTERVAL '365 days'")
  })

  it("accepts active research-only principals and the three legal clinical roles", () => {
    expect(migration).toContain("target_kind = 'RESEARCH_ONLY'")
    expect(migration).toContain("target_kind = 'CLINICAL'")
    expect(migration).toContain("'MEMBER'::\"UserRole\"")
    expect(migration).toContain("'HEAD_OF_DEPT'::\"UserRole\"")
    expect(migration).toContain("'ADMIN'::\"UserRole\"")
    expect(migration).toContain('"deletedAt" IS NULL AND "emailVerifiedAt" IS NOT NULL')
  })

  it("binds immutable OMOP approval to the exact export, grant, requester, purpose, format, hashes and count", () => {
    expect(migration).toContain('record.id IS NULL')
    expect(migration).toContain('record."researchGrantId" <> NEW."grantId"')
    expect(migration).toContain('record."ownerId" <> NEW."requesterId"')
    for (const field of ["purpose", "format", "definitionHash", "snapshotHash", "snapshotCaseCount"]) {
      expect(migration).toContain(`record."${field}" <> NEW."${field}"`)
    }
    expect(migration).toContain("ResearchOmopApproval_requesterId_fkey")
    expect(migration).toContain("HOSPITAL_OMOP_APPROVAL_DATASET_MISMATCH")
    expect(migration).toContain("HOSPITAL_OMOP_APPROVAL_PERMISSION_MISMATCH")
    expect(migration).toContain("HOSPITAL_OMOP_APPROVAL_SCOPE_MISMATCH")
    expect(migration).toContain("HOSPITAL_OMOP_APPROVAL_IMMUTABLE")
  })

  it("stores Central transport evidence and prospective guidance as separate durable policy", () => {
    expect(migration).toContain('ADD COLUMN "transportConfigurationHash"')
    expect(migration).toContain("HospitalInstallation_transportConfiguredById_fkey")
    expect(migration).toContain("HospitalInstallation_transport_lock_check")
    expect(migration).toContain('CREATE TABLE "ClinicalGuidancePolicy"')
    expect(migration).toContain('"adultEnabled" BOOLEAN NOT NULL DEFAULT true')
    expect(migration).toContain('"pediatricEnabled" BOOLEAN NOT NULL DEFAULT true')
    expect(migration).toContain("ClinicalGuidancePolicy_singleton_check")
  })
})
