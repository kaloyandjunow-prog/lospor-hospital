import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { issueHospitalResearchGrant, statusResearchGrantSchema } from "./research-control"

const base = {
  userId: "user-1",
  institutionId: "inst-1",
  allInstitutions: false,
  purpose: "Approved protocol 42",
}

describe("Status research-grant contract", () => {
  it("commits purpose evidence without copying free text into the audit trail", async () => {
    const expiresAt = new Date("2026-08-24T00:00:00.000Z")
    const grant = {
      id: "grant-1",
      userId: base.userId,
      institutionId: base.institutionId,
      allInstitutions: false,
      canQuery: true,
      canInspectCases: false,
      canExportCsv: false,
      canExportJson: false,
      canExportOmop: false,
      canShare: false,
      purpose: base.purpose,
      expiresAt,
    }
    const tx = {
      hospitalInstallation: {
        findUnique: vi.fn().mockResolvedValue({
          applianceOperator: {
            id: "operator-1",
            role: "ADMIN",
            deletedAt: null,
            emailVerifiedAt: new Date("2026-08-20T00:00:00.000Z"),
          },
        }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: base.userId,
          role: "HEAD_OF_DEPT",
          accountKind: "CLINICAL",
          deletedAt: null,
          emailVerifiedAt: new Date("2026-08-20T00:00:00.000Z"),
        }),
      },
      institution: { findUnique: vi.fn().mockResolvedValue({ id: base.institutionId }) },
      researchAccessGrant: { create: vi.fn().mockResolvedValue(grant) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    const prisma = { $transaction: vi.fn(async callback => callback(tx)) }

    await issueHospitalResearchGrant(
      prisma as never,
      statusResearchGrantSchema.parse(base),
    )

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        detail: expect.objectContaining({ purposeRecorded: true }),
      }),
    })
    const detail = tx.auditLog.create.mock.calls[0]?.[0]?.data.detail
    expect(detail).not.toHaveProperty("purpose")
    expect(JSON.stringify(detail)).not.toContain(base.purpose)
  })

  it("defaults to query-only for 90 days and caps validity at 365 days", () => {
    expect(statusResearchGrantSchema.parse(base)).toMatchObject({
      expiryDays: 90,
      canQuery: true,
      canInspectCases: false,
      canExportCsv: false,
      canExportJson: false,
      canExportOmop: false,
      canShare: false,
    })
    expect(statusResearchGrantSchema.safeParse({ ...base, expiryDays: 365 }).success).toBe(true)
    expect(statusResearchGrantSchema.safeParse({ ...base, expiryDays: 366 }).success).toBe(false)
  })

  it("requires exactly one institution scope", () => {
    expect(statusResearchGrantSchema.safeParse({ ...base, institutionId: null }).success).toBe(false)
    expect(statusResearchGrantSchema.safeParse({
      ...base,
      allInstitutions: true,
      institutionId: null,
    }).success).toBe(true)
    expect(statusResearchGrantSchema.safeParse({ ...base, allInstitutions: true }).success).toBe(false)
  })

  it("requires OMOP to carry its matching CSV/JSON permission", () => {
    expect(statusResearchGrantSchema.safeParse({
      ...base,
      canExportOmop: true,
    }).success).toBe(false)
    expect(statusResearchGrantSchema.safeParse({
      ...base,
      canExportOmop: true,
      canExportJson: true,
    }).success).toBe(true)
  })

  it("requires query scope before cohort sharing and rejects an empty grant", () => {
    expect(statusResearchGrantSchema.safeParse({
      ...base,
      canQuery: false,
      canShare: true,
    }).success).toBe(false)
    expect(statusResearchGrantSchema.safeParse({
      ...base,
      canQuery: false,
    }).success).toBe(false)
  })
})
