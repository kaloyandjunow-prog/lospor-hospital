import { describe, expect, it, vi } from "vitest"
import { parseIntraopAutomation } from "@lospor/core/intraop-automation"
import { VITAL_BANDS } from "@lospor/core/vital-questions"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/intraop-automation", async () => {
  const actual = await vi.importActual<typeof import("@/lib/intraop-automation")>("@/lib/intraop-automation")
  return {
    tallyTable: actual.tallyTable,
    readIntraopAutomation: async () => parseIntraopAutomation(undefined),
    vitalStats: async () => ({}),
    // Two months of cumulative counts: adults' heart rate 50..109, 120 readings of each.
    vitalStatsHistory: async () => [
      { month: "2026-10", stats: { ADULT: { hr: { min: 50, counts: Array.from({ length: 60 }, () => 1), cases: 40 } } } },
      { month: "2026-11", stats: { ADULT: { hr: { min: 50, counts: Array.from({ length: 60 }, () => 2), cases: 120 } } } },
    ],
  }
})

describe("the Unusual readings view (10.2.0)", () => {
  it("states each band's fixed rules as Core does", async () => {
    const { fixedRulesOf } = await import("./intraop-readings-control")
    const band = (key: string) => fixedRulesOf(VITAL_BANDS.find(item => item.key === key)!)
    expect(band("ADULT")).toEqual({ tachycardiaAbove: 100, bradycardiaBelow: 50, hypotension: { sign: "map", from: 65, to: 65 } })
    expect(band("NEWBORN").hypotension).toEqual({ sign: "sbp", from: 60, to: 60 })
    expect(band("TODDLER").hypotension).toEqual({ sign: "sbp", from: 70, to: 74 })
    expect(band("SCHOOL").hypotension).toEqual({ sign: "sbp", from: 82, to: 90 })
  })

  it("keeps a finished case's lowest and highest figures, and nothing that names it", async () => {
    const { caseTuple } = await import("./intraop-readings-control")
    expect(caseTuple({ hr: { "60": 2, "92": 1 }, sbp: { "101": 3, "118": 1 }, map: { "70": 4 } })).toEqual([60, 92, 101, null, 70])
    expect(caseTuple({})).toEqual([null, null, null, null, null])
  })

  it("assembles counts, cases, limits by month and the settings, from the tally", async () => {
    const { intraopReadingsControlView } = await import("./intraop-readings-control")
    const contributions = Array.from({ length: 1_005 }, () => ({ contribution: { band: "ADULT", signs: { hr: { "70": 5, "88": 1 } } } }))
    const queries = [
      [{ band: "ADULT", sign: "hr", value: 70, count: 600 }, { band: "ADULT", sign: "hr", value: 88, count: 120 }],
      [{ band: "ADULT", sign: "hr", cases: 120 }],
      [...contributions, { contribution: null }],
    ]
    const db = {
      institution: { findMany: async () => [{ id: "inst-1" }] },
      $queryRaw: async () => queries.shift(),
    }
    const view = await intraopReadingsControlView(db as never, Date.parse("2026-11-09T10:00:00Z"))

    expect(view.stats.ADULT?.hr).toEqual({ min: 70, counts: [600, ...Array(17).fill(0), 120], cases: 120 })
    // Capped per band, newest first, five figures each.
    expect(view.cases.ADULT).toHaveLength(1_000)
    expect(view.cases.ADULT![0]).toEqual([70, 88, null, null, null])
    expect(view.caseColumns).toEqual(["hrMin", "hrMax", "sbpMin", "dbpMin", "mapMin"])
    // Limits at every tail step for each month, the cases so far beside them.
    expect(view.history).toHaveLength(2)
    expect(view.history[1]!.limits.ADULT!.hr!.cases).toBe(120)
    expect(view.history[1]!.limits.ADULT!.hr!.low).toHaveLength(view.tailSteps.length)
    expect(view.history[1]!.limits.ADULT!.hr!.high).toHaveLength(view.tailSteps.length)
    // The settings in force, and the 10.2.0 fact that a high blood-pressure limit asks nothing.
    expect(view.config.minCases).toBe(100)
    expect(view.hypertensionUsesStatistics).toBe(false)
    expect(view.bands).toHaveLength(8)
    expect(view.signs.map(sign => sign.key)).toEqual(["hr", "sbp", "dbp", "map"])
    expect(JSON.stringify(view)).not.toMatch(/caseId|userId|institutionId/)
  })
})
