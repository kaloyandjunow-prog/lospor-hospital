import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  hospital: vi.fn(() => true),
  authorize: vi.fn(async () => ({
    response: new Response(JSON.stringify({ code: "UNAUTHORIZED" }), { status: 401 }),
  })),
}))

vi.mock("@/lib/hospital/deployment", () => ({ isHospitalDeployment: mocks.hospital }))
vi.mock("@/lib/research/request", () => ({
  authorizeResearchRequest: mocks.authorize,
  researchRouteError: vi.fn(() => new Response(null, { status: 500 })),
}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/audit", () => ({ logAuditInTransaction: vi.fn() }))

describe("Hospital research-grant route boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hospital.mockReturnValue(true)
  })

  it("removes Browser grant management on Hospital before clinical auth", async () => {
    const collection = await import("@/app/v1/research/grants/route")
    const member = await import("@/app/v1/research/grants/[id]/route")
    const request = new Request("http://api.test/v1/research/grants")
    expect((await collection.GET(request)).status).toBe(404)
    expect((await collection.POST(new Request(request, { method: "POST" }))).status).toBe(404)
    expect((await member.DELETE(
      new Request("http://api.test/v1/research/grants/grant-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "grant-1" }) },
    )).status).toBe(404)
    expect(mocks.authorize).not.toHaveBeenCalled()
  })

  it("leaves the upstream/public-demo route behind its existing authorization", async () => {
    mocks.hospital.mockReturnValue(false)
    const { GET } = await import("@/app/v1/research/grants/route")
    const response = await GET(new Request("http://api.test/v1/research/grants"))
    expect(response.status).toBe(401)
    expect(mocks.authorize).toHaveBeenCalledWith(expect.any(Request), "manageAccess")
  })
})
