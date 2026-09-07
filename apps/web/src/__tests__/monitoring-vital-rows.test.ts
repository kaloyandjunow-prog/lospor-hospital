import { describe, expect, it } from "vitest"

import { cvpToCanonical, cvpToDisplay } from "@lospor/core/monitoring-values"

import { VITAL_ROW_DEFS } from "@/components/intraop/TimetableVitalsChart"

/**
 * BIS, train-of-four and CVP are lanes in the timetable, not fields on the
 * monitoring form, because the timing is the information: a BIS that sat at 55
 * and one that dropped to 22 for twenty minutes are the same case without a
 * timestamp on each reading.
 */
describe("the monitors that read a number have their own lanes", () => {
  const byKey = Object.fromEntries(VITAL_ROW_DEFS.map(r => [r.key, r]))

  it("gates each lane on the modality that reveals it", () => {
    expect(byKey.bis?.monitors).toEqual(["bis"])
    expect(byKey.tofRatio?.monitors).toEqual(["tofMonitor"])
    expect(byKey.cvp?.monitors).toEqual(["cvpMonitor"])
  })

  it("places them under EtCO₂ and temperature", () => {
    const order = VITAL_ROW_DEFS.map(r => r.key)
    for (const key of ["bis", "tofRatio", "cvp"] as const) {
      expect(order.indexOf(key)).toBeGreaterThan(order.indexOf("etco2"))
      expect(order.indexOf(key)).toBeGreaterThan(order.indexOf("temp"))
    }
  })

  it("keeps each lane on the scale its monitor reports", () => {
    // A BIS is an index over 0-100 and the train-of-four is a fraction. A lane
    // that let either wander off its scale would produce a column nobody could
    // interpret, which is also why the ratio and the count stay separate.
    expect([byKey.bis?.min, byKey.bis?.max, byKey.bis?.step]).toEqual([0, 100, 1])
    expect([byKey.tofRatio?.min, byKey.tofRatio?.max, byKey.tofRatio?.step]).toEqual([0, 1, 0.1])
    // Stated in mmHg, which is what the column holds whatever is on screen.
    expect([byKey.cvp?.min, byKey.cvp?.max]).toEqual([0.1, 50])
  })

  /**
   * The silent failure this guards. CVP may be entered in cmH2O and is always
   * stored in mmHg, so a value that made the round trip without converting --
   * or converted twice -- would be wrong by a factor of 1.36 with nothing on
   * screen to show it.
   */
  it("returns a CVP typed in cmH2O to the millimetres it is stored in", () => {
    const typed = 10
    const stored = cvpToCanonical(typed, "cmH2O")

    expect(stored).toBe(7.4)
    expect(cvpToDisplay(stored, "cmH2O")).toBe(10.1)
    // And in mmHg nothing moves, so the preference cannot alter the record.
    expect(cvpToCanonical(7.4, "mmHg")).toBe(7.4)
  })

  /**
   * TOF ratio shares the chart's single 0-220 axis with BP and heart rate, so a
   * real 0.9 plots at 0.4% of chart height -- indistinguishable from 0, while
   * BIS and CVP already read clearly on the same axis. Only the plotted height
   * changes; the stored ratio, the grid cell and the tooltip stay 0.9.
   */
  it("plots TOF as a percentage of the shared axis, without touching what is stored", () => {
    expect(byKey.tofRatio?.toPlotValue?.(0.9)).toBe(90)
    expect(byKey.tofRatio?.toPlotValue?.(0)).toBe(0)
    expect(byKey.bis?.toPlotValue).toBeUndefined()
    expect(byKey.cvp?.toPlotValue).toBeUndefined()
  })

  it("opens the steppers where a clinician is usually heading", () => {
    // defaultVal is only where the control opens; nothing stores it. 50 is
    // mid-range surgical anaesthesia and 0.9 is the threshold for adequate
    // reversal.
    expect(byKey.bis?.defaultVal).toBe(50)
    expect(byKey.tofRatio?.defaultVal).toBe(0.9)
  })
})
