import { describe, expect, it } from "vitest"
import { suggestionFactsFromPreop } from "./preop-facts"

describe("the suggestion facts from the preoperative record", () => {
  it("reads nothing from no record", () => {
    expect(suggestionFactsFromPreop(null)).toEqual({
      patient: { ageDays: null, weightKg: null, idealWeightKg: null, sex: null },
      preop: { mhHistory: false, latexAllergy: false, diabetes: false, apfelScore: null, ponvHistory: false, betaBlocker: false, cyanoticHeartDisease: false },
    })
  })

  it("reads the patient: age in days, weight, ideal weight and sex", () => {
    const { patient } = suggestionFactsFromPreop({ ageValue: 6, ageUnit: "MONTHS", weightKg: 7.2, sex: "FEMALE" }, 6.8)
    expect(patient).toEqual({ ageDays: 183, weightKg: 7.2, idealWeightKg: 6.8, sex: "FEMALE" })
    expect(suggestionFactsFromPreop({ weightKg: 0, sex: "UNKNOWN" }).patient).toMatchObject({ weightKg: null, sex: null })
  })

  it("takes MH history from the patient's own answer or the family's anaesthetic problems, and only a yes", () => {
    expect(suggestionFactsFromPreop({ malignantHyperthermiaHistory: true }).preop.mhHistory).toBe(true)
    expect(suggestionFactsFromPreop({ familyAnesthesiaProblems: true }).preop.mhHistory).toBe(true)
    expect(suggestionFactsFromPreop({ malignantHyperthermiaHistory: null, familyAnesthesiaProblems: false }).preop.mhHistory).toBe(false)
  })

  it("finds diabetes by ICD-10 code or by name, in either language", () => {
    expect(suggestionFactsFromPreop({ comorbidities: [{ label: "Type 2", code: "E11.9" }] }).preop.diabetes).toBe(true)
    expect(suggestionFactsFromPreop({ comorbidities: [{ label: "Захарен диабет тип 1" }] }).preop.diabetes).toBe(true)
    expect(suggestionFactsFromPreop({ comorbidities: [{ label: "Hypertension", code: "I10" }] }).preop.diabetes).toBe(false)
  })

  it("finds cyanotic heart disease by lesion code or by name", () => {
    expect(suggestionFactsFromPreop({ comorbidities: [{ label: "Tetralogy", icd10Code: "Q21.3" }] }).preop.cyanoticHeartDisease).toBe(true)
    expect(suggestionFactsFromPreop({ comorbidities: [{ label: "Тетралогия на Фало" }] }).preop.cyanoticHeartDisease).toBe(true)
    expect(suggestionFactsFromPreop({ comorbidities: [{ label: "Atrial septal defect", code: "Q21.1" }] }).preop.cyanoticHeartDisease).toBe(false)
  })

  it("finds a beta-blocker by ATC or by name", () => {
    expect(suggestionFactsFromPreop({ currentMedications: [{ label: "Concor", atcCode: "C07AB07" }] }).preop.betaBlocker).toBe(true)
    expect(suggestionFactsFromPreop({ currentMedications: [{ label: "Metoprolol 50 mg" }] }).preop.betaBlocker).toBe(true)
    expect(suggestionFactsFromPreop({ currentMedications: [{ label: "Carvedilol" }, { label: "Labetalol" }] }).preop.betaBlocker).toBe(true)
    expect(suggestionFactsFromPreop({ currentMedications: [{ label: "Amlodipine", atcCode: "C08CA01" }] }).preop.betaBlocker).toBe(false)
  })

  it("passes the Apfel score and the ПОГП history", () => {
    expect(suggestionFactsFromPreop({ apfelScore: 3, apfelPONVHistory: true }).preop).toMatchObject({ apfelScore: 3, ponvHistory: true })
  })
})
