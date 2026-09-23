import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  canRead: vi.fn(),
  canWrite: vi.fn(),
  generate: vi.fn(),
  review: vi.fn(),
  caseFindUnique: vi.fn(),
  suggestionFindMany: vi.fn(),
}))

vi.mock("@/lib/mobile-auth", () => ({ getAuthUser: mocks.auth }))
vi.mock("@/lib/access-control", () => ({
  canReadCase: mocks.canRead,
  canWriteCaseWithOwnerFallback: mocks.canWrite,
}))
vi.mock("@/lib/preop/suggestions", () => ({
  generatePreopSuggestions: mocks.generate,
  reviewPreopSuggestion: mocks.review,
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    case: { findUnique: mocks.caseFindUnique },
    preopAssessmentSuggestion: { findMany: mocks.suggestionFindMany },
    $transaction: (run: (tx: unknown) => unknown) => run({ case: { findUnique: mocks.caseFindUnique } }),
  },
}))

const params = Promise.resolve({ id: "case-1" })

describe("preoperative suggestion HTTP boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ id: "user-1" })
    mocks.canRead.mockReturnValue(true)
    mocks.canWrite.mockReturnValue(true)
    mocks.caseFindUnique.mockResolvedValue({
      userId: "user-1", createdById: "user-1", institutionId: "institution-1", status: "DRAFT",
      preop: { id: "preop-1" },
    })
    mocks.suggestionFindMany.mockResolvedValue([{ id: "suggestion-1" }])
    mocks.generate.mockResolvedValue({ profileVersion: 1, suggestions: [{ id: "suggestion-1" }] })
    mocks.review.mockResolvedValue({ id: "suggestion-1", status: "REJECTED" })
  })

  it("does not disclose suggestions to unauthenticated callers", async () => {
    mocks.auth.mockResolvedValue(null)
    const { GET } = await import("./route")
    const response = await GET(new NextRequest("https://api.lospor.org/v1/cases/case-1/preop-suggestions"), { params })
    expect(response.status).toBe(401)
    expect(mocks.suggestionFindMany).not.toHaveBeenCalled()
  })

  it("hides suggestions from callers without case read access", async () => {
    mocks.canRead.mockReturnValue(false)
    const { GET } = await import("./route")
    const response = await GET(new NextRequest("https://api.lospor.org/v1/cases/case-1/preop-suggestions"), { params })
    expect(response.status).toBe(404)
    expect(mocks.suggestionFindMany).not.toHaveBeenCalled()
  })

  it("requires case write access to generate suggestions", async () => {
    mocks.canWrite.mockReturnValue(false)
    const { POST } = await import("./route")
    const response = await POST(new NextRequest("https://api.lospor.org/v1/cases/case-1/preop-suggestions", { method: "POST" }), { params })
    expect(response.status).toBe(403)
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it("generates suggestions only for a writable, non-finalized case", async () => {
    const { POST } = await import("./route")
    const response = await POST(new NextRequest("https://api.lospor.org/v1/cases/case-1/preop-suggestions", { method: "POST" }), { params })
    expect(response.status).toBe(200)
    expect(mocks.generate).toHaveBeenCalledWith(expect.anything(), { caseId: "case-1", preopId: "preop-1", actorId: "user-1" })
  })
})
