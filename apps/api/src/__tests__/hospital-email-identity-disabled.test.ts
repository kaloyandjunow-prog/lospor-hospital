import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const hospital = vi.fn(() => true)
const passwordResetCreate = vi.fn()
const verificationCreate = vi.fn()

vi.mock("@/lib/hospital/deployment", () => ({ isHospitalDeployment: hospital }))
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
    hospital.mockReturnValue(true)
  })

  it("does not offer email password recovery", async () => {
    const { POST } = await import("@/app/v1/auth/password-reset/request/route")
    const response = await POST(new Request("http://localhost/v1/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify({ email: "contact@example.test" }),
    }) as never)
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: "HOSPITAL_LOCAL_RECOVERY_REQUIRED" })
    expect(passwordResetCreate).not.toHaveBeenCalled()
  })

  it("does not turn a contact address into an email-verification identity", async () => {
    const { POST } = await import("@/app/v1/auth/verify-email/resend/route")
    const response = await POST(new Request("http://localhost/v1/auth/verify-email/resend", {
      method: "POST",
      body: JSON.stringify({ email: "contact@example.test" }),
    }) as never)
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: "HOSPITAL_EMAIL_IDENTITY_DISABLED" })
    expect(verificationCreate).not.toHaveBeenCalled()
  })
})
