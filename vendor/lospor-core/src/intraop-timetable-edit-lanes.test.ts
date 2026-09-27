import { describe, expect, it } from "vitest"

import { projectIntraopEvents } from "./intraop-engine"
import { applyIntraopEventOps, timetableEditToEventOps } from "./intraop-timetable-edit"
import type { LogEvent, TimetableData } from "./intraop-types"

// The lanes the first edit tests left out (9.13.0 coverage review): gas,
// position, phase, clinical events, and whole bars drawn new on the web chart.
// Each edit must write only its own events, and re-projecting the new log must
// give the edited chart back -- the web chart is never saved whole.

const start = "2026-09-26T21:00:00.000Z"
const at = (minutes: number) => new Date(Date.parse(start) + minutes * 60_000).toISOString()
const now = at(62) // column 12

const log: LogEvent[] = [
  { id: "g1", ts: at(0), type: "gas_start", fgf: 2, carrierGas: "air", fio2: 50 },
  { id: "g2", ts: at(20), type: "gas_change", fgf: 1, carrierGas: "air", fio2: 40 },
  { id: "p1", ts: at(0), type: "position_change", name: "supine" },
  { id: "ph1", ts: at(5), type: "phase_change", name: "induction" },
  { id: "c1", ts: at(15), type: "clinical_event", label: "Incision", color: "#f00" },
]

let n = 0
function edit(change: (chart: TimetableData) => TimetableData, base: LogEvent[] = log) {
  const before = projectIntraopEvents(base, { start, openThrough: now })
  const after = change(JSON.parse(JSON.stringify(before)) as TimetableData)
  const ops = timetableEditToEventOps({ log: base, before, after, chartStart: start, now, newId: () => `new-${++n}` })
  const next = applyIntraopEventOps(base, ops)
  return { ops, next, chart: projectIntraopEvents(next, { start, openThrough: now }) }
}

describe("clinical events on the web chart", () => {
  it("moving and relabelling one updates only it; a new one is added; a removed one is deleted", () => {
    const moved = edit(chart => ({ ...chart, clinicalEvents: (chart.clinicalEvents ?? []).map(item => ({ ...item, colIdx: 5, label: "Skin incision" })) }))
    expect(moved.ops.update).toEqual([expect.objectContaining({ id: "c1", ts: at(25), label: "Skin incision" })])
    expect(moved.chart.clinicalEvents).toEqual([expect.objectContaining({ eventId: "c1", colIdx: 5, label: "Skin incision" })])

    const added = edit(chart => ({ ...chart, clinicalEvents: [...(chart.clinicalEvents ?? []), { colIdx: 8, label: "Tourniquet", color: "#0f0" }] }))
    expect(added.ops.add).toEqual([expect.objectContaining({ type: "clinical_event", label: "Tourniquet", ts: at(40) })])
    expect(added.ops.update).toEqual([])

    expect(edit(chart => ({ ...chart, clinicalEvents: [] })).ops.remove).toEqual(["c1"])
  })
})

describe("position and phase lanes", () => {
  it("a moved or renamed change updates its event; a new one is added at its row", () => {
    const moved = edit(chart => ({ ...chart, positions: chart.positions!.map(item => ({ ...item, position: "prone" })) }))
    expect(moved.ops.update).toEqual([expect.objectContaining({ id: "p1", name: "prone", ts: at(0) })])

    const phase = edit(chart => ({
      ...chart,
      phases: [...chart.phases!.map(item => ({ ...item, startCol: 2 })), { phase: "maintenance", startCol: 6, endCol: 12 }],
    }))
    expect(phase.ops.update).toEqual([expect.objectContaining({ id: "ph1", ts: at(10) })])
    expect(phase.ops.add).toEqual([expect.objectContaining({ type: "phase_change", name: "maintenance", ts: at(30) })])
    expect(phase.chart.phases!.map(item => item.phase)).toEqual(["induction", "maintenance"])
  })

  it("an unchanged lane writes nothing, a removed change is deleted", () => {
    expect(edit(chart => ({ ...chart, positions: chart.positions!.map(item => ({ ...item, endCol: item.endCol + 1 })) })).ops.update).toEqual([])
    expect(edit(chart => ({ ...chart, positions: [] })).ops.remove).toEqual(["p1"])
  })
})

