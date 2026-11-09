import { describe, expect, it } from "vitest"

import {
  DEFAULT_CLINICAL_PREFERENCES,
  applyClinicalPreferencesPatch,
  combineClinicalPreferencesPatches,
  mergeClinicalPreferences,
  normalizeClinicalPreferences,
  parseClinicalPreferencesPatch,
} from "./clinical-preferences"
import { CLINICAL_EVENT_CATS } from "./catalog/intraop-events"
import { complicationDisplayLabel, resolveIntraopEventLabel } from "./clinical-display"
import { intraopComplicationList, legacyComplications, timelineComplicationEvent } from "./complication-events"
import { ALL_COMPLICATIONS, COMPLICATION_CATEGORIES, RETIRED_COMPLICATIONS, canonicalComplicationLabel, complicationGroupsBeyond } from "./complications"
import { intraopAttentionItems, intraopAttentionText, intraopResolveAttention } from "./intraop-attention"
import { parseIntraopAutomation, type IntraopAutomationSettings } from "./intraop-automation"
import {
  INTRAOP_END_CORRECTION_REASONS,
  intraopEndCorrectionReasonLabel,
  isIntraopEndCorrection,
  isIntraopEndCorrectionReason,
} from "./intraop-end-correction"
import { projectIntraopEvents, reverseProjectIntraop } from "./intraop-engine"
import { describeIntraopEvent } from "./intraop-summary"
import { applyIntraopEventOps, timetableEditToEventOps } from "./intraop-timetable-edit"
import { parseLogEvent, type LogEvent } from "./intraop-types"
import {
  isOpenVitalEpisode,
  meanArterialPressure,
  vitalAnswerOps,
  vitalEpisodeOps,
  vitalQuestions,
  vitalQuestionText,
  type VitalHistogram,
  type VitalQuestionContext,
  type VitalStatsTable,
} from "./vital-questions"

/**
 * The 10.1.0 automation at its edges: the combinations a busy case produces
 * (two complications at once, a reading that carries only some signs), the
 * fixed rules for children, the clinician's own setting, and what the chart,
 * the event log and the parser make of the new entries.
 */

const YEAR = 365.25
const ADULT = Math.round(40 * YEAR)
const PRESCHOOLER = Math.round(4 * YEAR)

const on: IntraopAutomationSettings = parseIntraopAutomation({ enabled: true, vitalQuestions: { enabled: true } })

function histogram(lo: number, hi: number, cases: number): VitalHistogram {
  const counts: number[] = []
  const mid = (lo + hi) / 2
  for (let v = lo; v <= hi; v += 1) counts.push(Math.max(1, Math.round(100 - Math.abs(v - mid) * 2)))
  return { min: lo, counts, cases }
}

const adultStats: VitalStatsTable = {
  ADULT: {
    hr: histogram(40, 120, 400),
    sbp: histogram(70, 170, 400),
    dbp: histogram(35, 100, 400),
    map: histogram(45, 120, 400),
  },
}

const at = (minute: number) => new Date(Date.UTC(2026, 10, 1, 9, minute)).toISOString()
const vital = (id: string, minute: number, values: Partial<LogEvent>): LogEvent => ({ id, type: "vital", ts: at(minute), ...values })
const context = (overrides: Partial<VitalQuestionContext> = {}): VitalQuestionContext => ({
  settings: on, stats: adultStats, ageDays: ADULT, keepLogging: true, ...overrides,
})
const keys = (log: LogEvent[], ctx = context()) => vitalQuestions(log, ctx).map(question => question.key)

/** Answer the waiting question about `kind` on the latest reading. */
function answer(log: LogEvent[], kind: string, reply: "log_complication" | "not_now", ctx = context()): LogEvent[] {
  const question = vitalQuestions(log, ctx).find(item => item.kind === kind)
  if (!question) throw new Error(`no ${kind} question`)
  return applyIntraopEventOps(log, vitalAnswerOps(question, reply, ctx, at(59)))
}

