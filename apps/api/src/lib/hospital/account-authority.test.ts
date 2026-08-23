import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const logAuditInTransaction = vi.fn()
const notePasswordChanged = vi.fn()
const invalidateAccountState = vi.fn()

vi.mock("@/lib/audit", () => ({ logAuditInTransaction }))
vi.mock("@/lib/password-epoch", () => ({ notePasswordChanged, invalidateAccountState }))

const NOW = new Date("2026-08-23T12:00:00.000Z")
const REASON = "Approved clinical authority change"

function harness(overrides: Record<string, unknown> = {}) {
  const user = {
    id: "user-1",
    role: "MEMBER",
    accountKind: "CLINICAL",
    institutionId: "inst-1",
    activatedAt: new Date("2026-08-20T12:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  }
  const tx = {
    $queryRaw: vi.fn(async () => []),
    user: {
      findUnique: vi.fn(async () => user),
      count: vi.fn(async () => 2),
      update: vi.fn(async ({ data }: { data: { role: string } }) => ({ id: user.id, role: data.role })),
    },
    hospitalInstallation: {
      findFirst: vi.fn(async (): Promise<{ id: string } | null> => null),
    },
    hospitalAccountAccessToken: { updateMany: vi.fn(async () => ({ count: 2 })) },
    passwordResetToken: { updateMany: vi.fn(async () => ({ count: 1 })) },
  }
  const prisma = {
    $transaction: vi.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
  }
  return { prisma, tx }
}

describe("private Status clinical-role policy", () => {
  beforeEach(() => vi.clearAllMocks())

  it("promotes an active clinical Member to Admin and revokes stale authority", async () => {
    const { changeHospitalClinicalRole } = await import("./account-authority")
    const { prisma, tx } = harness()
    const result = await changeHospitalClinicalRole(prisma as never, "user-1", {
      role: "ADMIN",
      reason: REASON,
    }, NOW)

    expect(result).toMatchObject({ account: { id: "user-1", role: "ADMIN" }, changed: true })
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { role: "ADMIN", passwordChangedAt: NOW },
      select: { id: true, role: true },
    })
    expect(tx.hospitalAccountAccessToken.updateMany).toHaveBeenCalled()
    expect(tx.passwordResetToken.updateMany).toHaveBeenCalled()
    expect(notePasswordChanged).toHaveBeenCalledWith("user-1", NOW)
    expect(invalidateAccountState).toHaveBeenCalledWith("user-1")
    expect(logAuditInTransaction).toHaveBeenCalledWith(
      tx,
      "hospital-status-operator",
      "ADMIN_ACCOUNT_AUTHORITY_CHANGE",
      "user-1",
      expect.objectContaining({
        previousRole: "MEMBER",
        role: "ADMIN",
        reasonRecorded: true,
        sessionsRevoked: true,
      }),
    )
  })

  it("requires activation before promotion to Admin", async () => {
    const { changeHospitalClinicalRole } = await import("./account-authority")
    const { prisma, tx } = harness({ activatedAt: null })
    await expect(changeHospitalClinicalRole(prisma as never, "user-1", {
      role: "ADMIN",
      reason: REASON,
    }, NOW)).rejects.toMatchObject({ code: "ACCOUNT_NOT_ACTIVE" })
    expect(tx.user.update).not.toHaveBeenCalled()
  })

  it("refuses to demote the last active clinical Admin", async () => {
    const { changeHospitalClinicalRole } = await import("./account-authority")
    const { prisma, tx } = harness({ role: "ADMIN" })
    tx.user.count.mockResolvedValue(1)
    await expect(changeHospitalClinicalRole(prisma as never, "user-1", {
      role: "MEMBER",
      reason: REASON,
    }, NOW)).rejects.toMatchObject({ code: "LAST_CLINICAL_ADMIN" })
    expect(tx.user.update).not.toHaveBeenCalled()
  })

  it("refuses to demote the designated appliance authority", async () => {
    const { changeHospitalClinicalRole } = await import("./account-authority")
    const { prisma, tx } = harness({ role: "ADMIN" })
    tx.hospitalInstallation.findFirst.mockResolvedValue({ id: "local" })
    await expect(changeHospitalClinicalRole(prisma as never, "user-1", {
      role: "MEMBER",
      reason: REASON,
    }, NOW)).rejects.toMatchObject({ code: "APPLIANCE_OPERATOR_MANAGED" })
    expect(tx.user.count).not.toHaveBeenCalled()
  })

  it("demotes an HOD without reassigning or deleting their cases", async () => {
    const { changeHospitalClinicalRole } = await import("./account-authority")
    const { prisma, tx } = harness({ role: "HEAD_OF_DEPT" })
    await changeHospitalClinicalRole(prisma as never, "user-1", {
      role: "MEMBER",
      reason: REASON,
    }, NOW)
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { role: "MEMBER", passwordChangedAt: NOW } }))
    expect(tx).not.toHaveProperty("case")
  })

  it("never converts a research-only account into clinical authority", async () => {
    const { changeHospitalClinicalRole } = await import("./account-authority")
    const { prisma, tx } = harness({ role: "RESEARCHER", accountKind: "RESEARCH_ONLY" })
    await expect(changeHospitalClinicalRole(prisma as never, "user-1", {
      role: "ADMIN",
      reason: REASON,
    }, NOW)).rejects.toMatchObject({ code: "ACCOUNT_AUTHORITY_PROTECTED" })
    expect(tx.user.update).not.toHaveBeenCalled()
  })
})
