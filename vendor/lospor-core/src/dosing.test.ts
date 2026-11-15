import { describe, expect, it } from "vitest"
import { roundDoseToStep, suggestedDoseFromWeights } from "./dosing"
describe("a route with dose settings of its own", () => {
  // Morphine: 0.1 mg/kg IV/IM, while the intrathecal route is in micrograms.
  const morphine = {
    hint: "0.1 mg/kg IBW",
    byRoute: { IV: { perKg: 0.1, basis: "IBW", roundTo: 1 }, IM: { perKg: 0.1, basis: "IBW", roundTo: 1 } },
    ownRoutes: ["IV", "IM", "IT", "PD"],
  }

  it("never takes another route's calculation or hint", () => {
    expect(suggestedDoseFromWeights(morphine, "IT", 70, 70)).toEqual({ dose: "", hint: "" })
    expect(suggestedDoseFromWeights(morphine, "INTRATHECAL", 70, 70)).toEqual({ dose: "", hint: "" })
    expect(suggestedDoseFromWeights(morphine, "EPIDURAL", 70, 70)).toEqual({ dose: "", hint: "" })
  })

  it("keeps the calculation of the routes that have one, by either spelling", () => {
    expect(suggestedDoseFromWeights(morphine, "IV", 70, 70)).toEqual({ dose: "7", hint: "0.1 mg/kg IBW" })
    expect(suggestedDoseFromWeights(morphine, "INTRAMUSCULAR", 70, 70).dose).toBe("7")
  })
})

describe("doses rounded to a step", () => {
  it("carry no floating-point dust", () => {
    expect(String(roundDoseToStep(0.3, 0.1))).toBe("0.3")
    expect(String(roundDoseToStep(0.7, 0.1))).toBe("0.7")
    expect(roundDoseToStep(0.123, 0.05)).toBe(0.1)
    expect(roundDoseToStep(147, 10)).toBe(150)
  })

  it("leave the suggested dose clean", () => {
    // 3 kg x 0.1 mg/kg, rounded to 0.1: was "0.30000000000000004".
    const { dose } = suggestedDoseFromWeights({ perKg: 0.1, roundTo: 0.1, basis: "TBW" }, undefined, null, 3)
    expect(dose).toBe("0.3")
  })
})
