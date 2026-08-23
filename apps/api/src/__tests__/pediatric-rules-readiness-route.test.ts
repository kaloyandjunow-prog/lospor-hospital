import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  effective: vi.fn(),
  guidance: vi.fn(),
  baseline: vi.fn(),
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/mobile-auth", () => ({ getAuthUser: mocks.auth }))
vi.mock("@/lib/clinical-rules/service", () => ({
  effectiveClinicalRulesForUser: mocks.effective,
}))
vi.mock("@/lib/hospital/control-plane", () => ({
  currentGuidancePolicy: mocks.guidance,
}))
vi.mock("@/lib/hospital/deployment", () => ({ isHospitalDeployment: () => true }))
vi.mock("@/lib/hospital/clinical-baseline-readiness", () => ({
  assessSelectedHospitalClinicalBaseline: mocks.baseline,
}))

describe("legacy pediatric-rules Hospital readiness projection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.PEDIATRIC_MODE_ENABLED = "true"
    mocks.auth.mockResolvedValue({ id: "clinician-1", institutionId: "institution-1" })
    mocks.effective.mockResolvedValue({
      presetId: null,
      presetName: null,
      presetVersion: null,
      scope: null,
      rules: [],
    })
    mocks.guidance.mockResolvedValue({ adultEnabled: true, pediatricEnabled: true })
    mocks.baseline.mockResolvedValue({
      mode: "PEDIATRIC",
      baselineReady: false,
      reasonCode: "SELECTION_MISSING",
      expected: { presetId: "lospor-pediatrics-v2" },
      selected: null,
    })
  })

  it("does not repeat the bundled release sign-off as database readiness", async () => {
    const { GET } = await import("@/app/v1/clinical/pediatric/rules/route")
    const response = await GET(new Request("http://localhost/v1/clinical/pediatric/rules") as never)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.enabled).toBe(true)
    expect(body.productionReady).toBe(false)
    expect(body.baseline).toMatchObject({
      baselineReady: false,
      reasonCode: "SELECTION_MISSING",
    })
    expect(body.guidance).toEqual({
      enabled: false,
      policyEnabled: true,
      baselineReady: false,
      prospectiveOnly: true,
    })
  })

  it("reports a ready baseline independently from a disabled policy", async () => {
    mocks.guidance.mockResolvedValue({ adultEnabled: true, pediatricEnabled: false })
    mocks.baseline.mockResolvedValue({
      mode: "PEDIATRIC",
      baselineReady: true,
      reasonCode: "READY",
      expected: { presetId: "lospor-pediatrics-v2" },
      selected: { presetId: "lospor-pediatrics-v2" },
    })
    const { GET } = await import("@/app/v1/clinical/pediatric/rules/route")
    const body = await (await GET(new Request(
      "http://localhost/v1/clinical/pediatric/rules",
    ) as never)).json()

    expect(body.productionReady).toBe(true)
    expect(body.guidance).toMatchObject({
      enabled: false,
      policyEnabled: false,
      baselineReady: true,
    })
  })
})
