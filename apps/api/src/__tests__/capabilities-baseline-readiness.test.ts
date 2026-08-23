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
vi.mock("@/lib/hospital/ai-boundary", () => ({
  clinicalAiCapabilities: async () => ({}),
}))
vi.mock("@/lib/hospital/support-config", () => ({
  hospitalSupportConfiguration: () => ({}),
}))

describe("Hospital capabilities baseline readiness", () => {
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
