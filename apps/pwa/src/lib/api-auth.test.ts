import { beforeEach, describe, expect, it, vi } from "vitest"
import { Platform } from "react-native"

const secureStore = vi.hoisted(() => ({
  setItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}))

vi.mock("expo-secure-store", () => secureStore)
vi.mock("./local-clinical-cache", () => ({ clearLocalClinicalCache: vi.fn(async () => {}) }))

describe("auth API helpers", () => {
  beforeEach(() => {
    ;(Platform as { OS: string }).OS = "ios"
    vi.resetModules()
    vi.clearAllMocks()
    global.fetch = vi.fn() as unknown as typeof fetch
  })

  it("stores the bearer token after mobile login", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "jwt-token" }),
    } as Response)

    const { login } = await import("./api")
    await login({ loginIdentifier: "EMAIL", value: " Doctor@Example.COM " }, "Strong1!", "bg")

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/auth/token"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "doctor@example.com", password: "Strong1!", locale: "bg" }),
      }),
    )
    expect(secureStore.setItemAsync).toHaveBeenCalledWith("lospor_access_token", "jwt-token")
  })

  it("posts a case-preserved username and never an email fallback on native", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "jwt-token" }),
    } as Response)

    const { login } = await import("./api")
    await login({ loginIdentifier: "USERNAME", value: "Ivan.Petrov" }, "Strong1!", "en")

    const request = vi.mocked(fetch).mock.calls[0]?.[1]
    expect(JSON.parse(String(request?.body))).toEqual({
      username: "Ivan.Petrov",
      password: "Strong1!",
      locale: "en",
    })
    expect(JSON.parse(String(request?.body))).not.toHaveProperty("email")
  })

  it("returns a validated administrator MFA challenge without creating a session", async () => {
    const challengeToken = "a".repeat(43)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({
        code: "MFA_REQUIRED",
        mfa: {
          challengeToken,
          expiresIn: 300,
          enrollmentRequired: false,
        },
      }),
    } as Response)

    const { login } = await import("./api")
    await expect(login({ loginIdentifier: "EMAIL", value: "admin@example.com" }, "Strong1!", "bg"))
      .resolves.toEqual({
        kind: "mfa",
        challenge: expect.objectContaining({
          code: "MFA_REQUIRED",
          challengeToken,
          enrollmentRequired: false,
        }),
      })
    expect(secureStore.setItemAsync).not.toHaveBeenCalled()
  })

  it("rejects a malformed administrator MFA challenge", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({
        code: "MFA_REQUIRED",
        mfa: { challengeToken: "short", expiresIn: 300, enrollmentRequired: false },
      }),
    } as Response)

    const { login } = await import("./api")
    await expect(login({ loginIdentifier: "EMAIL", value: "admin@example.com" }, "Strong1!", "bg"))
      .rejects.toMatchObject({ code: "AUTH_RESPONSE_INVALID", status: 502 })
    expect(secureStore.setItemAsync).not.toHaveBeenCalled()
  })

  it("stores a native administrator token only after a complete MFA response validates", async () => {
    const recoveryCodes = Array.from({ length: 10 }, (_, index) => `A${index}23-4567-A234-567A`)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "admin-jwt",
        token_type: "Bearer",
        expires_in: 28_800,
        recoveryCodes,
      }),
    } as Response)

    const { completeAdministratorMfa } = await import("./api")
    const result = await completeAdministratorMfa({
      code: "MFA_ENROLLMENT_REQUIRED",
      challengeToken: "a".repeat(43),
      expiresIn: 300,
      expiresAt: Date.now() + 300_000,
      enrollmentRequired: true,
      manualKey: "A234567A234567A234567A234567A234",
    }, "123456")

    expect(result).toEqual({ accessToken: "admin-jwt", recoveryCodes })
    expect(secureStore.setItemAsync).toHaveBeenCalledWith("lospor_access_token", "admin-jwt")
  })

  it("completes PWA administrator MFA with its HttpOnly cookie and no bearer storage", async () => {
    ;(Platform as { OS: string }).OS = "web"
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: { id: "admin-1" } }),
    } as Response)

    const { completeAdministratorMfa } = await import("./api")
    await expect(completeAdministratorMfa({
      code: "MFA_REQUIRED",
      challengeToken: "a".repeat(43),
      expiresIn: 300,
      expiresAt: Date.now() + 300_000,
      enrollmentRequired: false,
    }, "123456")).resolves.toEqual({})

    expect(fetch).toHaveBeenCalledWith(
      "/v1/auth/mfa/login",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: expect.objectContaining({ "X-LOSPOR-Client": "pwa" }),
      }),
    )
    expect(secureStore.setItemAsync).not.toHaveBeenCalled()
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
      institutionId: "institution-1",
      locale: "bg",
      legalAcceptances: [
        { deployment: "CLOUD_DEMO", kind: "TERMS", version: "1.2.0", effectiveDate: "2026-08-22", locale: "bg", contentSha256: "a".repeat(64) },
        { deployment: "CLOUD_DEMO", kind: "PRIVACY", version: "1.2.0", effectiveDate: "2026-08-22", locale: "bg", contentSha256: "b".repeat(64) },
      ],
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
          institutionId: "institution-1",
          locale: "bg",
          legalAcceptances: [
            { deployment: "CLOUD_DEMO", kind: "TERMS", version: "1.2.0", effectiveDate: "2026-08-22", locale: "bg", contentSha256: "a".repeat(64) },
            { deployment: "CLOUD_DEMO", kind: "PRIVACY", version: "1.2.0", effectiveDate: "2026-08-22", locale: "bg", contentSha256: "b".repeat(64) },
          ],
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

  it("uses an HttpOnly cookie session and stores no bearer token on PWA Web", async () => {
    ;(Platform as { OS: string }).OS = "web"
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: "user-1" } }),
    } as Response)

    const { login } = await import("./api")
    await login({ loginIdentifier: "EMAIL", value: "doctor@example.com" }, "Strong1!", "bg")

    expect(fetch).toHaveBeenCalledWith(
      "/v1/auth/session",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: expect.objectContaining({
          "X-LOSPOR-Client": "pwa",
          "X-LOSPOR-Client-Version": expect.any(String),
        }),
        body: JSON.stringify({ email: "doctor@example.com", password: "Strong1!", locale: "bg" }),
      }),
    )
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith("lospor_access_token")
    expect(secureStore.setItemAsync).not.toHaveBeenCalled()
  })

  it("posts only a case-preserved username on PWA Web", async () => {
    ;(Platform as { OS: string }).OS = "web"
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: "user-1" } }),
    } as Response)

    const { login } = await import("./api")
    await login({ loginIdentifier: "USERNAME", value: "Ivan.Petrov" }, "Strong1!", "bg")

    expect(fetch).toHaveBeenCalledWith(
      "/v1/auth/session",
      expect.objectContaining({
        credentials: "same-origin",
        body: JSON.stringify({ username: "Ivan.Petrov", password: "Strong1!", locale: "bg" }),
      }),
    )
    const request = vi.mocked(fetch).mock.calls[0]?.[1]
    expect(JSON.parse(String(request?.body))).not.toHaveProperty("email")
  })

  it("sends PWA requests with cookies and never an Authorization header", async () => {
    ;(Platform as { OS: string }).OS = "web"
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)

    const { apiFetch } = await import("./api")
    await apiFetch("/api/cases")

    expect(fetch).toHaveBeenCalledWith(
      "/v1/cases",
      expect.objectContaining({
        credentials: "same-origin",
        headers: expect.not.objectContaining({ Authorization: expect.anything() }),
      }),
    )
  })

  it("keeps the PWA authenticated when server-side sign-out cannot be confirmed", async () => {
    ;(Platform as { OS: string }).OS = "web"
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503 } as Response)

    const { logout } = await import("./api")
    await expect(logout()).rejects.toMatchObject({ code: "LOGOUT_FAILED", status: 503 })
    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled()
  })

  it("checks the authoritative cookie session when the PWA starts", async () => {
    ;(Platform as { OS: string }).OS = "web"
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: "account-1" } }),
    } as Response)

    const { hasAuthenticatedSession } = await import("./api")
    await expect(hasAuthenticatedSession()).resolves.toBe(true)
    expect(fetch).toHaveBeenCalledWith(
      "/v1/auth/session",
      expect.objectContaining({ method: "GET", credentials: "same-origin" }),
    )
  })

  it("does not authenticate the PWA when a route fallback returns HTML with HTTP 200", async () => {
    ;(Platform as { OS: string }).OS = "web"
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => { throw new SyntaxError("Unexpected token '<'") },
    } as unknown as Response)

    const { hasAuthenticatedSession } = await import("./api")
    await expect(hasAuthenticatedSession()).resolves.toBe(false)
  })

  it("does not authenticate the PWA when the session response has no user identity", async () => {
    ;(Platform as { OS: string }).OS = "web"
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ user: null }),
    } as Response)

    const { hasAuthenticatedSession } = await import("./api")
    await expect(hasAuthenticatedSession()).resolves.toBe(false)
  })

  it("preserves the stable clinical-app-forbidden error code", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        code: "CLINICAL_APP_FORBIDDEN",
        error: "Research-only account",
      }),
    } as Response)

    const { login } = await import("./api")
    await expect(login({ loginIdentifier: "EMAIL", value: "research@example.com" }, "Strong1!", "bg"))
      .rejects.toMatchObject({
        name: "ApiError",
        status: 403,
        code: "CLINICAL_APP_FORBIDDEN",
      })
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith("lospor_access_token")
    expect(secureStore.setItemAsync).not.toHaveBeenCalled()
  })

  it("rejects a malformed successful login without storing a session", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as Response)

    const { login } = await import("./api")
    await expect(login({ loginIdentifier: "EMAIL", value: "doctor@example.com" }, "Strong1!", "bg"))
      .rejects.toMatchObject({ code: "AUTH_RESPONSE_INVALID" })
    expect(secureStore.setItemAsync).not.toHaveBeenCalled()
  })

  it("clears the local token when server-side logout is offline", async () => {
    secureStore.getItemAsync.mockResolvedValue("jwt-token")
    vi.mocked(fetch).mockRejectedValue(new Error("offline"))

    const { logout } = await import("./api")
    await expect(logout()).resolves.toBeUndefined()
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith("lospor_access_token")
  })
})