describe("the clinician's setting to keep logging", () => {
  it("is on unless the account says otherwise", () => {
    expect(DEFAULT_CLINICAL_PREFERENCES.vitalEpisodeAutoLog).toBe(true)
    expect(normalizeClinicalPreferences({}).vitalEpisodeAutoLog).toBe(true)
    expect(normalizeClinicalPreferences({ vitalEpisodeAutoLog: false }).vitalEpisodeAutoLog).toBe(false)
  })

  it("takes only a true or false, never a string that looks like one", () => {
    expect(parseClinicalPreferencesPatch({ vitalEpisodeAutoLog: "false" })).not.toHaveProperty("vitalEpisodeAutoLog")
    expect(parseClinicalPreferencesPatch({ vitalEpisodeAutoLog: 0 })).not.toHaveProperty("vitalEpisodeAutoLog")
    expect(parseClinicalPreferencesPatch({ vitalEpisodeAutoLog: false })).toEqual({ vitalEpisodeAutoLog: false })
  })

  it("follows the account over the device, and the device only when the account never said", () => {
    expect(mergeClinicalPreferences({ vitalEpisodeAutoLog: false }, { vitalEpisodeAutoLog: true }).vitalEpisodeAutoLog).toBe(false)
    expect(mergeClinicalPreferences({ vitalEpisodeAutoLog: true }, { vitalEpisodeAutoLog: false }).vitalEpisodeAutoLog).toBe(true)
    expect(mergeClinicalPreferences({}, { vitalEpisodeAutoLog: false }).vitalEpisodeAutoLog).toBe(false)
  })

  it("keeps the last change when changes queue up offline, and leaves the rest alone", () => {
    expect(combineClinicalPreferencesPatches({ vitalEpisodeAutoLog: false }, { vitalEpisodeAutoLog: true }).vitalEpisodeAutoLog).toBe(true)
    expect(combineClinicalPreferencesPatches({ vitalEpisodeAutoLog: false }, { intraopFavouriteDrugs: ["Propofol"] }))
      .toMatchObject({ vitalEpisodeAutoLog: false, intraopFavouriteDrugs: ["Propofol"] })
    const current = { ...DEFAULT_CLINICAL_PREFERENCES, intraopFavouriteDrugs: ["Fentanyl"] }
    expect(applyClinicalPreferencesPatch(current, { vitalEpisodeAutoLog: false }))
      .toMatchObject({ vitalEpisodeAutoLog: false, intraopFavouriteDrugs: ["Fentanyl"] })
  })
})

describe("the hospital's minimum number of cases", () => {
  it("keeps any whole number from 20 to 10 000, and the default for anything else", () => {
    const minCases = (value: unknown) => parseIntraopAutomation({ vitalQuestions: { minCases: value } }).vitalQuestions.minCases
    expect(minCases(20)).toBe(20)
    expect(minCases(10_000)).toBe(10_000)
    expect(minCases(19)).toBe(100)
    expect(minCases(10_001)).toBe(100)
    expect(minCases(50.5)).toBe(100)
    expect(minCases("50")).toBe(100)
  })
})

describe("two complications at once", () => {
  // HR 170 with BP 60/30: tachycardia and hypotension, tracked apart.
  const both = (id: string, minute: number) => vital(id, minute, { heartRate: 170, systolic: 60, diastolic: 30 })

  it("an episode of one never silences the question about the other", () => {
    let log = [vital("r1", 0, { heartRate: 170 })]
    log = answer(log, "tachycardia", "log_complication")
    log = [...log, both("r2", 5)]
    expect(keys(log)).toEqual(["vital:hypotension:r2"])
  })

  it("a Not now to one leaves the other waiting", () => {
    let log = [both("r1", 0)]
    log = answer(log, "tachycardia", "not_now")
    expect(keys(log)).toEqual(["vital:hypotension:r1"])
  })

  it("two open episodes close each at its own reading", () => {
    let log = [both("r1", 0)]
    log = answer(log, "hypotension", "log_complication")
    log = answer(log, "tachycardia", "log_complication")
    log = [...log, vital("r2", 5, { heartRate: 80, systolic: 60, diastolic: 30 })]
    const first = vitalEpisodeOps(log, context())
    expect(first.update.map(event => [event.label, event.endTs])).toEqual([["Tachycardia", at(5)]])
    log = applyIntraopEventOps(log, first)
    log = [...log, vital("r3", 10, { heartRate: 82, systolic: 120, diastolic: 70 })]
    const second = vitalEpisodeOps(log, context())
    expect(second.update.map(event => [event.label, event.endTs])).toEqual([["Hypotension", at(10)]])
  })
})

