import { describe, expect, it, vi } from "vitest"
import type { ActiveFluid, ActiveInfusion } from "./intraop-log-event"
import { buildEndCaseRunningItems, hasEndCaseRunningItems } from "./intraop-end-case-items"

describe("buildEndCaseRunningItems", () => {
  it("builds cleanup rows for active agent, gas, infusions, and fluids", () => {
    const infusion: ActiveInfusion = { infId: "inf-1", name: "Propofol", rate: "10", unit: "mg/kg/h", color: "#111" }
    const fluid: ActiveFluid = { fluidId: "fl-1", name: "Ringer", volume: "500", color: "#222" }
    const stopAgent = vi.fn()
    const stopGasSettings = vi.fn()
    const stopInfusion = vi.fn()
    const stopFluid = vi.fn()

    const items = buildEndCaseRunningItems({
      activeAgent: { name: "Sevoflurane", color: "#333" },
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
      ["gas-settings", "Gas settings", "FGF 2L/min - FiO2 50%", "#6366f1"],
      ["inf-inf-1", "Propofol", "10 mg/kg/h - infusion", "#111"],
      ["fluid-fl-1", "Ringer", "500 mL - fluid", "#222"],
    ])

    items[0].onStop()
    items[1].onStop()
    items[2].onStop()
    items[3].onStop()
    expect(stopAgent).toHaveBeenCalledOnce()
    expect(stopGasSettings).toHaveBeenCalledOnce()
    expect(stopInfusion).toHaveBeenCalledWith(infusion)
    expect(stopFluid).toHaveBeenCalledWith(fluid)
  })

  it("returns an empty list when nothing is running", () => {
    expect(buildEndCaseRunningItems({
      activeAgent: null,
      activeGas: null,
      activeInfusions: [],
      activeFluids: [],
      stopAgent: vi.fn(),
      stopGasSettings: vi.fn(),
      stopInfusion: vi.fn(),
      stopFluid: vi.fn(),
    })).toEqual([])
  })

  it("detects whether the end-case cleanup sheet is needed", () => {
    const base = {
      activeAgent: null,
      activeGas: null,
      activeInfusions: [],
      activeFluids: [],
    }
    expect(hasEndCaseRunningItems(base)).toBe(false)
    expect(hasEndCaseRunningItems({ ...base, activeAgent: { name: "Sevoflurane", color: "#333" } })).toBe(true)
    expect(hasEndCaseRunningItems({ ...base, activeGas: { fgf: 2, carrierGas: "air", fio2: 50 } })).toBe(true)
    expect(hasEndCaseRunningItems({ ...base, activeInfusions: [{ infId: "i1", name: "Propofol", rate: "10", unit: "mg/kg/h", color: "#111" }] })).toBe(true)
    expect(hasEndCaseRunningItems({ ...base, activeFluids: [{ fluidId: "f1", name: "Ringer", volume: "500", color: "#222" }] })).toBe(true)
  })
})
