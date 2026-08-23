import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  count: vi.fn(),
  findLogs: vi.fn(),
  findUsers: vi.fn(),
}))

vi.mock("@/lib/mobile-auth", () => ({ getAuthUser: mocks.getAuthUser }))
vi.mock("@/lib/access-control", () => ({
  requireRole: (user: { role?: string } | null, roles: string[]) => Boolean(user?.role && roles.includes(user.role)),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { count: mocks.count, findMany: mocks.findLogs },
    user: { findMany: mocks.findUsers },
  },
}))

describe("administrator audit endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAuthUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" })
    mocks.count.mockResolvedValue(1)
    mocks.findLogs.mockResolvedValue([{
      id: "audit-1",
      userId: "deleted-user-id",
      action: "HOSPITAL_ACCOUNT_CREATED",
      entityId: "private-entity-id",
      detail: { patientNumber: "private-patient-number", reason: "private free text" },
      createdAt: new Date("2026-08-23T12:00:00.000Z"),
    }])
    mocks.findUsers.mockResolvedValue([])
  })

  it("returns the bilingual filter catalog but never republishes raw audit detail or entity IDs", async () => {
    const { GET } = await import("./route")
    const response = await GET(new NextRequest("http://localhost/v1/admin/audit-logs?page=0"))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.schemaVersion).toBe(1)
    expect(body.actions.length).toBeGreaterThanOrEqual(70)
    expect(body.actions[0]).toMatchObject({ labels: { bg: expect.any(String), en: expect.any(String) } })
    expect(body.logs[0]).toMatchObject({ action: "HOSPITAL_ACCOUNT_CREATED", user: { name: null } })
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain("private-patient-number")
    expect(serialized).not.toContain("private free text")
    expect(serialized).not.toContain("private-entity-id")
    expect(serialized).not.toContain("deleted-user-id")
  })

  it("rejects unregistered action filters before querying the database", async () => {
    const { GET } = await import("./route")
    const response = await GET(new NextRequest(
      "http://localhost/v1/admin/audit-logs?action=MADE_UP_ACTION",
    ))
    expect(response.status).toBe(400)
    expect(mocks.findLogs).not.toHaveBeenCalled()
  })

  it("keeps the endpoint administrator-only", async () => {
    mocks.getAuthUser.mockResolvedValue({ id: "member-1", role: "MEMBER" })
    const { GET } = await import("./route")
    const response = await GET(new NextRequest("http://localhost/v1/admin/audit-logs"))
    expect(response.status).toBe(403)
    expect(mocks.findLogs).not.toHaveBeenCalled()
  })
})