describe("a reading that carries only some signs", () => {
  it("never closes an episode it says nothing about", () => {
    let log = [vital("r1", 0, { heartRate: 170 })]
    log = answer(log, "tachycardia", "log_complication")
    log = [...log, vital("r2", 5, { systolic: 120, diastolic: 70 })]
    expect(vitalEpisodeOps(log, context()).update).toEqual([])
    // Nor does the question come back: the latest heart rate is still the one logged.
    expect(keys(log)).toEqual([])
  })

  it("asks about blood pressure from a reading without a heart rate", () => {
    expect(keys([vital("r1", 0, { systolic: 60, diastolic: 30 })])).toEqual(["vital:hypotension:r1"])
  })
})

describe("an episode", () => {
  it("stays open while a reading is back inside the statistics but still past the fixed rule", () => {
    // Adults: the fixed rule asks above 100 bpm; the statistics here allow more.
    let log = [vital("r1", 0, { heartRate: 170 })]
    log = answer(log, "tachycardia", "log_complication")
    log = [...log, vital("r2", 5, { heartRate: 105 })]
    expect(vitalEpisodeOps(log, context()).update).toEqual([])
    log = [...log, vital("r3", 10, { heartRate: 95 })]
    expect(vitalEpisodeOps(log, context()).update[0]).toMatchObject({ endTs: at(10) })
  })

  it("is never closed at a case end before it started", () => {
    let log = [vital("r1", 30, { heartRate: 170 })]
    log = answer(log, "tachycardia", "log_complication")
    expect(vitalEpisodeOps(log, context(), at(10)).update).toEqual([])
    expect(vitalEpisodeOps(log, context(), "not a date").update).toEqual([])
  })

  it("is open only when it came from the vitals and has no end", () => {
    const base: LogEvent = { id: "c", type: "complication", ts: at(0), label: "Tachycardia" }
    expect(isOpenVitalEpisode({ ...base, complicationSource: "vitals" })).toBe(true)
    expect(isOpenVitalEpisode({ ...base, complicationSource: "vitals", endTs: at(5) })).toBe(false)
    expect(isOpenVitalEpisode({ ...base, complicationSource: "timeline" })).toBe(false)
  })

  it("is left alone when the switches are off or the age is unknown", () => {
    let log = [vital("r1", 0, { heartRate: 170 })]
    log = answer(log, "tachycardia", "log_complication")
    log = [...log, vital("r2", 5, { heartRate: 80 })]
    expect(vitalEpisodeOps(log, context({ settings: parseIntraopAutomation({}) })).update).toEqual([])
    expect(vitalEpisodeOps(log, context({ ageDays: null })).update).toEqual([])
  })
})

describe("a complication already on the chart", () => {
  it("logged at the reading's own time answers the question", () => {
    const log: LogEvent[] = [
      vital("r1", 0, { heartRate: 170 }),
      { id: "t", type: "complication", ts: at(0), label: "Tachycardia", complicationSource: "timeline" },
    ]
    expect(keys(log)).toEqual([])
  })

  it("logged earlier, as a moment, does not answer a later reading", () => {
    const log: LogEvent[] = [
      { id: "t", type: "complication", ts: at(0), label: "Tachycardia", complicationSource: "timeline" },
      vital("r1", 5, { heartRate: 170 }),
    ]
    expect(keys(log)).toEqual(["vital:tachycardia:r1"])
  })

  it("of another kind does not answer it", () => {
    const log: LogEvent[] = [
      vital("r1", 0, { heartRate: 170 }),
      { id: "t", type: "complication", ts: at(0), label: "Laryngospasm", complicationSource: "timeline" },
    ]
    expect(keys(log)).toEqual(["vital:tachycardia:r1"])
  })
})

