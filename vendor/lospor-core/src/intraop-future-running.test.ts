import { describe, expect, it } from "vitest"

import { projectIntraopEvents } from "./intraop-engine"
import { runningItemsAt, runningItemsByColumn, runsOnAt } from "./intraop-summary"
import { applyIntraopEventOps, timetableEditToEventOps } from "./intraop-timetable-edit"
import { calcInfusionTotal } from "./intraop-totals"
import type { LogEvent, TimetableData } from "./intraop-types"

// A running item in the rows after "now" (9.13.1). Propofol runs at
// 4 mg/kg/h from 14:45; at 14:50 the clinician opens the 15:55 row to plan a
// change to 8. That row used to show nothing running, so the only way was a
// second propofol infusion -- which then counted alongside the first.

const start = "2026-09-28T11:45:00.000Z" // 14:45 Sofia; column 0
const at = (minutes: number) => new Date(Date.parse(start) + minutes * 60_000).toISOString()
const col = (minutes: number) => Math.floor(minutes / 5)
const read = (events: LogEvent[], minutes: number) => projectIntraopEvents(events, { start, openThrough: at(minutes) })

const propofol: LogEvent = { id: "p", ts: at(0), type: "infusion_start", infId: "prop", name: "Propofol", rate: "4", unit: "mg/kg/hr" }
const live = { projectRunning: true }

describe("a running infusion in a row after now", () => {
  it("shows there, marked projected, with its running rate -- only on the live chart", () => {
    const chart = read([propofol], 5) // now 14:50
    const row = runningItemsAt(chart, col(70), live) // 15:55
    expect(row).toEqual([expect.objectContaining({ kind: "infusion", id: "inf-prop", rate: 4, projected: true })])
    // Records, summaries and ended cases never project.
    expect(runningItemsAt(chart, col(70))).toEqual([])
    // The drawn bar's own rows are unchanged.
    expect(runningItemsAt(chart, col(5), live)[0].projected).toBeUndefined()
  })

  it("does not show after its planned stop; the stop's own row shows the stop", () => {
    const chart = read([propofol, { id: "s", ts: at(40), type: "infusion_stop", infId: "prop" }], 5)
    expect(runningItemsAt(chart, col(35), live)).toEqual([expect.objectContaining({ projected: true })])
    expect(runningItemsAt(chart, col(40), live)).toEqual([expect.objectContaining({ plannedStop: true })])
    expect(runningItemsAt(chart, col(45), live)).toEqual([])
  })

  it("does not show once stopped", () => {
    const chart = read([propofol, { id: "s", ts: at(3), type: "infusion_stop", infId: "prop" }], 5)
    expect(runningItemsAt(chart, col(70), live)).toEqual([])
  })

  it("carries a planned change due by that row: 8 after 15:30, still 4 before", () => {
    const chart = read([propofol, { id: "c", ts: at(45), type: "infusion_rate", infId: "prop", rate: "8", unit: "mg/kg/hr" }], 5)
    expect(runningItemsAt(chart, col(40), live)[0]).toMatchObject({ rate: 4, projected: true })
    expect(runningItemsAt(chart, col(70), live)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "inf-prop", rate: 8, projected: true }),
    ]))
  })
})

describe("the rate change made from that row", () => {
  // What the rate-change sheet writes when opened from the 15:55 row.
  const change: LogEvent = { id: "c", ts: at(70), type: "infusion_rate", infId: "prop", rate: "8", unit: "mg/kg/hr" }

  it("is a planned change of the same infusion, never a second one", () => {
    const chart = read([propofol, change], 5)
    expect(chart.infusions).toHaveLength(1)
    expect(chart.infusions[0].rateChanges).toEqual([expect.objectContaining({ col: col(70), planned: true })])
  })

  it("counts from 15:55 only: 4 before, 8 after, never both", () => {
    const before = read([propofol, change], 60).infusions[0]
    expect(calcInfusionTotal(before, null, 80).amount).toBe(4 * 80 * 60 / 60)
    const after = read([propofol, change], 80).infusions[0]
    expect(calcInfusionTotal(after, null, 80).amount).toBe(4 * 80 * 70 / 60 + 8 * 80 * 10 / 60)
  })

  it("from the web chart, a change placed after the bar's end is written on the same infusion, at that row", () => {
    const before = read([propofol], 5)
    const after = JSON.parse(JSON.stringify(before)) as TimetableData
    after.infusions[0].rateChanges = [{ col: col(70), rate: 8, unit: "mg/kg/hr" } as never]
    const ops = timetableEditToEventOps({ log: [propofol], before, after, chartStart: start, now: at(5), newId: () => "new" })
    expect(ops.add).toEqual([expect.objectContaining({ type: "infusion_rate", infId: "prop", rate: "8", ts: at(70) })])
    expect(ops.update).toEqual([])
    const chart = read(applyIntraopEventOps([propofol], ops), 5)
    expect(chart.infusions).toHaveLength(1)
    expect(chart.infusions[0].rateChanges?.[0]).toMatchObject({ planned: true })
  })
})

describe("every kind of running item", () => {
  it("a fluid, an agent and the gas run on too, until their planned stop", () => {
    const chart = read([
      { id: "f", ts: at(0), type: "fluid_start", fluidId: "fl", name: "Ringer", category: "Crystalloids", fluidEntryMode: "RATE", rate: "600", unit: "mL/h" },
      { id: "fr", ts: at(30), type: "fluid_rate", fluidId: "fl", rate: "1200", unit: "mL/h" },
      { id: "a", ts: at(0), type: "agent_start", name: "Sevoflurane", value: "2", agentMode: "concurrent" },
      { id: "ae", ts: at(40), type: "agent_stop", name: "Sevoflurane", agentMode: "concurrent" },
      { id: "g", ts: at(0), type: "gas_start", fgf: 2, carrierGas: "air", fio2: 50 },
      { id: "gc", ts: at(30), type: "gas_change", fgf: 1, carrierGas: "air", fio2: 40 },
    ], 5)
    const row = runningItemsByColumn(chart, [col(50)], live).get(col(50))!
    expect(row.map(item => item.kind).sort()).toEqual(["fluid", "gas"])
    expect(row.find(item => item.kind === "fluid")).toMatchObject({ rate: 1200, projected: true })
    expect(row.find(item => item.kind === "gas")).toMatchObject({ fio2: 40, projected: true })
    expect(runningItemsByColumn(chart, [col(35)], live).get(col(35))!.map(item => item.kind).sort()).toEqual(["agent", "fluid", "gas"])
  })

  it("runsOnAt is the one rule: after the drawn end, not stopped, not planned, before any planned stop", () => {
    expect(runsOnAt({ startCol: 0, endCol: 2 }, 5)).toBe(true)
    expect(runsOnAt({ startCol: 0, endCol: 2 }, 2)).toBe(false)
    expect(runsOnAt({ startCol: 0, endCol: 2, stopped: true }, 5)).toBe(false)
    expect(runsOnAt({ startCol: 4, endCol: 4, planned: true }, 5)).toBe(false)
    expect(runsOnAt({ startCol: 0, endCol: 2, plannedStopCol: 5 }, 4)).toBe(true)
    expect(runsOnAt({ startCol: 0, endCol: 2, plannedStopCol: 5 }, 5)).toBe(false)
  })
})
