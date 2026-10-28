import { describe, expect, it } from "vitest"
import {
  A3_WEIGHT_LOSS_CONCEPT_ID,
  BUNDLED_PREOP_QUESTIONS,
  PREOP_CATALOG_VERSION,
  bundledQuestion,
} from "./catalog"

describe("bundled preoperative catalog", () => {
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
  it("keeps the complete approved baseline and population catalog represented", () => {
    expect(BUNDLED_PREOP_QUESTIONS).toHaveLength(89)
    // Core 10.0.0 carries the approved baseline plus the 1.6.0 additions:
    // previous ICU stay, alcohol use with two follow-ups, a child's recent
    // vaccination, Gupta's two inputs, and bleeding/transfusion for children.
    expect(BUNDLED_PREOP_QUESTIONS.filter(question => question.applicability.includes("ADULT"))).toHaveLength(27)
    expect(BUNDLED_PREOP_QUESTIONS.filter(question => question.applicability.includes("PEDIATRIC"))).toHaveLength(20)
    expect(BUNDLED_PREOP_QUESTIONS.filter(question => question.applicability.length === 0)).toHaveLength(42)
    expect(BUNDLED_PREOP_QUESTIONS.every(question => question.options.every(option =>
      option.key !== "NOT_ASSESSED" && option.key !== "UNKNOWN",
    ))).toBe(true)
    expect(bundledQuestion("BASE_SURGERY_URGENCY")?.options.map(option => option.key))
      .toEqual(["ELECTIVE", "EMERGENCY"])
    expect(bundledQuestion("BASE_SURGERY_RISK")?.options.map(option => option.key))
      .toEqual(["LOW", "HIGH"])
    // Gupta's functional status and procedure type carry the model's own options.
    expect(bundledQuestion("A15_FUNCTIONAL_STATUS")?.options.map(option => option.key))
      .toEqual(["INDEPENDENT", "PARTIALLY_DEPENDENT", "TOTALLY_DEPENDENT"])
    expect(bundledQuestion("A16_GUPTA_PROCEDURE_TYPE")?.options).toHaveLength(21)
    expect(BUNDLED_PREOP_QUESTIONS.filter(question => question.answerType === "CHOICE")
      .filter(question => !["BASE_SURGERY_URGENCY", "BASE_SURGERY_RISK", "A15_FUNCTIONAL_STATUS", "A16_GUPTA_PROCEDURE_TYPE"].includes(question.stableKey))
      .every(question => question.options.map(option => option.key).sort().join(",") === "NO,YES"))
      .toBe(true)
  })


  it("keeps the approved OMOP boundaries in the catalog", () => {
    expect(bundledQuestion("A2_REDUCED_EXERCISE_TOLERANCE")?.omopSourceCode)
      .toBe("LOSPOR:PREOP_A2_REDUCED_EXERCISE_TOLERANCE")
    // Every question carries a concept; 0 where no standard concept says what it asks.
    expect(bundledQuestion("A2_REDUCED_EXERCISE_TOLERANCE")?.omopConceptId).toBe(0)
    expect(bundledQuestion("A3_UNINTENTIONAL_WEIGHT_LOSS")?.omopConceptId)
      .toBe(A3_WEIGHT_LOSS_CONCEPT_ID)
    expect(BUNDLED_PREOP_QUESTIONS.some(question => JSON.stringify(question).includes("NOT_ASSESSED"))).toBe(false)
  })
})
