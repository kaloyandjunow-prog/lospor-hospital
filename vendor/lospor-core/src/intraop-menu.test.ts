import { describe, expect, it } from "vitest"
import { intraopContinuousMenu, intraopMenuItemOf, intraopPointMenu } from "./intraop-menu"
import type { LogEvent } from "./intraop-types"

const T0 = Date.parse("2026-11-21T08:00:00.000Z")
const at = (min: number) => new Date(T0 + min * 60_000).toISOString()
const cell = (min: number) => ({ start: at(min), end: at(min + 5) })
const now = at(62)
const prop = { kind: "infusion" as const, key: "prop" }

const running: LogEvent[] = [
  { id: "p1", ts: at(10), type: "infusion_start", infId: "prop", name: "Propofol", rate: "5", unit: "mg/kg/h" },
  { id: "p2", ts: at(25), type: "infusion_rate", infId: "prop", rate: "8", unit: "mg/kg/h" },
]
const stopped: LogEvent[] = [...running, { id: "p3", ts: at(40), type: "infusion_stop", infId: "prop" }]

describe("the menu of a running item", () => {
  it("offers Stop, Change dose, Change syringe, Fix start and Delete whole where it runs", () => {
    expect(intraopContinuousMenu(running, prop, cell(30), { now })).toEqual(["stop", "change_dose", "change_syringe", "fix_start", "delete_whole"])
  })

  it("adds Delete in a cell holding its start or a change", () => {
    expect(intraopContinuousMenu(running, prop, cell(10), { now })).toContain("delete_here")
    expect(intraopContinuousMenu(running, prop, cell(25), { now })).toContain("delete_here")
  })

  it("offers Resume, Fix start, Fix end in the stop cell and after it", () => {
    expect(intraopContinuousMenu(stopped, prop, cell(40), { now })).toEqual(["resume", "fix_start", "fix_end", "delete_here", "delete_whole"])
    expect(intraopContinuousMenu(stopped, prop, cell(50), { now })).toEqual(["resume", "fix_start", "fix_end", "delete_whole"])
  })

  it("does not offer Resume after the case end, and nothing past the end", () => {
    expect(intraopContinuousMenu(stopped, prop, cell(50), { now, endedAt: at(55) })).not.toContain("resume")
    expect(intraopContinuousMenu(stopped, prop, cell(60), { now, endedAt: at(55) })).toEqual([])
  })

  it("plans in a future cell, and removes what is planned there", () => {
    expect(intraopContinuousMenu(running, prop, cell(70), { now })).toEqual(["plan_change", "plan_stop"])
    const plannedStop: LogEvent[] = [...running, { id: "p4", ts: at(80), type: "infusion_stop", infId: "prop" }]
    expect(intraopContinuousMenu(plannedStop, prop, cell(80), { now })).toEqual(["plan_change", "plan_stop", "remove_planned"])
  })

  it("offers Change dose for a fluid only when it runs at a rate", () => {
    const byVolume: LogEvent[] = [{ id: "f1", ts: at(10), type: "fluid_start", fluidId: "rl", name: "Ringer", volume: "500" }]
    const byRate: LogEvent[] = [{ id: "f1", ts: at(10), type: "fluid_start", fluidId: "rl", name: "Ringer", volume: "500", rate: "500", unit: "mL/h", fluidEntryMode: "RATE" }]
    expect(intraopContinuousMenu(byVolume, { kind: "fluid", key: "rl" }, cell(30), { now })).not.toContain("change_dose")
    expect(intraopContinuousMenu(byRate, { kind: "fluid", key: "rl" }, cell(30), { now })).toContain("change_dose")
  })

  it("offers Switch agent for an agent, and nothing when read-only", () => {
    const sevo: LogEvent[] = [{ id: "a1", ts: at(10), type: "agent_start", name: "Sevoflurane", value: "2", agentMode: "concurrent" }]
    expect(intraopContinuousMenu(sevo, { kind: "agent", key: "Sevoflurane" }, cell(30), { now })).toEqual(["stop", "change_dose", "switch_agent", "fix_start", "delete_whole"])
    expect(intraopContinuousMenu(sevo, { kind: "agent", key: "Sevoflurane" }, cell(30), { now, readOnly: true })).toEqual([])
  })
})

describe("the menu of a one-off entry", () => {
  it("is Repeat dose, Edit, Move, Delete for a drug; Edit and Delete for vitals", () => {
    expect(intraopPointMenu({ id: "d", ts: at(1), type: "drug", name: "Fentanyl" }, {})).toEqual(["repeat_dose", "edit", "move", "delete"])
    expect(intraopPointMenu({ id: "v", ts: at(1), type: "vital", heartRate: 70 }, {})).toEqual(["edit", "delete"])
    expect(intraopPointMenu({ id: "e", ts: at(1), type: "clinical_event", label: "Intubated" }, {})).toEqual(["edit", "move", "delete"])
    expect(intraopPointMenu({ id: "e", ts: at(1), type: "clinical_event", label: "Intubated" }, { readOnly: true })).toEqual([])
  })

  it("finds the item of a continuous event for the event log", () => {
    expect(intraopMenuItemOf(running[1])).toEqual(prop)
    expect(intraopMenuItemOf({ id: "d", ts: at(1), type: "drug" })).toBeNull()
  })
})
