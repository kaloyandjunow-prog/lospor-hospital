import { describe, expect, it } from "vitest"
import { intraopApplyDoseChange, intraopApplyRateChange } from "./intraop-edits"
import { projectIntraopEvents } from "./intraop-engine"
import type { LogEvent } from "./intraop-types"

const at = (m: number) => new Date(Date.UTC(2026, 10, 22, 10, m)).toISOString()
const chartStart = at(0)

// The dose change rule, one for both apps: the start cell edits the start, a cell with a change edits it.
describe("a dose change on a running infusion", () => {
  const start = { id: "s", ts: at(17), type: "infusion_start", infId: "i1", name: "Propofol", rate: "5", unit: "mL/h" } as LogEvent
  const later = { id: "c", ts: at(45), type: "infusion_rate", infId: "i1", rate: "10", unit: "mL/h" } as LogEvent
  const fields = { rate: "7", unit: "mL/h" }

  it("in the start cell replaces the start dose and keeps later changes", () => {
    const next = intraopApplyRateChange([start, later], { infId: "i1", at: at(15), chartStart, fields })!
    expect(next.find(event => event.id === "s")).toMatchObject({ rate: "7", ts: at(17) })
    expect(next.filter(event => event.type === "infusion_rate")).toHaveLength(1)
    const chart = projectIntraopEvents(next, { start: new Date(chartStart), openThrough: new Date(at(60)) } as never)
    expect(chart.infusions[0]!.rateChanges).toEqual([expect.objectContaining({ rate: 10, col: 9 })])
  })

  it("in a cell that already has a change replaces that change, not a second one", () => {
    const next = intraopApplyRateChange([start, later], { infId: "i1", at: at(47), chartStart, fields: { rate: "12", unit: "mL/h" } })!
    expect(next.filter(event => event.type === "infusion_rate")).toEqual([expect.objectContaining({ id: "c", rate: "12", ts: at(45) })])
  })

  it("elsewhere says a new change is to be written", () => {
    expect(intraopApplyRateChange([start], { infId: "i1", at: at(30), chartStart, fields })).toBeNull()
  })
})

// The same rule for every kind: agent percent, gas and jet settings, fluid rate.
describe("a dose change on the other running items", () => {
  const input = (kind: "agent" | "gas" | "jet" | "fluid", key: string, minute: number, fields: Record<string, unknown>) => ({ kind, key, at: at(minute), chartStart, fields: fields as never })

  it("an agent: the start cell replaces the start percent (never turns the start into a change); a changed cell replaces its change", () => {
    const log = [
      { id: "a", ts: at(17), type: "agent_start", name: "Sevoflurane", value: "2", agentMode: "concurrent" },
      { id: "b", ts: at(45), type: "agent_start", name: "Sevoflurane", value: "1.5", agentMode: "concurrent" },
    ] as LogEvent[]
    const start = intraopApplyDoseChange(log, input("agent", "Sevoflurane", 15, { value: "3" }))!
    expect(start.find(event => event.id === "a")).toMatchObject({ value: "3", ts: at(17) })
    expect(start.filter(event => event.type === "agent_start")).toHaveLength(2)
    expect(intraopApplyDoseChange(log, input("agent", "Sevoflurane", 47, { value: "1" }))!.find(event => event.id === "b")).toMatchObject({ value: "1", ts: at(45) })
    expect(intraopApplyDoseChange(log, input("agent", "Sevoflurane", 30, { value: "1" }))).toBeNull()
  })

  it("gas and jet: the start cell edits the start's settings", () => {
    const gas = [{ id: "g", ts: at(17), type: "gas_start", fgf: 2, fio2: 50 }] as LogEvent[]
    expect(intraopApplyDoseChange(gas, input("gas", "gas", 15, { fgf: 4 }))!.find(event => event.id === "g")).toMatchObject({ fgf: 4, fio2: 50 })
    const jet = [{ id: "j", ts: at(17), type: "jet_start", jetPressureBar: 2, jetRate: 150 }] as LogEvent[]
    expect(intraopApplyDoseChange(jet, input("jet", "jet", 16, { jetRate: 200 }))!.find(event => event.id === "j")).toMatchObject({ jetRate: 200, jetPressureBar: 2 })
  })

  it("a fluid: the start cell edits the start's rate; a stopped run before the cell is not touched", () => {
    const fluid = [
      { id: "f", ts: at(17), type: "fluid_start", fluidId: "f1", name: "Ringer", rate: "500", unit: "mL/h", fluidEntryMode: "RATE" },
      { id: "e", ts: at(25), type: "fluid_end", fluidId: "f1" },
    ] as LogEvent[]
    expect(intraopApplyDoseChange(fluid, input("fluid", "f1", 15, { rate: "300" }))!.find(event => event.id === "f")).toMatchObject({ rate: "300" })
    expect(intraopApplyDoseChange(fluid, input("fluid", "f1", 40, { rate: "300" }))).toBeNull()
  })
})