describe("children, on the fixed rules alone", () => {
  const child = context({ ageDays: PRESCHOOLER, stats: null })

  it("ask about hypotension below 70 + 2 × age systolic, with MAP shown", () => {
    const [question] = vitalQuestions([vital("r1", 0, { systolic: 75, diastolic: 40 })], child)
    expect(question.kind).toBe("hypotension")
    const text = vitalQuestionText(question, "en", true)
    expect(text.title).toBe(`75/40 (MAP ${meanArterialPressure(75, 40)}): log hypotension?`)
    expect(text.detail).toBe("SBP 75 is below the fixed limit of 78 mmHg · Preschool (3–5 years)")
    expect(text.stop).toBe("Automatic logging stops when SBP is 78 or higher.")
    expect(keys([vital("r1", 0, { systolic: 80, diastolic: 40 })], child)).toEqual([])
  })

  it("ask about a heart rate past the band's limits, and never about hypertension", () => {
    expect(keys([vital("r1", 0, { heartRate: 125 })], child)).toEqual(["vital:tachycardia:r1"])
    expect(keys([vital("r1", 0, { heartRate: 65 })], child)).toEqual(["vital:bradycardia:r1"])
    expect(keys([vital("r1", 0, { heartRate: 100, systolic: 190, diastolic: 120 })], child)).toEqual([])
  })
})

describe("the words of a question", () => {
  it("name every sign that has to come back before logging stops", () => {
    const [question] = vitalQuestions([vital("r1", 0, { systolic: 60, diastolic: 30 })], context())
    const stop = vitalQuestionText(question, "en", true).stop!
    expect(stop).toMatch(/^Automatic logging stops when SBP is \d+ or higher and DBP is \d+ or higher and MAP is \d+ or higher\.$/)
    // MAP has to clear the fixed adult rule of 65 as well as the statistics.
    expect(Number(stop.match(/MAP is (\d+)/)![1])).toBeGreaterThanOrEqual(65)
    expect(vitalQuestionText(question, "bg", true).stop).toMatch(/^Автоматичното записване спира, когато Сис е \d+ или повече и Диас е \d+ или повече и САН е \d+ или повече\.$/)
  })

  it("say hypertension from the patient's baseline, not from the hospital's statistics", () => {
    const [question] = vitalQuestions([vital("r1", 0, { systolic: 200, diastolic: 95 })], { ...context(), preopPressure: { systolic: 140, diastolic: 80 } })
    expect(question.kind).toBe("hypertension")
    expect(vitalQuestionText(question, "en", true).detail).toBe("SBP 200 is 43% above the baseline of 140 mmHg (limit 168)")
    expect(vitalQuestionText(question, "bg", true).title).toBe(`200/95 (САН ${meanArterialPressure(200, 95)}): Хипертенсия?`)
  })
})

describe("in the shared Waiting for your answer list", () => {
  it("come after the timeline's own questions, in the vitals' own words", () => {
    const log: LogEvent[] = [
      vital("r1", 0, { heartRate: 170 }),
      { id: "late", type: "drug", ts: at(40), name: "Ondansetron", dose: "4", unit: "mg" },
    ]
    const items = intraopAttentionItems(log, { now: at(45), endedAt: at(30), vitals: context() })
    expect(items.map(item => item.kind)).toEqual(["after_end", "vital_deviation"])
    expect(intraopAttentionText(items[1], "en")).toBe("HR 170: log tachycardia?")
    expect(intraopAttentionText(items[1], "bg")).toBe("СЧ 170: Тахикардия?")
  })

  it("write a moment, not an episode, for a clinician who turned logging off", () => {
    const log = [vital("r1", 0, { heartRate: 170 })]
    const ops = intraopResolveAttention(log, "vital:tachycardia:r1", "log_complication", { now: at(1), vitals: context({ keepLogging: false }) })
    expect(ops.add[0]).toMatchObject({ type: "complication", ts: at(0), endTs: at(0) })
    const notNow = intraopResolveAttention(log, "vital:tachycardia:r1", "not_now", { now: at(1), vitals: context() })
    expect(notNow.add[0]).toMatchObject({ type: "prompt_answer", answerFor: "r1", answerKind: "tachycardia", answer: "not_now" })
  })
})

