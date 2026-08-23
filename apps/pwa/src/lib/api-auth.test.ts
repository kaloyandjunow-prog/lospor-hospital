import { beforeEach, describe, expect, it, vi } from "vitest"

const secureStore = vi.hoisted(() => ({
  setItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}))
const localCache = vi.hoisted(() => ({
  clearLocalClinicalCache: vi.fn(async () => ({ drafts: 0, patches: 0, intraopQueues: 0 })),
}))

vi.mock("expo-secure-store", () => secureStore)
vi.mock("./local-clinical-cache", () => localCache)

function token(payload: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}.sig`
}

describe("auth API helpers", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    global.fetch = vi.fn() as unknown as typeof fetch
  })

  it("derives the immutable local-draft owner from signed token claims", async () => {
    const { authenticatedIdentityFromToken } = await import("./api")
    expect(authenticatedIdentityFromToken(token({
      id: "user-1",
      institutionId: "hospital-1",
    }))).toEqual({ userId: "user-1", institutionId: "hospital-1" })
    expect(authenticatedIdentityFromToken(token({ id: "user-1" }))).toEqual({
      userId: "user-1",
      institutionId: null,
    })
    expect(authenticatedIdentityFromToken(token({ institutionId: "hospital-1" }))).toBeNull()
  })

  it("retains account-bound clinical work on session expiry", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Session expired" }),
    } as Response)
    const { apiFetch, onAuthExpired, setToken } = await import("./api")
    await setToken(token({ id: "user-1", institutionId: "hospital-1" }))
    const expired = vi.fn()
    onAuthExpired(expired)

    await apiFetch("/api/cases")

    expect(expired).toHaveBeenCalledOnce()
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith("lospor_access_token")
    expect(localCache.clearLocalClinicalCache).not.toHaveBeenCalled()
  })

  it("clears device-local clinical work on explicit sign-out", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 204 } as Response)
    const { logout, setToken } = await import("./api")
    await setToken(token({ id: "user-1", institutionId: "hospital-1" }))

    await logout()

    expect(localCache.clearLocalClinicalCache).toHaveBeenCalledOnce()
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith("lospor_access_token")
  })

  it("fails a queued clinical write before fetch when another account has signed in", async () => {
    const { apiFetch, setToken } = await import("./api")
    await setToken(token({ id: "user-b", institutionId: "hospital-1" }))

    await expect(apiFetch("/api/cases", {
      method: "POST",
      expectedIdentity: { userId: "user-a", institutionId: "hospital-1" },
    })).rejects.toMatchObject({ code: "LOCAL_AUTH_CONTEXT_CHANGED", status: 409 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("stores the bearer token after mobile login", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "jwt-token" }),
    } as Response)

    const { login } = await import("./api")
    await login({ loginIdentifier: "EMAIL", value: " Doctor@Example.COM " }, "Strong1!")

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/auth/token"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "doctor@example.com", password: "Strong1!" }),
      }),
    )
    expect(secureStore.setItemAsync).toHaveBeenCalledWith("lospor_access_token", "jwt-token")
  })

  it("preserves Hospital username case and sends no email fallback", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "username-jwt" }),
    } as Response)
    const { login } = await import("./api")
    await login({ loginIdentifier: "USERNAME", value: "Ivan.Petrov_2" }, "Strong1!")
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/auth/token"),
      expect.objectContaining({
        body: JSON.stringify({ username: "Ivan.Petrov_2", password: "Strong1!" }),
      }),
    )
  })

  it("requests password reset and returns the local test link when present", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, devResetUrl: "http://localhost:3000/reset-password?token=test" }),
    } as Response)

    const { requestPasswordReset } = await import("./api")
    const result = await requestPasswordReset("doctor@example.com")

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/auth/password-reset/request"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "doctor@example.com" }),
      }),
    )
    expect(result).toEqual({ ok: true, devResetUrl: "http://localhost:3000/reset-password?token=test" })
  })

  it("registers an account and returns verification state", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: "user-1", email: "doctor@example.com", verificationRequired: true, pending: false }),
    } as Response)

    const { registerAccount } = await import("./api")
    const result = await registerAccount({
      firstName: "Test",
      lastName: "Doctor",
      title: "Dr",
      email: "doctor@example.com",
      password: "Strong1!",
      acceptedTerms: true,
    })

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/auth/register"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          firstName: "Test",
          lastName: "Doctor",
          title: "Dr",
          email: "doctor@example.com",
          password: "Strong1!",
          acceptedTerms: true,
        }),
      }),
    )
    expect(result).toMatchObject({ verificationRequired: true, pending: false })
  })

  it("confirms password reset with token and password", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response)

    const { confirmPasswordReset } = await import("./api")
    await confirmPasswordReset("reset-token", "NewStrong1!")

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/auth/password-reset/confirm"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "reset-token", password: "NewStrong1!" }),
      }),
    )
  })
})
