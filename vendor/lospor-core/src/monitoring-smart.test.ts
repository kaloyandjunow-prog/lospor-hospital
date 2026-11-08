import { describe, expect, it } from "vitest"
import { DEFAULT_INTRAOP_AUTOMATION } from "./intraop-automation"
import type { VascularLine } from "./vascular-access-lines"
import { isRelaxant, monitoringSuggestionKey, monitoringSuggestions, readingDue, standardMonitoringOn, toggleStandardMonitoring, type MonitoringContext } from "./monitoring-smart"
import { suggestionOutcomes } from "./intraop-suggestions/acceptance"

const ENABLED = { ...DEFAULT_INTRAOP_AUTOMATION, enabled: true, groups: { ...DEFAULT_INTRAOP_AUTOMATION.groups, reminders: true } }
const START = "2026-11-02T09:30:00.000Z"
const base = (over: Partial<MonitoringContext> = {}): MonitoringContext => ({
  monitoring: ["ecg", "spO2Monitor", "nbpMonitor"], techniques: ["GENERAL_BALANCED"], airway: [], lines: [], relaxantAt: null,
  startedAt: START, now: "2026-11-02T09:40:00.000Z",
  settings: ENABLED, ...over,
})
const fields = (context: MonitoringContext) => monitoringSuggestions(context).map(item => item.field)
const line = (site: string, over: Partial<VascularLine> = {}): VascularLine => ({ id: site, site, siteLabel: site, insertedAt: START, ...over })

describe("monitoring suggestions follow the chart", () => {
  it("suggests nothing for an empty case", () => expect(fields(base())).toEqual([]))

  it("capnography after a tube or mask airway device is in use, not a face mask or a failed tube", () => {
    expect(fields(base({ airway: [{ device: "ORAL_ETT", status: "in_use", insertedAt: START }] }))).toEqual(["etco2Monitor"])
    expect(fields(base({ airway: [{ device: "FACE_MASK", status: "in_use" }] }))).toEqual([])
    expect(fields(base({ airway: [{ device: "ORAL_ETT", status: "failed" }] }))).toEqual([])
  })

  it("IBP for an arterial line and CVP for a central line, but not for a failed line or a peripheral one", () => {
    expect(fields(base({ lines: [line("ART_RADIAL"), line("CVK_IJV")] }))).toEqual(["invasiveBP", "cvpMonitor"])
    expect(fields(base({ lines: [line("ART_RADIAL", { failed: true }), line("VEN_PERIPHERAL")] }))).toEqual([])
  })

  it("TOF after a relaxant, BIS for TIVA, temperature after 30 minutes of general anaesthesia", () => {
    expect(fields(base({ relaxantAt: START }))).toEqual(["tofMonitor"])
    expect(fields(base({ techniques: ["GENERAL_TIVA"] }))).toEqual(["bis"])
    expect(fields(base({ techniques: ["GENERAL_TCI"] }))).toEqual(["bis"])
    expect(fields(base({ now: "2026-11-02T10:01:00.000Z" }))).toEqual(["tempMonitor"])
    expect(fields(base({ techniques: ["REGIONAL_SPINAL"], now: "2026-11-02T11:00:00.000Z" }))).toEqual([])
  })

  it("skips what is already ticked, what was hidden, and what Status switched off", () => {
    const context = base({ relaxantAt: START, techniques: ["GENERAL_TIVA"] })
    expect(fields({ ...context, monitoring: [...context.monitoring, "tofMonitor"] })).toEqual(["bis"])
    expect(fields({ ...context, hidden: ["bis"] })).toEqual(["tofMonitor"])
    expect(fields({ ...context, settings: { ...ENABLED, disabled: ["monitor:bis"] } })).toEqual(["tofMonitor"])
  })

  it("hides one monitoring occurrence but allows a later device occurrence", () => {
    const first = base({ airway: [{ device: "ORAL_ETT", status: "in_use", insertedAt: START }] })
    expect(fields({ ...first, hidden: [monitoringSuggestionKey("etco2Monitor", START)] })).toEqual([])
    expect(fields({ ...first, airway: [
      { device: "ORAL_ETT", status: "replaced", insertedAt: START },
      { device: "LMA", status: "in_use", insertedAt: "2026-11-02T10:00:00.000Z" },
    ], hidden: [monitoringSuggestionKey("etco2Monitor", START)] })).toEqual(["etco2Monitor"])
  })

  it("names the relaxants by the drug lists' names", () => {
    expect(isRelaxant("Rocuronium")).toBe(true)
    expect(isRelaxant("Cisatracurium 10 mg")).toBe(true)
    expect(isRelaxant("Propofol")).toBe(false)
  })
})

