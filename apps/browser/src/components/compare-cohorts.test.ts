import { describe, expect, it } from "vitest"
import { compareCohort, initialCompareSide } from "./compare-cohorts"

describe("compare cohorts", () => {
  // The same raw-count score filters as the cohort builder, on each side.
  it("sends each side's risk score filters", () => {
    const side = { ...initialCompareSide("A"), apfelMin: "3", apfelMax: "4", paedScoreMin: "13", rcriMax: "x" }
    expect(compareCohort(side).filters).toMatchObject({
      apfel: { min: 3, max: 4 },
      paedScore: { min: 13 },
    })
    expect(compareCohort(side).filters).not.toHaveProperty("rcri")
  })

  it("sends no score filter while none is filled in", () => {
    const filters = compareCohort(initialCompareSide("B")).filters
    for (const field of ["rcri", "apfel", "stopBang", "povoc", "colds", "paedScore"]) {
      expect(filters).not.toHaveProperty(field)
    }
  })
})
