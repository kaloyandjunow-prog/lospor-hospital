import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  snapshot: vi.fn(),
}))

vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }))
vi.mock("@/lib/hospital/appliance-status-snapshot", () => ({
  applianceStatusSnapshot: mocks.snapshot,
}))

describe("private appliance status snapshot route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    process.env.HOSPITAL_STATUS_SNAPSHOT_TOKEN_FILE = "/run/secrets/status-snapshot-token"
    mocks.readFile.mockResolvedValue("snapshot-token-that-is-long-enough\n")
    mocks.snapshot.mockResolvedValue({ schemaVersion: 1, generatedAt: "2026-08-12T00:00:00.000Z" })
  })

  it("is unavailable rather than failing open when its token file is absent", async () => {
    mocks.readFile.mockRejectedValue(new Error("missing"))
    const { GET } = await import("@/app/internal/appliance-status/route")
    const response = await GET(new Request("http://api/internal/appliance-status"))
    expect(response.status).toBe(503)
    expect(mocks.snapshot).not.toHaveBeenCalled()
  })

  it("rejects a wrong bearer token", async () => {
    const { GET } = await import("@/app/internal/appliance-status/route")
    const response = await GET(new Request("http://api/internal/appliance-status", {
      headers: { authorization: "Bearer wrong-token-that-is-long-enough" },
    }))
    expect(response.status).toBe(401)
    expect(mocks.snapshot).not.toHaveBeenCalled()
  })

  it("returns the safe snapshot with no-store caching", async () => {
    const { GET } = await import("@/app/internal/appliance-status/route")
    const response = await GET(new Request("http://api/internal/appliance-status", {
      headers: { authorization: "Bearer snapshot-token-that-is-long-enough" },
    }))
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(mocks.snapshot).toHaveBeenCalledWith("snapshot-token-that-is-long-enough")
    expect(await response.json()).toEqual({
      schemaVersion: 1,
      generatedAt: "2026-08-12T00:00:00.000Z",
    })
  })

  it("binds the identity proof to the exact previous token during overlap", async () => {
    mocks.readFile.mockImplementation(async (path: string) =>
      path.endsWith(".previous") ? "previous-snapshot-token-long-enough\n" : "current-snapshot-token-long-enough\n")
    const { GET } = await import("@/app/internal/appliance-status/route")
    const response = await GET(new Request("http://api/internal/appliance-status", {
      headers: { authorization: "Bearer previous-snapshot-token-long-enough" },
    }))
    expect(response.status).toBe(200)
    expect(mocks.snapshot).toHaveBeenCalledWith("previous-snapshot-token-long-enough")
  })
})
