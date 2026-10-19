import { describe, expect, it } from "vitest"
import { calculateColds, calculatePovoc } from "./pediatric"
import { displayResearchScore, isResearchScoreField, RESEARCH_SCORE_SCALES } from "./research-scores"

describe("a raw score shown to a researcher", () => {
  it("is the count out of its maximum, with the guideline band where there is one", () => {
    expect(displayResearchScore("apfel", 3, "en")).toBe("3 / 4 · High (~ 60%)")
    expect(displayResearchScore("apfel", 1, "bg")).toBe("1 / 4 · Умерен (~ 20%)")
    expect(displayResearchScore("rcri", 0, "en")).toBe("0 / 6 · Very low (0.4%)")
    expect(displayResearchScore("stopBang", 5, "en")).toBe("5 / 8 · High OSA risk")
  })

  // Sikich & Lerman used >= 10; > 12 is more specific, so 10-12 is "possible".
  it("bands PAED as none, possible and likely emergence delirium", () => {
    expect(displayResearchScore("paedScore", 9, "en")).toBe("9 / 20 · No emergence delirium")
    expect(displayResearchScore("paedScore", 12, "en")).toBe("12 / 20 · Possible emergence delirium")
    expect(displayResearchScore("paedScore", 13, "bg")).toBe("13 / 20 · Вероятен делир при събуждане")
  })

  it("gives POVOC the risk Eberhart published for the count", () => {
    expect(displayResearchScore("povoc", 2, "en")).toBe("2 / 4 · 30%")
  })

  it("leaves scores without a published band as the count alone", () => {
    expect(displayResearchScore("colds", 17, "en")).toBe("17 / 25")
    expect(displayResearchScore("aldreteTotal", 9, "en")).toBe("9 / 10")
  })

  it("knows which fields are scores", () => {
    expect(isResearchScoreField("apfel")).toBe(true)
    expect(isResearchScoreField("weightKg")).toBe(false)
    expect(isResearchScoreField("toString")).toBe(false)
  })

  // The maximum printed beside a score has to be one the calculator can
  // reach, or "4 / 4" would read as the worst case when it is not.
  it("states the range the core calculators actually produce", () => {
    const povocMax = calculatePovoc({ ageYears: 5, surgeryMinutes: 60, strabismusSurgery: true, patientOrFamilyHistory: true }).score
    expect(povocMax).toBe(RESEARCH_SCORE_SCALES.povoc.max)
    const worst = calculateColds({ currentSymptoms: "MODERATE_OR_SEVERE", onset: "LESS_THAN_2_WEEKS", lungDisease: "MODERATE_OR_SEVERE", airwayDevice: "TRACHEAL_TUBE", surgery: "MAJOR_AIRWAY" }).score
    const best = calculateColds({ currentSymptoms: "NONE", onset: "MORE_THAN_4_WEEKS", lungDisease: "NONE", airwayDevice: "FACE_MASK_OR_NONE", surgery: "NON_AIRWAY" }).score
    expect([best, worst]).toEqual([RESEARCH_SCORE_SCALES.colds.min, RESEARCH_SCORE_SCALES.colds.max])
  })
})
