import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))
const mocks = vi.hoisted(() => ({
  verifyCredentials: vi.fn(), rateLimit: vi.fn(), update: vi.fn(),
  signMobileToken: vi.fn(), invalidate: vi.fn(),
}))
vi.mock("@/lib/credentials", () => ({ verifyCredentials: mocks.verifyCredentials }))
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }))
vi.mock("@/lib/prisma", () => ({ prisma: { user: { update: mocks.update, findUnique: vi.fn() } } }))
vi.mock("@/lib/mobile-auth", () => ({
  AUTH_COOKIE_NAME: "lospor_session", AUTH_TOKEN_TTL_SECONDS: 28_800,
  signMobileToken: mocks.signMobileToken, getAuthUser: vi.fn(),
}))
vi.mock("@/lib/password-epoch", () => ({ invalidateAccountState: mocks.invalidate }))
vi.mock("@/lib/token-blocklist", () => ({ revokeToken: vi.fn() }))

const oldMode = process.env.LOSPOR_DEPLOYMENT_MODE
const oldAdmin = process.env.LOSPOR_ACCOUNT_ADMINISTRATION_ENABLED
afterAll(() => {
  if (oldMode === undefined) delete process.env.LOSPOR_DEPLOYMENT_MODE
  else process.env.LOSPOR_DEPLOYMENT_MODE = oldMode
  if (oldAdmin === undefined) delete process.env.LOSPOR_ACCOUNT_ADMINISTRATION_ENABLED
  else process.env.LOSPOR_ACCOUNT_ADMINISTRATION_ENABLED = oldAdmin
})

const account = {
  id: "user-1", email: null, username: "Dr.Smith", name: "Д-р Иванов",
  firstName: "Иван", lastName: "Иванов", title: "д-р", role: "MEMBER",
  institutionId: "inst-1", institution: { name: "Болница" },
  acceptedTermsAt: null, lastLoginAt: null,
  preferences: { theme: "dark", ui: { density: "compact", locale: "bg" } },
}

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.1" },
    body: JSON.stringify(body),
  })
}

describe("Hospital username login locale persistence", () => {
  beforeEach(() => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    process.env.LOSPOR_ACCOUNT_ADMINISTRATION_ENABLED = "true"
    vi.clearAllMocks()
    mocks.verifyCredentials.mockResolvedValue(account)
    mocks.rateLimit.mockResolvedValue({ allowed: true })
    mocks.update.mockResolvedValue({})
    mocks.signMobileToken.mockResolvedValue("signed-token")
  })

  it.each([
    ["browser", "/v1/auth/session"],
    ["native", "/v1/auth/token"],
  ] as const)("persists explicit English during Hospital %s login without losing other preferences", async (_kind, path) => {
    const route = path.endsWith("token")
      ? await import("@/app/v1/auth/token/route")
      : await import("@/app/v1/auth/session/route")
    const response = await route.POST(request(path, {
      username: "Dr.Smith", password: "secret", locale: "en",
    }))
    expect(response.status).toBe(200)
    expect(mocks.verifyCredentials).toHaveBeenCalledWith(
      { kind: "USERNAME", canonical: "dr.smith" }, "secret",
    )
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        preferences: { theme: "dark", ui: { density: "compact", locale: "en" } },
      }),
    }))
    expect(mocks.signMobileToken).toHaveBeenCalledWith(expect.objectContaining({ preferredLocale: "en" }))
    expect(mocks.invalidate).toHaveBeenCalledWith("user-1")
    await expect(response.json()).resolves.toMatchObject(
      path.endsWith("token") ? { preferredLocale: "en" } : { user: { preferredLocale: "en" } },
    )
  })

  it("uses stored Bulgarian when login contains no explicit language", async () => {
    const { POST } = await import("@/app/v1/auth/session/route")
    const response = await POST(request("/v1/auth/session", {
      username: "DR.SMITH", password: "secret",
    }))
    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { lastLoginAt: expect.any(Date) } }))
    expect(mocks.invalidate).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({ user: { preferredLocale: "bg" } })
  })

  it("does not issue a session when explicit locale persistence fails", async () => {
    mocks.update.mockRejectedValue(new Error("storage unavailable"))
    const { POST } = await import("@/app/v1/auth/session/route")
    await expect(POST(request("/v1/auth/session", {
      username: "Dr.Smith", password: "secret", locale: "en",
    }))).rejects.toThrow("storage unavailable")
  })
})
