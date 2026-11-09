import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import { parseIntraopAutomation } from "@lospor/core/intraop-automation"
import { dantroleneVialsView, type SuggestionContext } from "@lospor/core/intraop-suggestions"

const STRINGS: Record<string, string> = { vlSoFar: "Opened so far: {vials} for {mg} mg given", vlVialOne: "{count} vial", vlVialMany: "{count} vials", vlNote: "EMHG note", vlTotal: "Total {value} mg/kg" }
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ tc: (key: string) => STRINGS[key] ?? key, language: "en" }) }))
vi.mock("react-native-svg", () => ({ __esModule: true, default: () => null, SvgXml: () => null, Circle: () => null, Path: () => null }))

import { render } from "@/test/render"
import type { LogEvent } from "@/lib/intraop-log-event"
import type { IntraopAttention } from "@/lib/use-intraop-attention"
import { DantroleneVials } from "./DantroleneVials"
import { SuggestionSheetHost, type PhoneSuggestionSheets } from "./SuggestionSheetHost"

const viewFor = (stocked: number[], given: number[] = []) => (perKg: number) => dantroleneVialsView({ weightKg: 140, perKg, givenDosesMg: given, stocked })
const byId = (tree: ReturnType<typeof render>, id: string) => tree.root.findAll(node => node.props?.testID === id)
const text = (tree: ReturnType<typeof render>, id: string) => JSON.stringify(byId(tree, id)[0]!.props.children)

describe("the dantrolene vials on the phone card (10.2.0)", () => {
  it("draws the plan, and stepping the dose redraws and re-plans", () => {
    const tree = render(<DantroleneVials viewFor={viewFor([20, 250])} initialPerKg={2} onGive={vi.fn()} />)
    expect(text(tree, "vials-dose")).toContain("280")
    expect(text(tree, "vials-plan")).toContain("1 × 250 mg  +  2 × 20 mg")
    act(() => { byId(tree, "vials-inc")[0]!.props.onPress() })
    expect(text(tree, "vials-dose")).toContain("350")
    expect(text(tree, "vials-plan")).toContain("1 × 250 mg  +  5 × 20 mg")
    act(() => { byId(tree, "vials-dec")[0]!.props.onPress() })
    act(() => { byId(tree, "vials-dec")[0]!.props.onPress() })
    expect(text(tree, "vials-plan")).toContain("11 × 20 mg")
  })

  it("counts the vials already opened, notes 10 mg/kg from the total, and Give passes the dose", () => {
    const onGive = vi.fn()
    const tree = render(<DantroleneVials viewFor={viewFor([20, 120, 250], [700, 700])} initialPerKg={1} onGive={onGive} />)
    expect(text(tree, "vials-so-far")).toContain("1400")
    expect(text(tree, "vials-total")).toContain("EMHG note")
    act(() => { byId(tree, "vials-give")[0]!.props.onPress() })
    expect(onGive).toHaveBeenCalledWith(140)
  })

  it("draws nothing without a weight", () => {
    expect(render(<DantroleneVials viewFor={() => null} initialPerKg={2.5} onGive={vi.fn()} />).toJSON()).toBeNull()
  })
})

describe("the MH card on the phone", () => {
  const NOW = "2026-11-02T10:30:00.000Z"
  const context: SuggestionContext = {
    settings: { ...parseIntraopAutomation({ enabled: true, groups: { treatmentSuggestions: true } }), dantroleneVialsMg: [20, 250] },
    user: {}, patient: { ageDays: 40 * 365, weightKg: 140 }, preop: {}, tofMonitor: false, keepLogging: true, labs: [], now: NOW,
  }
  const mh = { id: "c1", ts: "2026-11-02T10:29:00.000Z", type: "complication", label: "Malignant hyperthermia" } as LogEvent

  it("shows the vials under the dantrolene row, and Give opens the dantrolene sheet with the planned dose", () => {
    const openDrug = vi.fn()
    const attention = { items: [], resolve: vi.fn(async () => {}), suggestions: context, applyOps: vi.fn(async () => {}), opened: "card:c1", open: vi.fn(), log: [mh] } as IntraopAttention
    const sheets = { nowIso: () => NOW, clockOf: (iso: string) => iso.slice(11, 16), openDrug, openFluid: vi.fn(), openShock: vi.fn(), openLab: vi.fn(), openGas: vi.fn(), deepenTargets: () => [], stop: vi.fn(), displayName: () => "" } as unknown as PhoneSuggestionSheets
    const tree = render(<SuggestionSheetHost attention={attention} sheets={sheets} />)
    expect(text(tree, "vials-dose")).toContain("350") // 2.5 mg/kg of 140 kg, the first dose
    act(() => { byId(tree, "vials-give")[0]!.props.onPress() })
    expect(openDrug).toHaveBeenCalledWith(expect.objectContaining({ name: "Dantrolene", amount: 350, unit: "mg", suggestion: "card:Malignant hyperthermia:dantrolene" }))
  })
})
