import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  delivery: vi.fn(),
  cleanup: vi.fn(),
  purge: vi.fn(),
}))

vi.mock("@/lib/hospital/deployment", () => ({ isHospitalDeployment: () => true }))
vi.mock("@/lib/hospital/config", () => ({
  hospitalConfig: () => ({ HOSPITAL_WORKER_TOKEN: process.env.HOSPITAL_WORKER_TOKEN }),
}))
vi.mock("@/lib/hospital/delivery-worker", () => ({
  processAvailableCentralDeliveries: mocks.delivery,
  cleanAcceptedArtifacts: mocks.cleanup,
}))
vi.mock("@/lib/purge-deleted", () => ({
  RETENTION_DAYS: 30,
  purgeDeletedAccounts: mocks.purge,
}))
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }))

import { POST as deliver } from "@/app/v1/internal/hospital-delivery/process/route"
import { GET as purge } from "@/app/v1/internal/purge-deleted/route"
import { GET as optionSnapshot } from "@/app/v1/internal/option-library-snapshot/route"

const current = "c".repeat(32)
const previous = "p".repeat(32)

describe("operational route credential overlap", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.HOSPITAL_WORKER_TOKEN = current
    process.env.HOSPITAL_WORKER_TOKEN_PREVIOUS = previous
    process.env.CRON_SECRET = current
    process.env.CRON_SECRET_PREVIOUS = previous
    process.env.OPTION_LIBRARY_SNAPSHOT_SECRET = current
    process.env.OPTION_LIBRARY_SNAPSHOT_SECRET_PREVIOUS = previous
    mocks.delivery.mockResolvedValue(0)
    mocks.cleanup.mockResolvedValue(0)
    mocks.purge.mockResolvedValue({ userIds: [], scanned: 0, anonymised: 0, rateLimitRowsRemoved: 0 })
  })

  afterEach(() => {
    for (const key of [
      "HOSPITAL_WORKER_TOKEN", "HOSPITAL_WORKER_TOKEN_PREVIOUS",
      "CRON_SECRET", "CRON_SECRET_PREVIOUS",
      "OPTION_LIBRARY_SNAPSHOT_SECRET", "OPTION_LIBRARY_SNAPSHOT_SECRET_PREVIOUS",
    ]) delete process.env[key]
  })

  it("accepts the previous delivery bearer only during overlap", async () => {
    const request = () => new NextRequest("http://api/v1/internal/hospital-delivery/process", {
      method: "POST",
      headers: { authorization: `Bearer ${previous}` },
    })
    expect((await deliver(request())).status).toBe(200)
    delete process.env.HOSPITAL_WORKER_TOKEN_PREVIOUS
    expect((await deliver(request())).status).toBe(403)
  })

  it("accepts and then retires the previous cron bearer", async () => {
    const request = () => new NextRequest("http://api/v1/internal/purge-deleted", {
      headers: { authorization: `Bearer ${previous}` },
    })
    expect((await purge(request())).status).toBe(200)
    delete process.env.CRON_SECRET_PREVIOUS
    expect((await purge(request())).status).toBe(403)
  })

  it("uses constant-time overlap for the option-library header", async () => {
    const request = () => new NextRequest("http://api/v1/internal/option-library-snapshot", {
      headers: { "x-snapshot-secret": previous },
    })
    expect((await optionSnapshot(request())).status).toBe(200)
    delete process.env.OPTION_LIBRARY_SNAPSHOT_SECRET_PREVIOUS
    expect((await optionSnapshot(request())).status).toBe(403)
  })
})
