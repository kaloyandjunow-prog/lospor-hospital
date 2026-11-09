import { describe, expect, it } from "vitest"
import { dantroleneVialPlan, vialPlanText } from "./vial-plan"

describe("the most economic dantrolene vials", () => {
  it("takes one 250 and two 20 for 280 mg when both are stocked", () => {
    const plan = dantroleneVialPlan(280, [20, 250])
    expect(plan.vials).toEqual([{ size: 250, count: 1 }, { size: 20, count: 2 }])
    expect(plan).toMatchObject({ count: 3, totalMg: 290, wasteMg: 10 })
    expect(vialPlanText(plan)).toBe("1 × 250 mg + 2 × 20 mg")
  })

  it("takes the fewest vials that leave less than the smallest stocked vial over", () => {
    expect(dantroleneVialPlan(240, [20, 120, 250])).toMatchObject({ vials: [{ size: 250, count: 1 }], wasteMg: 10 })
    expect(dantroleneVialPlan(140, [20, 120]).vials).toEqual([{ size: 120, count: 1 }, { size: 20, count: 1 }])
    expect(dantroleneVialPlan(100, [20, 120, 250]).vials).toEqual([{ size: 20, count: 5 }])
    expect(dantroleneVialPlan(350, [20, 250]).vials).toEqual([{ size: 250, count: 1 }, { size: 20, count: 5 }])
  })

  it("uses the one stocked size for everything, and rounds up", () => {
    expect(dantroleneVialPlan(80, [20])).toMatchObject({ vials: [{ size: 20, count: 4 }], wasteMg: 0 })
    expect(dantroleneVialPlan(81, [20])).toMatchObject({ count: 5, totalMg: 100, wasteMg: 19 })
    expect(dantroleneVialPlan(300, [250])).toMatchObject({ count: 2, totalMg: 500 })
  })

  it("counts waste against the real dose, not the rounded one", () => {
    expect(dantroleneVialPlan(75.5, [20]).wasteMg).toBeCloseTo(4.5)
  })

  it("is empty with no dose or nothing stocked, and ignores a size that is not positive", () => {
    expect(dantroleneVialPlan(0, [20]).count).toBe(0)
    expect(dantroleneVialPlan(100, []).count).toBe(0)
    expect(dantroleneVialPlan(100, [0, -5, 20]).vials).toEqual([{ size: 20, count: 5 }])
  })

  it("never opens more than needed: no plan beats another on waste and count", () => {
    for (let dose = 10; dose <= 700; dose += 10) {
      const plan = dantroleneVialPlan(dose, [20, 120, 250])
      expect(plan.totalMg).toBeGreaterThanOrEqual(dose)
      expect(plan.wasteMg).toBeLessThan(20)
    }
  })
})
