import { randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { config as loadDotenv } from "dotenv"

vi.mock("server-only", () => ({}))
// Never reach Mistral from a test; the key check has its own unit tests.
vi.mock("@/lib/hospital/mistral-key-check", () => ({ mistralKeyCheck: vi.fn(async () => undefined) }))

const runPostgres = process.env.LOSPOR_POSTGRES_INTEGRATION === "true"
if (runPostgres && !process.env.DATABASE_URL) loadDotenv({ quiet: true })

/**
 * What the Status overview map needs to tell a quiet fault from a quiet day
 * (Hospital 1.5.6), against a real database: failed reads of the hospital
 * system, codes that arrived unmapped, how long the oldest case has waited for
 * Central, failed research exports this week, and a new administrator.
 * Counted as the change these rows make, so other data does not matter.
 */
describe.skipIf(!runPostgres)("appliance connection facts, PostgreSQL", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let applianceIntegrations: typeof import("@/lib/hospital/appliance-activity").applianceIntegrations
  let casesAwaitingCentralExport: typeof import("@/lib/hospital/central-status").casesAwaitingCentralExport
  let applianceStatusSnapshot: typeof import("@/lib/hospital/appliance-status-snapshot").applianceStatusSnapshot

  const suffix = randomUUID()
  const institutionId = `connections-inst-${suffix}`
  const userId = `connections-user-${suffix}`
  const now = Date.now()
  const hours = (value: number) => new Date(now - value * 3_600_000)
  const codes = { lab: `LAB-${suffix}`, vital: `VITAL-${suffix}`, medication: `MED-${suffix}` }
  const caseIds: string[] = []
  const linkIds: string[] = []
  let before: Awaited<ReturnType<typeof applianceIntegrations>>
  let beforeExports = 0

  const ehrImport = (receivedAt: Date, unreadSources: unknown) => prisma.ehrImport.create({
    data: {
      institutionId, identifierHash: randomBytes(32).toString("hex"), maskedIdentifier: "***1", transport: "FHIR",
      payloadHash: randomBytes(32).toString("hex"), receivedAt, expiresAt: new Date(now + 86_400_000),
      ...(unreadSources === undefined ? {} : { unreadSources: unreadSources as object }),
    },
  })

  async function completeCase(label: string, changedAt: Date) {
    const id = `connections-case-${label}-${suffix}`
    const patientLinkId = `connections-link-${label}-${suffix}`
    caseIds.push(id)
    linkIds.push(patientLinkId)
    await prisma.patientLink.create({
      data: {
        id: patientLinkId, institutionId, identifierHash: randomBytes(32).toString("hex"), identifierCiphertext: "x",
        identifierNonce: "x", identifierAuthTag: "x", maskedIdentifier: "***", createdById: userId,
      },
    })
    await prisma.case.create({
      data: {
        id, userId, createdById: userId, institutionId, patientLinkId, status: "COMPLETE", clinicalMode: "ADULT",
        finalizedAt: changedAt, createdAt: changedAt, updatedAt: changedAt,
      },
    })
  }

  beforeAll(async () => {
    ;({ prisma } = await import("@/lib/prisma"))
    ;({ applianceIntegrations } = await import("@/lib/hospital/appliance-activity"))
    ;({ casesAwaitingCentralExport } = await import("@/lib/hospital/central-status"))
    ;({ applianceStatusSnapshot } = await import("@/lib/hospital/appliance-status-snapshot"))
    before = await applianceIntegrations(now)
    beforeExports = await prisma.researchExport.count({ where: { status: "FAILED", createdAt: { gte: hours(7 * 24) } } })
    await prisma.institution.create({ data: { id: institutionId, name: "Connections test hospital", city: "Sofia" } })
    await prisma.user.create({
      data: {
        id: userId, email: `${userId}@example.test`, username: userId, usernameCanonical: userId.toLowerCase(),
        name: "Connections test", passwordHash: "not-a-real-password", institutionId,
      },
    })
    // One import with an unread group in the last day; one clean; one unread but older than a day.
    await ehrImport(hours(2), [{ group: "allergies", errorCode: "EHR_FHIR_HTTP_ERROR" }])
    await ehrImport(hours(3), [])
    await ehrImport(hours(30), [{ group: "labs", errorCode: "EHR_FHIR_HTTP_ERROR" }])
    await prisma.hospitalEhrLabCodeMap.create({ data: { code: codes.lab, test: "", seenCount: 1, lastSeenAt: hours(1) } })
    await prisma.hospitalEhrVitalCodeMap.create({ data: { code: codes.vital, field: "", seenCount: 1, lastSeenAt: hours(1) } })
    await prisma.hospitalEhrMedicationCodeMap.create({ data: { code: codes.medication, seenCount: 1, lastSeenAt: hours(1) } })
    await completeCase("old", hours(5 * 24))
    await completeCase("new", hours(10))
    await prisma.researchExport.create({ data: { ownerId: userId, name: "failed", format: "csv", definition: {}, status: "FAILED", createdAt: hours(2) } })
    await prisma.researchExport.create({ data: { ownerId: userId, name: "failed long ago", format: "csv", definition: {}, status: "FAILED", createdAt: hours(30 * 24) } })
    await prisma.auditLog.create({ data: { userId, action: "ADMIN_ACCOUNT_AUTHORITY_CHANGE", entityId: userId, detail: { previousRole: "MEMBER", role: "ADMIN" }, createdAt: new Date(now - 60_000) } })
  }, 60_000)

  afterAll(async () => {
    if (!prisma) return
    await prisma.auditLog.deleteMany({ where: { userId } })
    await prisma.researchExport.deleteMany({ where: { ownerId: userId } })
    await prisma.case.deleteMany({ where: { id: { in: caseIds } } })
    await prisma.patientLink.deleteMany({ where: { id: { in: linkIds } } })
    await prisma.ehrImport.deleteMany({ where: { institutionId } })
    await prisma.hospitalEhrLabCodeMap.deleteMany({ where: { code: codes.lab } })
    await prisma.hospitalEhrVitalCodeMap.deleteMany({ where: { code: codes.vital } })
    await prisma.hospitalEhrMedicationCodeMap.deleteMany({ where: { code: codes.medication } })
    await prisma.user.deleteMany({ where: { id: userId } })
    await prisma.institution.deleteMany({ where: { id: institutionId } })
    await prisma.$disconnect()
  })

  it("counts failed reads of the last day and codes that arrived unmapped", async () => {
    const after = await applianceIntegrations(now)
    expect(after).not.toBeNull()
    expect(after!.ehr.readFailures24h - (before?.ehr.readFailures24h ?? 0)).toBe(1)
    expect(after!.ehr.unmappedCodes - (before?.ehr.unmappedCodes ?? 0)).toBe(3)
  }, 30_000)

  it("says since when the oldest case has waited for Central", async () => {
    const waiting = await casesAwaitingCentralExport(institutionId)
    expect(waiting.count).toBe(2)
    expect(waiting.oldestSince?.getTime()).toBe(hours(5 * 24).getTime())
    expect(await casesAwaitingCentralExport(`connections-none-${suffix}`)).toEqual({ count: 0, oldestSince: null })
  }, 30_000)

  it("reports failed exports of the last week and a new administrator", async () => {
    const snapshot = await applianceStatusSnapshot("connections-test-key", now)
    expect(snapshot.researchExportsFailed7d - beforeExports).toBe(1)
    expect(Date.parse(snapshot.lastAdministratorAddedAt!)).toBeGreaterThanOrEqual(now - 60_000)
    expect(snapshot).toHaveProperty("centralOldestWaitingSince")
  }, 30_000)
})
