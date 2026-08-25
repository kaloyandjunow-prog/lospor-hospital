import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  read: vi.fn(),
  findCase: vi.fn(),
  upsert: vi.fn(),
  audit: vi.fn(),
  executeRaw: vi.fn(),
  lockCase: vi.fn(),
}))

vi.mock("@/lib/mobile-auth", () => ({ getAuthUser: mocks.getAuthUser }))
vi.mock("@/lib/hospital/deployment", () => ({ isHospitalDeployment: () => true }))
vi.mock("@/lib/prisma", () => ({ prisma: { marker: "main-db" } }))
vi.mock("@/lib/audit", () => ({ logAuditInTransaction: mocks.audit }))
vi.mock("@/lib/hospital/case-central-export", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hospital/case-central-export")>(
    "@/lib/hospital/case-central-export",
  )
  return { ...actual, readCaseCentralExport: mocks.read }
})
vi.mock("@/lib/clinical-transaction", () => {
  class CaseWriteError extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
      message: string,
    ) {
      super(message)
    }
  }
  const tx = {
    case: { findFirst: mocks.findCase },
    caseCentralExportControl: { upsert: mocks.upsert },
    $executeRaw: mocks.executeRaw,
  }
  return {
    CaseWriteError,
    lockCaseForUpdate: mocks.lockCase,
    withDirectTransaction: (run: (transaction: typeof tx) => unknown) => run(tx),
  }
})

