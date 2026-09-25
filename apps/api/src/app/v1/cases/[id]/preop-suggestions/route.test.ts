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
  },
}))
// Suggestion writes take the case lock, like every other clinical write.
vi.mock("@/lib/clinical-transaction", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/clinical-transaction")>(),
  withLockedCaseTransaction: (_caseId: string, run: (tx: unknown) => unknown) =>
    run({ case: { findUnique: mocks.caseFindUnique } }),
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
  it("returns current persisted suggestions for an authorized reader", async () => {
    const { GET } = await import("./route")
    const response = await GET(new NextRequest("https://api.lospor.org/v1/cases/case-1/preop-suggestions"), { params })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([{ id: "suggestion-1" }])
    expect(mocks.suggestionFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { preopId: "preop-1" },
      orderBy: { createdAt: "desc" },
    }))
  })

  it("reviews a suggestion only through a writable, non-finalized case", async () => {
    const { PATCH } = await import("./[suggestionId]/route")
    const response = await PATCH(new NextRequest("https://api.lospor.org/v1/cases/case-1/preop-suggestions/suggestion-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "ACCEPTED" }),
    }), { params: Promise.resolve({ id: "case-1", suggestionId: "suggestion-1" }) })
    expect(response.status).toBe(200)
    expect(mocks.review).toHaveBeenCalledWith(expect.anything(), {
      caseId: "case-1",
      suggestionId: "suggestion-1",
      reviewerId: "user-1",
      status: "ACCEPTED",
    })
  })

  it("rejects invalid review states and does not mutate suggestions", async () => {
    const { PATCH } = await import("./[suggestionId]/route")
    const response = await PATCH(new NextRequest("https://api.lospor.org/v1/cases/case-1/preop-suggestions/suggestion-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "MAYBE" }),
    }), { params: Promise.resolve({ id: "case-1", suggestionId: "suggestion-1" }) })
    expect(response.status).toBe(400)
    expect(mocks.review).not.toHaveBeenCalled()
  })

  it("does not permit suggestion review on a finalized case", async () => {
    mocks.caseFindUnique.mockResolvedValueOnce({
      userId: "user-1", createdById: "user-1", institutionId: "institution-1", status: "COMPLETE",
    })
    const { PATCH } = await import("./[suggestionId]/route")
    const response = await PATCH(new NextRequest("https://api.lospor.org/v1/cases/case-1/preop-suggestions/suggestion-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "REJECTED" }),
    }), { params: Promise.resolve({ id: "case-1", suggestionId: "suggestion-1" }) })
    expect(response.status).toBe(403)
    expect(mocks.review).not.toHaveBeenCalled()
  })

  it("maps a missing suggestion to not found", async () => {
    mocks.review.mockRejectedValueOnce(new Error("PREOP_SUGGESTION_NOT_FOUND"))
    const { PATCH } = await import("./[suggestionId]/route")
    const response = await PATCH(new NextRequest("https://api.lospor.org/v1/cases/case-1/preop-suggestions/missing", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "REJECTED" }),
    }), { params: Promise.resolve({ id: "case-1", suggestionId: "missing" }) })
    expect(response.status).toBe(404)
  })
})
