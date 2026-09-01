import { randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

// @/lib/prisma imports "server-only", which throws outside a Server Component.
vi.mock("server-only", () => ({}))

/**
 * The advisory lock that serialises Central export batching.
 *
 * reserveNextCentralBatch opens its transaction by taking
 * pg_advisory_xact_lock, which returns void. The Prisma driver adapter cannot
 * deserialise a void column, so issuing it through $queryRaw raised
 * UnsupportedNativeDataType and took the whole transaction down with it — on
 * every single call. A standalone appliance showed it as the delivery worker
 * answering HTTP 500 once a minute, forever, and it would have meant the export
 * pipeline never worked at all, including after enrollment.
 *
 * Nothing caught it because it only appears against a real PostgreSQL: the unit
 * suites never reach the lock. This test is therefore Postgres-gated, and its
 * value is entirely in the call not throwing.
 */

const runPostgres = process.env.LOSPOR_POSTGRES_INTEGRATION === "true"

describe.skipIf(!runPostgres)("Central export batch reservation in PostgreSQL", () => {
  let reserveNextCentralBatch:
    typeof import("@/lib/hospital/export-batch").reserveNextCentralBatch

  beforeAll(async () => {
    // hospitalConfig() is read before the transaction opens and requires the
    // signing identity; the CI job does not set it because nothing else needs it.
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    process.env.HOSPITAL_SITE_SIGNING_PRIVATE_KEY_FILE ??= "/run/secrets/site-signing-private.pem"
    process.env.HOSPITAL_SITE_SIGNING_PUBLIC_KEY_FILE ??= "/run/secrets/site-signing-public.pem"
    process.env.HOSPITAL_WORKER_TOKEN ??= randomBytes(24).toString("hex")
    process.env.HOSPITAL_EXPORT_PSEUDONYM_KEY ??= randomBytes(32).toString("base64")
    ;({ reserveNextCentralBatch } = await import("@/lib/hospital/export-batch"))
  })

  it("takes the advisory lock without tripping the driver adapter", async () => {
    // An unenrolled installation is the ordinary state of a hospital before it
    // has a Central to talk to, and the answer must be "nothing to send" rather
    // than an exception. Reaching that answer proves the lock was acquired,
    // because it is the first statement in the transaction.
    await expect(reserveNextCentralBatch()).resolves.toBeNull()
  })

  it("is safe to call repeatedly, as the worker does every minute", async () => {
    await expect(reserveNextCentralBatch()).resolves.toBeNull()
    await expect(reserveNextCentralBatch()).resolves.toBeNull()
  })
})

/**
 * The starvation regression: reserveNextCentralBatch used to take a single
 * bounded window of the oldest `HOSPITAL_EXPORT_BATCH_CASE_LIMIT * 3` cases
 * and give up if none of them were eligible, rather than paging further.
 * Once a site accumulated enough already-delivered or excluded old cases to
 * fill that window, every later pass rescanned the exact same ineligible
 * rows and a genuinely newer, eligible case was never reached -- forever.
 *
 * The limit is set to 2 here (window of 6) so the regression reproduces with
 * a handful of seeded cases instead of the real default of 500.
 */
describe.skipIf(!runPostgres).sequential(
  "Central export batch reservation does not starve on an ineligible window",
  () => {
    let prisma: typeof import("@/lib/prisma")["prisma"]
    let reserveNextCentralBatch:
      typeof import("@/lib/hospital/export-batch").reserveNextCentralBatch
    const institutionIds: string[] = []
    const userIds: string[] = []
    const caseIds: string[] = []
    const patientLinkIds: string[] = []
    const batchIds: string[] = []

    beforeAll(async () => {
      process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
      process.env.HOSPITAL_SITE_SIGNING_PRIVATE_KEY_FILE ??= "/run/secrets/site-signing-private.pem"
      process.env.HOSPITAL_SITE_SIGNING_PUBLIC_KEY_FILE ??= "/run/secrets/site-signing-public.pem"
      process.env.HOSPITAL_WORKER_TOKEN ??= randomBytes(24).toString("hex")
      process.env.HOSPITAL_EXPORT_PSEUDONYM_KEY ??= randomBytes(32).toString("base64")
      process.env.OMOP_PSEUDONYM_SALT ??= randomBytes(32).toString("hex")
      process.env.HOSPITAL_EXPORT_BATCH_CASE_LIMIT = "2"

      const configModule = await import("@/lib/hospital/config")
      configModule.resetHospitalConfigForTests()
      ;({ prisma } = await import("@/lib/prisma"))
      ;({ reserveNextCentralBatch } = await import("@/lib/hospital/export-batch"))
    })

    afterAll(async () => {
      if (!prisma) return
      await prisma.hospitalInstallation.deleteMany({ where: { id: "local" } }).catch(() => undefined)
      await prisma.centralDeliveryBatch.deleteMany({ where: { id: { in: batchIds } } }).catch(() => undefined)
      await prisma.case.deleteMany({ where: { id: { in: caseIds } } }).catch(() => undefined)
      await prisma.patientLink.deleteMany({ where: { id: { in: patientLinkIds } } }).catch(() => undefined)
      await prisma.centralExportPolicy.deleteMany({ where: { institutionId: { in: institutionIds } } }).catch(() => undefined)
      await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined)
      await prisma.institution.deleteMany({ where: { id: { in: institutionIds } } }).catch(() => undefined)
    })

    async function createCase(input: {
      institutionId: string
      userId: string
      label: string
      finalizedAt: Date
      excluded: boolean
    }) {
      const id = `starvation-case-${input.label}-${randomUUID()}`
      const patientLinkId = `starvation-patient-${input.label}-${randomUUID()}`
      caseIds.push(id)
      patientLinkIds.push(patientLinkId)
      await prisma.patientLink.create({
        data: {
          id: patientLinkId,
          institutionId: input.institutionId,
          identifierHash: randomBytes(32).toString("hex"),
          identifierCiphertext: "starvation-test-only",
          identifierNonce: "starvation-test-nonce",
          identifierAuthTag: "starvation-test-auth-tag",
          maskedIdentifier: "starvation-test-only",
          createdById: input.userId,
        },
      })
      await prisma.case.create({
        data: {
          id,
          caseCode: `STARVE-${input.label}`,
          userId: input.userId,
          createdById: input.userId,
          institutionId: input.institutionId,
          patientLinkId,
          status: "DRAFT",
          clinicalMode: "ADULT",
          createdAt: input.finalizedAt,
          updatedAt: input.finalizedAt,
          preop: {
            create: {
              ageYears: 42,
              sex: "FEMALE",
              diagnosis: "Starvation-test diagnosis",
              plannedProcedure: "Starvation-test procedure",
              createdAt: input.finalizedAt,
              updatedAt: input.finalizedAt,
            },
          },
          fieldStatuses: {
            create: {
              section: "preop",
              fieldKey: "diagnosis",
              presence: "PRESENT",
              source: "starvation-test",
              createdAt: input.finalizedAt,
              updatedAt: input.finalizedAt,
            },
          },
          finalizations: {
            create: {
              sequence: 1,
              schemaVersion: "starvation-test/v1",
              snapshotDocument: "{}",
              snapshotHash: "a".repeat(64),
              finalizedAt: input.finalizedAt,
              finalizedById: input.userId,
            },
          },
          ...(input.excluded ? {
            centralExportControl: {
              create: { decision: "EXCLUDE", decidedById: input.userId },
            },
          } : {}),
        },
      })
      await prisma.case.update({
        where: { id },
        data: { status: "COMPLETE", finalizedAt: input.finalizedAt },
      })
      await prisma.case.update({ where: { id }, data: { updatedAt: input.finalizedAt } })
      return id
    }

    it("pages past a fully-ineligible oldest window to reach a newer eligible case", async () => {
      const suffix = randomUUID()
      const institutionId = `starvation-institution-${suffix}`
      const userId = `starvation-admin-${suffix}`
      institutionIds.push(institutionId)
      userIds.push(userId)
      await prisma.institution.create({
        data: { id: institutionId, name: "Starvation Test Hospital", city: "Sofia" },
      })
      await prisma.user.create({
        data: {
          id: userId,
          email: `starvation-${suffix}@example.invalid`,
          username: `Starvation-${suffix}`,
          usernameCanonical: `starvation-${suffix}`.toLowerCase(),
          name: "Starvation Test Operator",
          passwordHash: "not-a-real-password-hash",
          role: "ADMIN",
          institutionId,
          approvedAt: new Date(),
          activatedAt: new Date(),
          emailVerifiedAt: new Date(),
        },
      })
      await prisma.centralExportPolicy.create({
        data: {
          institutionId,
          enabled: true,
          approvedById: userId,
          approvedAt: new Date(),
          includeRedactedText: false,
          redactionProfile: "bg-en-v1",
        },
      })
      await prisma.hospitalInstallation.upsert({
        where: { id: "local" },
        create: {
          id: "local",
          siteId: `starvation-site-${suffix}`,
          siteCode: "STARV",
          institutionId,
          centralBaseUrl: "https://central.invalid",
          centralEnabled: true,
          nextSequence: 1,
          transportConfigurationHash: "b".repeat(64),
          transportConfiguredAt: new Date(),
          transportConfiguredById: userId,
        },
        update: {
          siteId: `starvation-site-${suffix}`,
          siteCode: "STARV",
          institutionId,
          centralBaseUrl: "https://central.invalid",
          centralEnabled: true,
          transportConfigurationHash: "b".repeat(64),
          transportConfiguredAt: new Date(),
          transportConfiguredById: userId,
        },
      })

      const dayMs = 24 * 60 * 60 * 1000
      // The oldest window (pageSize = limit * 3 = 6) is entirely EXCLUDE'd —
      // the exact shape that used to make the function give up.
      for (let i = 0; i < 6; i++) {
        await createCase({
          institutionId,
          userId,
          label: `excluded-${i}`,
          finalizedAt: new Date(Date.now() - (10 - i) * dayMs),
          excluded: true,
        })
      }
      // One genuinely newer, eligible case beyond that window.
      const eligibleCaseId = await createCase({
        institutionId,
        userId,
        label: "eligible",
        finalizedAt: new Date(Date.now() - 1 * dayMs),
        excluded: false,
      })

      const batchId = await reserveNextCentralBatch()
      expect(batchId).not.toBeNull()
      if (batchId) batchIds.push(batchId)

      const batch = await prisma.centralDeliveryBatch.findUnique({
        where: { id: batchId! },
        include: { cases: true },
      })
      expect(batch?.cases.map(c => c.caseId)).toEqual([eligibleCaseId])
      expect(batch?.caseExcluded).toBe(6)
    })
  },
)
