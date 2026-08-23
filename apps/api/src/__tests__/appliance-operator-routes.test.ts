import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  installationFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  userDelete: vi.fn(),
}))

vi.mock("@/lib/mobile-auth", () => ({
  AUTH_COOKIE_NAME: "lospor-auth",
  getAuthUser: mocks.getAuthUser,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    hospitalInstallation: { findFirst: mocks.installationFindFirst },
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
      delete: mocks.userDelete,
    },
  },
}))

vi.mock("@/lib/password-epoch", () => ({
  invalidateAccountState: vi.fn(),
  notePasswordChanged: vi.fn(),
}))
vi.mock("@/lib/token-blocklist", () => ({ revokeToken: vi.fn() }))
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }))

describe("appliance operator route protections", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    mocks.getAuthUser.mockResolvedValue({
      id: "admin-actor",
      role: "ADMIN",
      institutionId: "institution-1",
    })
    mocks.installationFindFirst.mockResolvedValue({ id: "local" })
  })

  it("blocks demotion through ordinary admin user management", async () => {
    const { PATCH } = await import("@/app/v1/admin/users/[id]/route")
    const request = new NextRequest("http://api/v1/admin/users/operator-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "MEMBER" }),
    })
    const response = await PATCH(request, {
      params: Promise.resolve({ id: "operator-1" }),
    })
    // 404, not the 409 APPLIANCE_OPERATOR_MANAGED this expected before.
    //
    // Role supervision left the clinical application entirely: Status changes a
    // role through PATCH /v1/internal/hospital/accounts/:id/role, behind the
    // private account-control bearer. So the route no longer refuses this
    // demotion for the operator specifically -- it refuses every demotion for
    // everyone, which is the stronger guarantee and the one worth asserting.
    expect(response.status).toBe(404)
    expect(mocks.userUpdate).not.toHaveBeenCalled()
  })

  it("demotes nobody at all through the tombstoned route", async () => {
    const { PATCH } = await import("@/app/v1/admin/users/[id]/route")
    const response = await PATCH(
      new NextRequest("http://api/v1/admin/users/clinician-9", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "MEMBER" }),
      }),
      { params: Promise.resolve({ id: "clinician-9" }) },
    )
    expect(response.status).toBe(404)
    expect(mocks.userUpdate).not.toHaveBeenCalled()
  })

  it("blocks hard deletion through ordinary admin user management", async () => {
    const { DELETE } = await import("@/app/v1/admin/users/[id]/route")
    const response = await DELETE(
      new NextRequest("http://api/v1/admin/users/operator-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "operator-1" }) },
    )
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: "APPLIANCE_OPERATOR_MANAGED" })
    expect(mocks.userDelete).not.toHaveBeenCalled()
  })

  it("blocks operator self-deletion", async () => {
    mocks.getAuthUser.mockResolvedValue({ id: "operator-1", role: "ADMIN" })
    const { POST } = await import("@/app/v1/user/delete/route")
    const response = await POST(new NextRequest("http://api/v1/user/delete", {
      method: "POST",
    }))
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: "APPLIANCE_OPERATOR_MANAGED" })
    expect(mocks.userUpdate).not.toHaveBeenCalled()
  })
})
