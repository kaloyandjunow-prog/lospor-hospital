import { describe, expect, it, vi } from "vitest"
import openApiDocument from "@/generated/openapi.json"

const baseline = vi.hoisted(() => vi.fn())

vi.mock("server-only", () => ({}))
vi.mock("@/lib/hospital/deployment", () => ({ isHospitalDeployment: () => true }))
vi.mock("@/lib/hospital/clinical-baseline-readiness", () => ({
  assessSelectedHospitalClinicalBaseline: baseline,
}))
vi.mock("@/lib/pediatric-mode", () => ({
  pediatricCapabilities: () => ({
    enabled: true,
    productionReady: true,
    rulesetVersion: "pediatric-v2",
    minimumClientVersion: "8.0.0",
    reviewedDoseProfilesRequired: true,
  }),
}))
const HOSPITAL_AI = {
  clinicalAdvice: { enabled: true, reason: "ENABLED" },
  labImageExtraction: { enabled: true, reason: "ENABLED" },
  monitorOcr: { enabled: true, reason: "ENABLED" },
}
vi.mock("@/lib/hospital/ai-boundary", () => ({
  clinicalAiCapabilities: async () => HOSPITAL_AI,
}))
const HOSPITAL_SUPPORT = { configured: true, contactUrl: "mailto:support@example.test" }
vi.mock("@/lib/hospital/support-config", () => ({
  hospitalSupportConfiguration: () => HOSPITAL_SUPPORT,
}))

describe("Hospital capabilities baseline readiness", () => {
  it("reports the Status-managed AI policy and support contact, not the static deployment defaults", async () => {
    baseline.mockResolvedValue({
      mode: "PEDIATRIC",
      baselineReady: true,
      reasonCode: null,
      expected: { presetId: "lospor-pediatrics-v2" },
      selected: { presetId: "lospor-pediatrics-v2" },
    })
    const { GET } = await import("@/app/v1/capabilities/route")
    const body = await (await GET()).json()

    // If this route ever again imports clinicalAiCapabilities from
    // @/lib/deployment-capabilities instead of @/lib/hospital/ai-boundary, the
    // mocks above stop applying and this fails: the static function hardcodes
    // AI disabled for a Hospital deployment regardless of the Status policy.
    expect(body.features.clinicalAi).toEqual(HOSPITAL_AI)
    expect(body.support).toEqual(HOSPITAL_SUPPORT)
  })

  it("overrides the static bundled sign-off when no exact platform baseline is selected", async () => {
    baseline.mockResolvedValue({
      mode: "PEDIATRIC",
      baselineReady: false,
      reasonCode: "SELECTION_MISSING",
      expected: { presetId: "lospor-pediatrics-v2" },
      selected: null,
    })
    const { GET } = await import("@/app/v1/capabilities/route")
    const body = await (await GET()).json()

    expect(body.features.pediatricMode).toMatchObject({
      enabled: true,
      productionReady: false,
      baselineReady: false,
      baseline: { baselineReady: false, reasonCode: "SELECTION_MISSING" },
    })
  })

  it("publishes the baseline-ready fields in the public OpenAPI capability contract", () => {
    const schemas = openApiDocument.components.schemas
    expect(schemas.PediatricCapabilities.required).toEqual(expect.arrayContaining([
      "productionReady",
      "baselineReady",
      "baseline",
    ]))
    expect(schemas.PediatricCapabilities.properties.baseline).toMatchObject({
      anyOf: [
        { $ref: "#/components/schemas/ClinicalBaselineReadiness" },
        { type: "null" },
      ],
    })
    expect(schemas.Capabilities.properties.features).toMatchObject({
      properties: {
        pediatricMode: { $ref: "#/components/schemas/PediatricCapabilities" },
      },
      required: ["pediatricMode"],
    })
  })
})
