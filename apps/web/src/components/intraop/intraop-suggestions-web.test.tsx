// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { parseIntraopAutomation } from "@lospor/core/intraop-automation"
import { applyIntraopEventOps } from "@lospor/core/intraop-timetable-edit"
import type { SuggestionContext } from "@lospor/core/intraop-suggestions"
import type { LogEvent } from "@lospor/core/intraop-types"
import type { AirwayDeviceEntry } from "@lospor/core/airway-device-entries"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en" }))

import { useIntraopAttention } from "@/lib/use-intraop-attention"
import { IntraopAttentionPanel } from "./IntraopAttentionPanel"
import { SuggestionHost, type SuggestionSheets } from "./SuggestionHost"
import { AirwayExchangeDialog } from "./AirwayExchangeDialog"
import { convertDoseAmount, suggestionFluidFor, suggestionFluidPrefill, suggestionPrefill } from "./suggestion-prefill"
import type { TtFP } from "./timetable-types"

// SPS on the web (10.2.0). What is listed and
// what each answer writes are Core's; these check the web lays them out and
// routes each row to the right sheet, with the suggestion's tag.

const NOW = new Date("2026-11-02T10:30:00.000Z")
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString()

const ALL_ON = parseIntraopAutomation({
  enabled: true,
  groups: { treatmentSuggestions: true, reverseQuestions: true, readingQuestions: true, labQuestions: true, reminders: true, timers: true },
})

const context = (extra: Partial<Omit<SuggestionContext, "now">> = {}): Omit<SuggestionContext, "now"> => ({
  settings: ALL_ON,
  user: {},
  patient: { ageDays: 40 * 365, weightKg: 80, idealWeightKg: 70, sex: "MALE" },
  preop: {},
  tofMonitor: false,
  keepLogging: true,
  labs: [],
  bloodLossMl: null,
  startedAt: at(-60),
  endedAt: null,
  ...extra,
})

const hypotension: LogEvent = { id: "c1", ts: at(-1), type: "complication", label: "Hypotension", recordedAt: at(-1) }

function sheets(): SuggestionSheets & { calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = {}
  const spy = (name: string) => (...args: unknown[]) => { (calls[name] ??= []).push(args) }
  return {
    calls,
    nowIso: () => NOW.toISOString(),
    timeOf: iso => iso.slice(11, 16),
    openDrug: spy("openDrug"),
    openFluid: spy("openFluid"),
    openShock: spy("openShock"),
    openLab: spy("openLab"),
    openGas: spy("openGas"),
    deepenTargets: () => [],
    stop: spy("stop"),
    displayName: event => event.name ?? "",
  }
}

function withFakeNow<T>(run: () => T): T {
  vi.useFakeTimers({ now: NOW })
  try { return run() } finally { vi.useRealTimers() }
}

