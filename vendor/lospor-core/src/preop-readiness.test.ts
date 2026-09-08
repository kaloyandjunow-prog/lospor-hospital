import { describe, expect, it } from "vitest"
import { evaluatePreopReadiness } from "./clinical-validation"

/**
 * What a preoperative assessment must contain, from the one place both clients
 * now ask. Each app used to answer this for itself and they did not agree.
 */

function complete(over: Record<string, unknown> = {}) {
  return {
    ageYears: 55,
    sex: "MALE",
    heightCm: 171,
    weightKg: 82,
    diagnoses: [{ label: "Cholelithiasis" }],
    procedures: [{ label: "Cholecystectomy" }],
    bpSystolic: 130,
    bpDiastolic: 80,
    heartRate: 72,
    respiratoryRate: 14,
    mallampati: "II",
    asaScore: "II",
    ...over,
  }
}

const codes = (preop: Record<string, unknown>) =>
  evaluatePreopReadiness(preop).issues.map(item => item.code)

describe("whether a preoperative assessment is finished", () => {
  it("accepts a complete adult assessment", () => {
    expect(evaluatePreopReadiness(complete())).toEqual({ valid: true, issues: [] })
  })

  /**
   * The web form checked this and the shared rule did not, so the same
   * twelve-year-old read as finished on one client and unfinished on the other.
   * The server refuses the write either way -- what the disagreement changed
   * was whether the clinician found out before or after pressing save.
   */
  it("refuses a paediatric age carried in an adult-mode record", () => {
    expect(codes(complete({ ageYears: 12 }))).toEqual(["missing_age"])
    expect(codes(complete({ clinicalMode: "ADULT", ageYears: 12 }))).toEqual(["missing_age"])
  })

  it("accepts the youngest age adult mode covers", () => {
    expect(evaluatePreopReadiness(complete({ ageYears: 18 })).valid).toBe(true)
  })

  it("checks a paediatric record against its own age scale", () => {
    const pediatric = complete({
      clinicalMode: "PEDIATRIC",
      ageYears: undefined,
      ageValue: 8,
      ageUnit: "MONTHS",
    })
    expect(evaluatePreopReadiness(pediatric).valid).toBe(true)
    expect(codes({ ...pediatric, ageValue: 40, ageUnit: "YEARS" })).toEqual(["missing_age"])
  })

  // "Nobody has recorded this" is a truthy string and must block exactly as a
  // blank does.
  it("treats an unknown sex as unanswered", () => {
    expect(codes(complete({ sex: "UNKNOWN" }))).toEqual(["missing_sex"])
    expect(codes(complete({ sex: "" }))).toEqual(["missing_sex"])
  })

  /**
   * Unobtainable is an answer. A blood pressure nobody could take is
   * documented, not missing, and demanding a number would be demanding one
   * that does not exist.
   */
  it("accepts a vital documented as unobtainable", () => {
    expect(evaluatePreopReadiness(complete({
      bpSystolic: null,
      bpDiastolic: null,
      heartRate: null,
      respiratoryRate: null,
      mallampati: null,
      bpUnobtainable: true,
      heartRateUnobtainable: true,
      respiratoryRateUnobtainable: true,
      airwayUnobtainable: true,
    })).valid).toBe(true)
  })

  it("still asks for a vital that is neither recorded nor marked unobtainable", () => {
    expect(codes(complete({ bpSystolic: null }))).toEqual(["missing_blood_pressure"])
    expect(codes(complete({ heartRate: null }))).toEqual(["missing_heart_rate"])
    expect(codes(complete({ respiratoryRate: null }))).toEqual(["missing_respiratory_rate"])
    expect(codes(complete({ mallampati: null }))).toEqual(["missing_airway"])
  })

  // Older records carry the diagnosis and the procedure as free text. They were
  // finished when they were written and stay finished.
  it("accepts the legacy free-text diagnosis and procedure", () => {
    expect(evaluatePreopReadiness(complete({
      diagnoses: [],
      procedures: [],
      diagnosis: "Cholelithiasis",
      plannedProcedure: "Cholecystectomy",
    })).valid).toBe(true)
    expect(codes(complete({ diagnoses: [], procedures: [], diagnosis: "   " })))
      .toEqual(["missing_diagnosis", "missing_procedure"])
  })

  it("reports every gap at once rather than one at a time", () => {
    expect(codes({ asaScore: "II" })).toEqual([
      "missing_age",
      "missing_sex",
      "missing_height",
      "missing_weight",
      "missing_diagnosis",
      "missing_procedure",
      "missing_blood_pressure",
      "missing_heart_rate",
      "missing_respiratory_rate",
      "missing_airway",
    ])
  })

  it("says a missing assessment is missing", () => {
    expect(codes(null as never)).toEqual(["missing_preop"])
  })
})
