import { describe, expect, it } from "vitest"
import {
  calcSuggestedDose,
  suggestedDoseFromWeights,
  dosingWeightKg,
  idealBodyWeightKg,
  type DoseEntry,
} from "./dose-calc"

const MALE_175 = { weightKg: 80, heightCm: 175, sex: "MALE" }    // IBW ≈ 70.46
const FEMALE_160 = { weightKg: 60, heightCm: 160, sex: "FEMALE" } // IBW ≈ 52.38

describe("idealBodyWeightKg (Devine)", () => {
  it("computes male/female IBW", () => {
    expect(idealBodyWeightKg(175, "MALE")).toBeCloseTo(70.46, 1)
    expect(idealBodyWeightKg(160, "FEMALE")).toBeCloseTo(52.38, 1)
  })
  it("returns null below 5 ft or without height", () => {
    expect(idealBodyWeightKg(150, "MALE")).toBeNull()
    expect(idealBodyWeightKg(undefined, "MALE")).toBeNull()
    expect(idealBodyWeightKg(null, "MALE")).toBeNull()
  })
})

describe("dosingWeightKg", () => {
  it("TBW basis uses total body weight (fallback IBW)", () => {
    expect(dosingWeightKg("TBW", 70, 80)).toBe(80)
    expect(dosingWeightKg("TBW", 70, null)).toBe(70)
  })
  it("IBW basis caps at the patient's actual weight", () => {
    expect(dosingWeightKg("IBW", 84, 50)).toBe(50)
    expect(dosingWeightKg(undefined, 70, 80)).toBe(70)
  })
  it("falls back when one is missing", () => {
    expect(dosingWeightKg("IBW", null, 80)).toBe(80)
    expect(dosingWeightKg("IBW", 70, null)).toBe(70)
    expect(dosingWeightKg("IBW", null, null)).toBeNull()
  })
})

describe("suggestedDoseFromWeights (web entry point)", () => {
  it("computes per-kg with resolved IBW/TBW", () => {
    const entry: DoseEntry = { perKg: 2, basis: "IBW", roundTo: 10, hint: "1–2.5 mg/kg" }
    expect(suggestedDoseFromWeights(entry, undefined, 70.46, 80)).toEqual({ dose: "140", hint: "1–2.5 mg/kg" })
  })
  it("returns empty (with hint) for a concentration route with no doseCalc", () => {
    const lido: DoseEntry = { hint: "", byRoute: { IV: { perKg: 1, basis: "IBW", roundTo: 10 } } }
    expect(suggestedDoseFromWeights(lido, "IV", 70.46, 80).dose).toBe("70")
    expect(suggestedDoseFromWeights(lido, "PD", 70.46, 80).dose).toBe("")
  })
  it("clamps to cap and honours TBW basis", () => {
    expect(suggestedDoseFromWeights({ perKg: 25, roundTo: 1, cap: 3000 }, undefined, null, 200).dose).toBe("3000")
    expect(suggestedDoseFromWeights({ perKg: 1, basis: "TBW" }, undefined, 70, 80).dose).toBe("80")
  })
})

describe("calcSuggestedDose (patient entry point)", () => {
  it("returns empty for no entry", () => {
    expect(calcSuggestedDose(undefined, undefined, MALE_175)).toEqual({ dose: "", hint: "" })
  })
  it("returns a flat dose as-is", () => {
    expect(calcSuggestedDose({ flat: 0.5, hint: "0.5 mg" }, undefined, MALE_175)).toEqual({ dose: "0.5", hint: "0.5 mg" })
  })
  it("computes per-kg IBW with roundTo", () => {
    const entry: DoseEntry = { perKg: 2, basis: "IBW", roundTo: 10 }
    expect(calcSuggestedDose(entry, undefined, MALE_175).dose).toBe("140")
    expect(calcSuggestedDose(entry, undefined, FEMALE_160).dose).toBe("100")
  })
  it("falls back to TBW when height is missing; empty when nothing known", () => {
    const entry: DoseEntry = { perKg: 2, basis: "IBW", roundTo: 10 }
    expect(calcSuggestedDose(entry, undefined, { weightKg: 80 }).dose).toBe("160")
    expect(calcSuggestedDose(entry, undefined, {}).dose).toBe("")
  })
})
