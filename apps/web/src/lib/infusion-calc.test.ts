import { describe, expect, it } from "vitest"
import { calcInfusionTotal } from "./infusion-calc"
import type { TimetableInfusion } from "@/components/IntraopTimetable"

function inf(p: Partial<TimetableInfusion>): TimetableInfusion {
  return { id: "i1", name: "X", rate: 0, unit: "mg/hr", startCol: 0, endCol: 0, color: "#000", ...p }
}

// 12 columns (startCol 0 → endCol 11) = 60 minutes = 1 hour.
describe("calcInfusionTotal", () => {
  it("per-kg/hr over one hour uses IBW", () => {
    const r = calcInfusionTotal(inf({ name: "Propofol", rate: 6, unit: "mg/kg/hr", endCol: 11 }), 70, 90, { Propofol: "IBW" })
    expect(r.amount).toBe(420) // 6 × 70 × 1h
    expect(r.unit).toBe("mg")
    expect(r.weightUsed).toBe(70)
    expect(r.weightBasis).toBe("IBW")
  })

  it("TBW basis uses total body weight", () => {
    const r = calcInfusionTotal(inf({ name: "Heparin", rate: 18, unit: "IU/kg/hr", endCol: 11 }), 70, 90, { Heparin: "TBW" })
    expect(r.amount).toBe(1620) // 18 × 90 × 1h
    expect(r.weightBasis).toBe("TBW")
  })

  it("non-per-kg mg/hr has no weight", () => {
    const r = calcInfusionTotal(inf({ name: "Nitroglycerin", rate: 5, unit: "mg/hr", endCol: 11 }), 70, 90, {})
    expect(r.amount).toBe(5)
    expect(r.unit).toBe("mg")
    expect(r.weightUsed).toBeNull()
    expect(r.weightBasis).toBeNull()
  })

  it("per-kg/min over one hour (60 min)", () => {
    const r = calcInfusionTotal(inf({ name: "Dopamine", rate: 5, unit: "mcg/kg/min", endCol: 11 }), 70, 90, { Dopamine: "IBW" })
    expect(r.amount).toBe(21000) // 5 × 70 × 60min
    expect(r.unit).toBe("mcg")
  })

  it("sums across rate changes", () => {
    const r = calcInfusionTotal(
      inf({ name: "Propofol", rate: 6, unit: "mg/kg/hr", endCol: 11, rateChanges: [{ col: 6, rate: 3, unit: "mg/kg/hr" }] }),
      70, 90, { Propofol: "IBW" },
    )
    // cols 0–5 @6 (0.5h)=210, cols 6–11 @3 (0.5h)=105 → 315
    expect(r.amount).toBe(315)
  })
})
