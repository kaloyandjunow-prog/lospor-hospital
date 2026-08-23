import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
}))

vi.mock("@/lib/mobile-auth", () => ({ getAuthUser: mocks.auth }))
vi.mock("@/lib/hospital/deployment", () => ({ isHospitalDeployment: () => true }))
vi.mock("@/lib/prisma", () => ({
  prisma: { case: { count: mocks.count, findMany: mocks.findMany } },
}))

const request = (page?: string) => new Request(
  `http://localhost/v1/hospital/central-cases${page === undefined ? "" : `?page=${page}`}`,
) as never

const record = {
  id: "case-private-route-key",
  finalizedAt: new Date("2026-08-23T10:00:00.000Z"),
  centralExportControl: null,
  centralExportCheckpoint: { lastAction: "UPSERT", acceptedAt: new Date("2026-08-23T10:05:00.000Z") },
  centralExportRejection: null,
  centralDeliveryCases: [],
}

describe("Hospital Central case discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({
      id: "member-1",
      role: "MEMBER",
      accountKind: "CLINICAL",
      institutionId: "inst-1",
    })
    mocks.count.mockResolvedValue(1)
    mocks.findMany.mockResolvedValue([record])
  })

  it("lists a Member's immutable creator scope without clinical or identity fields", async () => {
    const { GET } = await import("./route")
    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        createdById: "member-1",
        status: "COMPLETE",
        finalizedAt: { not: null },
      },
      skip: 0,
      take: 20,
    }))
    const body = await response.json()
    expect(body).toMatchObject({
      schemaVersion: 1,
      page: 0,
      pageSize: 20,
      total: 1,
      cases: [{
        caseId: "case-private-route-key",
        finalizedAt: "2026-08-23T10:00:00.000Z",
        control: { schemaVersion: 2, state: "ACCEPTED" },
      }],
    })
    expect(JSON.stringify(body)).not.toMatch(/patient|caseCode|assignee|createdBy|batchId|pseudonym|reasonNote/i)
  })

  it("keeps HOD discovery institution-scoped and Admin discovery authority-wide", async () => {
    const { GET } = await import("./route")
    mocks.auth.mockResolvedValue({
      id: "hod-1", role: "HEAD_OF_DEPT", accountKind: "CLINICAL", institutionId: "inst-1",
    })
    await GET(request("2"))
    expect(mocks.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ institutionId: "inst-1" }),
      skip: 40,
    }))

    mocks.auth.mockResolvedValue({
      id: "admin-1", role: "ADMIN", accountKind: "CLINICAL", institutionId: null,
    })
    await GET(request())
    expect(mocks.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { status: "COMPLETE", finalizedAt: { not: null } },
    }))
  })

  it("refuses research-only accounts, unaffiliated HODs, and malformed pages", async () => {
    const { GET } = await import("./route")
    mocks.auth.mockResolvedValue({
      id: "research-1", role: "MEMBER", accountKind: "RESEARCH_ONLY", institutionId: "inst-1",
    })
    expect((await GET(request())).status).toBe(403)

    mocks.auth.mockResolvedValue({
      id: "hod-1", role: "HEAD_OF_DEPT", accountKind: "CLINICAL", institutionId: null,
    })
    expect((await GET(request())).status).toBe(403)

    mocks.auth.mockResolvedValue({
      id: "member-1", role: "MEMBER", accountKind: "CLINICAL", institutionId: "inst-1",
    })
    expect((await GET(request("-1"))).status).toBe(400)
    expect((await GET(request("100001"))).status).toBe(400)
    expect(mocks.findMany).not.toHaveBeenCalled()
  })
})
