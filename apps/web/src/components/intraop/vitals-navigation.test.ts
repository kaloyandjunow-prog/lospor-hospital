import { describe, expect, it } from "vitest"
import { nextVitalsField } from "./vitals-navigation"

/**
 * Vitals are read out and typed in bursts: a whole set of observations for one
 * time, then the next time. Tab has to follow that, not the browser's own
 * left-to-right order, or an anaesthetist typing a set of obs ends up putting
 * the heart rate in the systolic box three columns along.
 */
describe("nextVitalsField", () => {
  const rowKeys = ["systolic", "diastolic", "heartRate", "spo2"]
  const base = { rowKeys, colCount: 288 }

  it("moves down the column, staying at the same time", () => {
    expect(nextVitalsField({ ...base, currentKey: "systolic", col: 4 }))
      .toEqual({ col: 4, key: "diastolic" })
  })

  it("wraps from the bottom of one time to the top of the next", () => {
    expect(nextVitalsField({ ...base, currentKey: "spo2", col: 4 }))
      .toEqual({ col: 5, key: "systolic" })
  })

  it("stops at the end of the chart rather than wrapping to the start", () => {
    expect(nextVitalsField({ ...base, currentKey: "spo2", col: 287 })).toBeNull()
  })

  it("follows the lanes actually shown, not a fixed order", () => {
    // Monitoring selection decides which lanes exist; with no diastolic lane,
    // Tab must skip it rather than land on a field that is not on screen.
    expect(nextVitalsField({
      ...base,
      rowKeys: ["systolic", "heartRate"],
      currentKey: "systolic",
      col: 0,
    })).toEqual({ col: 0, key: "heartRate" })
  })

  it("stops on a field that is not among the shown lanes", () => {
    expect(nextVitalsField({ ...base, currentKey: "temperature", col: 0 })).toBeNull()
  })

  it("stops when there are no lanes at all", () => {
    expect(nextVitalsField({ ...base, rowKeys: [], currentKey: "systolic", col: 0 })).toBeNull()
  })
})
