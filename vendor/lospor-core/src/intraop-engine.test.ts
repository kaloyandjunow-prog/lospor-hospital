import { describe, expect, it } from "vitest"
import {
  projectIntraopEvents,
  rebuildIntraopActiveState,
  reverseProjectIntraop,
  sortIntraopEvents,
} from "./intraop-engine"
import {
  gasSettingsAtColumn,
  runningItemsAt,
  runningItemsByColumn,
} from "./intraop-summary"
import { parseLogEvents, type LogEvent } from "./intraop-types"

const at = (minutes: number) => new Date(Date.UTC(2026, 6, 24, 8, minutes)).toISOString()

function event(id: string, minutes: number, value: Omit<LogEvent, "id" | "ts">): LogEvent {
  return { id, ts: at(minutes), ...value }
}

const completeLog: LogEvent[] = [
  event("vital", 5, { type: "vital", systolic: 120, diastolic: 70, heartRate: 60 }),
  event("drug", 10, { type: "drug", name: "Propofol", dose: "150", unit: "mg" }),
  event("inf-start", 0, { type: "infusion_start", infId: "inf-1", name: "Lidocaine", rate: "2", unit: "ml/hr" }),
  event("inf-rate", 10, { type: "infusion_rate", infId: "inf-1", rate: "4", unit: "ml/hr" }),
  event("inf-stop", 20, { type: "infusion_stop", infId: "inf-1" }),
  event("fluid-start", 5, { type: "fluid_start", fluidId: "fluid-1", name: "Plasma-Lyte", volume: "500", category: "Crystalloids" }),
  event("agent-start", 0, { type: "agent_start", name: "Sevoflurane", value: "2" }),
  event("agent-change", 10, { type: "agent_start", name: "Sevoflurane", value: "1.7" }),
  event("agent-stop", 25, { type: "agent_stop", name: "Sevoflurane" }),
  event("gas-start", 0, { type: "gas_start", carrierGas: "air", fio2: 50, fgf: 2 }),
  event("gas-change", 10, { type: "gas_change", carrierGas: "air", fio2: 60, fgf: 1 }),
  event("event", 15, { type: "clinical_event", label: "Incision" }),
  event("position-1", 0, { type: "position_change", name: "Supine" }),
  event("position-2", 15, { type: "position_change", name: "Trendelenburg" }),
  event("phase-1", 0, { type: "phase_change", name: "Induction" }),
  event("phase-2", 15, { type: "phase_change", name: "Maintenance" }),
]

