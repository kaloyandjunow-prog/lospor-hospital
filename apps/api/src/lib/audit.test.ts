import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: { auditLog: { create: vi.fn() } } }))
vi.mock("@/lib/hospital/status-events", () => ({ emitStatusEvent: vi.fn() }))
import { assertSafeAuditDetail } from "./audit"

describe("audit detail privacy boundary", () => {
  it("accepts stable evidence codes, opaque IDs, roles, counts, and booleans", () => {
    expect(() => assertSafeAuditDetail({
      targetUserId: "opaque-user-id",
      institutionId: "opaque-institution-id",
      previousRole: "MEMBER",
      role: "HEAD_OF_DEPT",
      changedFields: ["role"],
      reasonCode: "STALE_REVISION",
      reasonRecorded: true,
      count: 2,
    })).not.toThrow()
  })

  it.each([
    "password", "passwordHash", "resetToken", "activationLink", "credential",
    "patientNumber", "maskedPatientNumber", "caseCode", "clinicalPayload",
    "payload", "email", "fullName", "reason", "reasonNote", "purpose",
    "description", "message", "errorMessage", "privateKey", "callbackUrl",
  ])("rejects unsafe field %s even when nested", key => {
    expect(() => assertSafeAuditDetail({ nested: { [key]: "must-not-be-stored" } }))
      .toThrow(/Unsafe audit detail field/)
  })
})
