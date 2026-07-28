import { describe, expect, it } from "vitest"
import { buildPreopPayload } from "./preop-payload"

describe("buildPreopPayload", () => {
  it("derives BMI and legacy diagnosis/procedure strings", () => {
    const result = buildPreopPayload({
      heightCm: 170,
      weightKg: 70,
      diagnoses: [{ label: "Hypertension" }, { label: "Diabetes" }],
      procedures: [{ label: "Appendectomy" }],
      upperLipBiteTest: "CLASS_II",
    })

    expect(result.bmi).toBeCloseTo(24.2, 1)
    expect(result.diagnosis).toBe("Hypertension; Diabetes")
    expect(result.plannedProcedure).toBe("Appendectomy")
    expect(result.upperLipBiteTest).toBe("CLASS_II")
  })

  it("calculates RCRI, Apfel, and STOP-BANG scores from form values", () => {
    const result = buildPreopPayload({
      sex: "MALE",
      ageYears: 58,
      heightCm: 170,
      weightKg: 110,
      highRiskSurgery: true,
      rcriCHF: true,
      rcriCVD: true,
      smoking: false,
      apfelPONVHistory: true,
      stopbangSnoring: true,
      stopbangTired: true,
      stopbangBP: true,
      stopbangNeck: true,
    })

    expect(result.rcriScore).toBe(3)
    expect(result.apfelScore).toBe(2)
    expect(result.stopBangScore).toBe(7)
  })
})
