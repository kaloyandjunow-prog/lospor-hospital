import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const options = readFileSync(join(process.cwd(), "src/lib/use-intraop-options.ts"), "utf8")
const screen = readFileSync(join(process.cwd(), "app/(app)/cases/intraop/[id].tsx"), "utf8")

describe("PWA appliance guidance policy contract", () => {
  it("fails closed for cached snapshots that predate the explicit policy", () => {
    expect(screen).toContain("clinicalRulesSnapshot?.guidance?.enabled ?? false")
  })

  it("removes every prospective drug, infusion and fluid guidance map", () => {
    for (const name of [
      "FLUID_QUICK_VOLUMES",
      "FLUID_CONCENTRATIONS",
      "FLUID_DEFAULT_CONCENTRATIONS",
      "DRUG_QUICK_DOSES",
      "DRUG_LA_CONCENTRATIONS",
      "DRUG_ROUTE_PROFILES",
      "DRUG_BASE_PROFILES",
      "DRUG_RANGES",
      "DRUG_DOSE_CALCS",
      "INFUSION_QUICK_RATES",
      "INFUSION_SUGGESTED_RATES",
      "INFUSION_LA_CONCENTRATIONS",
      "INFUSION_RANGES",
      "INFUSION_ROUTE_PROFILES",
      "INFUSION_BASE_PROFILES",
    ]) {
      expect(options).toContain(`${name}: guidanceEnabled ? ${name} : {}`)
    }
    expect(options).toContain("PEDIATRIC_DRUG_PROFILES: guidanceEnabled ? pediatricDrugProfiles : []")
    expect(options).toContain("PEDIATRIC_FLUID_PROFILES: guidanceEnabled ? pediatricFluidProfiles : []")
    expect(options).toContain("PEDIATRIC_INFUSION_PROFILES: guidanceEnabled ? pediatricInfusionProfiles : []")
  })

  it("retains routes and coded identity needed to record manual entries", () => {
    expect(options).toContain("DRUG_ROUTES,")
    expect(options).toContain("INFUSION_ROUTES,")
    expect(options).toContain("DRUG_CODES, INFUSION_CODES")
  })
})
