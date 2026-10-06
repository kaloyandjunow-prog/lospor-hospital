import { describe, expect, it } from "vitest"
import { PREOP_REQUIRED_FIELD_SECTION, preopInvalidSubmitMessage, preopMissingFieldKeys, preopRequiredFieldLabel } from "./preop-validation-navigation"

describe("preop validation navigation", () => {
  it("routes required fields to the section that owns the input", () => {
    expect(PREOP_REQUIRED_FIELD_SECTION.ageYears).toBe("patient")
    expect(PREOP_REQUIRED_FIELD_SECTION.diagnoses).toBe("case")
    expect(PREOP_REQUIRED_FIELD_SECTION.bpSystolic).toBe("exam")
    expect(PREOP_REQUIRED_FIELD_SECTION.mallampati).toBe("airway")
    expect(PREOP_REQUIRED_FIELD_SECTION.asaScore).toBe("risk")
  })

  it("uses translated labels when building the invalid-submit message", () => {
    expect(preopRequiredFieldLabel("diagnoses", { diagnoses: "Diagnosis" })).toBe("Diagnosis")
    expect(preopRequiredFieldLabel("unknownField", { diagnoses: "Diagnosis" })).toBe("unknownField")
    expect(preopInvalidSubmitMessage(
      ["diagnoses", "mallampati"],
      { diagnoses: "Diagnosis", mallampati: "Mallampati" },
      "Complete before proceeding"
    )).toBe("Complete before proceeding\n\n- Diagnosis\n- Mallampati")
  })
})

// Found on the appliance in 1.5.0: an empty case listed only Sex, Height,
// Weight and ASA, because zod skips the Core refinement while basic fields fail.
describe("the fields Continue names", () => {
  it("names every missing required field at once, in form order", () => {
    expect(preopMissingFieldKeys(["sex", "heightCm", "weightKg", "asaScore"], { clinicalMode: "ADULT" })).toEqual([
      "ageYears", "sex", "heightCm", "weightKg", "diagnoses", "procedures",
      "bpSystolic", "heartRate", "respiratoryRate", "mallampati", "asaScore",
    ])
  })

  it("names a child's missing precise age and opens the patient section for it", () => {
    const keys = preopMissingFieldKeys([], { clinicalMode: "PEDIATRIC" })
    expect(keys[0]).toBe("ageValue")
    expect(PREOP_REQUIRED_FIELD_SECTION[keys[0]]).toBe("patient")
  })

  it("names nothing once the case is ready", () => {
    expect(preopMissingFieldKeys([], {
      clinicalMode: "ADULT", ageYears: 40, sex: "MALE", heightCm: 180, weightKg: 80,
      diagnoses: [{ label: "x" }], procedures: [{ label: "y" }],
      bpSystolic: 120, bpDiastolic: 80, heartRate: 70, respiratoryRate: 14, mallampati: "I", asaScore: "I",
    })).toEqual([])
  })
})