describe("standard monitoring and due readings", () => {
  it("turns ECG, SpO2 and NIBP on and off together and keeps the rest", () => {
    expect(standardMonitoringOn(["ecg", "spO2Monitor"])).toBe(false)
    expect(toggleStandardMonitoring(["bis"]).sort()).toEqual(["bis", "ecg", "nbpMonitor", "spO2Monitor"])
    expect(toggleStandardMonitoring(["bis", "ecg", "spO2Monitor", "nbpMonitor"])).toEqual(["bis"])
  })

  it("a reading is due after its interval from the last reading, or from the monitor going on", () => {
    expect(readingDue("bis", null, START, "2026-11-02T09:44:00.000Z")).toBe(false)
    expect(readingDue("bis", null, START, "2026-11-02T09:46:00.000Z")).toBe(true)
    expect(readingDue("bis", "2026-11-02T09:44:00.000Z", START, "2026-11-02T09:50:00.000Z")).toBe(false)
    expect(readingDue("ecg", null, START, "2026-11-02T12:00:00.000Z")).toBe(false)
  })

  it("counts a persisted case-scoped monitoring dismissal", () => {
    expect(suggestionOutcomes([{
      id: "monitor-dismiss", ts: START, type: "prompt_answer",
      answerKind: "monitor:etco2Monitor", answerFor: monitoringSuggestionKey("etco2Monitor", START),
      answer: "not_now", suggestion: "monitor:etco2Monitor",
    }])).toEqual([{ id: "monitor:etco2Monitor", outcome: "dismissed" }])
  })
})

describe("the full list by purpose", () => {
  it("places every catalogue monitor in exactly one group", async () => {
    const { MONITORING } = await import("./catalog/monitoring")
    const { MONITORING_PURPOSE_GROUPS } = await import("./monitoring-smart")
    const grouped = MONITORING_PURPOSE_GROUPS.flatMap(group => group.fields.map(item => item.field)).sort()
    expect(grouped).toEqual(MONITORING.map(item => item.field).sort())
  })
})

describe("turning the cuff off when the arterial line goes on", () => {
  it("asks only at the moment IBP is added while the cuff is on", async () => {
    const { asksNibpOff, withoutNibp } = await import("./monitoring-smart")
    expect(asksNibpOff(["ecg", "nbpMonitor"], ["ecg", "nbpMonitor", "invasiveBP"])).toBe(true)
    expect(asksNibpOff(["ecg"], ["ecg", "invasiveBP"])).toBe(false)
    expect(asksNibpOff(["nbpMonitor", "invasiveBP"], ["nbpMonitor", "invasiveBP", "bis"])).toBe(false)
    expect(withoutNibp(["ecg", "nbpMonitor", "invasiveBP"])).toEqual(["ecg", "invasiveBP"])
  })
})

describe("the hospital's reading intervals (Status)", () => {
  it("use the hospital's minutes for a monitor, the built-in ones otherwise, and refuse nonsense", async () => {
    const { readingDue } = await import("./monitoring-smart")
    const { parseIntraopAutomation } = await import("./intraop-automation")
    const last = "2026-11-07T10:00:00.000Z"
    const settings = parseIntraopAutomation({ enabled: true, monitoringDueMinutes: { bis: 5, tofMonitor: 0, tempMonitor: 500 } })
    expect(settings.monitoringDueMinutes).toMatchObject({ bis: 5, tofMonitor: 10, tempMonitor: 30, cvpMonitor: 15 })
    expect(readingDue("bis", last, null, "2026-11-07T10:06:00.000Z", settings.monitoringDueMinutes)).toBe(true)
    expect(readingDue("bis", last, null, "2026-11-07T10:06:00.000Z")).toBe(false)
  })
})