describe("the waiting list on the web", () => {
  it("lists a card for a complication with Open and Not now, and nothing while every group is off", () => withFakeNow(() => {
    const { result } = renderHook(() => useIntraopAttention({ log: [hypotension], onEventOps: vi.fn(), suggestions: context() }))
    const card = result.current.entries.find(entry => entry.key === "card:c1")
    expect(card).toMatchObject({ kind: "suggestion", actions: ["not_now", "open"] })

    const off = renderHook(() => useIntraopAttention({ log: [hypotension], onEventOps: vi.fn(), suggestions: null }))
    expect(off.result.current.entries).toEqual([])
  }))

  it("Open opens the line; Not now writes Core's answer", () => withFakeNow(() => {
    const onEventOps = vi.fn()
    const onOpen = vi.fn()
    const { result } = renderHook(() => useIntraopAttention({ log: [hypotension], onEventOps, suggestions: context() }))
    render(<IntraopAttentionPanel entries={result.current.entries} onAnswer={result.current.answer} onOpen={onOpen} />)
    fireEvent.click(screen.getByTestId("attention-open-card:c1"))
    expect(onOpen).toHaveBeenCalledWith("card:c1")
    fireEvent.click(screen.getByTestId("attention-not_now-card:c1"))
    const next = applyIntraopEventOps([hypotension], onEventOps.mock.calls[0][0])
    expect(next.find(event => event.type === "prompt_answer")).toMatchObject({ answerKind: "card", answerFor: "c1", answer: "not_now" })
  }))

  it("a question with several answers offers each, and logs the one picked", () => withFakeNow(() => {
    const log: LogEvent[] = [
      { id: "e1", ts: at(-30), type: "clinical_event", label: "Intubated" },
      { id: "v1", ts: at(-5), type: "vital", etco2: 38 },
      { id: "v2", ts: at(0), type: "vital", etco2: 4 },
    ]
    const onEventOps = vi.fn()
    const { result } = renderHook(() => useIntraopAttention({ log, onEventOps, suggestions: context() }))
    const line = result.current.entries.find(entry => entry.suggestion?.item.type === "reading")!
    render(<IntraopAttentionPanel entries={result.current.entries} onAnswer={result.current.answer} />)
    expect(screen.queryByTestId(`attention-log_complication-${line.key}`)).toBeNull()
    fireEvent.click(screen.getByTestId(`attention-choice-Accidental extubation-${line.key}`))
    const next = applyIntraopEventOps(log, onEventOps.mock.calls[0][0])
    expect(next.some(event => event.type === "complication" && event.label === "Accidental extubation")).toBe(true)
  }))

  it("opens by itself a card for a complication just logged here, not one that was waiting on load", () => withFakeNow(() => {
    const older: LogEvent = { id: "c0", ts: at(-40), type: "complication", label: "Hypertension", recordedAt: at(-40) }
    const { result, rerender } = renderHook(({ log }) => useIntraopAttention({ log, onEventOps: vi.fn(), suggestions: context() }), { initialProps: { log: [older] } })
    expect(result.current.opened).toBeNull()
    rerender({ log: [older, hypotension] })
    expect(result.current.opened).toBe("card:c1")
  }))
})

