import React from "react"
import { act } from "react-test-renderer"
import { afterEach, describe, expect, it, vi } from "vitest"
import { parseIntraopAutomation } from "@lospor/core/intraop-automation"
import type { SuggestionContext } from "@lospor/core/intraop-suggestions"

vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ tc: (key: string) => key, language: "en" }) }))
vi.mock("react-native-svg", () => ({ __esModule: true, default: () => null, SvgXml: () => null }))

import { render } from "@/test/render"
import type { LogEvent } from "@/lib/intraop-log-event"
import type { IntraopAttention } from "@/lib/use-intraop-attention"
import { buildPhoneSuggestionSheets, phoneFluidFor, tagWithSuggestion } from "@/lib/phone-suggestion-sheets"
import { SuggestionSheetHost, type PhoneSuggestionSheets } from "./SuggestionSheetHost"
import { inlineSheet } from "./inline-sheet"

const NOW = "2026-11-02T10:30:00.000Z"
const hypotension = { id: "c1", ts: "2026-11-02T10:29:00.000Z", type: "complication", label: "Hypotension" } as LogEvent
const context: SuggestionContext = {
  settings: parseIntraopAutomation({ enabled: true, groups: { treatmentSuggestions: true, timers: true } }),
  user: {}, patient: { ageDays: 40 * 365, weightKg: 80 }, preop: {}, tofMonitor: false, keepLogging: true, labs: [], now: NOW,
}

function attentionFor(log: LogEvent[], opened: string): IntraopAttention & { applyOps: ReturnType<typeof vi.fn> } {
  return { items: [], resolve: vi.fn(async () => {}), suggestions: context, applyOps: vi.fn(async () => {}), opened, open: vi.fn(), log }
}

function sheetsSpy(): PhoneSuggestionSheets & { openDrug: ReturnType<typeof vi.fn>; openShock: ReturnType<typeof vi.fn> } {
  return {
    nowIso: () => NOW, clockOf: (iso: string) => iso.slice(11, 16), openDrug: vi.fn(), openFluid: vi.fn(), openShock: vi.fn(), openLab: vi.fn(), openGas: vi.fn(),
    deepenTargets: () => [], stop: vi.fn(), displayName: (event: LogEvent) => event.name ?? "",
  } as never
}

const byId = (tree: ReturnType<typeof render>, id: string) => tree.root.findAll(node => node.props?.testID === id)[0]!

// A row pressed in one test must not leave its controls open for the next.
afterEach(() => { act(() => inlineSheet.release()) })

describe("the suggestion card on the phone (10.2.0)", () => {
  it("shows Core's rows with the prefilled dose, and a drug row opens the drug sheet with the tag", () => {
    const sheets = sheetsSpy()
    const tree = render(<SuggestionSheetHost attention={attentionFor([hypotension], "card:c1")} sheets={sheets} />)
    expect(byId(tree, "card-row-ephedrine")).toBeTruthy()
    act(() => { byId(tree, "card-row-open-ephedrine").props.onPress() })
    expect(sheets.openDrug).toHaveBeenCalledWith(expect.objectContaining({ name: "Ephedrine", amount: 10, unit: "mg", suggestion: "card:Hypotension:ephedrine" }))
  })

  it("opens the row's controls in place: the card stays, and the same row again folds them", () => {
    const sheets = sheetsSpy()
    const onClose = vi.fn()
    const attention = attentionFor([hypotension], "card:c1")
    const tree = render(<SuggestionSheetHost attention={attention} sheets={sheets} />)
    act(() => { byId(tree, "card-row-open-ephedrine").props.onPress() })
    expect(sheets.openDrug).toHaveBeenCalledTimes(1)
    expect(inlineSheet.get().id).toBe("ephedrine")
    expect(attention.open).not.toHaveBeenCalledWith(null)
    expect(onClose).not.toHaveBeenCalled()
    act(() => { byId(tree, "card-row-open-ephedrine").props.onPress() })
    expect(sheets.openDrug).toHaveBeenCalledTimes(1)
    expect(inlineSheet.get().id).toBeNull()
  })

  it("Not now writes the card's answer", () => {
    const attention = attentionFor([hypotension], "card:c1")
    const tree = render(<SuggestionSheetHost attention={attention} sheets={sheetsSpy()} />)
    act(() => { byId(tree, "suggestion-card-not-now").props.onPress() })
    expect(attention.applyOps.mock.calls[0][0].add[0]).toMatchObject({ type: "prompt_answer", answerKind: "card", answer: "not_now" })
  })

  it("a checklist has branches, a red strip and Done; the shock row opens the dial", () => {
    const arrest = { id: "c1", ts: "2026-11-02T10:27:00.000Z", type: "complication", label: "Cardiac arrest" } as LogEvent
    const attention = attentionFor([arrest], "card:c1")
    const sheets = sheetsSpy()
    const tree = render(<SuggestionSheetHost attention={attention} sheets={sheets} />)
    expect(byId(tree, "suggestion-card-strip")).toBeTruthy()
    act(() => { byId(tree, "card-branch-shockable").props.onPress() })
    act(() => { byId(tree, "card-row-open-defibrillation").props.onPress() })
    expect(sheets.openShock).toHaveBeenCalled()
  })
})

describe("the phone sheets a card opens", () => {
  it("converts a dose into the drug's unit and tags the saved entry once", () => {
    const pending = { current: null as string | null }
    const openDrugPreset = vi.fn()
    const sheets = buildPhoneSuggestionSheets({
      pending, nowIso: () => NOW, clockOf: () => "", setEntryTs: vi.fn(),
      drugCats: [{ cat: "Vasopressors", color: "#f00", drugs: [{ name: "Adrenaline", unit: "mg" }] }], openDrugPreset,
      infusions: [], setInfDrug: vi.fn(), setInfRate: vi.fn(), setInfOpen: vi.fn(),
      fluids: [], log: [], openFluid: vi.fn(), setFlFluid: vi.fn(), setFlVol: vi.fn(), setFlEntryMode: vi.fn(), setFlRate: vi.fn(),
      openShock: vi.fn(), openLab: vi.fn(), openGas: vi.fn(), deepenTargets: () => [], saveEvent: vi.fn(), displayName: () => "",
    })
    sheets.openDrug({ name: "Adrenaline", mode: "bolus", amount: 50, unit: "mcg", suggestion: "card:Anaphylaxis:adrenaline" })
    expect(openDrugPreset).toHaveBeenCalledWith("Adrenaline", "0.05")
    expect(tagWithSuggestion({ type: "drug", name: "Adrenaline" }, pending)).toMatchObject({ suggestion: "card:Anaphylaxis:adrenaline" })
    expect(tagWithSuggestion({ type: "drug", name: "Adrenaline" }, pending)).not.toHaveProperty("suggestion")
  })

  it("picks the fluid for a kind: the last of it charted, else the first listed", () => {
    const fluids = [{ name: "Ringer", cat: "Crystalloids", color: "" }, { name: "NaCl 0.9%", cat: "Crystalloids", color: "" }]
    expect(phoneFluidFor("Crystalloids", [{ id: "f", ts: NOW, type: "fluid_start", name: "NaCl 0.9%", category: "Crystalloids" } as LogEvent], fluids)?.name).toBe("NaCl 0.9%")
    expect(phoneFluidFor("Crystalloids", [], fluids)?.name).toBe("Ringer")
  })
})
