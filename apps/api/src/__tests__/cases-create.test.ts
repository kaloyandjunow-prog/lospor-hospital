import { beforeEach, describe, expect, it, vi } from "vitest"

const getAuthUserMock   = vi.fn()
const findFirstMock     = vi.fn()
const findUniqueMock    = vi.fn()
const createMock        = vi.fn()
const patientCreateManyMock = vi.fn()
const patientFindUniqueMock = vi.fn()
const logAuditMock      = vi.fn()

vi.mock("next/server", async importOriginal => {
  const actual = await importOriginal<typeof import("next/server")>()
  return { ...actual, after: vi.fn() }
})
vi.mock("@/lib/mobile-auth", () => ({ getAuthUser: getAuthUserMock }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    case: { findFirst: findFirstMock, findUnique: findUniqueMock, create: createMock },
    patientLink: { createMany: patientCreateManyMock, findUnique: patientFindUniqueMock },
  },
}))
vi.mock("@/lib/clinical-transaction", () => ({
  withDirectTransaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
    case: { findFirst: findFirstMock, findUnique: findUniqueMock, create: createMock },
    patientLink: { createMany: patientCreateManyMock, findUnique: patientFindUniqueMock },
  })),
}))
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }))
vi.mock("@/lib/relational-sync", () => ({ syncCaseRelationalSafe: vi.fn() }))

const MINIMAL_PREOP = {
  ageYears: 40,
  sex: "MALE",
  heightCm: 175,
  weightKg: 75,
}

function makeRequest(
  body: Record<string, unknown>,
  idempotencyKey?: string,
  extraHeaders: Record<string, string> = {},
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey
  Object.assign(headers, extraHeaders)
  return new Request("http://localhost/api/cases", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }) as Parameters<typeof POST>[0]
}

let POST: (req: never, ctx?: unknown) => Promise<Response>

describe("POST /api/cases", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    patientFindUniqueMock.mockReset()
    process.env.HOSPITAL_PATIENT_HMAC_KEY = Buffer.alloc(32, 1).toString("base64")
    process.env.HOSPITAL_PATIENT_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString("base64")
    getAuthUserMock.mockResolvedValue({ id: "user-1", role: "MEMBER", institutionId: "inst-1" })
    findFirstMock.mockResolvedValue(null) // no existing draft
    findUniqueMock.mockResolvedValue(null) // for caseCode uniqueness
    createMock.mockResolvedValue({
      id: "new-case-1",
      caseCode: "2026-0001",
      status: "DRAFT",
      preop: { updatedAt: new Date() },
    })
    patientCreateManyMock.mockResolvedValue({ count: 1 })
    patientFindUniqueMock
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: "patient-link-1", maskedIdentifier: "HO****01" })
    const mod = await import("@/app/v1/cases/route")
    POST = mod.POST
  })

  it("creates a case with status DRAFT (never COMPLETE)", async () => {
    const res = await POST(makeRequest({ preop: MINIMAL_PREOP }))
    expect(res.status).toBe(201)
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "DRAFT" }),
      }),
    )
    const body = await res.json()
    expect(body.id).toBeDefined()
  })

  it("deduplicates when X-Idempotency-Key matches existing clientDraftId", async () => {
    const existing = { id: "existing-case", caseCode: "2026-0001", preop: { updatedAt: new Date() } }
    findFirstMock.mockResolvedValue(existing)

    const res = await POST(makeRequest({ preop: MINIMAL_PREOP }, "draft-abc-123"))
    expect(res.status).toBe(200)
    expect(createMock).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.id).toBe("existing-case")
  })

  it("returns the existing case when a concurrent create wins the same clientDraftId", async () => {
    const existing = { id: "race-winner", caseCode: "2026-0002", preop: { updatedAt: new Date() } }
    findFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing)
    createMock.mockRejectedValueOnce({ code: "P2002", meta: { target: ["userId", "clientDraftId"] } })

    const res = await POST(makeRequest({ preop: MINIMAL_PREOP }, "draft-race-123"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe("race-winner")
  })

  it("creates normally when no X-Idempotency-Key is provided", async () => {
    const res = await POST(makeRequest({ preop: MINIMAL_PREOP }))
    expect(res.status).toBe(201)
    expect(createMock).toHaveBeenCalled()
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ clientDraftId: expect.anything() }),
      }),
    )
  })

  it("returns 400 when preop is missing", async () => {
    const res = await POST(makeRequest({ intraop: {} }))
    expect(res.status).toBe(400)
    expect(createMock).not.toHaveBeenCalled()
  })

  it("returns a structured permanent PII error for legacy free-text diagnosis", async () => {
    const res = await POST(makeRequest({
      preop: { ...MINIMAL_PREOP, diagnosis: "Ivan Petrov" },
    }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      code: "PII_BLOCKED",
      field: "diagnosis",
      reason: "likely_name",
      retryable: false,
      blockedKeys: ["diagnosis", "icdCode"],
    })
    expect(createMock).not.toHaveBeenCalled()
  })

  it("accepts an uppercase Bulgarian diagnosis selected from ICD-10", async () => {
    const res = await POST(makeRequest({
      preop: {
        ...MINIMAL_PREOP,
        diagnoses: [{ code: "K35", label: "ОСТЪР АПЕНДИСИТ", system: "ICD-10" }],
        diagnosis: "ОСТЪР АПЕНДИСИТ",
        icdCode: "K35",
      },
    }))

    expect(res.status).toBe(201)
    expect(createMock).toHaveBeenCalled()
  })

  it("creates the patient link and case in the same transaction without putting the number in clinical JSON", async () => {
    const patientNumber = "HOSP-PRIVATE-001"
    const res = await POST(makeRequest({ patientNumber, preop: MINIMAL_PREOP }))

    expect(res.status).toBe(201)
    expect(patientCreateManyMock).toHaveBeenCalledOnce()
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        patientLinkId: "patient-link-1",
        preop: { create: expect.not.objectContaining({ patientNumber: expect.anything() }) },
      }),
    }))
    expect(JSON.stringify(createMock.mock.calls[0])).not.toContain(patientNumber)
  })

  it("fails closed when an offline mobile draft does not match the clinician's current hospital", async () => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    const mobileHeaders = { "X-LOSPOR-Client": "mobile" }

    const missing = await POST(makeRequest(
      { patientNumber: "HOSP-001", preop: MINIMAL_PREOP },
      "draft-missing-context",
      mobileHeaders,
    ))
    expect(missing.status).toBe(409)
    await expect(missing.json()).resolves.toMatchObject({ code: "INSTITUTION_CONTEXT_CHANGED" })

    const changed = await POST(makeRequest(
      { patientNumber: "HOSP-001", preop: MINIMAL_PREOP },
      "draft-old-hospital",
      { ...mobileHeaders, "X-LOSPOR-Expected-Institution": "old-inst" },
    ))
    expect(changed.status).toBe(409)
    expect(createMock).not.toHaveBeenCalled()

    const current = await POST(makeRequest(
      { patientNumber: "HOSP-001", preop: MINIMAL_PREOP },
      "draft-current-hospital",
      { ...mobileHeaders, "X-LOSPOR-Expected-Institution": "inst-1" },
    ))
    expect(current.status).toBe(201)
  })
})
