import { randomBytes } from "node:crypto"
import { beforeAll, describe, expect, it, vi } from "vitest"

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
