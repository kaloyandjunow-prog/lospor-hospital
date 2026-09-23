import { describe, expect, it } from "vitest"
import {
  A3_WEIGHT_LOSS_CONCEPT_ID,
  BUNDLED_PREOP_QUESTIONS,
  PREOP_CATALOG_VERSION,
  bundledQuestion,
} from "./catalog"

describe("1.4.7 bundled preoperative catalog", () => {
  it("contains unique immutable stable keys for the approved baseline and populations", () => {
    const keys = BUNDLED_PREOP_QUESTIONS.map(question => question.stableKey)
    expect(new Set(keys).size).toBe(keys.length)
    expect(BUNDLED_PREOP_QUESTIONS.every(question => question.catalogVersion === PREOP_CATALOG_VERSION)).toBe(true)
    expect(keys).toEqual(expect.arrayContaining([
      "BASE_ALLERGIES",
      "BASE_SURGERY_URGENCY",
      "A1_RECENT_INFECTION",
      "A2_REDUCED_EXERCISE_TOLERANCE",
      "A3_UNINTENTIONAL_WEIGHT_LOSS",
      "P1_PREMATURITY_NICU",
      "P4_SLEEP_DISORDERED_BREATHING",
    ]))
    expect(keys).not.toEqual(expect.arrayContaining([
      "A10_CANCER_TREATMENT",
      "A15_FRAILTY",
      "P5_CHRONIC_LUNG_DISEASE",
    ]))
  })

  it("keeps the approved OMOP boundaries in the catalog", () => {
    expect(bundledQuestion("A2_REDUCED_EXERCISE_TOLERANCE")?.omopSourceCode)
      .toBe("LOSPOR:PREOP_A2_REDUCED_EXERCISE_TOLERANCE")
    expect(bundledQuestion("A2_REDUCED_EXERCISE_TOLERANCE")?.omopConceptId).toBeUndefined()
    expect(bundledQuestion("A3_UNINTENTIONAL_WEIGHT_LOSS")?.omopConceptId)
      .toBe(A3_WEIGHT_LOSS_CONCEPT_ID)
    expect(BUNDLED_PREOP_QUESTIONS.some(question => JSON.stringify(question).includes("NOT_ASSESSED"))).toBe(false)
  })
})