describe("on the chart", () => {
  const start = at(0)

  it("an open episode is a marker without an end, and a complication ahead of now is planned", () => {
    const chart = projectIntraopEvents([
      { id: "open", type: "complication", ts: at(10), label: "Hypotension", complicationSource: "vitals" },
      { id: "ahead", type: "complication", ts: at(50), label: "Laryngospasm", complicationSource: "timeline" },
    ], { start, openThrough: at(30) })
    const [open, ahead] = chart.clinicalEvents!
    expect(open).not.toHaveProperty("endColIdx")
    expect(open).not.toHaveProperty("planned")
    expect(ahead).toMatchObject({ eventId: "ahead", planned: true })
  })

  it("an end before the start draws no span", () => {
    const chart = projectIntraopEvents([
      { id: "c", type: "complication", ts: at(20), endTs: at(10), label: "Hypotension" },
    ], { start, openThrough: at(30) })
    expect(chart.clinicalEvents![0]).not.toHaveProperty("endColIdx")
  })

  it("reads back from an old chart as the entries it shows", () => {
    const events = reverseProjectIntraop({
      clinicalEvents: [
        { colIdx: 2, endColIdx: 4, label: "Hypotension", color: "#ef4444", kind: "complication" },
        { colIdx: 3, label: "Cardioversion", color: "#f59e0b", kind: "defibrillation", energyJ: 100, synchronized: true },
        { colIdx: 5, label: "Incision", color: "#64748b" },
      ],
    } as never, start)
    expect(events.map(event => [event.type, event.ts, event.endTs, event.energyJ, event.synchronized])).toEqual([
      ["complication", at(10), at(20), undefined, undefined],
      ["defibrillation", at(15), undefined, 100, true],
      ["clinical_event", at(25), undefined, undefined, undefined],
    ])
  })
})

describe("in the event log", () => {
  it("says an episode is still logging, and a moment is a complication", () => {
    const open: LogEvent = { id: "o", type: "complication", ts: at(0), label: "Bradycardia", complicationSource: "vitals" }
    expect(describeIntraopEvent(open, { language: "en" })).toMatchObject({ text: "Bradycardia", sub: "Complication · still logging" })
    expect(describeIntraopEvent(open, { language: "bg" })).toMatchObject({ text: "Брадикардия", sub: "Усложнение · записва се" })
    const moment: LogEvent = { id: "m", type: "complication", ts: at(0), endTs: at(0), label: "Bradycardia", complicationSource: "vitals" }
    expect(describeIntraopEvent(moment, { language: "en" }).sub).toBe("Complication")
    expect(describeIntraopEvent({ id: "n", type: "complication", ts: at(0) }, { language: "en" }).text).toBe("Complication")
  })
})

describe("the shared parser", () => {
  it("drops new fields that are malformed instead of guessing", () => {
    const parsed = parseLogEvent({
      id: "x", type: "complication", ts: at(0), label: "Hypotension",
      complicationSource: "ai", endTs: "yesterday", answer: "later", synchronized: "yes", energyJ: "200",
    })!
    expect(parsed).toEqual({ id: "x", type: "complication", ts: at(0), label: "Hypotension" })
  })
})

describe("the reasons for correcting an end", () => {
  it("each read in both languages", () => {
    for (const reason of INTRAOP_END_CORRECTION_REASONS) {
      expect(isIntraopEndCorrectionReason(reason)).toBe(true)
      expect(intraopEndCorrectionReasonLabel(reason, "en")).toMatch(/^[A-Z]/)
      expect(intraopEndCorrectionReasonLabel(reason, "bg")).toMatch(/[А-Яа-я]/)
    }
    expect(new Set(INTRAOP_END_CORRECTION_REASONS.map(reason => intraopEndCorrectionReasonLabel(reason, "en"))).size).toBe(INTRAOP_END_CORRECTION_REASONS.length)
    expect(isIntraopEndCorrectionReason("wrong_time_entered")).toBe(false)
  })

  it("are not asked for when either end cannot be read", () => {
    expect(isIntraopEndCorrection("not a date", at(30))).toBe(false)
    expect(isIntraopEndCorrection(at(30), "not a date")).toBe(false)
  })
})

