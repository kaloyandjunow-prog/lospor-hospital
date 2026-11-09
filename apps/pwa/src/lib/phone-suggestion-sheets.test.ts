import { describe, expect, it, vi } from "vitest"
import { buildPhoneSuggestionSheets, tagWithSuggestion, type PhoneSheetDeps } from "./phone-suggestion-sheets"

const TAG = "card:Hypoxia / desaturation:oxygen"

function deps(overrides: Partial<PhoneSheetDeps> = {}) {
  const pending = { current: null as string | null }
  const built = {
    pending, nowIso: () => "2026-11-08T08:00:00.000Z", clockOf: () => "08:00", setEntryTs: vi.fn(),
    drugCats: [], openDrugPreset: vi.fn(), infusions: [], setInfDrug: vi.fn(), setInfRate: vi.fn(), setInfOpen: vi.fn(),
    fluids: [], log: [], openFluid: vi.fn(), setFlFluid: vi.fn(), setFlVol: vi.fn(), setFlEntryMode: vi.fn(), setFlRate: vi.fn(),
    openShock: vi.fn(), openLab: vi.fn(), openGas: vi.fn(), deepenTargets: () => [], saveEvent: vi.fn(), displayName: () => "",
    ...overrides,
  } as PhoneSheetDeps
  return { built, pending }
}

describe("a gas change or a shock made from a treatment card", () => {
  it("opens its sheet with the card's tag waiting", () => {
    const { built, pending } = deps()
    const sheets = buildPhoneSuggestionSheets(built)
    sheets.openGas(100, 6, false, TAG)
    expect(built.openGas).toHaveBeenCalledWith(100, 6, false)
    expect(pending.current).toBe(TAG)
    pending.current = null
    sheets.openShock("card:Ventricular fibrillation:shock")
    expect(built.openShock).toHaveBeenCalled()
    expect(pending.current).toBe("card:Ventricular fibrillation:shock")
  })

  it("tags the gas and shock events it saves, once", () => {
    for (const type of ["gas_start", "gas_change", "defibrillation"]) {
      const pending = { current: TAG as string | null }
      expect(tagWithSuggestion({ type, fio2: 100 }, pending)).toMatchObject({ suggestion: TAG })
      expect(pending.current).toBeNull()
      expect(tagWithSuggestion({ type, fio2: 40 }, pending)).not.toHaveProperty("suggestion")
    }
  })

  it("leaves a stop, a vital or an event alone, and keeps the tag for the entry it was meant for", () => {
    const pending = { current: TAG as string | null }
    expect(tagWithSuggestion({ type: "gas_stop" }, pending)).not.toHaveProperty("suggestion")
    expect(tagWithSuggestion({ type: "vital" }, pending)).not.toHaveProperty("suggestion")
    expect(pending.current).toBe(TAG)
  })
})
