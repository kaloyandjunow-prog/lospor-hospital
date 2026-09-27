import { describe, expect, it } from "vitest"

import { projectIntraopEvents } from "./intraop-engine"
import { eventsSaveState, sameIntraopSaveState, segmentEventIds, totalsProvisional, type IntraopSaveInput } from "./intraop-save-state"
import { calcInfusionTotals, calculateDeliveredFluidTotals } from "./intraop-totals"
import { calculateDrugTotals } from "./intraop-summary"
import type { LogEvent } from "./intraop-types"

const start = "2026-09-27T11:00:00.000Z"
const at = (minutes: number) => new Date(Date.parse(start) + minutes * 60_000).toISOString()
const log: LogEvent[] = [
  { id: "s", ts: at(0), type: "infusion_start", infId: "i", name: "Remifentanil", rate: "0.1", unit: "mcg/kg/min" },
  { id: "r", ts: at(10), type: "infusion_rate", infId: "i", rate: "0.2", unit: "mcg/kg/min" },
  { id: "e", ts: at(25), type: "infusion_stop", infId: "i" },
  { id: "d", ts: at(5), type: "drug", name: "Rocuronium", dose: "50", unit: "mg" },
  { id: "f", ts: at(0), type: "fluid_start", fluidId: "fl", name: "Ringer", category: "Crystalloids", fluidEntryMode: "RATE", rate: "600", unit: "mL/h" },
]
const chart = projectIntraopEvents(log, { start, openThrough: at(30) })
const none: IntraopSaveInput = { queuedEventIds: [], sendingEventId: null, refused: [] }

describe("save state on the chart", () => {
  it("a bar is queued while any of its events is: start, change or stop", () => {
    const [bar] = chart.infusions
    expect(segmentEventIds(bar)).toEqual(["s", "r", "e"])
    expect(eventsSaveState(segmentEventIds(bar), { ...none, queuedEventIds: ["r"] })).toBe("queued")
    expect(eventsSaveState(segmentEventIds(bar), { ...none, queuedEventIds: ["r"], sendingEventId: "e" })).toBe("sending")
    expect(eventsSaveState(segmentEventIds(bar), { ...none, queuedEventIds: ["r"], refused: [{ eventId: "s" }] })).toBe("refused")
    expect(eventsSaveState(segmentEventIds(bar), none)).toBeNull()
  })

  it("a total is marked provisional while anything in it is not on the server", () => {
    expect(totalsProvisional(chart, none)).toBe(false)
    expect(totalsProvisional(chart, { ...none, queuedEventIds: ["d"] })).toBe(true)
    expect(totalsProvisional(chart, { ...none, queuedEventIds: ["unrelated-vital"] })).toBe(false)
  })

  it("never changes a number: every save state gives the same totals", () => {
    const totals = () => ({
      infusions: calcInfusionTotals(chart.infusions, 70, 80),
      drugs: calculateDrugTotals(chart),
      fluids: calculateDeliveredFluidTotals(chart.fluids, at(30)),
    })
    const baseline = totals()
    for (const input of [
      none,
      { ...none, queuedEventIds: log.map(event => event.id) },
      { ...none, sendingEventId: "s" },
      { ...none, refused: [{ eventId: "d" }] },
    ]) {
      totalsProvisional(chart, input)
      segmentEventIds(chart.infusions[0])
      expect(totals()).toEqual(baseline)
    }
  })
})

describe("two readings of the save state", () => {
  const base = { queuedEventIds: ["a"], sendingEventId: null, queuedSections: ["intraop"], refused: [{ eventId: "r", at: "2026-09-27T12:00:00.000Z", status: 412 }] }

  it("are the same when nothing shown on the chart differs, whatever the objects", () => {
    expect(sameIntraopSaveState(base, JSON.parse(JSON.stringify(base)))).toBe(true)
  })

  it("differ on a queued, sending, section or refused change", () => {
    expect(sameIntraopSaveState(base, { ...base, queuedEventIds: ["a", "b"] })).toBe(false)
    expect(sameIntraopSaveState(base, { ...base, sendingEventId: "a" })).toBe(false)
    expect(sameIntraopSaveState(base, { ...base, queuedSections: [] })).toBe(false)
    expect(sameIntraopSaveState(base, { ...base, refused: [{ ...base.refused[0], at: "2026-09-27T12:01:00.000Z" }] })).toBe(false)
  })
})
