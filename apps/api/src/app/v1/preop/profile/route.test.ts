import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  ensure: vi.fn(),
  serialize: vi.fn(),
}))

vi.mock("@/lib/mobile-auth", () => ({ getAuthUser: mocks.auth }))
vi.mock("@/lib/preop/service", () => ({
  ensurePreopProfile: mocks.ensure,
  serializePreopProfile: mocks.serialize,
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (run: (tx: unknown) => unknown) => run({}),
  },
}))

const request = () => new NextRequest("https://api.lospor.org/v1/preop/profile")

describe("preoperative profile read boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ id: "user-1", role: "MEMBER" })
    mocks.ensure.mockResolvedValue({ id: "profile-1" })
    mocks.serialize.mockImplementation((value: unknown) => ({ serialized: value }))
  })

  it("requires authentication", async () => {
    mocks.auth.mockResolvedValue(null)
    const { GET } = await import("./route")
    const response = await GET(request())
    expect(response.status).toBe(401)
    expect(mocks.ensure).not.toHaveBeenCalled()
  })

  it("returns the one appliance profile to any signed-in clinician", async () => {
    const { GET } = await import("./route")
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(mocks.ensure).toHaveBeenCalledWith(expect.anything(), "user-1")
    await expect(response.json()).resolves.toEqual({ serialized: { id: "profile-1" } })
  })

  it("offers no write: operators change the profile from Status", async () => {
    const route = await import("./route")
    expect("POST" in route).toBe(false)
    expect("PUT" in route).toBe(false)
    expect("PATCH" in route).toBe(false)
  })

  it("reports an unavailable profile as a server fault", async () => {
    mocks.ensure.mockRejectedValue(new Error("database down"))
    const { GET } = await import("./route")
    const response = await GET(request())
    expect(response.status).toBe(500)
  })
})