describe("the card beside the chart", () => {
  function openCard(log: LogEvent[], extra: Partial<Omit<SuggestionContext, "now">> = {}) {
    const onEventOps = vi.fn()
    const hook = renderHook(() => useIntraopAttention({ log, onEventOps, suggestions: context(extra) }))
    act(() => hook.result.current.open("card:c1"))
    const sheet = sheets()
    render(<SuggestionHost attention={hook.result.current} sheets={sheet} />)
    return { onEventOps, sheet, hook }
  }

  it("shows the rows with their prefilled doses, and a drug row opens the drug sheet with the suggestion's tag", () => withFakeNow(() => {
    const { sheet } = openCard([hypotension])
    expect(screen.getByTestId("suggestion-card")).toBeTruthy()
    expect(screen.getByTestId("card-row-ephedrine").textContent).toContain("10 mg")
    fireEvent.click(screen.getByTestId("card-row-ephedrine").querySelector("button")!)
    expect(sheet.calls.openDrug[0][0]).toMatchObject({ name: "Ephedrine", mode: "bolus", amount: 10, unit: "mg", suggestion: "card:Hypotension:ephedrine" })
  }))

  it("hands the row's own slot to the sheet, so its controls open under the row and not over the screen", () => withFakeNow(() => {
    const { sheet } = openCard([hypotension])
    const slot = screen.getByTestId("card-host-ephedrine")
    expect(screen.getByTestId("card-row-ephedrine").contains(slot)).toBe(true)
    fireEvent.click(screen.getByTestId("card-row-ephedrine").querySelector("button")!)
    expect((sheet.calls.openDrug[0][0] as { host?: unknown }).host).toBe(slot)
  }))

  it("a child gets the weight-based dose", () => withFakeNow(() => {
    openCard([hypotension], { patient: { ageDays: 6 * 365, weightKg: 20 } })
    expect(screen.getByTestId("card-row-ephedrine").textContent).toContain("2 mg")
  }))

  it("shows ✓ with the dose and time once a row was charted", () => withFakeNow(() => {
    openCard([hypotension, { id: "d1", ts: at(0), type: "drug", name: "Ephedrine", dose: "6", unit: "mg" }])
    expect(screen.getByTestId("card-used-ephedrine").textContent).toContain("6 mg")
  }))

  it("Not now writes the card's answer and minimises it", () => withFakeNow(() => {
    const { onEventOps } = openCard([hypotension])
    fireEvent.click(screen.getByTestId("suggestion-card-not-now"))
    expect(onEventOps.mock.calls[0][0].add[0]).toMatchObject({ type: "prompt_answer", answerKind: "card", answer: "not_now" })
  }))

  it("a checklist offers Done, branches and a red strip; the shock row opens the dial", () => withFakeNow(() => {
    const arrest: LogEvent = { id: "c1", ts: at(-3), type: "complication", label: "Cardiac arrest", recordedAt: at(-3) }
    const { sheet, onEventOps } = openCard([arrest])
    expect(screen.getByTestId("suggestion-card-strip").textContent).toContain("sinceOnset")
    fireEvent.click(screen.getByTestId("card-branch-shockable"))
    fireEvent.click(screen.getByTestId("card-row-defibrillation").querySelector("button")!)
    expect(sheet.calls.openShock).toHaveLength(1)
    fireEvent.click(screen.getByTestId("suggestion-card-done"))
    expect(onEventOps.mock.calls.at(-1)![0].add[0]).toMatchObject({ answerKind: "card", answer: "done" })
  }))

  it("an arrest charted afterwards: Give writes 1 mg at once, and ROSC at a typed time spreads the doses", () => withFakeNow(() => {
    const arrest: LogEvent = { id: "c1", ts: at(-30), type: "complication", label: "Cardiac arrest", recordedAt: at(-30) }
    const dose: LogEvent = { id: "arrest-dose-adrenaline-c1-1", ts: at(-30), type: "drug", name: "Epinephrine / Adrenaline", dose: "1000", unit: "mcg", timeApproximate: true }
    const { onEventOps } = openCard([arrest, dose])
    fireEvent.click(screen.getByTestId("card-branch-nonshockable"))
    fireEvent.click(screen.getByTestId("card-arrest-give-adrenaline"))
    expect(onEventOps.mock.calls.at(-1)![0].add[0]).toMatchObject({ id: "arrest-dose-adrenaline-c1-2", ts: at(-25), dose: "1000", unit: "mcg", timeApproximate: true })
    // ROSC typed as 10:20, ten minutes after the arrest: the dose already charted stays at its start.
    fireEvent.change(screen.getByTestId("card-event-time-rosc"), { target: { value: "10:20" } })
    fireEvent.click(screen.getByTestId("card-event-at-rosc"))
    const ops = onEventOps.mock.calls.at(-1)![0]
    expect(ops.add[0]).toMatchObject({ type: "clinical_event", label: "ROSC" })
  }))
})