describe("the gas lane", () => {
  it("changing the running settings updates the start; a new change is added at its row", () => {
    const { ops, chart } = edit(c => ({
      ...c,
      gasSettings: c.gasSettings!.map(item => ({
        ...item,
        fio2: 60,
        settingsChanges: [...(item.settingsChanges ?? []), { col: 10, fgf: 3, carrierGas: "air", fio2: 80 }],
      })),
    }))
    expect(ops.update).toEqual([expect.objectContaining({ id: "g1", fio2: 60 })])
    expect(ops.add).toEqual([expect.objectContaining({ type: "gas_change", fgf: 3, fio2: 80, ts: at(50) })])
    expect(chart.gasSettings![0]).toMatchObject({ fio2: 60 })
  })

  it("stopping it writes one stop; deleting it removes its start and changes", () => {
    const stopped = edit(c => ({ ...c, gasSettings: c.gasSettings!.map(item => ({ ...item, stopped: true, endCol: 9 })) }))
    expect(stopped.ops.add).toEqual([expect.objectContaining({ type: "gas_stop", ts: at(45) })])
    expect(edit(c => ({ ...c, gasSettings: [] })).ops.remove.sort()).toEqual(["g1", "g2"])
  })

  it("a gas bar drawn new writes its start, its changes and its stop", () => {
    const { ops, chart } = edit(c => ({
      ...c,
      gasSettings: [{
        id: "draft", startCol: 2, endCol: 6, stopped: true, fgf: 2, carrierGas: "n2o", fio2: 40,
        settingsChanges: [{ col: 4, fgf: 1, carrierGas: "n2o", fio2: 30 }],
      }],
    }), [])
    expect(ops.add.map(event => [event.type, event.ts])).toEqual([
      ["gas_start", at(10)], ["gas_change", at(20)], ["gas_stop", at(30)],
    ])
    expect(chart.gasSettings!.some(item => item.stopped)).toBe(true)
  })
})

describe("bars drawn new on the web chart", () => {
  it("a stopped fluid bar writes its start, its rate changes and its stop", () => {
    const { ops } = edit(c => ({
      ...c,
      fluids: [{
        id: "flu", name: "Ringer", category: "Crystalloids", volume: "100", color: "#00f",
        startCol: 1, endCol: 5, stopped: true, fluidEntryMode: "RATE",
        rateChanges: [{ col: 3, rate: 200, unit: "ml/hr", ts: at(15) }],
      }],
    }), [])
    expect(ops.add.map(event => [event.type, event.ts])).toEqual([
      ["fluid_start", at(5)], ["fluid_rate", at(15)], ["fluid_end", at(25)],
    ])
    expect(ops.add[1]).toMatchObject({ fluidId: "flu", rate: "200", unit: "ml/hr", fluidEntryMode: "RATE" })
  })

  it("a stopped infusion bar writes its start, its rate changes and its stop", () => {
    const { ops, chart } = edit(c => ({
      ...c,
      infusions: [{
        id: "inf", name: "Remifentanil", rate: "0.1", unit: "mcg/kg/min", color: "#0af",
        startCol: 2, endCol: 8, stopped: true, rateChanges: [{ col: 4, rate: 0.2, unit: "mcg/kg/min" }],
      }],
    }), [])
    expect(ops.add.map(event => [event.type, event.ts])).toEqual([
      ["infusion_start", at(10)], ["infusion_rate", at(20)], ["infusion_stop", at(40)],
    ])
    expect(chart.infusions[0]).toMatchObject({ startCol: 2, endCol: 8, stopped: true })
  })

  it("a stopped agent bar writes a concurrent start and stop", () => {
    const { ops } = edit(c => ({ ...c, agents: [{ name: "Sevoflurane", percent: 2, startCol: 1, endCol: 4, stopped: true }] }), [])
    expect(ops.add).toEqual([
      expect.objectContaining({ type: "agent_start", ts: at(5), value: "2", agentMode: "concurrent" }),
      expect.objectContaining({ type: "agent_stop", ts: at(20), name: "Sevoflurane", agentMode: "concurrent" }),
    ])
  })
})
