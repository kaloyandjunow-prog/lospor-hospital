import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const cleanupMock = vi.fn()
const processMock = vi.fn()

vi.mock("@/lib/research/exports", () => ({
  cleanupResearchExportArtifacts: cleanupMock,
  processResearchExport: processMock,
}))

let GET: (request: Request) => Promise<Response>

describe("research export worker authorization", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    cleanupMock.mockResolvedValue({ expired: 0, abandoned: 0 })
    processMock.mockResolvedValue(null)
    ;({ GET } = await import("@/app/v1/internal/research-exports/process/route"))
  })

  afterEach(() => {
    delete process.env.RESEARCH_EXPORT_WORKER_SECRET
    delete process.env.RESEARCH_EXPORT_WORKER_SECRET_PREVIOUS
    delete process.env.CRON_SECRET
    delete process.env.CRON_SECRET_PREVIOUS
  })

  it("accepts Vercel CRON_SECRET when a separate worker secret is configured", async () => {
    process.env.RESEARCH_EXPORT_WORKER_SECRET = "w".repeat(32)
    process.env.CRON_SECRET = "c".repeat(32)

    const response = await GET(new Request("http://localhost/v1/internal/research-exports/process", {
      headers: { authorization: `Bearer ${"c".repeat(32)}` },
    }))

    expect(response.status).toBe(200)
    expect(cleanupMock).toHaveBeenCalledTimes(1)
  })

  it("accepts the dedicated worker secret", async () => {
    process.env.RESEARCH_EXPORT_WORKER_SECRET = "w".repeat(32)
    process.env.CRON_SECRET = "c".repeat(32)

    const response = await GET(new Request("http://localhost/v1/internal/research-exports/process", {
      headers: { authorization: `Bearer ${"w".repeat(32)}` },
    }))

    expect(response.status).toBe(200)
  })

  it("rejects any other secret", async () => {
    process.env.CRON_SECRET = "c".repeat(32)

    const response = await GET(new Request("http://localhost/v1/internal/research-exports/process", {
      headers: { authorization: `Bearer ${"x".repeat(32)}` },
    }))

    expect(response.status).toBe(401)
    expect(cleanupMock).not.toHaveBeenCalled()
  })

  it("accepts bounded previous credentials only while the overlap variable exists", async () => {
    process.env.RESEARCH_EXPORT_WORKER_SECRET = "w".repeat(32)
    process.env.RESEARCH_EXPORT_WORKER_SECRET_PREVIOUS = "p".repeat(32)

    const during = await GET(new Request("http://localhost/v1/internal/research-exports/process", {
      headers: { authorization: `Bearer ${"p".repeat(32)}` },
    }))
    expect(during.status).toBe(200)

    delete process.env.RESEARCH_EXPORT_WORKER_SECRET_PREVIOUS
    const retired = await GET(new Request("http://localhost/v1/internal/research-exports/process", {
      headers: { authorization: `Bearer ${"p".repeat(32)}` },
    }))
    expect(retired.status).toBe(401)
  })
})
