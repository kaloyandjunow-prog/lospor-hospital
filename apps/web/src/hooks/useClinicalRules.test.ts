import { describe, expect, it } from "vitest"
import { failClosedHospitalGuidance } from "./useClinicalRules"

const bundle = {
  preset: null,
  productionReady: true,
  effectiveRules: [],
  doseProfiles: [],
}

describe("Hospital clinical-guidance response policy", () => {
  it("preserves only an explicit boolean prospective policy", () => {
    expect(failClosedHospitalGuidance({
      ...bundle,
      guidance: { enabled: true, prospectiveOnly: true as const },
    }).guidance).toEqual({ enabled: true, prospectiveOnly: true })
  })

  it("fails closed for old or corrupt server and cache payloads", () => {
    expect(failClosedHospitalGuidance(bundle).guidance.enabled).toBe(false)
    expect(failClosedHospitalGuidance({
      ...bundle,
      guidance: { enabled: "yes", prospectiveOnly: true },
    }).guidance).toEqual({ enabled: false, prospectiveOnly: true })
    expect(failClosedHospitalGuidance({
      ...bundle,
      guidance: { enabled: true, prospectiveOnly: false },
    }).guidance).toEqual({ enabled: false, prospectiveOnly: true })
  })
})
