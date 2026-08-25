import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const options = readFileSync(join(process.cwd(), "src/lib/use-intraop-options.ts"), "utf8")
const screen = readFileSync(join(process.cwd(), "app/(app)/cases/intraop/[id].tsx"), "utf8")

describe("PWA appliance guidance policy contract", () => {
  // clinicalRulesSnapshot?.guidance is gone -- prospectiveGuidanceEnabled is
  // now a direct hook output (useClinicalRules/clinicalRulesStateForMode),
  // defaulting to false in its own initial state, so a cached snapshot from
  // before this policy existed fails closed by construction rather than by
  // an explicit `?? false` read at the call site.
  it("sources prospectiveGuidanceEnabled from the hook, not the raw snapshot", () => {
    expect(screen).toContain("prospectiveGuidanceEnabled,")
    expect(screen).not.toContain("clinicalRulesSnapshot?.guidance")
  })

  it("gates every prospective drug, infusion and fluid quick-value/range/profile map", () => {
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
      "AGENT_QUICK_PERCENTS",
    ]) {
      const declaration = new RegExp(`const ${name} = useMemo\\(\\s*\\(\\)\\s*=>\\s*prospectiveGuidanceEnabled \\?`)
      expect(options).toMatch(declaration)
    }
  })

  it("retains routes and coded identity needed to record manual entries", () => {
    expect(options).toContain("DRUG_ROUTES,")
    expect(options).toContain("INFUSION_ROUTES,")
    expect(options).toContain("DRUG_CODES, INFUSION_CODES")
  })
})
