// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { parseIntraopAutomation } from "@lospor/core/intraop-automation"
import type { LogEvent } from "@lospor/core/intraop-types"

const intl = vi.hoisted(() => ({ locale: "en" }))
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => intl.locale }))
// The limits table reads the hospital's settings and counts through this hook.
const automation = vi.hoisted(() => ({ value: null as null | { settings: unknown; stats: unknown } }))
vi.mock("@/lib/use-intraop-automation", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/use-intraop-automation")>()
  return { ...actual, useIntraopAutomation: () => automation.value ?? actual.parseIntraopAutomationResponse(null) }
})

import { useIntraopAttention } from "@/lib/use-intraop-attention"
import { parseIntraopAutomationResponse } from "@/lib/use-intraop-automation"
import { VitalLimitsSection } from "@/components/indicators/VitalLimitsSection"
import { DefibrillationDialog } from "./DefibrillationDialog"
import { IntraopAttentionPanel } from "./IntraopAttentionPanel"
import { clinicalEventName } from "@/lib/clinical-event-name"
import { defibrillationDialogProps, moreComplicationCategories, quickComplicationOption } from "./event-picker-extras"

const vitals = { settings: parseIntraopAutomation({ enabled: true, vitalQuestions: { enabled: true } }), stats: null, ageDays: 40 * 365, keepLogging: true }

describe("vitals questions on the web (10.1.0)", () => {
  it("lists the question with why and when logging stops, and writes Core's complication", () => {
    vi.useFakeTimers({ now: new Date("2026-11-01T09:01:00.000Z") })
    try {
      const log: LogEvent[] = [{ id: "r1", type: "vital", ts: "2026-11-01T09:00:00.000Z", heartRate: 45, systolic: 120, diastolic: 70 }]
      const onEventOps = vi.fn()
      const { result } = renderHook(() => useIntraopAttention({ log, timeZone: "Europe/Sofia", onEventOps, vitals }))
      expect(result.current.entries.map(entry => entry.key)).toEqual(["vital:bradycardia:r1"])
      render(<IntraopAttentionPanel entries={result.current.entries} onAnswer={result.current.answer} />)
      expect(screen.getByTestId("attention-detail-vital:bradycardia:r1").textContent).toContain("below the fixed limit of 50 bpm")
      expect(screen.getByText("Automatic logging stops when HR is 50 or higher.")).toBeTruthy()
      act(() => { fireEvent.click(screen.getByTestId("attention-log_complication-vital:bradycardia:r1")) })
      expect(onEventOps.mock.calls[0][0].add).toEqual([expect.objectContaining({ type: "complication", label: "Bradycardia", ts: log[0].ts })])
    } finally {
      vi.useRealTimers()
    }
  })

  it("asks nothing on a read-only screen, and the defaults (everything on) when the API sends nothing usable", () => {
    const log: LogEvent[] = [{ id: "r1", type: "vital", ts: "2026-11-01T09:00:00.000Z", heartRate: 45 }]
    const { result } = renderHook(() => useIntraopAttention({ log, timeZone: "Europe/Sofia", vitals: null, readOnly: true }))
    expect(result.current.entries).toEqual([])
    expect(parseIntraopAutomationResponse(null)).toMatchObject({ settings: { enabled: true, vitalQuestions: { enabled: true } }, stats: null })
  })
})

describe("the Defibrillation dialog", () => {
  it("saves nothing until energy and synchronisation are set, with keyboard steps on the dial", () => {
    const onSave = vi.fn()
    render(<DefibrillationDialog timeLabel="09:10" shockNumber={1} prefillJoules={null} onCancel={() => {}} onSave={onSave} />)
    const save = screen.getByTestId("defib-save") as HTMLButtonElement
    expect(save.disabled).toBe(true)
    const dial = screen.getByTestId("defib-dial")
    act(() => { fireEvent.keyDown(dial, { key: "PageUp" }) })
    act(() => { fireEvent.keyDown(dial, { key: "ArrowUp" }) })
    expect(screen.getByTestId("defib-readout").textContent).toBe("11")
    expect(save.disabled).toBe(true)
    act(() => { fireEvent.click(screen.getByTestId("defib-sync")) })
    act(() => { fireEvent.click(save) })
    expect(onSave).toHaveBeenCalledWith(11, true)
  })

  it("prefills a child's energy from the reference at the right shock number", () => {
    const markers = [{ colIdx: 1, label: "Defibrillation", color: "#f59e0b", kind: "defibrillation" as const, energyJ: 64, synchronized: false }]
    expect(defibrillationDialogProps(markers, 3, "09:15", { ageValue: 4, ageUnit: "YEARS", weightKg: 16 }))
      .toEqual({ timeLabel: "09:15", shockNumber: 2, prefillJoules: 64 })
    expect(defibrillationDialogProps([], 3, "09:15", { ageValue: 40, ageUnit: "YEARS", weightKg: 80 }).prefillJoules).toBeNull()
  })
})

