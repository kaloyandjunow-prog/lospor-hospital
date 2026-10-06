import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const mocks = vi.hoisted(() => ({
  pending: vi.fn(async () => null),
  access: vi.fn(async () => ({ enabled: true, transport: "FOLDER", folderRequests: true })),
  request: vi.fn(async (_input: unknown): Promise<{ requestId: string } | null> => null),
  pull: vi.fn(async (_client: unknown, _input: unknown) => ({ ok: true, importId: "imp-1", created: true, fieldCount: 1, unread: [] })),
}))
vi.mock("@/lib/mobile-auth", () => ({ getAuthUser: async () => ({ id: "user-1", institutionId: "inst-1" }) }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }))
vi.mock("@/lib/hospital/ehr-import", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/hospital/ehr-import")>(),
  findPendingEhrImport: mocks.pending,
}))
vi.mock("@/lib/hospital/ehr-transport-policy", () => ({ ehrTransportAccess: mocks.access }))
vi.mock("@/lib/hospital/ehr-folder-requests", () => ({ folderRequestFor: mocks.request }))
vi.mock("@/lib/hospital/ehr-fhir-pull", () => ({ pullFhirImport: mocks.pull }))
vi.mock("@/lib/hospital/ehr-fhir-auth", () => ({
  ehrAuthConfigFor: () => ({}),
  resolveEhrAccessToken: async () => ({ ok: true, token: "t" }),
}))

import { GET } from "./route"

const lookup = async (query: string) => {
  const response = await GET(new NextRequest(`http://api/v1/ehr-import/lookup?identifier=2026-004512&identifierType=IZ${query}`))
  return { status: response.status, body: await response.json() }
}

// Asking the hospital system over the watched folder (1.5.0), as the lookup answers it.
describe("a lookup on a watched-folder site that asks", () => {
  beforeEach(() => { mocks.request.mockReset() })

  it("asks on the clinician's lookup and says so, never that the hospital holds nothing", async () => {
    mocks.request.mockResolvedValueOnce({ requestId: "a".repeat(32) })
    expect(await lookup("&request=1")).toEqual({ status: 200, body: { pending: false, requested: true, requestId: "a".repeat(32) } })
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ identifier: "2026-004512", identifierType: "IZ", request: true }))
  })

  it("passes a repeat check through without asking", async () => {
    await lookup(`&requestId=${"b".repeat(32)}`)
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ request: false, requestId: "b".repeat(32) }))
  })

  it("answers nothing when nothing was asked or the hospital answered", async () => {
    expect(await lookup("")).toEqual({ status: 200, body: { pending: false } })
  })

  it("reports a request that could not be written as a failure", async () => {
    mocks.request.mockRejectedValueOnce(new Error("disk full"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await lookup("&request=1")).toEqual({ status: 502, body: { pending: false, code: "EHR_REQUEST_FAILED" } })
  })
})

// Found on the appliance in 1.5.0: a clinician who had imported a patient onto
// one case was told on the next case that the hospital held nothing.
describe("a lookup on a FHIR site", () => {
  it("asks for a fresh copy once a case has taken the clinician's last one", async () => {
    mocks.access.mockResolvedValueOnce({ enabled: true, transport: "FHIR", endpoint: "http://ehr", credential: "c" } as never)
    await lookup("")
    expect(mocks.pull).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      restageFor: "user:user-1",
      reuseOnlyWhilePending: true,
    }))
  })
})
