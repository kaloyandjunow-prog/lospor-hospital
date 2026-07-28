import { describe, expect, it } from "vitest"
import { calcSuggestedDose, dosingWeightKg, idealBodyWeightKg, type DoseEntry } from "./dose-calc"

const MALE_175 = { weightKg: 80, heightCm: 175, sex: "MALE" }   // IBW ≈ 70.46
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
  it("TBW basis uses total body weight", () => {
    expect(dosingWeightKg("TBW", 70, 80)).toBe(80)
    expect(dosingWeightKg("TBW", 70, null)).toBe(70) // fallback IBW
  })
  it("IBW basis caps at the patient's actual weight", () => {
    expect(dosingWeightKg("IBW", 84, 50)).toBe(50) // tall + light → real weight
    expect(dosingWeightKg(undefined, 70, 80)).toBe(70) // default = min(IBW,TBW)
  })
  it("falls back when one is missing", () => {
    expect(dosingWeightKg("IBW", null, 80)).toBe(80)
    expect(dosingWeightKg("IBW", 70, null)).toBe(70)
    expect(dosingWeightKg("IBW", null, null)).toBeNull()
  })
})

describe("calcSuggestedDose", () => {
  it("returns empty for no entry", () => {
    expect(calcSuggestedDose(undefined, undefined, MALE_175)).toEqual({ dose: "", hint: "" })
  })

  it("returns a flat dose as-is", () => {
    const entry: DoseEntry = { flat: 0.5, hint: "0.5 mg" }
    expect(calcSuggestedDose(entry, undefined, MALE_175)).toEqual({ dose: "0.5", hint: "0.5 mg" })
  })

  it("computes per-kg IBW with roundTo (propofol 2 mg/kg, round 10)", () => {
    const entry: DoseEntry = { perKg: 2, basis: "IBW", roundTo: 10, hint: "1–2.5 mg/kg" }
    expect(calcSuggestedDose(entry, undefined, MALE_175).dose).toBe("140")   // min(70.46,80)*2 → 141 → round10 → 140
    expect(calcSuggestedDose(entry, undefined, FEMALE_160).dose).toBe("100") // 52.38*2 ≈ 104.8 → round10 → 100
  })

  it("uses per-route doseCalc and ignores concentration routes", () => {
    const lido: DoseEntry = { hint: "", byRoute: { IV: { perKg: 1, basis: "IBW", roundTo: 10 } } }
    expect(calcSuggestedDose(lido, "IV", MALE_175).dose).toBe("70")  // 70.46*1 → 70
    expect(calcSuggestedDose(lido, "PD", MALE_175).dose).toBe("")    // concentration route: no doseCalc
  })

  it("falls back to total body weight when height (IBW) is missing", () => {
    const entry: DoseEntry = { perKg: 2, basis: "IBW", roundTo: 10 }
    expect(calcSuggestedDose(entry, undefined, { weightKg: 80 }).dose).toBe("160") // 80*2 → 160
  })

  it("returns empty when neither weight nor height is known", () => {
    const entry: DoseEntry = { perKg: 2, basis: "IBW", roundTo: 10 }
    expect(calcSuggestedDose(entry, undefined, {}).dose).toBe("")
  })

  it("clamps to cap", () => {
    const pcc: DoseEntry = { perKg: 25, roundTo: 1, cap: 3000 }
    expect(calcSuggestedDose(pcc, undefined, { weightKg: 200 }).dose).toBe("3000") // 200*25=5000 → cap 3000
  })

  it("honours TBW basis", () => {
    const entry: DoseEntry = { perKg: 1, basis: "TBW" }
    expect(calcSuggestedDose(entry, undefined, MALE_175).dose).toBe("80") // TBW 80
  })

  it("caps IBW at real weight for a tall, light patient", () => {
    const entry: DoseEntry = { perKg: 2, basis: "IBW", roundTo: 10 }
    expect(calcSuggestedDose(entry, undefined, { weightKg: 50, heightCm: 190, sex: "MALE" }).dose).toBe("100") // min(84,50)=50 *2 → 100
  })
})