const context = { params: Promise.resolve({ id: "case-1" }) }
const request = (method: "GET" | "PUT", body?: unknown) => new Request(
  "http://localhost/v1/hospital/cases/case-1/export-control",
  {
    method,
    ...(body === undefined ? {} : {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  },
)

const currentRecord = {
  centralExportControl: {
    decision: "WITHDRAW_REQUESTED" as const,
    decidedAt: new Date("2026-08-23T10:00:00.000Z"),
  },
  centralExportCheckpoint: {
    lastAction: "UPSERT",
    acceptedAt: new Date("2026-08-23T09:00:00.000Z"),
  },
  centralExportRejection: null,
  centralDeliveryCases: [],
}

describe("Hospital per-case Central control", () => {
  let route: typeof import("./route")

  beforeEach(async () => {
    vi.clearAllMocks()
    mocks.getAuthUser.mockResolvedValue({
      id: "hod-1", role: "HEAD_OF_DEPT", accountKind: "CLINICAL", institutionId: "inst-1",
    })
    mocks.read.mockResolvedValue({
      schemaVersion: 2, state: "NEVER_EXPORTED",
      decidedAt: null, lastBatch: null, canWithdraw: false, canResend: false,
    })
    mocks.findCase
      .mockResolvedValueOnce({
        id: "case-1",
        centralExportControl: { decision: "DEFAULT" },
        centralExportCheckpoint: { lastAction: "UPSERT" },
        centralDeliveryCases: [],
      })
      .mockResolvedValueOnce(currentRecord)
    mocks.executeRaw.mockResolvedValue(1)
    mocks.lockCase.mockResolvedValue(true)
    mocks.upsert.mockResolvedValue({ decision: "EXCLUDE", reasonCode: null })
    route = await import("./route")
  })

  it("gives an HOD only the institution-scoped safe read model", async () => {
    const response = await route.GET(request("GET"), context)
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(mocks.read).toHaveBeenCalledWith(
      expect.anything(),
      { id: "case-1", institutionId: "inst-1" },
    )
    expect(await response.json()).toMatchObject({ schemaVersion: 2, state: "NEVER_EXPORTED" })
  })

  it("allows an appliance administrator without a department to read a case", async () => {
    mocks.getAuthUser.mockResolvedValue({ id: "admin-1", role: "ADMIN", accountKind: "CLINICAL", institutionId: null })
    const response = await route.GET(request("GET"), context)
    expect(response.status).toBe(200)
    expect(mocks.read).toHaveBeenCalledWith(expect.anything(), { id: "case-1" })
  })

  it("gives a Member control only over the finalization that still stands", async () => {
    mocks.getAuthUser.mockResolvedValue({
      id: "member-1", role: "MEMBER", accountKind: "CLINICAL", institutionId: "inst-1",
    })
    expect((await route.GET(request("GET"), context)).status).toBe(200)
    expect(mocks.read).toHaveBeenCalledWith(
      expect.anything(),
      {
        id: "case-1",
        finalizations: {
          some: { finalizedById: "member-1", supersededBy: { is: null } },
        },
      },
    )
  })

  it("tells a Member who did not finalize the case nothing about it", async () => {
    mocks.getAuthUser.mockResolvedValue({
      id: "transferred-creator", role: "MEMBER", accountKind: "CLINICAL", institutionId: "inst-1",
    })
    // The creator scope is gone, so their scope selects no row and the route
    // answers exactly as it would for a case that does not exist.
    mocks.read.mockResolvedValue(null)
    const response = await route.GET(request("GET"), context)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: "Not found" })

    mocks.findCase.mockReset()
    mocks.findCase.mockResolvedValue(null)
    const write = await route.PUT(request("PUT", { action: "WITHDRAW" }), context)
    expect(write.status).toBe(404)
    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it("keeps research-only accounts and unaffiliated HODs outside the route", async () => {
    mocks.getAuthUser.mockResolvedValue({
      id: "research-1", role: "MEMBER", accountKind: "RESEARCH_ONLY", institutionId: "inst-1",
    })
    expect((await route.GET(request("GET"), context)).status).toBe(403)
    mocks.getAuthUser.mockResolvedValue({
      id: "hod-1", role: "HEAD_OF_DEPT", accountKind: "CLINICAL", institutionId: null,
    })
    expect((await route.GET(request("GET"), context)).status).toBe(403)
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it("commits a withdrawal and bounded audit evidence in the same transaction", async () => {
    const response = await route.PUT(request("PUT", {
      action: "WITHDRAW",
      reasonNote: "must never enter audit or the response",
    }), context)
    expect(response.status).toBe(200)
    expect(mocks.upsert).toHaveBeenCalledOnce()
    expect(mocks.audit).toHaveBeenCalledOnce()
    expect(mocks.audit.mock.calls[0].slice(1)).toEqual([
      "hod-1",
      "CASE_CENTRAL_DELIVERY_ACTION",
      "case-1",
      { action: "WITHDRAW", reasonNoteRecorded: true },
    ])
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("must never enter")
    const serialized = JSON.stringify(await response.json())
    expect(serialized).not.toContain("must never enter")
  })

  it("refuses withdrawal before acceptance and resend before withdrawal", async () => {
    mocks.findCase.mockReset()
    mocks.findCase.mockResolvedValue({
      id: "case-1",
      centralExportControl: { decision: "DEFAULT" },
      centralExportCheckpoint: null,
      centralDeliveryCases: [],
    })
    let response = await route.PUT(request("PUT", { action: "WITHDRAW" }), context)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: "CENTRAL_CASE_NOT_EXPORTED" })

    mocks.findCase.mockResolvedValue({
      id: "case-1",
      centralExportControl: { decision: "DEFAULT" },
      centralExportCheckpoint: { lastAction: "UPSERT" },
      centralDeliveryCases: [],
    })
    response = await route.PUT(request("PUT", { action: "RESEND" }), context)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: "CENTRAL_CASE_NOT_WITHDRAWN" })
    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it("resends only a withdrawn case by restoring automatic delivery", async () => {
    mocks.findCase.mockReset()
    mocks.findCase
      .mockResolvedValueOnce({
        id: "case-1",
        centralExportControl: { decision: "WITHDRAWN" },
        centralExportCheckpoint: { lastAction: "WITHDRAW" },
        centralDeliveryCases: [],
      })
      .mockResolvedValueOnce({
        ...currentRecord,
        centralExportControl: {
          decision: "DEFAULT",
          decidedAt: new Date("2026-08-23T11:00:00.000Z"),
        },
      })
    const response = await route.PUT(request("PUT", { action: "RESEND" }), context)
    expect(response.status).toBe(200)
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ decision: "DEFAULT", reasonCode: "CLINICIAN_RESEND" }),
      update: expect.objectContaining({ decision: "DEFAULT", reasonCode: "CLINICIAN_RESEND" }),
    }))
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(), "hod-1", "CASE_CENTRAL_DELIVERY_ACTION", "case-1",
      { action: "RESEND", reasonNoteRecorded: false },
    )
  })

  it("rejects undeclared request fields instead of accepting an ambiguous control", async () => {
    const response = await route.PUT(request("PUT", {
      action: "RESEND", unexpected: "patient-identifier",
    }), context)
    expect(response.status).toBe(400)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it("cannot falsely exclude or withdraw a case already reserved for delivery", async () => {
    mocks.findCase.mockReset()
    mocks.findCase.mockResolvedValue({
      id: "case-1",
      centralExportControl: { decision: "DEFAULT" },
      centralExportCheckpoint: null,
      centralDeliveryCases: [{ batchId: "private-batch-id" }],
    })
    const response = await route.PUT(request("PUT", { action: "WITHDRAW" }), context)
    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body).toMatchObject({ code: "CENTRAL_CASE_DELIVERY_IN_PROGRESS" })
    expect(JSON.stringify(body)).not.toContain("private-batch-id")
    expect(mocks.executeRaw).toHaveBeenCalledBefore(mocks.findCase)
    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
  })
})
