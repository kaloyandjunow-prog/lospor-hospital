import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(async () => null),
  change: vi.fn(),
}))

vi.mock("@/lib/hospital/account-control-http", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/hospital/account-control-http")>(),
  authorizeAccountControl: mocks.authorize,
}))
vi.mock("@/lib/hospital/account-authority", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/hospital/account-authority")>(),
  changeHospitalClinicalRole: mocks.change,
}))
vi.mock("@/lib/transactional-email", () => ({ appUrl: () => "https://clinical.test" }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const context = { params: Promise.resolve({ id: "user-1" }) }
function request(body: unknown) {
  return new Request("http://api.test/v1/internal/hospital/accounts/user-1/role", {
    method: "PATCH",
    headers: { authorization: "Bearer private-status-token", "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("private Status account role route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue(null)
    mocks.change.mockResolvedValue({
      account: { id: "user-1", role: "ADMIN" },
      previousRole: "MEMBER",
      changed: true,
      invalidatedLinks: 0,
    })
  })

  it("accepts a reasoned Admin promotion only after private authorization", async () => {
    const { PATCH } = await import("./route")
    const response = await PATCH(request({ role: "ADMIN", reason: "Approved by hospital IT" }), context)
    expect(response.status).toBe(200)
    expect(mocks.authorize).toHaveBeenCalledTimes(1)
    expect(mocks.change).toHaveBeenCalledWith({}, "user-1", {
      role: "ADMIN",
      reason: "Approved by hospital IT",
    })
    expect(response.headers.get("cache-control")).toContain("no-store")
  })

  it("rejects missing reason and direct provisioning-shaped payloads", async () => {
    const { PATCH } = await import("./route")
    const response = await PATCH(request({ role: "ADMIN", password: "ChosenPassword!" }), context)
    expect(response.status).toBe(400)
    expect(mocks.change).not.toHaveBeenCalled()
  })
})
