import { describe, expect, it } from "vitest"
import { dantroleneVialsOpened, dantroleneVialsView, vialDimensions, vialSvg } from "./dantrolene-vials"

describe("the dantrolene vials on the MH card", () => {
  it("plans a 140 kg patient's 2 mg/kg as one 250 and two 20s, drawn largest first", () => {
    const view = dantroleneVialsView({ weightKg: 140, perKg: 2, givenDosesMg: [], stocked: [20, 250] })!
    expect(view).toMatchObject({ doseMg: 280, openedVials: 0, openedWithThis: 3, givenMg: 0, afterMgPerKg: 2 })
    expect(view.plan.vials).toEqual([{ size: 250, count: 1 }, { size: 20, count: 2 }])
    expect(view.drawing.map(vial => vial.size)).toEqual([250, 20, 20])
    // The dose uses all of the 250, all of the first 20 and half of the last.
    expect(view.drawing.map(vial => Math.round(vial.used * 100) / 100)).toEqual([1, 1, 0.5])
  })

  it("plans a repeat on its own and adds the vials already opened", () => {
    // 280 mg given first (3 vials), then 1 mg/kg: 140 mg is a 120 and a 20.
    const view = dantroleneVialsView({ weightKg: 140, perKg: 1, givenDosesMg: [280], stocked: [20, 120, 250] })!
    expect(view.plan.vials).toEqual([{ size: 120, count: 1 }, { size: 20, count: 1 }])
    expect(view).toMatchObject({ doseMg: 140, givenMg: 280, givenMgPerKg: 2, afterMgPerKg: 3 })
    expect(view.openedVials).toBe(dantroleneVialsOpened([280], [20, 120, 250]).vials)
    expect(view.openedWithThis).toBe(view.openedVials + 2)
  })

  it("notes the 10 mg/kg threshold from the total with this dose", () => {
    expect(dantroleneVialsView({ weightKg: 80, perKg: 2, givenDosesMg: [640], stocked: [20] })!.reachesNoteAt10).toBe(true)
    expect(dantroleneVialsView({ weightKg: 80, perKg: 2, givenDosesMg: [400], stocked: [20] })!.reachesNoteAt10).toBe(false)
  })

  it("draws nothing without a weight, a dose or a stocked size", () => {
    expect(dantroleneVialsView({ weightKg: 0, perKg: 2, givenDosesMg: [], stocked: [20] })).toBeNull()
    expect(dantroleneVialsView({ weightKg: 80, perKg: 0, givenDosesMg: [], stocked: [20] })).toBeNull()
    expect(dantroleneVialsView({ weightKg: 80, perKg: 2, givenDosesMg: [], stocked: [] })).toBeNull()
  })

  it("draws a bigger vial bigger, and a part-used one with the unused powder dimmed", () => {
    expect(vialDimensions(250).h).toBeGreaterThan(vialDimensions(120).h)
    expect(vialDimensions(120).h).toBeGreaterThan(vialDimensions(20).h)
    expect(vialSvg(20)).toContain("20 mg")
    expect(vialSvg(250, 0.5)).toContain('fill-opacity="0.28"')
    expect(vialSvg(250, 1)).not.toContain('fill-opacity="0.28"')
    expect(vialSvg(120).startsWith("<svg")).toBe(true)
  })
})
