import { beforeEach, describe, expect, it, vi } from "vitest"

const secureStore = vi.hoisted(() => ({
  setItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}))

vi.mock("expo-secure-store", () => secureStore)
vi.mock("./local-clinical-cache", () => ({ clearLocalClinicalCache: vi.fn(async () => {}) }))

describe("auth API helpers", () => {
  beforeEach(() => {
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
    await login("doctor@example.com", "Strong1!")

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/auth/token"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "doctor@example.com", password: "Strong1!" }),
      }),
    )
    expect(secureStore.setItemAsync).toHaveBeenCalledWith("lospor_access_token", "jwt-token")
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
