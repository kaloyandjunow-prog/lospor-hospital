import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const mocks = vi.hoisted(() => ({
  pull: vi.fn(async (_client: unknown, _input: unknown) => ({ ok: false, reason: "nothing-importable" })),
}))
vi.mock("@/lib/mobile-auth", () => ({ getAuthUser: async () => ({ id: "user-1", institutionId: "inst-1" }) }))
vi.mock("@/lib/prisma", () => ({
  prisma: { case: { findFirst: async () => ({ id: "case-1", institutionId: "inst-1", clinicalMode: "ADULT", preop: {} }) } },
}))
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }))
vi.mock("@/lib/hospital/ehr-import", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/hospital/ehr-import")>(),
  findPendingEhrImport: async () => null,
}))
vi.mock("@/lib/hospital/ehr-transport-policy", () => ({
  ehrTransportAccess: async () => ({ enabled: true, transport: "FHIR", endpoint: "http://ehr", credential: "c" }),
}))
vi.mock("@/lib/hospital/ehr-folder-requests", () => ({ folderRequestFor: async () => null }))
vi.mock("@/lib/hospital/ehr-fhir-pull", () => ({ pullFhirImport: mocks.pull }))
vi.mock("@/lib/hospital/ehr-fhir-auth", () => ({
  ehrAuthConfigFor: () => ({}),
  forgetEhrAccessToken: vi.fn(),
  resolveEhrAccessToken: async () => ({ ok: true, token: "t" }),
}))

import { GET } from "./route"

const ask = (query: string) => GET(
  new NextRequest(`http://api/v1/cases/case-1/ehr-import?identifier=71001&identifierType=IZ${query}`),
  { params: Promise.resolve({ id: "case-1" }) },
)

// Found on the appliance (2026-11-14): after everything from the hospital
// system was accepted, deleting a value and pressing "Ask again" never brought
// it back -- the case's reviewed copy was returned, and it offers nothing.
describe("asking the hospital system again for a case", () => {
  beforeEach(() => mocks.pull.mockClear())

  it("stages a fresh copy when the clinician asks again", async () => {
    await ask("&again=1")
    expect(mocks.pull).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      restageFor: "case-1",
      reuseOnlyWhilePending: true,
    }))
  })

  it("keeps the case's own copy on the automatic ask", async () => {
    await ask("")
    expect(mocks.pull).toHaveBeenCalledWith(expect.anything(), expect.not.objectContaining({ reuseOnlyWhilePending: true }))
  })
})
