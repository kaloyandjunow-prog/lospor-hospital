import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { config as loadDotenv } from "dotenv"

vi.mock("server-only", () => ({}))

const runPostgres = process.env.LOSPOR_POSTGRES_INTEGRATION === "true"
  && process.env.LOSPOR_BUNDLED_BASELINE_POSTGRES === "true"
if (runPostgres && !process.env.DATABASE_URL) loadDotenv({ quiet: true })

/**
 * The 1.6.0 update installs the v3 baselines beside v2 and selects them. The
 * appliance's readiness must then report paediatric (and adult) guidance as
 * ready: it accepted v2 alone, so every updated appliance read
 * IDENTITY_MISMATCH and switched paediatric dose guidance off. Run on an
 * empty, freshly migrated database like the other bundled-baseline suites;
 * everything is rolled back.
 */
describe.skipIf(!runPostgres)("v3 baselines installed by the update are ready (Hospital 1.6.0)", () => {
  let prisma: typeof import("@/lib/prisma").prisma

  beforeAll(async () => {
    ;({ prisma } = await import("@/lib/prisma"))
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  it("reports both modes READY on the v3 the provisioner selects", async () => {
    const { provisionBundledClinicalBaselinesInSerializableTransaction } = await import("@/lib/clinical-rules/bundled-baseline-provisioner")
    const { assessSelectedHospitalClinicalBaseline } = await import("@/lib/hospital/clinical-baseline-readiness")
    const { Prisma } = await import("@/generated/prisma/client")
    const rollback = new Error("roll back")
    await expect(prisma.$transaction(async tx => {
      const installed = await provisionBundledClinicalBaselinesInSerializableTransaction(tx, { installedAt: new Date("2026-10-19T08:00:00.000Z") })
      expect(installed.v3.outcome).toBe("installed")
      for (const mode of ["ADULT", "PEDIATRIC"] as const) {
        const readiness = await assessSelectedHospitalClinicalBaseline(mode, tx)
        expect(readiness).toMatchObject({ baselineReady: true, reasonCode: "READY", selected: { version: 3 } })
      }
      throw rollback
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000 })).rejects.toBe(rollback)
  })
})
