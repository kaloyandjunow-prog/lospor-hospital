import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  findMany: vi.fn(),
}))

vi.mock("@/lib/mobile-auth", () => ({ getAuthUser: mocks.getAuthUser }))
vi.mock("@/lib/hospital/deployment", () => ({ isHospitalDeployment: () => true }))
vi.mock("@/lib/prisma", () => ({
  prisma: { centralDeliveryBatch: { findMany: mocks.findMany } },
}))

describe("Hospital Central delivery history", () => {
  let route: typeof import("./route")

  beforeEach(async () => {
    vi.clearAllMocks()
    mocks.findMany.mockResolvedValue([])
    route = await import("./route")
  })

  it("is appliance-wide infrastructure visible only to an administrator", async () => {
    mocks.getAuthUser.mockResolvedValue({
      id: "hod-1", role: "HEAD_OF_DEPT", institutionId: "inst-1",
    })
    expect((await route.GET(new Request("http://api.test/v1/hospital/deliveries"))).status)
      .toBe(403)
    expect(mocks.findMany).not.toHaveBeenCalled()

    mocks.getAuthUser.mockResolvedValue({ id: "admin-1", role: "ADMIN", institutionId: null })
    const response = await route.GET(new Request("http://api.test/v1/hospital/deliveries"))
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(await response.json()).toEqual([])
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.not.objectContaining({ errorMessage: true }),
    }))
  })

  it("keeps the old clinical-session delivery trigger absent", async () => {
    const response = await route.POST(new Request("http://api.test/v1/hospital/deliveries", {
      method: "POST",
    }))
    expect(response.status).toBe(404)
    expect(response.headers.get("cache-control")).toContain("no-store")
  })
})
