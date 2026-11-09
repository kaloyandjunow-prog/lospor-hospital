import { describe, expect, it } from "vitest"
import { bisFromScan, tofRatioFromScan } from "./monitor-scan"

describe("BIS from a monitor photo", () => {
  it("keeps a whole number from 0 to 100 and rounds a decimal", () => {
    expect(bisFromScan(46)).toBe(46)
    expect(bisFromScan(45.6)).toBe(46)
    expect(bisFromScan(0)).toBe(0)
    expect(bisFromScan(100)).toBe(100)
  })
  it("drops anything out of range or not a number", () => {
    expect(bisFromScan(101)).toBeNull()
    expect(bisFromScan(-1)).toBeNull()
    expect(bisFromScan("46")).toBeNull()
    expect(bisFromScan(null)).toBeNull()
    expect(bisFromScan(Number.NaN)).toBeNull()
  })
})

describe("TOF from a monitor photo is corrected to a ratio", () => {
  it("keeps a ratio as it is", () => {
    expect(tofRatioFromScan(0.9)).toBe(0.9)
    expect(tofRatioFromScan(0)).toBe(0)
    expect(tofRatioFromScan(1.0001)).toBe(1)
  })
  it("turns a percent into a ratio", () => {
    expect(tofRatioFromScan(90)).toBe(0.9)
    expect(tofRatioFromScan(95)).toBe(0.95)
    expect(tofRatioFromScan(5)).toBe(0.05)
    expect(tofRatioFromScan(100)).toBe(1)
  })
  it("caps a ratio above 1 at 1", () => {
    expect(tofRatioFromScan(1.1)).toBe(1)
    expect(tofRatioFromScan(110)).toBe(1)
  })
  it("discards a train-of-four count, which cannot be told from a percent", () => {
    for (const count of [1, 2, 3, 4]) expect(tofRatioFromScan(count)).toBeNull()
  })
  it("drops negatives, huge numbers and non-numbers", () => {
    expect(tofRatioFromScan(-0.2)).toBeNull()
    expect(tofRatioFromScan(900)).toBeNull()
    expect(tofRatioFromScan("90")).toBeNull()
    expect(tofRatioFromScan(null)).toBeNull()
  })
})
