import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/hospital/ai-boundary", () => ({ clinicalAiCapabilities: vi.fn(async () => ({})) }))
vi.mock("@/lib/hospital/clinical-baseline-readiness", () => ({
  assessSelectedHospitalClinicalBaseline: vi.fn(async () => ({ baselineReady: true })),
}))

const originalMode = process.env.LOSPOR_DEPLOYMENT_MODE
const originalAdmin = process.env.LOSPOR_ACCOUNT_ADMINISTRATION_ENABLED
const originalRegistration = process.env.LOSPOR_SELF_REGISTRATION_ENABLED

afterEach(() => {
  for (const [key, value] of [
    ["LOSPOR_DEPLOYMENT_MODE", originalMode],
    ["LOSPOR_ACCOUNT_ADMINISTRATION_ENABLED", originalAdmin],
    ["LOSPOR_SELF_REGISTRATION_ENABLED", originalRegistration],
  ] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe("authentication deployment capabilities", () => {
  it("advertises the exact Hospital username/admin-recovery boundary", async () => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    process.env.LOSPOR_ACCOUNT_ADMINISTRATION_ENABLED = "true"
    const { GET } = await import("@/app/v1/capabilities/route")
    const response = await GET()
    expect((await response.json()).authentication).toEqual({
      loginIdentifier: "USERNAME",
      selfRegistration: false,
      passwordRecovery: "ADMINISTRATOR",
      passwordChange: true,
      sessionInventory: true,
    })
  })

  it("fails closed without silently advertising email under partial Hospital configuration", async () => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    delete process.env.LOSPOR_ACCOUNT_ADMINISTRATION_ENABLED
    const { GET } = await import("@/app/v1/capabilities/route")
    const response = await GET()
    expect((await response.json()).authentication).toMatchObject({
      loginIdentifier: "USERNAME",
      selfRegistration: false,
      passwordRecovery: "UNAVAILABLE",
    })
  })

  it("preserves public email capability policy", async () => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "public"
    delete process.env.LOSPOR_ACCOUNT_ADMINISTRATION_ENABLED
    process.env.LOSPOR_SELF_REGISTRATION_ENABLED = "false"
    const { GET } = await import("@/app/v1/capabilities/route")
    const response = await GET()
    expect((await response.json()).authentication).toMatchObject({
      loginIdentifier: "EMAIL",
      selfRegistration: false,
      passwordRecovery: "EMAIL",
    })
  })
})