describe("an episode from the vitals on the web", () => {
  const episodeLog = (): LogEvent[] => [
    { id: "r1", type: "vital", ts: "2026-11-01T09:00:00.000Z", heartRate: 44 },
    { id: "vq-bradycardia-r1", type: "complication", ts: "2026-11-01T09:00:00.000Z", label: "Bradycardia", color: "#ef4444", complicationSource: "vitals", triggerReadingId: "r1" },
    { id: "r2", type: "vital", ts: "2026-11-01T09:10:00.000Z", heartRate: 72 },
  ]

  it("closes at the first reading back inside the limits as soon as the case is open, sending only that change", () => {
    const onEventOps = vi.fn()
    renderHook(() => useIntraopAttention({ log: episodeLog(), timeZone: "Europe/Sofia", onEventOps, vitals }))
    expect(onEventOps).toHaveBeenCalledTimes(1)
    const ops = onEventOps.mock.calls[0][0]
    expect(ops.add).toEqual([])
    expect(ops.remove).toEqual([])
    expect(ops.update).toEqual([expect.objectContaining({ id: "vq-bradycardia-r1", endTs: "2026-11-01T09:10:00.000Z" })])
  })

  it("sends one close at a time while the save is on its way", async () => {
    let finish: () => void = () => {}
    const onEventOps = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const log = episodeLog()
    const { rerender } = renderHook(({ items }) => useIntraopAttention({ log: items, timeZone: "Europe/Sofia", onEventOps, vitals }), { initialProps: { items: log } })
    rerender({ items: [...log] })
    expect(onEventOps).toHaveBeenCalledTimes(1)
    await act(async () => { finish() })
  })

  it("is left to the screen that holds the case", () => {
    const onEventOps = vi.fn()
    renderHook(() => useIntraopAttention({ log: episodeLog(), timeZone: "Europe/Sofia", onEventOps, vitals, readOnly: true }))
    renderHook(() => useIntraopAttention({ log: episodeLog(), timeZone: "Europe/Sofia", onEventOps, vitals: null }))
    expect(onEventOps).not.toHaveBeenCalled()
  })
})

describe("the limits in Unit indicators", () => {
  const settings = parseIntraopAutomation({ enabled: true, vitalQuestions: { enabled: true, minCases: 100 } })
  const counts = (lo: number, hi: number, cases: number) => ({ min: lo, counts: Array.from({ length: hi - lo + 1 }, () => 10), cases })

  it("are not shown while the hospital has the questions off", () => {
    automation.value = { settings: { enabled: true, vitalQuestions: { enabled: false } }, stats: null }
    const { container } = render(<VitalLimitsSection />)
    expect(container.innerHTML).toBe("")
  })

  it("show each band's limits once it has enough cases, and say it is collecting until then", () => {
    automation.value = {
      settings,
      stats: { ADULT: { hr: counts(40, 140, 150), sbp: counts(70, 190, 150), dbp: counts(30, 110, 150), map: counts(40, 130, 150) }, PRESCHOOL: { hr: counts(70, 160, 12) } },
    }
    try {
      render(<VitalLimitsSection />)
      const adult = screen.getByTestId("vital-limits-ADULT").querySelectorAll("td")
      expect(adult[1].textContent).toBe("150")
      expect(adult[2].textContent).toMatch(/^< \d+ · > \d+$/)
      expect(adult[6].textContent).toBe("< 50 · > 100")
      const child = screen.getByTestId("vital-limits-PRESCHOOL").querySelectorAll("td")
      expect(child[1].textContent).toBe("12")
      expect(child[2].textContent).toBe("collecting")
      expect(child[6].textContent).toBe("< 70 · > 120")
      expect(screen.getAllByRole("row")).toHaveLength(9)
    } finally {
      automation.value = null
    }
  })

  it("name the signs and bands in Bulgarian as the Bulgarian chart does", () => {
    automation.value = { settings, stats: null }
    intl.locale = "bg"
    try {
      render(<VitalLimitsSection />)
      const headers = [...screen.getByTestId("vital-limits").querySelectorAll("th")].map(cell => cell.textContent)
      expect(headers.slice(2, 6)).toEqual(["СЧ", "Сис", "Диас", "САН"])
      expect(screen.getByTestId("vital-limits-ADULT").querySelector("td")!.textContent).toBe("Възрастни (18–64 г.)")
    } finally {
      intl.locale = "en"
      automation.value = null
    }
  })
})

describe("the chart's complications", () => {
  it("offer the rest of the catalogue after the quick ones, under its headings", () => {
    const more = moreComplicationCategories([{ label: "Hypotension" }, { label: "LAST" }], "en")
    expect(more.map(category => category.displayCat)).toEqual(["Cardiovascular", "Respiratory", "Neurological", "Metabolic / Temperature", "Drug / Pharmacological", "Haematological", "Equipment / Technical", "Surgical"])
    const offered = more.flatMap(category => category.events.map(event => event.label))
    expect(offered).not.toContain("Hypotension")
    expect(offered).not.toContain("Local anaesthetic systemic toxicity (LAST)")
    expect(offered).toContain("Ventricular fibrillation")
    expect(more.every(category => category.isComplication)).toBe(true)
    expect(moreComplicationCategories([], "bg")[0].displayCat).toMatch(/[А-Яа-я]/)
  })

  it("name a quick button as the list does, and save it under the catalogue's name", () => {
    expect(quickComplicationOption({ label: "Drug error", color: "#ef4444" }, "en")).toEqual({ label: "Drug error", color: "#ef4444", displayLabel: "Medication error" })
    expect(quickComplicationOption({ label: "LAST", color: "#ef4444" }, "en").label).toBe("Local anaesthetic systemic toxicity (LAST)")
    // The chart marker reads the same, even with the catalogue's "(LAST)" at the end.
    expect(clinicalEventName("Local anaesthetic systemic toxicity (LAST)", [], "bg", {})).toBe(quickComplicationOption({ label: "LAST", color: "#ef4444" }, "bg").displayLabel)
    expect(clinicalEventName("Drug error", [], "en", {})).toBe("Medication error")
  })
})
