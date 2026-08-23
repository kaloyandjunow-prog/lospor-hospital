import { beforeEach, describe, expect, it, vi } from "vitest"

// Appliance overlay. This route additionally refuses to touch the designated
// appliance operator, and that guard reaches modules importing `server-only`
// which the upstream route never pulls in. The guard has its own tests; these
// are about the deletion becoming a soft delete.
vi.mock("server-only", () => ({}))
vi.mock("@/lib/hospital/appliance-operator", () => ({
  APPLIANCE_OPERATOR_MANAGED_MESSAGE: "This account is managed by the appliance",
  isDesignatedApplianceOperator: vi.fn(async () => false),
}))
vi.mock("@/lib/hospital/appliance-operator-guard", () => ({
  applianceOperatorBlocksMutation: vi.fn(() => false),
}))

const getAuthUser = vi.fn()
const userUpdate = vi.fn()
const userDelete = vi.fn()
const userFindUnique = vi.fn()
const logAuditInTransaction = vi.fn()
const notePasswordChanged = vi.fn()
const invalidateAccountState = vi.fn()

vi.mock("@/lib/mobile-auth", () => ({ getAuthUser }))
vi.mock("@/lib/audit", () => ({ logAuditInTransaction }))
vi.mock("@/lib/password-epoch", () => ({ notePasswordChanged, invalidateAccountState }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { update: userUpdate, delete: userDelete, findUnique: userFindUnique },
    $transaction: (run: (tx: unknown) => unknown) =>
      run({ user: { update: userUpdate, findUnique: userFindUnique }, auditLog: { create: vi.fn() } }),
  },
}))

const context = { params: Promise.resolve({ id: "target-1" }) }
const deleteRequest = () =>
  new Request("http://localhost/v1/admin/users/target-1", { method: "DELETE" }) as never
const patchRequest = (role: "MEMBER" | "HEAD_OF_DEPT") =>
  new Request("http://localhost/v1/admin/users/target-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role }),
  }) as never

describe("deleting an account as an administrator", () => {
  let DELETE: typeof import("./route").DELETE

  beforeEach(async () => {
    vi.clearAllMocks()
    getAuthUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" })
    userFindUnique.mockResolvedValue({ id: "target-1", role: "HEAD_OF_DEPT", institutionId: "inst-1" })
    userUpdate.mockResolvedValue({ id: "target-1", deletedAt: new Date("2026-08-18T12:00:00Z") })
    ;({ DELETE } = await import("./route"))
  })

  it("marks the account deleted rather than removing the row", async () => {
    // It was prisma.user.delete(). Case.user declares no onDelete, so Prisma
    // defaults to Restrict and deleting any clinician holding a case raised a
    // foreign-key error with no try/catch around it -- an unhandled 500. The
    // endpoint worked only for accounts with no clinical record.
    const response = await DELETE(deleteRequest(), context)
    expect(response.status).toBe(200)
    expect(userDelete).not.toHaveBeenCalled()
    expect(userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "target-1" },
      data: expect.objectContaining({ deletedAt: expect.any(Date) }),
    }))
  })

  it("revokes every existing session, not just the open one", async () => {
    // Without the epoch bump a deleted account keeps full API access from any
    // other signed-in device until its token expires.
    await DELETE(deleteRequest(), context)
    const { data } = userUpdate.mock.calls[0][0]
    expect(data.passwordChangedAt).toBeInstanceOf(Date)
    expect(data.passwordChangedAt).toEqual(data.deletedAt)
    expect(notePasswordChanged).toHaveBeenCalledWith("target-1", expect.any(Date))
    expect(invalidateAccountState).toHaveBeenCalledWith("target-1")
  })

  it("records who did it, in the same transaction", async () => {
    await DELETE(deleteRequest(), context)
    expect(logAuditInTransaction).toHaveBeenCalledWith(
      expect.anything(), "admin-1", "ADMIN_ACCOUNT_DELETE", "target-1",
      expect.objectContaining({ retentionDays: expect.any(Number) }),
    )
  })

  it("refuses a non-administrator", async () => {
    getAuthUser.mockResolvedValue({ id: "user-1", role: "MEMBER" })
    const response = await DELETE(deleteRequest(), context)
    expect(response.status).toBe(403)
    expect(userUpdate).not.toHaveBeenCalled()
  })

  it("refuses to delete the caller's own account", async () => {
    getAuthUser.mockResolvedValue({ id: "target-1", role: "ADMIN" })
    const response = await DELETE(deleteRequest(), context)
    expect(response.status).toBe(400)
    expect(userUpdate).not.toHaveBeenCalled()
  })
})

describe("the retired clinical-app authority mutation", () => {
  let PATCH: typeof import("./route").PATCH

  beforeEach(async () => {
    vi.clearAllMocks()
    getAuthUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" })
    userFindUnique.mockResolvedValue({ id: "target-1", role: "HEAD_OF_DEPT", institutionId: "inst-1" })
    userUpdate.mockResolvedValue({ id: "target-1", role: "MEMBER" })
    ;({ PATCH } = await import("./route"))
  })

  it("is unexposed even to a clinical administrator", async () => {
    const response = await PATCH(patchRequest("MEMBER"), context)
    expect(response.status).toBe(404)
    expect(userUpdate).not.toHaveBeenCalled()
    expect(logAuditInTransaction).not.toHaveBeenCalled()
  })
})
