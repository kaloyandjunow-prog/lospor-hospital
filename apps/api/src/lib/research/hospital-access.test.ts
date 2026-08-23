import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { findInstitutions, findGrants } = vi.hoisted(() => ({
  findInstitutions: vi.fn(),
  findGrants: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    institution: { findMany: findInstitutions },
    researchAccessGrant: { findMany: findGrants },
  },
}))

import {
  canShareInstitution,
  resolveResearchContext,
  researchContextForAction,
} from "./access"

const user = {
  id: "user-1",
  role: "MEMBER",
  institutionId: "inst-1",
  institutionName: "Hospital A",
  firstName: "Test",
  lastName: "User",
  title: null,
  jti: null,
}

function grant(overrides: Record<string, unknown> = {}) {
  return {
    id: "grant-1",
    institutionId: "inst-1",
    institution: { id: "inst-1", name: "Hospital A" },
    allInstitutions: false,
    canQuery: false,
    canInspectCases: false,
    canExport: false,
    canExportCsv: false,
    canExportJson: false,
    canExportOmop: false,
    canShare: false,
    ...overrides,
  }
}

describe("Hospital granular research access", () => {
  beforeEach(() => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    vi.clearAllMocks()
    findInstitutions.mockResolvedValue([
      { id: "inst-1", name: "Hospital A" },
      { id: "inst-2", name: "Hospital B" },
    ])
    findGrants.mockResolvedValue([])
  })

  afterEach(() => {
    delete process.env.LOSPOR_DEPLOYMENT_MODE
  })

  it("keeps admin implicit access aggregate-only when no grant exists", async () => {
    const context = await resolveResearchContext({ ...user, role: "ADMIN" })
    expect(context).toMatchObject({
      scopeKind: "ALL",
      permissions: {
        query: true,
        inspectCases: false,
        export: false,
        exportOmop: false,
        shareInstitutionCohorts: false,
        manageAccess: false,
      },
    })
    expect(context?.actionScopes.inspectCases.institutionIds).toEqual([])
  })

  it("merges a narrow explicit grant into admin access without widening it", async () => {
    findGrants.mockResolvedValue([grant({
      canInspectCases: true,
      canExport: true,
      canExportCsv: true,
      canShare: true,
    })])
    const context = await resolveResearchContext({ ...user, role: "ADMIN" })
    expect(context?.actionScopes.query.allInstitutions).toBe(true)
    expect(researchContextForAction(context!, "inspectCases").institutionIds).toEqual(["inst-1"])
    expect(researchContextForAction(context!, "export").institutionIds).toEqual(["inst-1"])
    expect(canShareInstitution(context!, "inst-1")).toBe(true)
    expect(canShareInstitution(context!, "inst-2")).toBe(false)
  })

  it("lets a clinical member receive inspect access without silently adding query/export", async () => {
    findGrants.mockResolvedValue([grant({ canInspectCases: true })])
    const context = await resolveResearchContext(user)
    expect(context?.permissions).toMatchObject({
      query: false,
      inspectCases: true,
      export: false,
      exportOmop: false,
    })
    expect(context?.actionScopes.query.institutionIds).toEqual([])
    expect(context?.actionScopes.inspectCases.institutionIds).toEqual(["inst-1"])
  })

  it("gives a HOD no implicit Hospital research access but accepts an explicit grant", async () => {
    await expect(resolveResearchContext({ ...user, role: "HEAD_OF_DEPT" })).resolves.toBeNull()
    findGrants.mockResolvedValue([grant({ canQuery: true })])
    const context = await resolveResearchContext({ ...user, role: "HEAD_OF_DEPT" })
    expect(context?.permissions.query).toBe(true)
    expect(context?.institutionIds).toEqual(["inst-1"])
  })

  it("requires the format-specific export bit in addition to OMOP", async () => {
    findGrants.mockResolvedValue([grant({ canExportOmop: true, canExportJson: true, canExport: true })])
    const context = await resolveResearchContext({ ...user, role: "RESEARCHER" })
    expect(context?.permissions.export).toBe(true)
    expect(context?.permissions.exportOmop).toBe(true)
    expect(context?.actionScopes.exportOmop.institutionIds).toEqual(["inst-1"])
  })
})
