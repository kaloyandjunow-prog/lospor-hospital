import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  due: vi.fn(),
  update: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
  rateLimitDelete: vi.fn(),
  reservationUpdateMany: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: mocks.due },
    rateLimit: { deleteMany: mocks.rateLimitDelete },
    $transaction: mocks.transaction,
  },
}))

describe("deleted-account anonymisation audit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.due.mockResolvedValue([{ id: "user-1", email: "doctor@example.test", username: null }])
    mocks.update.mockResolvedValue({ id: "user-1" })
    mocks.auditCreate.mockResolvedValue({})
    mocks.rateLimitDelete.mockResolvedValue({ count: 0 })
    mocks.reservationUpdateMany.mockResolvedValue({ count: 1 })
    mocks.transaction.mockImplementation(async callback => callback({
      user: { update: mocks.update },
      auditLog: { create: mocks.auditCreate },
      hospitalUsernameReservation: { updateMany: mocks.reservationUpdateMany },
    }))
  })

  it("writes anonymisation evidence through the same transaction", async () => {
    const { purgeDeletedAccounts } = await import("./purge-deleted")
    await expect(purgeDeletedAccounts(new Date("2026-08-23T00:00:00.000Z"))).resolves.toMatchObject({
      scanned: 1,
      anonymised: 1,
      userIds: ["user-1"],
    })
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        action: "ACCOUNT_ANONYMISED",
        entityId: "user-1",
        detail: { retentionDays: 30 },
      },
    })
    expect(mocks.due).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ anonymizedAt: null }),
      select: { id: true, email: true, username: true },
    }))
  })

  it("removes Hospital username and optional contact identity without inventing email", async () => {
    mocks.due.mockResolvedValue([{
      id: "hospital-user-1",
      email: null,
      username: "Clinician.One",
    }])
    const { purgeDeletedAccounts } = await import("./purge-deleted")
    await purgeDeletedAccounts(new Date("2026-08-23T00:00:00.000Z"))
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        email: null,
        username: null,
        usernameCanonical: null,
        activatedAt: null,
      }),
    }))
    // The canonical username is a reserved, appliance-wide identity, not just
    // a user field — releasing it is what lets the login name be reissued.
    expect(mocks.reservationUpdateMany).toHaveBeenCalledWith({
      where: { userId: "hospital-user-1", releasedAt: null },
      data: { releasedAt: new Date("2026-08-23T00:00:00.000Z") },
    })
  })

  // HAUD_ROLLBACK:retention-anonymisation
  it("counts no anonymisation when the durable audit row fails", async () => {
    mocks.auditCreate.mockRejectedValue(new Error("audit unavailable"))
    const { purgeDeletedAccounts } = await import("./purge-deleted")
    await expect(purgeDeletedAccounts()).resolves.toMatchObject({
      scanned: 1,
      anonymised: 0,
      userIds: [],
    })
  })
})
