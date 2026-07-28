import { describe, it, expect } from "vitest"
import { defaultIntervalMin, detectCriticalCols, planPanels, PANELS_PER_SHEET } from "./pagination"

describe("defaultIntervalMin (legacy mapping)", () => {
  it("maps duration to sampling interval", () => {
    expect(defaultIntervalMin(60)).toBe(5)
    expect(defaultIntervalMin(120)).toBe(5)
    expect(defaultIntervalMin(121)).toBe(10)
    expect(defaultIntervalMin(240)).toBe(10)
    expect(defaultIntervalMin(300)).toBe(15)
    expect(defaultIntervalMin(480)).toBe(15)
    expect(defaultIntervalMin(600)).toBe(20)
  })
})

describe("detectCriticalCols", () => {
  it("flags SBP swings > threshold within the window", () => {
    const vitals = [
      { systolic: 120 }, { systolic: 122 }, { systolic: 118 },
      { systolic: 80 },
      { systolic: 85 }, { systolic: 118 }, { systolic: 120 },
    ]
    const ranges = detectCriticalCols(vitals)
    expect(ranges.some(r => r.startCol <= 3 && 3 <= r.endCol)).toBe(true)
  })

  it("returns nothing for stable vitals or empty input", () => {
    expect(detectCriticalCols([{ systolic: 120 }, { systolic: 125 }, { systolic: 118 }])).toEqual([])
    expect(detectCriticalCols([])).toEqual([])
    expect(detectCriticalCols(undefined)).toEqual([])
  })

  it("spans null gaps when the window covers them", () => {
    const vitals = [{ systolic: 120 }, {}, {}, { systolic: 84 }]
    expect(detectCriticalCols(vitals)).toEqual([])
    const ranges = detectCriticalCols(vitals, { windowMin: 15 })
    expect(ranges.some(r => r.startCol === 0 && r.endCol === 3)).toBe(true)
  })
})

describe("planPanels — stacked half-case panels, paper-chart style", () => {
  it("short case (1h40m): one full-height panel at native q5", () => {
    expect(planPanels({ totalCols: 20 })).toEqual([
      { index: 0, sheet: 0, startCol: 0, endCol: 19, intervalMin: 5 },
    ])
  })

  it("5h boundary case: still a single panel", () => {
    // 60 cols: q5 → 60 > 24; q10 → 30 > 24; q15 → 20 ≤ 24
    expect(planPanels({ totalCols: 60 })).toEqual([
      { index: 0, sheet: 0, startCol: 0, endCol: 59, intervalMin: 15 },
    ])
  })

  it("6h case: TWO stacked 3h panels on one sheet, q10 numeric", () => {
    // halves of 36 cols: q5 → 36 > 24; q10 → 18 ≤ 24
    expect(planPanels({ totalCols: 72 })).toEqual([
      { index: 0, sheet: 0, startCol: 0,  endCol: 35, intervalMin: 10 },
      { index: 1, sheet: 0, startCol: 36, endCol: 71, intervalMin: 10 },
    ])
  })

  it("12h case: two 6h panels on one sheet, q15 numeric", () => {
    // halves of 72 cols: q15 → 24 ≤ 24
    expect(planPanels({ totalCols: 144 })).toEqual([
      { index: 0, sheet: 0, startCol: 0,  endCol: 71,  intervalMin: 15 },
      { index: 1, sheet: 0, startCol: 72, endCol: 143, intervalMin: 15 },
    ])
  })

  it("uneven split snaps the boundary to the hour", () => {
    // 145 cols → boundary at col 72 (14:00 for an 08:00 start)
    const plans = planPanels({ totalCols: 145 })
    expect(plans).toHaveLength(2)
    expect(plans[0].endCol).toBe(71)
    expect(plans[1].startCol).toBe(72)
    expect(plans[1].endCol).toBe(144)
  })

  it("20h case: still just two panels (10h each, q30) on one sheet", () => {
    expect(planPanels({ totalCols: 240 })).toEqual([
      { index: 0, sheet: 0, startCol: 0,   endCol: 119, intervalMin: 30 },
      { index: 1, sheet: 0, startCol: 120, endCol: 239, intervalMin: 30 },
    ])
  })

  it("28h marathon: three panels — third one on a continuation sheet", () => {
    // 336 cols: halves of 168 > 144 max → 3 panels of ~112 cols (q30)
    const plans = planPanels({ totalCols: 336 })
    expect(plans).toHaveLength(3)
    expect(plans.map(p => p.sheet)).toEqual([0, 0, 1])
    expect(plans[0].startCol).toBe(0)
    expect(plans[plans.length - 1].endCol).toBe(335)
  })

  it("coverage is continuous and exhaustive; budget respected on every panel", () => {
    for (const cols of [1, 20, 60, 61, 72, 100, 144, 145, 240, 288, 336, 600]) {
      const plans = planPanels({ totalCols: cols })
      expect(plans[0].startCol).toBe(0)
      expect(plans[plans.length - 1].endCol).toBe(cols - 1)
      for (let k = 1; k < plans.length; k++) {
        expect(plans[k].startCol).toBe(plans[k - 1].endCol + 1)
        expect(plans[k].sheet).toBe(Math.floor(plans[k].index / PANELS_PER_SHEET))
      }
      for (const p of plans) {
        const n = p.endCol - p.startCol + 1
        expect(n).toBeGreaterThan(0)
        expect(Math.ceil(n / (p.intervalMin / 5))).toBeLessThanOrEqual(24)
      }
    }
  })
})
