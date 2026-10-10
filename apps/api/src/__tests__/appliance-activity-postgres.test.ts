import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { config as loadDotenv } from "dotenv"

vi.mock("server-only", () => ({}))

const runPostgres = process.env.LOSPOR_POSTGRES_INTEGRATION === "true"
if (runPostgres && !process.env.DATABASE_URL) loadDotenv({ quiet: true })

/**
 * The totals the Status overview shows (Hospital 1.5.4), against a real
 * database: people with a live session seen in the last ten minutes, split
 * clinical and research, and cases started and finalized per day. Counted as
 * the change these rows make, so other data in the database does not matter.
 */
describe.skipIf(!runPostgres)("appliance activity totals, PostgreSQL", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let applianceActivity: typeof import("@/lib/hospital/appliance-activity").applianceActivity

  const suffix = randomUUID()
  const clinical = `activity-clinical-${suffix}`
  const research = `activity-research-${suffix}`
  const idle = `activity-idle-${suffix}`
  const now = Date.now()
  const today = new Date(now).toISOString().slice(0, 10)
  const minutes = (value: number) => new Date(now - value * 60_000)

  const user = (id: string, accountKind: "CLINICAL" | "RESEARCH_ONLY") => prisma.user.create({
    data: { id, email: `${id}@example.test`, username: id, usernameCanonical: id.toLowerCase(), name: "Activity test", passwordHash: "not-a-real-password", accountKind },
  })
  const session = (userId: string, lastSeen: Date, revoked = false) => prisma.authSession.create({
    data: { jti: `${userId}-${randomUUID()}`, userId, clientType: "WEB", deviceLabel: "test", lastSeenAt: lastSeen, expiresAt: new Date(now + 3_600_000), ...(revoked ? { revokedAt: minutes(1) } : {}) },
  })
  const sameDay = (result: Awaited<ReturnType<typeof applianceActivity>>) => result?.days.find(day => day.day === today)

  let before: Awaited<ReturnType<typeof applianceActivity>>

  beforeAll(async () => {
    ;({ prisma } = await import("@/lib/prisma"))
    ;({ applianceActivity } = await import("@/lib/hospital/appliance-activity"))
    before = await applianceActivity(now)
    await user(clinical, "CLINICAL")
    await user(research, "RESEARCH_ONLY")
    await user(idle, "CLINICAL")
    // Two live sessions for one person count once; a revoked or stale session not at all.
    await session(clinical, minutes(2))
    await session(clinical, minutes(4))
    await session(research, minutes(9))
    await session(idle, minutes(30))
    await session(idle, minutes(1), true)
    await prisma.case.create({ data: { id: `activity-case-a-${suffix}`, userId: clinical, createdById: clinical, status: "IN_PROGRESS" } })
    await prisma.case.create({ data: { id: `activity-case-b-${suffix}`, userId: clinical, createdById: clinical, status: "COMPLETE", finalizedAt: new Date(now) } })
  }, 30_000)

  afterAll(async () => {
    if (!prisma) return
    await prisma.case.deleteMany({ where: { id: { startsWith: "activity-case-" }, userId: clinical } })
    await prisma.authSession.deleteMany({ where: { userId: { in: [clinical, research, idle] } } })
    await prisma.user.deleteMany({ where: { id: { in: [clinical, research, idle] } } })
    await prisma.$disconnect()
  })

  it("counts each person with a live session seen in the last ten minutes once", async () => {
    const after = await applianceActivity(now)
    expect(after).not.toBeNull()
    expect(after!.activeUsers - (before?.activeUsers ?? 0)).toBe(2)
    expect(after!.activeClinical - (before?.activeClinical ?? 0)).toBe(1)
    expect(after!.activeResearch - (before?.activeResearch ?? 0)).toBe(1)
  }, 30_000)

  it("counts the cases started and finalized today", async () => {
    const after = await applianceActivity(now)
    expect(after!.days).toHaveLength(30)
    expect(after!.days.at(-1)!.day).toBe(today)
    expect(sameDay(after)!.started - (sameDay(before)?.started ?? 0)).toBe(2)
    expect(sameDay(after)!.finalized - (sameDay(before)?.finalized ?? 0)).toBe(1)
  }, 30_000)
})
