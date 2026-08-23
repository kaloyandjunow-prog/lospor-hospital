import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  findReset: vi.fn(),
}))

vi.mock("@/lib/hospital/deployment", () => ({ isHospitalDeployment: () => true }))
vi.mock("@/lib/hospital/account-provisioning", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/hospital/account-provisioning")>(),
  consumeHospitalAccountToken: mocks.consume,
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    passwordResetToken: { findUnique: mocks.findReset },
  },
}))
vi.mock("@/lib/password-epoch", () => ({ notePasswordChanged: vi.fn() }))

function request(token = "A".repeat(43)) {
  return new NextRequest("https://clinical.hospital.test/v1/auth/password-reset/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, password: "NewStrong1!" }),
  })
}

describe("Hospital account-link consumption route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findReset.mockResolvedValue(null)
  })

  it("accepts a consumed activation link without echoing its secret", async () => {
    mocks.consume.mockResolvedValue({
      matched: true,
      purpose: "ACTIVATION",
      userId: "user-1",
    })
    const { POST } = await import("@/app/v1/auth/password-reset/confirm/route")
    const response = await POST(request())
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ ok: true, purpose: "ACTIVATION" })
    expect(JSON.stringify(body)).not.toContain("A".repeat(43))
  })

  it("maps an expired/replayed account link to a stable public error", async () => {
    const { HospitalAccountError } = await import("@/lib/hospital/account-provisioning")
    mocks.consume.mockRejectedValue(new HospitalAccountError("INVALID_OR_EXPIRED_ACCOUNT_LINK"))
    const { POST } = await import("@/app/v1/auth/password-reset/confirm/route")
    const response = await POST(request())
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: "Invalid or expired account link",
      code: "INVALID_OR_EXPIRED_ACCOUNT_LINK",
    })
  })

  it("keeps a stale designated-operator link behind the synchronized credential boundary", async () => {
    const { HospitalAccountError } = await import("@/lib/hospital/account-provisioning")
    mocks.consume.mockRejectedValue(new HospitalAccountError("APPLIANCE_OPERATOR_MANAGED"))
    const { POST } = await import("@/app/v1/auth/password-reset/confirm/route")
    const response = await POST(request())
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: "APPLIANCE_OPERATOR_MANAGED" })
  })
})
