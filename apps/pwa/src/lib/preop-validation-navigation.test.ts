import { describe, expect, it } from "vitest"
import { PREOP_REQUIRED_FIELD_SECTION, preopInvalidSubmitMessage, preopRequiredFieldLabel } from "./preop-validation-navigation"

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
