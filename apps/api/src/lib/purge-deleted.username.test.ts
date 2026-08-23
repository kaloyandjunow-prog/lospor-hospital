import { beforeEach, describe, expect, it, vi } from "vitest"

const findMany = vi.fn()
const userUpdate = vi.fn()
const reservationUpdateMany = vi.fn()
const rateLimitDeleteMany = vi.fn()
const auditCreate = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany },
    rateLimit: { deleteMany: rateLimitDeleteMany },
    $transaction: vi.fn(async (run: (tx: unknown) => unknown) => run({
      user: { update: userUpdate },
      hospitalUsernameReservation: { updateMany: reservationUpdateMany },
      auditLog: { create: auditCreate },
    })),
  },
}))

describe("final anonymization username release", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findMany.mockResolvedValue([{ id: "user-1" }])
    userUpdate.mockResolvedValue({ id: "user-1" })
    reservationUpdateMany.mockResolvedValue({ count: 1 })
    auditCreate.mockResolvedValue({ id: "audit-1" })
    rateLimitDeleteMany.mockResolvedValue({ count: 0 })
  })

  it("keeps the reservation until final anonymization and releases it atomically", async () => {
    const now = new Date("2026-08-23T12:00:00.000Z")
    const { purgeDeletedAccounts } = await import("./purge-deleted")
    await expect(purgeDeletedAccounts(now)).resolves.toMatchObject({
      anonymised: 1,
      userIds: ["user-1"],
    })
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        deletedAt: expect.objectContaining({ not: null }),
        usernameCanonical: { not: null },
      }),
    }))
    expect(userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-1" },
      data: expect.objectContaining({
        username: null,
        usernameCanonical: null,
      }),
    }))
    expect(reservationUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", releasedAt: null },
      data: { releasedAt: now },
    })
  })
})
