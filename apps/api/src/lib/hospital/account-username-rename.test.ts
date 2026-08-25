import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const logAuditInTransaction = vi.fn()
const notePasswordChanged = vi.fn()
const invalidateAccountState = vi.fn()
vi.mock("@/lib/audit", () => ({ logAuditInTransaction }))
vi.mock("@/lib/password-epoch", () => ({ notePasswordChanged, invalidateAccountState }))

const NOW = new Date("2026-08-23T12:00:00.000Z")

function harness(options: { reservedBy?: string; designated?: boolean } = {}) {
  const tx = {
    $queryRaw: vi.fn(async () => []),
    user: {
      findUnique: vi.fn(async () => ({
        id: "user-1", username: "Old.Name", usernameCanonical: "old.name",
        activatedAt: new Date(), deletedAt: null,
      })),
      update: vi.fn(async ({ data }: { data: { username: string } }) => ({ id: "user-1", username: data.username })),
    },
    hospitalInstallation: {
      findFirst: vi.fn(async () => options.designated ? { id: "local" } : null),
    },
    hospitalUsernameReservation: {
      findFirst: vi.fn(async () => options.reservedBy
        ? { id: "reservation-1", userId: options.reservedBy }
        : null),
      create: vi.fn(async () => ({ id: "reservation-new" })),
    },
    hospitalAccountAccessToken: {
      updateMany: vi.fn(async () => ({ count: 2 })),
      create: vi.fn(async () => ({ id: "recovery-1" })),
    },
    passwordResetToken: { updateMany: vi.fn(async () => ({ count: 1 })) },
  }
  const prisma = { $transaction: vi.fn(async (run: (client: typeof tx) => unknown) => run(tx)) }
  return { prisma, tx }
}

describe("Status-only Hospital username rename", () => {
  beforeEach(() => vi.clearAllMocks())

  it("claims the new canonical name, revokes sessions/links, and returns fresh recovery", async () => {
    const { renameHospitalUsername } = await import("./account-authority")
    const { prisma, tx } = harness()
    const result = await renameHospitalUsername(prisma as never, "user-1", {
      username: "New.Name-2",
      reason: "Hospital administrator approved the rename",
    }, NOW, () => "fresh-recovery-token")

    expect(result.account).toEqual({ id: "user-1", username: "New.Name-2" })
    expect(result.token).toBe("fresh-recovery-token")
    expect(tx.hospitalUsernameReservation.create).toHaveBeenCalledWith({
      data: { userId: "user-1", usernameCanonical: "new.name-2", createdAt: NOW },
    })
    expect(tx).not.toHaveProperty("case")
    expect(tx.hospitalAccountAccessToken.updateMany).toHaveBeenCalled()
    expect(tx.hospitalAccountAccessToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ purpose: "RECOVERY", tokenHash: expect.any(String) }),
    })
    expect(notePasswordChanged).toHaveBeenCalledWith("user-1", NOW)
    expect(invalidateAccountState).toHaveBeenCalledWith("user-1")
    expect(logAuditInTransaction).toHaveBeenCalledWith(
      tx, "hospital-status-operator", "HOSPITAL_ACCOUNT_USERNAME_CHANGED", "user-1",
      expect.objectContaining({ reasonRecorded: true, recoveryIssued: true }),
    )
  })

  it("allows a case-only spelling change without duplicating its reservation", async () => {
    const { renameHospitalUsername } = await import("./account-authority")
    const { prisma, tx } = harness({ reservedBy: "user-1" })
    await renameHospitalUsername(prisma as never, "user-1", {
      username: "OLD.NAME",
      reason: "Correct capitalization requested by administrator",
    }, NOW, () => "fresh-recovery-token")
    expect(tx.hospitalUsernameReservation.create).not.toHaveBeenCalled()
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ username: "OLD.NAME", usernameCanonical: "old.name" }),
    }))
  })

  it("refuses another account's reserved name", async () => {
    const { renameHospitalUsername } = await import("./account-authority")
    const { prisma, tx } = harness({ reservedBy: "user-2" })
    await expect(renameHospitalUsername(prisma as never, "user-1", {
      username: "Taken.Name",
      reason: "Hospital administrator approved the rename",
    }, NOW)).rejects.toMatchObject({ code: "USERNAME_ALREADY_REGISTERED" })
    expect(tx.user.update).not.toHaveBeenCalled()
  })

  it("protects the designated initial clinical authority", async () => {
    const { renameHospitalUsername } = await import("./account-authority")
    const { prisma, tx } = harness({ designated: true })
    await expect(renameHospitalUsername(prisma as never, "user-1", {
      username: "New.Name",
      reason: "Hospital administrator approved the rename",
    }, NOW)).rejects.toMatchObject({ code: "APPLIANCE_OPERATOR_MANAGED" })
    expect(tx.hospitalUsernameReservation.findFirst).not.toHaveBeenCalled()
  })
})
