import { describe, expect, it } from "vitest"
import {
  evaluatePreopReadiness,
  evaluatePreopSectionCompletion,
  validatePreopPatch,
  validatePostopPatch,
} from "./clinical-validation"

const completePediatricDemographics = {
  clinicalMode: "PEDIATRIC",
  ageValue: 12,
  ageUnit: "MONTHS",
  sex: "FEMALE",
  heightCm: 74,
  weightKg: 9,
}

describe("pediatric clinical validation", () => {
  it("accepts precise pediatric age as the demographic age source", () => {
    const result = evaluatePreopReadiness({
      ...completePediatricDemographics,
      diagnoses: [{ label: "Diagnosis" }],
      procedures: [{ label: "Procedure" }],
      bpUnobtainable: true,
      heartRateUnobtainable: true,
      respiratoryRateUnobtainable: true,
      airwayUnobtainable: true,
      asaScore: "II",
    })

    expect(result.issues.map(issue => issue.code)).not.toContain("missing_age")
    expect(evaluatePreopSectionCompletion(completePediatricDemographics).demographics).toBe("complete")
  })

  it("does not accept an adult age inside pediatric mode", () => {
    const result = evaluatePreopReadiness({
      ...completePediatricDemographics,
      ageValue: 18,
      ageUnit: "YEARS",
    })
    expect(result.issues.map(issue => issue.code)).toContain("missing_age")
  })

  it("keeps neonatal measurements writable while retaining physical hard limits", () => {
    expect(validatePreopPatch({
      ageValue: 240,
      heightCm: 28,
      bpSystolic: 35,
      bpDiastolic: 18,
      respiratoryRate: 110,
    }).valid).toBe(true)
    expect(validatePostopPatch({
      recoveryBpSystolic: 35,
      recoveryBpDiastolic: 18,
    }).valid).toBe(true)
    expect(validatePreopPatch({ bpSystolic: 5 }).valid).toBe(false)
  })
})
