import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => {
  const transaction = vi.fn()
  const installation = vi.fn()
  const policyUpsert = vi.fn()
  const audit = vi.fn()
  return { transaction, installation, policyUpsert, audit }
})

const tx = {
  hospitalInstallation: { findUnique: mocks.installation },
  hospitalPatientIdentifierPolicy: { upsert: mocks.policyUpsert },
}

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}))
vi.mock("@/lib/audit", () => ({ logAuditInTransaction: mocks.audit }))

import { setPatientIdentifierPolicy } from "./control-plane"

// ЕГН is what joins a patient's separate admissions into one person, so
// turning it on or off is a real, hard-to-reverse privacy commitment made by
// the hospital -- not a feature flag. These tests exist to prove the write
// path resolves an actual appliance-operator actor (not an anonymous
// device), commits the change and its audit entry atomically, and does so
// under Serializable isolation so two operators racing to flip the same
// singleton row cannot both "succeed" against a value already stale by the
// time either wrote.

describe("Hospital patient-identifier Status mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx))
    mocks.installation.mockResolvedValue({
      applianceOperator: {
        id: "admin-1",
        role: "ADMIN",
        deletedAt: null,
        activatedAt: new Date("2026-09-02T08:00:00Z"),
      },
    })
    mocks.audit.mockResolvedValue(undefined)
  })

  it("commits the policy change and its audit entry inside one Serializable transaction", async () => {
    mocks.policyUpsert.mockResolvedValue({
      id: "local",
      egnPermitted: false,
      changedAt: new Date("2026-09-02T12:00:00Z"),
    })

    const policy = await setPatientIdentifierPolicy({
      egnPermitted: false,
      reason: "Site will not hold national identifiers",
    })

    expect(policy).toMatchObject({ egnPermitted: false })
    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.transaction.mock.calls[0]?.[1]).toEqual({ isolationLevel: "Serializable" })
    expect(mocks.policyUpsert.mock.calls[0]?.[0].update).toMatchObject({
      egnPermitted: false,
      changedById: "admin-1",
      changeReason: "Site will not hold national identifiers",
    })
    expect(mocks.audit).toHaveBeenCalledWith(
      tx,
      "admin-1",
      "HOSPITAL_PATIENT_IDENTIFIER_POLICY_UPDATE",
      "local",
      expect.objectContaining({ egnPermitted: false, reasonRecorded: true }),
    )
    // The audit write happens inside the same transaction callback as the
    // policy write, not as a separate best-effort call afterward.
    const auditCallOrder = mocks.audit.mock.invocationCallOrder[0]!
    const upsertCallOrder = mocks.policyUpsert.mock.invocationCallOrder[0]!
    expect(auditCallOrder).toBeGreaterThan(upsertCallOrder)
  })

  it("refuses when no appliance operator is designated, and writes nothing", async () => {
    mocks.installation.mockResolvedValue({ applianceOperator: null })
    await expect(setPatientIdentifierPolicy({
      egnPermitted: true,
      reason: "Attempted change with no operator",
    })).rejects.toMatchObject({ code: "APPLIANCE_OPERATOR_UNAVAILABLE" })
    expect(mocks.policyUpsert).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it("does not complete the policy mutation when its atomic audit fails", async () => {
    mocks.policyUpsert.mockResolvedValue({ id: "local", egnPermitted: true })
    mocks.audit.mockRejectedValue(new Error("audit unavailable"))
    await expect(setPatientIdentifierPolicy({
      egnPermitted: true,
      reason: "Re-enable national identifiers",
    })).rejects.toThrow("audit unavailable")
  })
})
