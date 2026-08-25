import { beforeEach, describe, expect, it, vi } from "vitest"

const getAuthUser = vi.fn()
const findCase = vi.fn()
const findPatientLink = vi.fn()
const updateCase = vi.fn()
const createAudit = vi.fn()
const resolvePatientLink = vi.fn()
const deletePatientLinkIfOrphaned = vi.fn()
const isHospitalDeployment = vi.fn()

vi.mock("@/lib/mobile-auth", () => ({ getAuthUser }))
vi.mock("@/lib/hospital/deployment", () => ({ isHospitalDeployment }))
vi.mock("@/lib/hospital/patient-link", () => ({
  resolvePatientLink,
  deletePatientLinkIfOrphaned,
}))
vi.mock("@/lib/hospital/status-events", () => ({ emitStatusEvent: vi.fn() }))
vi.mock("@/lib/audit", () => ({ logAuditInTransaction: createAudit }))
vi.mock("@/lib/clinical-transaction", async () => {
  const actual = await vi.importActual<typeof import("@/lib/clinical-transaction")>(
    "@/lib/clinical-transaction",
  )
  return {
    ...actual,
    withLockedCaseTransaction: (_id: string, run: (tx: unknown) => unknown) => run({
      case: { findFirst: findCase, update: updateCase },
      patientLink: { findUnique: findPatientLink },
      auditLog: { create: createAudit },
    }),
  }
})

const context = { params: Promise.resolve({ id: "case-1" }) }

function request(body: unknown) {
  return new Request("http://localhost/v1/cases/case-1/patient-link/correct", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never
}

const validBody = {
  expectedPatientLinkId: "link-old",
  newPatientNumber: "000456-B",
  correctionReason: "Admitted under the wrong number",
}

describe("correcting the patient a case belongs to", () => {
  let POST: typeof import("./route").POST

  beforeEach(async () => {
    vi.clearAllMocks()
    isHospitalDeployment.mockReturnValue(true)
    getAuthUser.mockResolvedValue({ id: "admin-1", role: "ADMIN", institutionId: "inst-1" })
    findCase.mockResolvedValue({
      id: "case-1",
      institutionId: "inst-1",
      patientLinkId: "link-old",
      status: "IN_PROGRESS",
    })
    findPatientLink.mockResolvedValue({ maskedIdentifier: "00****23" })
    resolvePatientLink.mockResolvedValue({ id: "link-new", maskedIdentifier: "00****56" })
    updateCase.mockResolvedValue({})
    createAudit.mockResolvedValue({})
    ;({ POST } = await import("./route"))
  })

  it("repoints the case and reports the new masked identifier", async () => {
    const response = await POST(request(validBody), context)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      id: "case-1", patientLinkId: "link-new", maskedIdentifier: "00****56",
    })
    expect(updateCase).toHaveBeenCalledWith(expect.objectContaining({
      data: { patientLinkId: "link-new" },
    }))
  })

  it("never deletes the link it corrected away from", async () => {
    // The previous behaviour deleted it outright when no other case referenced
    // it, so a mistyped number destroyed the evidence of the correct linkage
    // and the mistake became unrecoverable.
    await POST(request(validBody), context)
    expect(deletePatientLinkIfOrphaned).not.toHaveBeenCalled()
  })

  it("records what changed and why, in the same transaction", async () => {
    await POST(request(validBody), context)
    expect(createAudit).toHaveBeenCalledWith(
      expect.anything(),
      "admin-1",
      "CASE_PATIENT_LINK_CORRECTED",
      "case-1",
      {
        fromPatientLinkId: "link-old",
        toPatientLinkId: "link-new",
        correctionReasonRecorded: true,
      },
    )
  })

  it("puts no patient identifier, masked identifier, or free text in audit detail", async () => {
    await POST(request(validBody), context)
    const detail = JSON.stringify(createAudit.mock.calls[0][4])
    expect(detail).not.toContain("000456-B")
    expect(detail).not.toContain("00****")
    expect(detail).not.toContain("Admitted under the wrong number")
  })

  it("refuses when the case has moved on since the caller read it", async () => {
    findCase.mockResolvedValue({
      id: "case-1", institutionId: "inst-1",
      patientLinkId: "link-someone-else", status: "IN_PROGRESS",
    })
    const response = await POST(request(validBody), context)
    expect(response.status).toBe(409)
    expect(updateCase).not.toHaveBeenCalled()
  })

  it("requires a reason, an expected link, and a number", async () => {
    for (const missing of ["expectedPatientLinkId", "newPatientNumber", "correctionReason"]) {
      const body: Record<string, unknown> = { ...validBody }
      delete body[missing]
      const response = await POST(request(body), context)
      expect(response.status, `${missing} should be required`).toBe(400)
    }
    expect(updateCase).not.toHaveBeenCalled()
  })

  it("is not something an ordinary member may do", async () => {
    getAuthUser.mockResolvedValue({ id: "user-1", role: "MEMBER", institutionId: "inst-1" })
    const response = await POST(request(validBody), context)
    expect(response.status).toBe(403)
    expect(updateCase).not.toHaveBeenCalled()
  })

  it("refuses on a finalised case rather than changing it underneath", async () => {
    // Correcting a finalised record means unfinalising it first, so the change
    // is captured in a new finalization instead of altering an attested one.
    findCase.mockResolvedValue({
      id: "case-1", institutionId: "inst-1", patientLinkId: "link-old", status: "COMPLETE",
    })
    const response = await POST(request(validBody), context)
    expect(response.status).toBe(409)
    expect(updateCase).not.toHaveBeenCalled()
  })

  it("refuses a correction that changes nothing", async () => {
    resolvePatientLink.mockResolvedValue({ id: "link-old", maskedIdentifier: "00****23" })
    const response = await POST(request(validBody), context)
    expect(response.status).toBe(400)
    expect(updateCase).not.toHaveBeenCalled()
  })

  it("does not exist on the serverless deployment", async () => {
    // Patient linkage is appliance-only; the public deployment holds no patient
    // identifiers to link at all.
    isHospitalDeployment.mockReturnValue(false)
    const response = await POST(request(validBody), context)
    expect(response.status).toBe(404)
  })
})
