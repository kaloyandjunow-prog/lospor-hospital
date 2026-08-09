import { describe, expect, it } from "vitest"
import { hasClinicianEnteredContent } from "./preop-server-create"

/**
 * Opening "New case" used to be enough to create a server draft.
 *
 * The screen's own defaults made the form object non-empty, so the
 * `Object.keys(values).length === 0` guard never fired, and the debounced
 * autosave posted a case containing assumed demographics (MALE, ASA I, elective)
 * and randomly generated vital signs — a record of a patient nobody had seen.
 *
 * These cases pin the distinction the guard has to make: structural defaults are
 * not content; something a clinician entered is.
 */
describe("hasClinicianEnteredContent", () => {
  // Exactly what the form holds the instant it mounts, after the fix.
  const freshForm = {
    clinicalMode: "ADULT",
    emergencySurgery: false,
    highRiskSurgery: false,
    diagnoses: [],
    procedures: [],
    comorbidities: [],
    currentMedications: [],
    allergyDetails: [],
    labResults: [],
  }

  it("treats a freshly opened form as empty", () => {
    expect(hasClinicianEnteredContent(freshForm)).toBe(false)
  })

  it("still treats it as empty when only structural defaults are present", () => {
    expect(hasClinicianEnteredContent({})).toBe(false)
    expect(hasClinicianEnteredContent({ clinicalMode: "PEDIATRIC" })).toBe(false)
    expect(hasClinicianEnteredContent({ ...freshForm, emergencySurgery: true })).toBe(false)
  })

  it("recognises the first real thing a clinician enters", () => {
    for (const entry of [
      { sex: "FEMALE" },
      { asaScore: "III" },
      { ageYears: 4 },
      { ageValue: 6, ageUnit: "MONTHS" },
      { weightKg: 8.2 },
      { heightCm: 68 },
      { bpSystolic: 96 },
      { heartRate: 130 },
      { spO2: 98 },
      { temperature: 37.2 },
      { surgeryName: "Inguinal hernia repair" },
    ]) {
      expect(hasClinicianEnteredContent({ ...freshForm, ...entry })).toBe(true)
    }
  })

  it("recognises a populated clinical list", () => {
    expect(hasClinicianEnteredContent({ ...freshForm, diagnoses: ["J35.0"] })).toBe(true)
    expect(hasClinicianEnteredContent({ ...freshForm, labResults: [{ test: "CRP", value: "5", unit: "mg/L" }] })).toBe(true)
  })

  it("does not count an empty string as entry", () => {
    // A field touched and cleared is still not a recorded observation.
    expect(hasClinicianEnteredContent({ ...freshForm, surgeryName: "" })).toBe(false)
  })
})
