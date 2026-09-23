import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireRole: vi.fn(),
  ensureInitial: vi.fn(),
  active: vi.fn(),
  publish: vi.fn(),
  serialize: vi.fn(),
}))

vi.mock("@/lib/mobile-auth", () => ({ getAuthUser: mocks.auth }))
vi.mock("@/lib/access-control", () => ({ requireRole: mocks.requireRole }))
vi.mock("@/lib/preop/service", () => ({
  activePreopProfile: mocks.active,
  ensureInitialPreopProfile: mocks.ensureInitial,
  publishPreopProfile: mocks.publish,
  serializePreopProfile: mocks.serialize,
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (run: (tx: unknown) => unknown) => run({}),
  },
}))

describe("preoperative profile administration boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ id: "user-1", role: "ADMIN" })
    mocks.requireRole.mockReturnValue(true)
    mocks.active.mockResolvedValue({ id: "profile-1", version: 1 })
    mocks.serialize.mockImplementation((value: unknown) => value)
    mocks.publish.mockResolvedValue({ id: "profile-2", version: 2 })
  })

  it("requires authentication for profile reads", async () => {
    mocks.auth.mockResolvedValue(null)
    const { GET } = await import("./route")
    const response = await GET(new NextRequest("https://api.lospor.org/v1/preop/profile"))
    expect(response.status).toBe(401)
    expect(mocks.ensureInitial).not.toHaveBeenCalled()
  })

  it("allows only administrators to publish a profile", async () => {
    mocks.requireRole.mockReturnValue(false)
    const { POST } = await import("./route")
    const response = await POST(new NextRequest("https://api.lospor.org/v1/preop/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questions: [] }),
    }))
    expect(response.status).toBe(403)
    expect(mocks.publish).not.toHaveBeenCalled()
  })

  it("publishes the validated profile through the transaction boundary", async () => {
    const { POST } = await import("./route")
    const response = await POST(new NextRequest("https://api.lospor.org/v1/preop/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questions: [{ stableKey: "BASE_ALLERGIES", enabled: true, required: false, sortOrder: 0 }] }),
    }))
    expect(response.status).toBe(201)
    expect(mocks.publish).toHaveBeenCalledWith(expect.anything(), "user-1", [
      { stableKey: "BASE_ALLERGIES", enabled: true, required: false, sortOrder: 0 },
    ])
    expect(mocks.serialize).toHaveBeenCalledWith({ id: "profile-2", version: 2 })
  })

  it("rejects malformed profile definitions before publishing", async () => {
    const { POST } = await import("./route")
    const response = await POST(new NextRequest("https://api.lospor.org/v1/preop/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questions: [{ stableKey: "BASE_ALLERGIES", enabled: "yes" }] }),
    }))
    expect(response.status).toBe(400)
    expect(mocks.publish).not.toHaveBeenCalled()
  })
})