describe("the airway picker, embedded", () => {
  const tube: AirwayDeviceEntry = { id: "a", device: "ORAL_ETT", details: { oralTubeSize: 7.5, oralCuffed: true }, insertedAt: at(-60), status: "in_use" }
  const options = [{ value: "ORAL_ETT", label: "Oral ETT" }, { value: "LMA", label: "LMA" }]

  it("a reintubation keeps both tubes, the first failed", () => {
    const onSave = vi.fn()
    render(<AirwayExchangeDialog entries={[tube]} deviceOptions={options} deviceLabel={code => code} reason="reintubation" at={at(0)} onSave={onSave} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByTestId("airway-field-oralTubeSize"), { target: { value: "8" } })
    fireEvent.click(screen.getByTestId("airway-exchange-save"))
    const [next] = onSave.mock.calls[0] as [AirwayDeviceEntry[]]
    expect(next).toHaveLength(2)
    expect(next[0]).toMatchObject({ id: "a", status: "failed", endedAt: at(0) })
    expect(next[1]).toMatchObject({ device: "ORAL_ETT", details: { oralTubeSize: 8, oralCuffed: true }, status: "in_use", insertedAt: at(0) })
  })

  it("Airway exchange asks why first; a planned exchange marks the old device replaced", () => {
    const onSave = vi.fn()
    render(<AirwayExchangeDialog entries={[tube]} deviceOptions={options} deviceLabel={code => code} reason={null} at={at(0)} onSave={onSave} onCancel={vi.fn()} />)
    expect((screen.getByTestId("airway-exchange-save") as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByTestId("airway-reason-planned"))
    fireEvent.click(screen.getByTestId("airway-device-LMA"))
    fireEvent.change(screen.getByTestId("airway-field-lmaSize"), { target: { value: "4" } })
    fireEvent.click(screen.getByTestId("airway-exchange-save"))
    const [next] = onSave.mock.calls[0] as [AirwayDeviceEntry[]]
    expect(next.map(entry => [entry.device, entry.status])).toEqual([["ORAL_ETT", "replaced"], ["LMA", "in_use"]])
  })
})

describe("a suggestion's prefill on the chart's own sheet", () => {
  const sheet = (extra: Partial<TtFP>): TtFP => ({
    col: 3, name: "Adrenaline", unit: "mg", mode: "bolus", dose: "1", doseHint: "", rate: 0, rateUnit: "mcg/kg/min", rateUnits: ["mcg/kg/min", "mcg/min"],
    rateMin: 0, rateMax: 1, rateStep: 0.01, color: "#000", anchor: { top: 0, bottom: 0, left: 0, right: 0, width: 0 }, ...extra,
  })

  it("converts between mass units and never puts a number beside a unit it cannot express", () => {
    expect(convertDoseAmount(50, "mcg", "mg")).toBe(0.05)
    expect(convertDoseAmount(1, "g", "mg")).toBe(1000)
    expect(convertDoseAmount(10, "IU", "mg")).toBeNull()
    expect(suggestionPrefill(sheet({}), { amount: 50, unit: "mcg" }, "card:Anaphylaxis:adrenaline")).toMatchObject({ dose: "0.05", suggestion: "card:Anaphylaxis:adrenaline" })
    expect(suggestionPrefill(sheet({ unit: "IU" }), { amount: 50, unit: "mcg" }, "t").dose).toBe("1")
  })

  it("keeps the sheet's own dose for a catalogue prefill, and takes a route the sheet offers", () => {
    expect(suggestionPrefill(sheet({ routes: ["IV", "IM"] }), { amount: "catalogue", route: "IM" }, "t")).toMatchObject({ dose: "1", route: "IM" })
    expect(suggestionPrefill(sheet({ routes: ["IV"] }), { amount: "catalogue", route: "IM" }, "t").route).toBeUndefined()
  })

  it("sets an infusion rate only in a unit the sheet has", () => {
    expect(suggestionPrefill(sheet({ mode: "infusion" }), { amount: 0.05, unit: "mcg/kg/min" }, "t").rate).toBe(0.05)
    expect(suggestionPrefill(sheet({ mode: "infusion" }), { amount: 2, unit: "IU/h" }, "t").rate).toBe(0)
  })

  it("fills a fluid by volume or rate, and picks the fluid for a kind", () => {
    expect(suggestionFluidPrefill(sheet({ mode: "fluid", fluidEntryModes: ["VOLUME", "RATE"] }), { amount: 500, mode: "VOLUME" }, "t").dose).toBe("500")
    expect(suggestionFluidPrefill(sheet({ mode: "fluid", fluidEntryModes: ["VOLUME", "RATE"] }), { amount: 150, mode: "RATE" }, "t")).toMatchObject({ fluidEntryMode: "RATE", fluidRate: "150" })
    expect(suggestionFluidFor("Crystalloids", [{ name: "NaCl 0.9%", category: "Crystalloids" }], [{ label: "Ringer", group: "Crystalloids" }])).toBe("NaCl 0.9%")
    expect(suggestionFluidFor("Crystalloids", [], [{ label: "Ringer", group: "Crystalloids" }])).toBe("Ringer")
  })
})
