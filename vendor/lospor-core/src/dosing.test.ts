import { describe, expect, it } from "vitest"
import { suggestedDoseFromWeights } from "./dosing"
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
