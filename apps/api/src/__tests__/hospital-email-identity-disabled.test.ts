import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const passwordResetCreate = vi.fn()
const verificationCreate = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    passwordResetToken: { create: passwordResetCreate },
    emailVerificationToken: { create: verificationCreate },
  },
}))
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true })),
}))

describe("Hospital contact email boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Matches the real deployment-configuration inputs authenticationDeploymentMode()
    // reads -- this is the boundary publicEmailAuthenticationRefusal() enforces.
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    process.env.LOSPOR_ACCOUNT_ADMINISTRATION_ENABLED = "true"
  })

  afterEach(() => {
    delete process.env.LOSPOR_DEPLOYMENT_MODE
    delete process.env.LOSPOR_ACCOUNT_ADMINISTRATION_ENABLED
  })

  it("does not offer email password recovery", async () => {
    const { POST } = await import("@/app/v1/auth/password-reset/request/route")
    const response = await POST(new Request("http://localhost/v1/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify({ email: "contact@example.test" }),
    }) as never)
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: "EMAIL_AUTH_DISABLED_BY_DEPLOYMENT" })
    expect(passwordResetCreate).not.toHaveBeenCalled()
  })

  it("does not turn a contact address into an email-verification identity", async () => {
    const { POST } = await import("@/app/v1/auth/verify-email/resend/route")
    const response = await POST(new Request("http://localhost/v1/auth/verify-email/resend", {
      method: "POST",
      body: JSON.stringify({ email: "contact@example.test" }),
    }) as never)
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: "EMAIL_AUTH_DISABLED_BY_DEPLOYMENT" })
    expect(verificationCreate).not.toHaveBeenCalled()
  })
})
