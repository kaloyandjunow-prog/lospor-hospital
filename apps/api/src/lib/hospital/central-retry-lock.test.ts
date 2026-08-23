import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  installation: vi.fn(),
  policy: vi.fn(),
  batch: vi.fn(),
  updateBatch: vi.fn(),
  audit: vi.fn(),
}))

const tx = {
  hospitalInstallation: { findUnique: mocks.installation },
  centralExportPolicy: { findUnique: mocks.policy },
  centralDeliveryBatch: { findUnique: mocks.batch, update: mocks.updateBatch },
}

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: vi.fn(async callback => callback(tx)) },
}))
vi.mock("@/lib/audit", () => ({ logAuditInTransaction: mocks.audit }))
vi.mock("@/lib/hospital/enrollment", () => ({ enrollHospital: vi.fn() }))
vi.mock("@/lib/hospital/config", () => ({
  hospitalConfig: () => ({}),
  isCentralDeliveryConfigured: () => false,
}))
vi.mock("@/lib/hospital/central-status", () => ({
  countCasesAwaitingCentralExport: vi.fn(async () => 0),
}))

import { retryCentralBatch } from "./control-plane"

const actor = {
  applianceOperator: {
    id: "operator-1",
    role: "ADMIN",
    deletedAt: null,
    emailVerifiedAt: new Date("2026-08-01T00:00:00Z"),
  },
}
const transport = {
  institutionId: "inst-1",
  centralEnabled: true,
  siteId: "site-1",
  transportConfigurationHash: "a".repeat(64),
  transportConfiguredAt: new Date("2026-08-20T00:00:00Z"),
  transportConfiguredById: "operator-1",
}

describe("Central batch retry lock", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.installation.mockResolvedValueOnce(actor).mockResolvedValueOnce(transport)
    mocks.batch.mockResolvedValue({
      id: "batch-1",
      sequence: 7,
      status: "RETRY",
      errorCode: "CENTRAL_UNAVAILABLE",
    })
    mocks.updateBatch.mockResolvedValue({ id: "batch-1", status: "RETRY" })
  })

  it("does not queue a batch while the separate clinical-export approval is off", async () => {
    mocks.policy.mockResolvedValue({ enabled: false, approvedAt: null })

    await expect(retryCentralBatch("batch-1", "Retry after network recovery"))
      .rejects.toMatchObject({ code: "CENTRAL_CLINICAL_EXPORT_NOT_ENABLED" })
    expect(mocks.batch).not.toHaveBeenCalled()
    expect(mocks.updateBatch).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it("queues and audits one retry only when transport and clinical policy are locked", async () => {
    mocks.policy.mockResolvedValue({
      enabled: true,
      approvedAt: new Date("2026-08-20T01:00:00Z"),
    })

    await expect(retryCentralBatch("batch-1", "Retry after network recovery"))
      .resolves.toMatchObject({ id: "batch-1", status: "RETRY" })
    expect(mocks.updateBatch).toHaveBeenCalledOnce()
    expect(mocks.audit).toHaveBeenCalledWith(
      tx,
      "operator-1",
      "HOSPITAL_CENTRAL_BATCH_RETRY",
      "batch-1",
      expect.objectContaining({ reasonRecorded: true }),
    )
  })
})
