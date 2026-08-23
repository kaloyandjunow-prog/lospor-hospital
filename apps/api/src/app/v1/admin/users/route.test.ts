import { beforeEach, describe, expect, it, vi } from "vitest"

const getAuthUser = vi.fn()
const findMany = vi.fn()

vi.mock("@/lib/mobile-auth", () => ({ getAuthUser }))
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findMany } } }))

describe("Hospital administrator account directory", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAuthUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" })
    findMany.mockResolvedValue([])
  })

  it("returns username and optional contact email in the read projection", async () => {
    const { GET } = await import("./route")
    const response = await GET({
      nextUrl: new URL("http://localhost/v1/admin/users"),
    } as never)
    expect(response.status).toBe(200)
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        username: true,
        email: true,
        activatedAt: true,
        accountKind: true,
      }),
    }))
  })

  it("retires password-selected creation and cannot mint another administrator", async () => {
    const { POST } = await import("./route")
    const response = await POST(new Request("http://localhost/v1/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "Another.Admin",
        password: "ChosenByAdmin1!",
        role: "ADMIN",
      }),
    }) as never)
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({
      code: "STATUS_ACCOUNT_PROVISIONING_REQUIRED",
    })
  })

  it("still refuses non-administrators before describing provisioning", async () => {
    getAuthUser.mockResolvedValue({ id: "member-1", role: "MEMBER" })
    const { POST } = await import("./route")
    const response = await POST(new Request("http://localhost/v1/admin/users", {
      method: "POST",
    }) as never)
    expect(response.status).toBe(403)
  })
})