describe("one name per complication, whichever button charted it", () => {
  const quick = CLINICAL_EVENT_CATS.find(category => category.isComplication)!.events.map(event => event.label)

  it("every quick button is a complication of the catalogue, once canonical", () => {
    expect(quick.map(canonicalComplicationLabel).filter(label => !ALL_COMPLICATIONS.includes(label))).toEqual([])
    expect(canonicalComplicationLabel("LAST")).toBe("Local anaesthetic systemic toxicity (LAST)")
    expect(canonicalComplicationLabel("Bradycardia")).toBe("Bradycardia")
  })

  it("reads the same in the picker, the list, the event log and print, in both languages", () => {
    for (const label of quick) {
      for (const locale of ["en", "bg"] as const) {
        const name = complicationDisplayLabel(label, locale)
        expect(resolveIntraopEventLabel(label, locale), `${label} (${locale})`).toBe(name)
        expect(describeIntraopEvent({ id: "c", type: "complication", ts: at(0), label: canonicalComplicationLabel(label) }, { language: locale }).text).toBe(name)
      }
    }
    expect(complicationDisplayLabel("Drug error", "en")).toBe("Medication error")
  })

  it("saves a short quick button under the catalogue's name, from the slot sheet and from the chart", () => {
    expect(timelineComplicationEvent({ id: "l", ts: at(0), label: "LAST" }).label).toBe("Local anaesthetic systemic toxicity (LAST)")
    const start = at(0)
    const before = projectIntraopEvents([], { start, openThrough: at(30) })
    const after = { ...before, clinicalEvents: [{ colIdx: 2, label: "LAST", color: "#ef4444", kind: "complication" as const }] }
    const ops = timetableEditToEventOps({ log: [], before, after, chartStart: start, now: at(30), newId: () => "n" })
    expect(ops.add[0].label).toBe("Local anaesthetic systemic toxicity (LAST)")
  })

  it("offers the rest under the catalogue's headings, without the quick ones again", () => {
    const groups = complicationGroupsBeyond(quick)
    expect(groups.map(group => group.id)).toEqual(["cardiovascular", "respiratory", "neurological", "metabolic", "drug", "haematological", "equipment", "surgical"].filter(id => groups.some(group => group.id === id)))
    const offered = groups.flatMap(group => group.items)
    expect(offered.filter(item => quick.map(canonicalComplicationLabel).includes(item))).toEqual([])
    expect(offered.length + new Set(quick.map(canonicalComplicationLabel)).size).toBe(ALL_COMPLICATIONS.length - RETIRED_COMPLICATIONS.length)
    // A retired duplicate is never offered again.
    expect(offered.filter(item => RETIRED_COMPLICATIONS.includes(item))).toEqual([])
  })
})

describe("the merged duplicates (10.1.0)", () => {
  it("are offered once, under the kept name", () => {
    const offered = COMPLICATION_CATEGORIES.flatMap(category => category.items)
    for (const kept of ["Anaphylaxis / allergic reaction", "Venous air embolism", "Massive haemorrhage", "Failed block", "Accidental extubation"]) {
      expect(offered).toContain(kept)
    }
    for (const retired of RETIRED_COMPLICATIONS) expect(offered).not.toContain(retired)
  })

  it("still read under their own name on a case that recorded one, as old text or as an entry", () => {
    expect(legacyComplications("Anaphylactoid reaction; ETT displacement — settled").selected).toEqual(["Anaphylactoid reaction", "ETT displacement"])
    expect(intraopComplicationList([], "Blood loss >1L").map(item => item.label)).toEqual(["Blood loss >1L"])
    expect(resolveIntraopEventLabel("Venous gas embolism", "en")).toBe("Venous gas embolism")
    expect(complicationDisplayLabel("ETT displacement", "bg")).toBe("Дислокация на ендотрахеалната тръба")
  })

  it("name the kept ones as agreed", () => {
    expect(complicationDisplayLabel("Failed block", "en")).toBe("Failed regional block")
    expect(complicationDisplayLabel("Failed block", "bg")).toBe("Неуспешен регионален блок")
    expect(complicationDisplayLabel("Awareness under anaesthesia", "bg")).toBe("Интраоперативна будност при обща анестезия")
    expect(complicationDisplayLabel("Arterial line failure", "bg")).toBe("Неизправност на артериален катетър")
  })
})
