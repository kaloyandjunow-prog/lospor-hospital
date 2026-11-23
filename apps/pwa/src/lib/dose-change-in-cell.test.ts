import { describe, expect, it } from "vitest"
import { editDoseInCell } from "./dose-change-in-cell"
import type { LogEvent } from "@/lib/intraop-log-event"

const at = (m: number) => new Date(Date.UTC(2026, 10, 22, 10, m)).toISOString()
const chartStart = new Date(at(0))
const ev = (e: Record<string, unknown>) => e as unknown as LogEvent

describe("a dose change entered on the phone goes through the shared rule", () => {
  it("agent: started again in the start cell edits the start percent", () => {
    const log = [ev({ id: "a", ts: at(17), type: "agent_start", name: "Sevoflurane", value: "2", agentMode: "concurrent" })]
    const next = editDoseInCell(log, ev({ type: "agent_start", name: "Sevoflurane", value: "3", agentMode: "concurrent" }), at(15), chartStart)!
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ id: "a", value: "3", ts: at(17) })
  })

  it("agent: a later cell is a new change (null), and a start with no percent is not a change", () => {
    const log = [ev({ id: "a", ts: at(17), type: "agent_start", name: "Sevoflurane", value: "2" })]
    expect(editDoseInCell(log, ev({ type: "agent_start", name: "Sevoflurane", value: "1.5" }), at(30), chartStart)).toBeNull()
    expect(editDoseInCell(log, ev({ type: "agent_start", name: "Sevoflurane" }), at(15), chartStart)).toBeNull()
  })

  it("gas, jet and fluid: the start cell edits the start", () => {
    const gas = [ev({ id: "g", ts: at(17), type: "gas_start", fgf: 2, fio2: 50 })]
    expect(editDoseInCell(gas, ev({ type: "gas_change", fgf: 4, fio2: 50 }), at(15), chartStart)![0]).toMatchObject({ type: "gas_start", fgf: 4 })
    const jet = [ev({ id: "j", ts: at(17), type: "jet_start", jetRate: 150 })]
    expect(editDoseInCell(jet, ev({ type: "jet_change", jetRate: 200 }), at(16), chartStart)![0]).toMatchObject({ type: "jet_start", jetRate: 200 })
    const fluid = [ev({ id: "f", ts: at(17), type: "fluid_start", fluidId: "f1", name: "Ringer", rate: "500", unit: "mL/h" })]
    expect(editDoseInCell(fluid, ev({ type: "fluid_rate", fluidId: "f1", name: "Ringer", rate: "300", unit: "mL/h" }), at(15), chartStart)![0]).toMatchObject({ rate: "300", name: "Ringer" })
  })

  it("an ordinary event is none of its business", () => {
    expect(editDoseInCell([], ev({ type: "drug", name: "Fentanyl" }), at(15), chartStart)).toBeNull()
  })
})
