import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))
const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(), findUnique: vi.fn(), update: vi.fn(), invalidate: vi.fn(),
}))
vi.mock("@/lib/mobile-auth", () => ({ getAuthUser: mocks.getAuthUser }))
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUnique, update: mocks.update } },
}))
vi.mock("@/lib/password-epoch", () => ({ invalidateAccountState: mocks.invalidate }))

function request(method: "GET" | "PATCH", body?: unknown) {
  return new NextRequest("http://localhost/v1/user", {
    method,
    ...(body === undefined ? {} : {
      headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }),
  })
}

describe("authenticated account locale profile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAuthUser.mockResolvedValue({ id: "user-1" })
  })

  it("returns Bulgarian when stored preferences have no valid locale", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "user-1", firstName: "Иван", lastName: "Иванов", title: "д-р",
      role: "MEMBER", preferences: {}, institutionId: "inst-1", institution: null,
    })
    const { GET } = await import("./route")
    const response = await GET(request("GET"))
    await expect(response.json()).resolves.toMatchObject({ preferredLocale: "bg" })
  })

  it("persists English without removing unrelated clinical/UI preferences", async () => {
    const current = { theme: "dark", units: { weight: "kg" }, ui: { density: "compact", locale: "bg" } }
    mocks.findUnique.mockResolvedValue({ preferences: current })
    mocks.update.mockImplementation(async ({ data }: { data: { preferences: unknown } }) => ({
      preferences: data.preferences, institution: null,
    }))
    const { PATCH } = await import("./route")
    const response = await PATCH(request("PATCH", { preferences: { ui: { locale: "en" } } }))
    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { preferences: expect.objectContaining({
        theme: "dark",
        units: expect.objectContaining({ weight: "kg" }),
        ui: { density: "compact", locale: "en" },
      }) },
    }))
    expect(mocks.invalidate).toHaveBeenCalledWith("user-1")
    await expect(response.json()).resolves.toMatchObject({ preferredLocale: "en" })
  })

  it("rejects unsupported account languages", async () => {
    const { PATCH } = await import("./route")
    const response = await PATCH(request("PATCH", { preferences: { ui: { locale: "de" } } }))
    expect(response.status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
