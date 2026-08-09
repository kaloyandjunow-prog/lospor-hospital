import { describe, expect, it } from "vitest"
import {
  RESEARCH_DISTRIBUTION_IDS,
  RESEARCH_METRIC_IDS,
  normalizeResearchCohort,
} from "./research"

describe("pediatric research contracts", () => {
  it("normalizes pediatric mode and precise-age filters", () => {
    expect(normalizeResearchCohort({
      version: 1,
      filters: {
        clinicalModes: ["PEDIATRIC", "PEDIATRIC"],
        ageDays: { min: 365, max: 0 },
      },
    })).toMatchObject({
      filters: {
        clinicalModes: ["PEDIATRIC"],
        ageDays: { min: 0, max: 365 },
      },
    })
  })

  it("publishes mode distribution and pediatric age metrics", () => {
    expect(RESEARCH_DISTRIBUTION_IDS).toContain("clinicalMode")
    expect(RESEARCH_METRIC_IDS).toContain("pediatricRate")
    expect(RESEARCH_METRIC_IDS).toContain("meanAgeDays")
  })
})