describe("canonical intraoperative engine", () => {
  it("projects every event lane with one shared five-minute clock", () => {
    const timetable = projectIntraopEvents([...completeLog].reverse(), {
      start: at(0),
      openThrough: at(30),
    })

    expect(timetable.vitals[1]).toMatchObject({ systolic: 120, heartRate: 60 })
    expect(timetable.drugs).toEqual([
      expect.objectContaining({ colIdx: 2, name: "Propofol", dose: "150" }),
    ])
    expect(timetable.infusions).toEqual([
      expect.objectContaining({
        id: "inf-1",
        startCol: 0,
        endCol: 4,
        stopped: true,
        rate: 2,
        rateChanges: [{ col: 2, rate: 4, unit: "ml/hr" }],
      }),
    ])
    expect(timetable.fluids).toEqual([
      expect.objectContaining({ id: "fluid-1", startCol: 1, endCol: 7, stopped: false }),
    ])
    expect(timetable.agents).toEqual([
      expect.objectContaining({ name: "Sevoflurane", startCol: 0, endCol: 5, percent: 1.7, stopped: true }),
    ])
    expect(timetable.gasSettings).toEqual([
      expect.objectContaining({
        startCol: 0,
        endCol: 7,
        fio2: 50,
        fiAir: 50,
        settingsChanges: [expect.objectContaining({ col: 2, fio2: 60, fiAir: 40 })],
      }),
    ])
    const gas = timetable.gasSettings?.[0]
    expect(gas && gasSettingsAtColumn(gas, 1)).toMatchObject({
      fgf: 2,
      fio2: 50,
      fiAir: 50,
      changeCol: null,
    })
    expect(gas && gasSettingsAtColumn(gas, 2)).toMatchObject({
      fgf: 1,
      fio2: 60,
      fiAir: 40,
      changeCol: 2,
    })
    expect(gasSettingsAtColumn({
      id: "legacy-gas",
      startCol: 0,
      endCol: 2,
      fgf: 10,
      carrierGas: null,
      fio2: 100,
      settingsChanges: [{ col: 1, fgf: 1, carrierGas: "air", fio2: 50 }],
    }, 1)).toMatchObject({
      fgf: 1,
      fio2: 50,
      fiAir: 50,
      changeCol: 1,
    })
    expect(timetable.clinicalEvents).toEqual([
      expect.objectContaining({ colIdx: 3, label: "Incision" }),
    ])
    expect(timetable.positions).toEqual([
      { position: "Supine", startCol: 0, endCol: 3 },
      { position: "Trendelenburg", startCol: 3, endCol: 7 },
    ])
    expect(timetable.phases).toEqual([
      { phase: "Induction", startCol: 0, endCol: 3 },
      { phase: "Maintenance", startCol: 3, endCol: 7 },
    ])
  })

  it("uses timestamp, sequence, then id for deterministic ordering", () => {
    const sameTime = [
      event("z", 0, { type: "clinical_event", label: "third", sequence: 2 }),
      event("b", 0, { type: "clinical_event", label: "second", sequence: 1 }),
      event("a", 0, { type: "clinical_event", label: "first", sequence: 1 }),
    ]
    expect(sortIntraopEvents(sameTime).map(item => item.id)).toEqual(["a", "b", "z"])
  })

  it("normalizes the legacy event name without dropping clinical events", () => {
    const parsed = parseLogEvents([
      { id: "legacy", ts: at(0), type: "event", label: "Legacy incision" },
    ])
    expect(parsed).toEqual([
      expect.objectContaining({ id: "legacy", type: "clinical_event", label: "Legacy incision" }),
    ])
  })

  it("round-trips legacy stopped segments and reconstructs all event families", () => {
    const projected = projectIntraopEvents(completeLog, { start: at(0), openThrough: at(30) })
    const reconstructed = reverseProjectIntraop(projected, at(0))
    expect(reconstructed.map(item => item.type)).toEqual(expect.arrayContaining([
      "vital", "drug", "infusion_start", "infusion_rate", "infusion_stop",
      "fluid_start", "agent_start", "agent_stop", "gas_start", "gas_change",
      "clinical_event", "position_change", "phase_change",
    ]))
    const reprojected = projectIntraopEvents(reconstructed, { start: at(0), openThrough: at(30) })
    expect(reprojected.infusions[0]).toMatchObject({ startCol: 0, endCol: 4, stopped: true })
    expect(reprojected.agents[0]).toMatchObject({ startCol: 0, endCol: 5, stopped: true })
  })

  it("rebuilds the currently active clinical state", () => {
    const state = rebuildIntraopActiveState(completeLog)
    expect(state.infusions).toEqual([])
    expect(state.fluids).toEqual([
      expect.objectContaining({ fluidId: "fluid-1", name: "Plasma-Lyte" }),
    ])
    expect(state.agent).toBeNull()
    expect(state.gas).toMatchObject({ fgf: 1, fio2: 60, fiAir: 40 })
  })

  it("builds visible running rows without changing per-column results", () => {
    const timetable = projectIntraopEvents(completeLog, {
      start: at(0),
      openThrough: at(30),
    })
    const columns = [0, 1, 2, 4, 6]
    const rows = runningItemsByColumn(timetable, columns)
    for (const column of columns) {
      expect(rows.get(column)).toEqual(runningItemsAt(timetable, column))
    }
  })
})
