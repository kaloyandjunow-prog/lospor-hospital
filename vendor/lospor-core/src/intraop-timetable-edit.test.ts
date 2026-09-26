import { describe, expect, it } from "vitest"

import { projectIntraopEvents } from "./intraop-engine"
import { applyIntraopEventOps, isEmptyIntraopEventOps, timetableEditToEventOps } from "./intraop-timetable-edit"
import type { LogEvent, TimetableData } from "./intraop-types"

const start = "2026-09-26T21:00:00.000Z"
const at = (minutes: number, seconds = 0) => new Date(Date.parse(start) + minutes * 60_000 + seconds * 1000).toISOString()
const now = at(62, 30) // column 12

const log: LogEvent[] = [
  { id: "d1", ts: at(5), type: "drug", name: "Fentanyl", dose: "100", unit: "mcg", drugRoute: "IV" },
  { id: "v1", ts: at(10), type: "vital", heartRate: 80, systolic: 120, diastolic: 70 },
  { id: "i1", ts: at(0), type: "infusion_start", infId: "inf", name: "Propofol", rate: "6", unit: "mg/kg/hr", color: "#111" },
  { id: "i2", ts: at(20), type: "infusion_rate", infId: "inf", rate: "4", unit: "mg/kg/hr" },
  { id: "f1", ts: at(1), type: "fluid_start", fluidId: "flu", name: "Ringer", category: "Crystalloids", fluidEntryMode: "VOLUME", volume: "500", bagVolumeMl: 500 },
  { id: "f2", ts: at(30), type: "fluid_end", fluidId: "flu", administeredVolumeMl: 450, volume: "450" },
  { id: "a1", ts: at(0), type: "agent_start", name: "Sevoflurane", value: "2", agentMode: "concurrent" },
]

let n = 0
function edit(change: (chart: TimetableData) => TimetableData) {
  const before = projectIntraopEvents(log, { start, openThrough: now })
  const after = change(JSON.parse(JSON.stringify(before)) as TimetableData)
  const ops = timetableEditToEventOps({ log, before, after, chartStart: start, now, newId: () => `new-${++n}` })
  return { ops, next: applyIntraopEventOps(log, ops) }
}

describe("editing a projected chart writes exactly the events that changed", () => {
  it("an unchanged chart writes nothing", () => {
    expect(isEmptyIntraopEventOps(edit(chart => chart).ops)).toBe(true)
  })

  it("moving a dose re-times only that dose, to the start of its new row", () => {
    const { ops } = edit(chart => ({ ...chart, drugs: chart.drugs.map(drug => ({ ...drug, colIdx: 4 })) }))
    expect(ops.add).toEqual([])
    expect(ops.remove).toEqual([])
    expect(ops.update).toEqual([expect.objectContaining({ id: "d1", ts: at(20), dose: "100" })])
  })

  it("a new dose in the now row gets the exact minute", () => {
    const { ops } = edit(chart => ({ ...chart, drugs: [...chart.drugs, { colIdx: 12, name: "Ondansetron", dose: "4", unit: "mg" }] }))
    expect(ops.add).toEqual([expect.objectContaining({ type: "drug", name: "Ondansetron", ts: at(62) })])
    expect(ops.update).toEqual([])
  })

  it("editing a vital updates its event; typing into an empty row adds one", () => {
    const { ops } = edit(chart => {
      const vitals = [...chart.vitals]
      vitals[2] = { ...vitals[2], heartRate: 95 }
      vitals[8] = { spO2: 97 }
      return { ...chart, vitals }
    })
    expect(ops.update).toEqual([expect.objectContaining({ id: "v1", heartRate: 95, systolic: 120 })])
    expect(ops.add).toEqual([expect.objectContaining({ type: "vital", spO2: 97, ts: at(40) })])
  })

  it("stopping a running infusion writes one stop at the row it was stopped in", () => {
    const { ops, next } = edit(chart => ({
      ...chart,
      infusions: chart.infusions.map(item => ({ ...item, stopped: true, endCol: 9 })),
    }))
    expect(ops.add).toEqual([expect.objectContaining({ type: "infusion_stop", infId: "inf", ts: at(45) })])
    expect(ops.update).toEqual([])
    const chart = projectIntraopEvents(next, { start, openThrough: now })
    expect(chart.infusions[0]).toMatchObject({ endCol: 9, stopped: true })
  })

  it("dragging a running bar's end writes nothing: its end is now", () => {
    expect(isEmptyIntraopEventOps(edit(chart => ({
      ...chart, infusions: chart.infusions.map(item => ({ ...item, endCol: 15 })),
    })).ops)).toBe(true)
  })

  it("moving a stopped fluid's end moves only its stop; resuming removes the stop", () => {
    const moved = edit(chart => ({ ...chart, fluids: chart.fluids.map(item => ({ ...item, endCol: 8 })) }))
    expect(moved.ops.update).toEqual([expect.objectContaining({ id: "f2", ts: at(40), administeredVolumeMl: 450 })])
    const resumed = edit(chart => ({ ...chart, fluids: chart.fluids.map(item => ({ ...item, stopped: false })) }))
    expect(resumed.ops.remove).toEqual(["f2"])
  })

  it("deleting an infusion deletes its start, its changes and its stop", () => {
    const { ops } = edit(chart => ({ ...chart, infusions: [] }))
    expect(ops.remove.sort()).toEqual(["i1", "i2"])
  })

  it("a new rate change is added at its row; a copied dose with the same reference is a new dose", () => {
    const { ops } = edit(chart => ({
      ...chart,
      infusions: chart.infusions.map(item => ({ ...item, rateChanges: [...(item.rateChanges ?? []), { col: 10, rate: 2, unit: "mg/kg/hr" }] })),
      drugs: [...chart.drugs, { ...chart.drugs[0], colIdx: 6 }],
    }))
    expect(ops.add).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "infusion_rate", infId: "inf", rate: "2", ts: at(50) }),
      expect.objectContaining({ type: "drug", name: "Fentanyl", ts: at(30) }),
    ]))
    expect(ops.update).toEqual([])
  })

  it("changing an agent's percent updates its start; a new agent runs alongside (concurrent)", () => {
    const { ops } = edit(chart => ({
      ...chart,
      agents: [...chart.agents.map(agent => ({ ...agent, percent: 3 })), { name: "Desflurane", startCol: 12, endCol: 12 }],
    }))
    expect(ops.update).toEqual([expect.objectContaining({ id: "a1", value: "3" })])
    expect(ops.add).toEqual([expect.objectContaining({ type: "agent_start", name: "Desflurane", agentMode: "concurrent", ts: at(62) })])
  })

  it("re-projecting the new log gives the edited chart back", () => {
    const { next } = edit(chart => ({ ...chart, drugs: chart.drugs.map(drug => ({ ...drug, colIdx: 3, dose: "50" })) }))
    const chart = projectIntraopEvents(next, { start, openThrough: now })
    expect(chart.drugs).toEqual([expect.objectContaining({ eventId: "d1", colIdx: 3, dose: "50" })])
  })
})

describe("End case stops", () => {
  it("are written with their marker and read back with it", () => {
    const { ops, next } = edit(chart => ({
      ...chart,
      infusions: chart.infusions.map(item => ({ ...item, stopped: true, endCol: 12, endCaseStop: true })),
    }))
    expect(ops.add).toEqual([expect.objectContaining({ type: "infusion_stop", endCaseStop: true, ts: at(62) })])
    expect(projectIntraopEvents(next, { start, openThrough: now }).infusions[0]).toMatchObject({ endCaseStop: true })
  })
})
