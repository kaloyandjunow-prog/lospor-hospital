import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
}))

vi.mock("@/lib/mobile-auth", () => ({ getAuthUser: mocks.getAuthUser }))

function request(path: string) {
  return new NextRequest(`https://clinical.hospital.test${path}`, {
    headers: {
      origin: "https://clinical.hospital.test",
      host: "clinical.hospital.test",
    },
  })
}

describe("Hospital research-only route boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
  })

  it("blocks a research-only compatibility account from clinical APIs", async () => {
    mocks.getAuthUser.mockResolvedValue({ id: "research-1", role: "RESEARCHER" })
    const { default: proxy } = await import("./proxy")
    const response = await proxy(request("/v1/cases"))
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: "CLINICAL_APP_FORBIDDEN" })
  })

  it("allows the same account to authenticate and use research APIs", async () => {
    mocks.getAuthUser.mockResolvedValue({ id: "research-1", role: "RESEARCHER" })
    const { default: proxy } = await import("./proxy")
    expect((await proxy(request("/v1/research/query"))).status).not.toBe(403)
    expect((await proxy(request("/v1/auth/session"))).status).not.toBe(403)
  })

  it("does not apply the Hospital overlay to the public deployment", async () => {
    delete process.env.LOSPOR_DEPLOYMENT_MODE
    mocks.getAuthUser.mockResolvedValue({ id: "research-1", role: "RESEARCHER" })
    const { default: proxy } = await import("./proxy")
    expect((await proxy(request("/v1/cases"))).status).not.toBe(403)
    expect(mocks.getAuthUser).not.toHaveBeenCalled()
  })
})
