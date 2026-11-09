// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { parseIntraopAutomation } from "@lospor/core/intraop-automation"
import type { SuggestionContext } from "@lospor/core/intraop-suggestions"
import type { LogEvent } from "@lospor/core/intraop-types"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en" }))

import { newGateWarnings, useSuggestionGate } from "./SuggestionGate"

const NOW = "2026-11-02T10:30:00.000Z"
const settings = (reminders: boolean) => parseIntraopAutomation({ enabled: true, groups: { reminders } })
const context = (extra: Partial<Omit<SuggestionContext, "now">> = {}): Omit<SuggestionContext, "now"> => ({
  settings: settings(true), user: {}, patient: { ageDays: 40 * 365, weightKg: 80, idealWeightKg: 70 }, preop: {},
  tofMonitor: false, keepLogging: true, labs: [], ...extra,
})
type Chart = { drugs: { name: string; dose?: string; unit?: string }[]; agents?: { name: string; startCol: number }[] }
const empty: Chart = { drugs: [], agents: [] }

describe("the MH-history warning and the local anaesthetic maximum (P1, E2)", () => {
  it("warns before a volatile or suxamethonium when the preop record has an MH history, and only then", () => {
    const mh = context({ preop: { mhHistory: true } })
    expect(newGateWarnings(mh, [], empty, { drugs: [], agents: [{ name: "SEVOFLURANE", startCol: 2 }] }, NOW, "en")).toEqual([{ kind: "mh", name: "SEVOFLURANE" }])
    expect(newGateWarnings(mh, [], empty, { drugs: [{ name: "Suxamethonium", dose: "100", unit: "mg", atcCode: "M03AB01" }] }, NOW, "en")).toEqual([{ kind: "mh", name: "Suxamethonium" }])
    expect(newGateWarnings(context(), [], empty, { drugs: [], agents: [{ name: "SEVOFLURANE", startCol: 2 }] }, NOW, "en")).toEqual([])
  })

  it("does not warn again for an agent already running whose percent changed", () => {
    const mh = context({ preop: { mhHistory: true } })
    const prev = { drugs: [], agents: [{ name: "SEVOFLURANE", startCol: 2 }] }
    expect(newGateWarnings(mh, [], prev, { drugs: [], agents: [{ name: "SEVOFLURANE", startCol: 2 }] }, NOW, "en")).toEqual([])
  })

  it("warns when a bolus takes the local anaesthetics over the maximum on ideal weight", () => {
    const log: LogEvent[] = [{ id: "b1", ts: "2026-11-02T10:00:00.000Z", type: "drug", name: "Bupivacaine", dose: "100", unit: "mg" }]
    // 2 mg/kg × 70 kg = 140 mg: 100 given, 50 more goes over.
    const [warning] = newGateWarnings(context(), log, empty, { drugs: [{ name: "Bupivacaine", dose: "50", unit: "mg" }] }, NOW, "en")
    expect(warning).toMatchObject({ kind: "laMax", name: "Bupivacaine" })
    expect(warning!.kind === "laMax" && warning.text).toContain("140 mg")
    expect(newGateWarnings(context(), log, empty, { drugs: [{ name: "Bupivacaine", dose: "30", unit: "mg" }] }, NOW, "en")).toEqual([])
    expect(newGateWarnings(context(), log, empty, { drugs: [{ name: "Bupivacaine", dose: "50", unit: "mg", route: "INTRATHECAL" }] }, NOW, "en")).toEqual([])
  })
})

describe("each warning is its own switch (10.2.0)", () => {
  const off = (...ids: string[]) => context({ settings: parseIntraopAutomation({ enabled: true, groups: { reminders: true }, disabled: ids }), preop: { mhHistory: true } })
  const log: LogEvent[] = [{ id: "b1", ts: "2026-11-02T10:00:00.000Z", type: "drug", name: "Bupivacaine", dose: "100", unit: "mg" }]
  const both: Chart = { drugs: [{ name: "Bupivacaine", dose: "50", unit: "mg" }], agents: [{ name: "SEVOFLURANE", startCol: 2 }] }

  it("switching the MH warning off keeps the local anaesthetic one, and the other way round", () => {
    expect(newGateWarnings(off(), log, empty, both, NOW, "en").map(warning => warning.kind).sort()).toEqual(["laMax", "mh"])
    expect(newGateWarnings(off("reminder:mhHistory"), log, empty, both, NOW, "en").map(warning => warning.kind)).toEqual(["laMax"])
    expect(newGateWarnings(off("reminder:localAnaestheticMax"), log, empty, both, NOW, "en").map(warning => warning.kind)).toEqual(["mh"])
  })

  it("shows the latex banner unless that line is switched off", () => {
    const latex = (...ids: string[]) => renderHook(() => useSuggestionGate({
      context: context({ settings: parseIntraopAutomation({ enabled: true, groups: { reminders: true }, disabled: ids }), preop: { latexAllergy: true } }),
      log: [], locale: "en", now: () => NOW,
    })).result.current.banner
    expect(latex()).not.toBeNull()
    expect(latex("reminder:latex")).toBeNull()
  })
})

describe("the gate on the chart", () => {
  it("holds the change until Give anyway, and lets everything through with the reminders off", () => {
    const apply = vi.fn()
    const next: Chart = { drugs: [], agents: [{ name: "SEVOFLURANE", startCol: 1 }] }
    const { result } = renderHook(() => useSuggestionGate({ context: context({ preop: { mhHistory: true } }), log: [], locale: "en", now: () => NOW }))
    act(() => result.current.guard(empty, apply)(next))
    expect(apply).not.toHaveBeenCalled()
    render(<>{result.current.modal}</>)
    fireEvent.click(screen.getByTestId("suggestion-gate-give"))
    expect(apply).toHaveBeenCalledWith(next)

    const off = renderHook(() => useSuggestionGate({ context: context({ settings: settings(false), preop: { mhHistory: true } }), log: [], locale: "en", now: () => NOW }))
    const applyOff = vi.fn()
    off.result.current.guard(empty, applyOff)(next)
    expect(applyOff).toHaveBeenCalledWith(next)
  })

  it("shows the latex banner when the preop record has a latex allergy", () => {
    const { result } = renderHook(() => useSuggestionGate({ context: context({ preop: { latexAllergy: true } }), log: [], locale: "en", now: () => NOW }))
    render(<>{result.current.banner}</>)
    expect(screen.getByTestId("latex-banner").textContent).toContain("Latex allergy")
  })
})
