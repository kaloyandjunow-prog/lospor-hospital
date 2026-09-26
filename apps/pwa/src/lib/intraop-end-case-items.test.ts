import { describe, expect, it, vi } from "vitest"
import type { ActiveFluid, ActiveInfusion } from "./intraop-log-event"
import { buildEndCaseRunningItems, hasEndCaseRunningItems } from "./intraop-end-case-items"

describe("buildEndCaseRunningItems", () => {
  it("builds cleanup rows for every running agent, gas, infusions, and fluids", () => {
    const infusion: ActiveInfusion = { infId: "inf-1", name: "Propofol", rate: "10", unit: "mg/kg/h", color: "#111" }
    const fluid: ActiveFluid = { fluidId: "fl-1", name: "Ringer", volume: "500", color: "#222" }
    const stopAgent = vi.fn()
    const stopGasSettings = vi.fn()
    const stopInfusion = vi.fn()
    const stopFluid = vi.fn()

    const items = buildEndCaseRunningItems({
      activeAgents: [{ name: "Sevoflurane", color: "#333" }, { name: "Desflurane", color: "#444" }],
      activeGas: { fgf: 2, carrierGas: "air", fio2: 50 },
      activeInfusions: [infusion],
      activeFluids: [fluid],
      stopAgent,
      stopGasSettings,
      stopInfusion,
      stopFluid,
    })

    expect(items.map(item => [item.key, item.label, item.sublabel, item.color])).toEqual([
      ["agent-Sevoflurane", "Sevoflurane", "Volatile - inhalational", "#333"],
      ["agent-Desflurane", "Desflurane", "Volatile - inhalational", "#444"],
      ["gas-settings", "Gas settings", "FGF 2L/min - FiO2 50%", "#6366f1"],
      ["inf-inf-1", "Propofol", "10 mg/kg/h - infusion", "#111"],
      ["fluid-fl-1", "Ringer", "500 mL - fluid", "#222"],
    ])
    expect(items[4].fluidVolume?.mode).toBe("VOLUME")
    expect(items[4].fluidVolume?.atEnd("2026-08-02T09:00:00.000Z")).toBe(500)

    // End case stops at its end time, marked so Resume can offer to undo them.
    const context = { endTs: "2026-08-02T09:00:00.000Z" }
    const atEnd = { exactTs: context.endTs, endCaseStop: true }
    for (const item of items) item.onStop(context)
    expect(stopAgent).toHaveBeenCalledWith("Sevoflurane", null, atEnd)
    expect(stopAgent).toHaveBeenCalledWith("Desflurane", null, atEnd)
    expect(stopGasSettings).toHaveBeenCalledWith(null, atEnd)
    expect(stopInfusion).toHaveBeenCalledWith(infusion, null, atEnd)
    expect(stopFluid).toHaveBeenCalledWith(fluid, context)
  })

  it("returns an empty list when nothing is running", () => {
    expect(buildEndCaseRunningItems({
      activeAgents: [],
      activeGas: null,
      activeInfusions: [],
      activeFluids: [],
      stopAgent: vi.fn(),
      stopGasSettings: vi.fn(),
      stopInfusion: vi.fn(),
      stopFluid: vi.fn(),
    })).toEqual([])
  })

  it("shows a running fluid rate instead of presenting it as a volume", () => {
    const fluid: ActiveFluid = {
      fluidId:"fl-rate",
      name:"Ringer",
      volume:"",
      color:"#06b6d4",
      fluidEntryMode:"RATE",
      startTs:"2026-08-02T08:00:00.000Z",
      initialRate:"40",
      rate:"60",
      unit:"mL/h",
      rateChanges:[],
    }
    const items = buildEndCaseRunningItems({
      activeAgents:[],
      activeGas:null,
      activeInfusions:[],
      activeFluids:[fluid],
      stopAgent:vi.fn(),
      stopGasSettings:vi.fn(),
      stopInfusion:vi.fn(),
      stopFluid:vi.fn(),
    })

    expect(items[0].sublabel).toBe("60 mL/h - fluid")
    expect(items[0].fluidVolume?.atEnd("2026-08-02T09:00:00.000Z")).toBe(40)
  })

  it("passes one end-case timestamp and actual-volume override to the fluid stop", () => {
    const fluid: ActiveFluid = {
      fluidId:"fl-volume",
      name:"Ringer",
      volume:"500",
      bagVolumeMl:500,
      color:"#06b6d4",
      fluidEntryMode:"VOLUME",
      startTs:"2026-08-02T08:00:00.000Z",
    }
    const stopFluid = vi.fn()
    const [item] = buildEndCaseRunningItems({
      activeAgents:[],
      activeGas:null,
      activeInfusions:[],
      activeFluids:[fluid],
      stopAgent:vi.fn(),
      stopGasSettings:vi.fn(),
      stopInfusion:vi.fn(),
      stopFluid,
    })

    item.onStop({ endTs:"2026-08-02T09:00:00.000Z", administeredVolumeMl:175 })
    expect(stopFluid).toHaveBeenCalledWith(fluid, {
      endTs:"2026-08-02T09:00:00.000Z",
      administeredVolumeMl:175,
    })
  })

  it("detects whether the end-case cleanup sheet is needed", () => {
    const base = {
      activeAgents: [],
      activeGas: null,
      activeInfusions: [],
      activeFluids: [],
    }
    expect(hasEndCaseRunningItems(base)).toBe(false)
    expect(hasEndCaseRunningItems({ ...base, activeAgents: [{ name: "Sevoflurane", color: "#333" }] })).toBe(true)
    expect(hasEndCaseRunningItems({ ...base, activeGas: { fgf: 2, carrierGas: "air", fio2: 50 } })).toBe(true)
    expect(hasEndCaseRunningItems({ ...base, activeInfusions: [{ infId: "i1", name: "Propofol", rate: "10", unit: "mg/kg/h", color: "#111" }] })).toBe(true)
    expect(hasEndCaseRunningItems({ ...base, activeFluids: [{ fluidId: "f1", name: "Ringer", volume: "500", color: "#222" }] })).toBe(true)
  })
})
