import { describe, expect, it } from "vitest"
import { rebuildActiveState } from "./intraop-active-state"
import type { LogEvent } from "@/lib/intraop-log-event"

const ev = (e: Partial<LogEvent>): LogEvent => e as LogEvent

describe("rebuildActiveState", () => {
  it("keeps an open infusion at its latest rate", () => {
    const r = rebuildActiveState([
      ev({ type: "infusion_start", infId: "i1", name: "Noradrenaline", rate: "5", unit: "mcg/min", color: "#f00" }),
      ev({ type: "infusion_rate", infId: "i1", rate: "8" }),
    ])
    expect(r.infusions).toHaveLength(1)
    expect(r.infusions[0]).toMatchObject({ infId: "i1", name: "Noradrenaline", rate: "8" })
  })

  it("drops a stopped infusion", () => {
    const r = rebuildActiveState([
      ev({ type: "infusion_start", infId: "i1", name: "P", rate: "6", unit: "x", color: "#0" }),
      ev({ type: "infusion_stop", infId: "i1" }),
    ])
    expect(r.infusions).toHaveLength(0)
  })

  it("tracks open fluids and removes ended ones", () => {
    const r = rebuildActiveState([
      ev({ type: "fluid_start", fluidId: "f1", name: "Ringer", volume: "1000", color: "#0" }),
      ev({ type: "fluid_start", fluidId: "f2", name: "Saline", volume: "500", color: "#0" }),
      ev({ type: "fluid_end", fluidId: "f1" }),
    ])
    expect(r.fluids.map(f => f.fluidId)).toEqual(["f2"])
  })

  it("last agent_start wins; agent_stop clears", () => {
    expect(rebuildActiveState([ev({ type: "agent_start", name: "Sevoflurane", color: "#0", value: "2" })]).agent)
      .toMatchObject({ name: "Sevoflurane", percent: 2 })
    expect(rebuildActiveState([
      ev({ type: "agent_start", name: "Sevoflurane", color: "#0" }),
      ev({ type: "agent_stop" }),
    ]).agent).toBeNull()
  })

  it("gas_start/gas_change set; gas_stop clears", () => {
    expect(rebuildActiveState([ev({ type: "gas_start", fgf: 2, carrierGas: "air", fio2: 40 })]).gas)
      .toMatchObject({ fgf: 2, carrierGas: "air", fio2: 40 })
    expect(rebuildActiveState([
      ev({ type: "gas_start", fgf: 2, carrierGas: "air", fio2: 40 }),
      ev({ type: "gas_stop" }),
    ]).gas).toBeNull()
  })
})
