import { describe, expect, it } from "vitest"

import { DEFAULT_INTRAOP_AUTOMATION, parseIntraopAutomation, vitalQuestionsEnabled, type IntraopAutomationSettings } from "./intraop-automation"
import { intraopAttentionItems, intraopResolveAttention } from "./intraop-attention"
import { applyIntraopEventOps } from "./intraop-timetable-edit"
import type { LogEvent } from "./intraop-types"
import {
  evaluateVitalReading,
  fixedHypotension,
  histogramMeanSd,
  histogramPercentile,
  histogramShare,
  highestPressure, hypertensionBaselineLimit, lowestPressure, meanArterialPressure, pressureBaseline,
  preopAgeDays,
  vitalAnswerOps,
  vitalBandFor,
  vitalComplicationId,
  vitalEpisodeOps,
  vitalLimitsFor,
  vitalQuestions,
  vitalQuestionText,
  type VitalHistogram,
  type VitalQuestionContext,
  type VitalStatsTable,
} from "./vital-questions"

const YEAR = 365.25
const ADULT = Math.round(40 * YEAR)

const on: IntraopAutomationSettings = parseIntraopAutomation({ enabled: true, vitalQuestions: { enabled: true } })

/** A bell-ish histogram: `n` readings spread evenly from lo to hi, more in the middle. */
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

const vital = (id: string, minute: number, values: Partial<LogEvent>): LogEvent => ({
  id, type: "vital", ts: new Date(Date.UTC(2026, 10, 1, 9, minute)).toISOString(), ...values,
})

const context = (overrides: Partial<VitalQuestionContext> = {}): VitalQuestionContext => ({
  settings: on, stats: adultStats, ageDays: ADULT, keepLogging: true, ...overrides,
})

describe("settings", () => {
  it("are on by default, off when saved off, and off without the master switch", () => {
    expect(parseIntraopAutomation(undefined)).toEqual(DEFAULT_INTRAOP_AUTOMATION)
    expect(parseIntraopAutomation("nonsense")).toEqual(DEFAULT_INTRAOP_AUTOMATION)
    expect(vitalQuestionsEnabled(DEFAULT_INTRAOP_AUTOMATION)).toBe(true)
    expect(vitalQuestionsEnabled(parseIntraopAutomation({ enabled: true }))).toBe(true)
    expect(vitalQuestionsEnabled(parseIntraopAutomation({ enabled: true, vitalQuestions: { enabled: false } }))).toBe(false)
    expect(vitalQuestionsEnabled(parseIntraopAutomation({ vitalQuestions: { enabled: true } }))).toBe(false)
    expect(vitalQuestionsEnabled(on)).toBe(true)
  })

  it("keep only the slider's steps and a sane minimum", () => {
    const parsed = parseIntraopAutomation({ vitalQuestions: { minCases: 3, tails: { ADULT: { hr: { low: 1, high: 7 } } } } })
    expect(parsed.vitalQuestions.minCases).toBe(100)
    expect(parsed.vitalQuestions.tails.ADULT.hr).toEqual({ low: 1, high: 0.5 })
    expect(parsed.vitalQuestions.tails.NEWBORN.map).toEqual({ low: 0.5, high: 0.5 })
  })
})

describe("bands and fixed rules", () => {
  it("place ages in their band", () => {
    expect(vitalBandFor(10)?.key).toBe("NEWBORN")
    expect(vitalBandFor(100)?.key).toBe("INFANT")
    expect(vitalBandFor(Math.round(2 * YEAR))?.key).toBe("TODDLER")
    expect(vitalBandFor(Math.round(4 * YEAR))?.key).toBe("PRESCHOOL")
    expect(vitalBandFor(Math.round(11 * YEAR))?.key).toBe("SCHOOL")
    expect(vitalBandFor(Math.round(17 * YEAR))?.key).toBe("ADOLESCENT")
    expect(vitalBandFor(ADULT)?.key).toBe("ADULT")
    expect(vitalBandFor(Math.round(70 * YEAR))?.key).toBe("OLDER")
    expect(vitalBandFor(null)).toBeNull()
  })

  it("use the child's actual age for 70 + 2 × age", () => {
    expect(fixedHypotension(Math.round(1.2 * YEAR))).toEqual({ sign: "sbp", below: 72 })
    expect(fixedHypotension(Math.round(5.5 * YEAR))).toEqual({ sign: "sbp", below: 80 })
    expect(fixedHypotension(Math.round(9.9 * YEAR))).toEqual({ sign: "sbp", below: 88 })
    expect(fixedHypotension(Math.round(10.1 * YEAR))).toEqual({ sign: "sbp", below: 90 })
    expect(fixedHypotension(5)).toEqual({ sign: "sbp", below: 60 })
    expect(fixedHypotension(200)).toEqual({ sign: "sbp", below: 70 })
    expect(fixedHypotension(ADULT)).toEqual({ sign: "map", below: 65 })
  })

  it("read age from the preoperative record as the unit indicators do", () => {
    expect(preopAgeDays({ ageApproxDays: 12 })).toBe(12)
    expect(preopAgeDays({ ageValue: 3, ageUnit: "MONTHS" })).toBe(91)
    expect(preopAgeDays({ ageYears: 40 })).toBe(Math.round(40 * YEAR + 182))
    expect(preopAgeDays(null)).toBeNull()
  })
})

describe("statistics", () => {
  const h: VitalHistogram = { min: 1, counts: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], cases: 1 }

  it("take a percentile as the reading at that rank", () => {
    expect(histogramPercentile(h, 0)).toBe(1)
    expect(histogramPercentile(h, 50)).toBe(6)
    expect(histogramPercentile(h, 99.5)).toBe(10)
  })

  it("count shares strictly beyond a value", () => {
    expect(histogramShare(h, 8, "below")).toBe(70)
    expect(histogramShare(h, 8, "above")).toBe(20)
  })

  it("give mean and SD", () => {
    const summary = histogramMeanSd(h)!
    expect(summary.mean).toBe(5.5)
    expect(summary.sd).toBeCloseTo(3.03, 2)
  })

  it("are used only once a band has the minimum number of cases", () => {
    const few = vitalLimitsFor({ ADULT: { hr: histogram(40, 120, 30) } }, on, "ADULT")
    expect(few.hr.active).toBe(false)
    expect(few.hr.low).toBeNull()
    const enough = vitalLimitsFor(adultStats, on, "ADULT")
    expect(enough.hr.active).toBe(true)
    expect(enough.hr.low!).toBeLessThan(enough.hr.high!)
  })

  it("follow each sign's own tail setting", () => {
    const wide = parseIntraopAutomation({ enabled: true, vitalQuestions: { enabled: true, tails: { ADULT: { hr: { low: 5, high: 5 } } } } })
    const narrow = vitalLimitsFor(adultStats, on, "ADULT").hr
    const broad = vitalLimitsFor(adultStats, wide, "ADULT").hr
    expect(broad.low!).toBeGreaterThan(narrow.low!)
    expect(broad.high!).toBeLessThan(narrow.high!)
    expect(vitalLimitsFor(adultStats, wide, "ADULT").sbp).toEqual(vitalLimitsFor(adultStats, on, "ADULT").sbp)
  })
})

describe("one reading", () => {
  const limits = vitalLimitsFor(adultStats, on, "ADULT")

  it("calculates MAP from systolic and diastolic", () => {
    expect(meanArterialPressure(120, 60)).toBe(80)
  })

  it("raises two questions when two things are wrong: HR 160 with BP 60/30", () => {
    const kinds = evaluateVitalReading({ heartRate: 160, systolic: 60, diastolic: 30 }, { ageDays: ADULT, limits }).map(f => f.kind)
    expect(kinds).toEqual(["hypotension", "tachycardia"])
  })

  it("raises both blood-pressure questions for a very wide pulse pressure (190/30)", () => {
    const kinds = evaluateVitalReading({ systolic: 190, diastolic: 30 }, { ageDays: ADULT, limits, baseline: { sbp: 130, source: "preop" }, hypertensionPercent: 20 }).map(f => f.kind)
    expect(kinds).toEqual(expect.arrayContaining(["hypotension", "hypertension"]))
  })

  it("asks about hypertension only above the patient's baseline by the Status percentage, never from the statistics", () => {
    const baseline = { sbp: 120, map: 90, source: "preop" as const }
    // 145 is 21% above 120: over a 20% threshold, under a 30% one.
    expect(evaluateVitalReading({ systolic: 145, diastolic: 70 }, { ageDays: ADULT, limits, baseline, hypertensionPercent: 20 }).map(f => f.kind)).toContain("hypertension")
    expect(evaluateVitalReading({ systolic: 145, diastolic: 70 }, { ageDays: ADULT, limits, baseline, hypertensionPercent: 30 }).map(f => f.kind)).not.toContain("hypertension")
    // MAP on its own: 110 is 22% above 90.
    expect(evaluateVitalReading({ ibpMap: 110 }, { ageDays: ADULT, limits, baseline, hypertensionPercent: 20 }).map(f => f.kind)).toContain("hypertension")
    // Without a baseline, even a very high reading does not ask: the statistics are switched off for hypertension.
    expect(evaluateVitalReading({ systolic: 240, diastolic: 130 }, { ageDays: ADULT, limits }).map(f => f.kind)).not.toContain("hypertension")
  })

  it("takes the baseline from the preop BP, else the first BP charted in theatre", () => {
    const log: LogEvent[] = [vital("a", 0, { systolic: 150, diastolic: 90, autoFilled: true }), vital("b", 5, { systolic: 130, diastolic: 80 }), vital("c", 10, { systolic: 170, diastolic: 95 })]
    expect(pressureBaseline(log, { systolic: 120, diastolic: 75 })).toEqual({ sbp: 120, map: 90, source: "preop" })
    expect(pressureBaseline(log, null)).toEqual({ sbp: 130, map: 97, source: "first" })
    expect(pressureBaseline([], null)).toBeNull()
    expect(hypertensionBaselineLimit(120, 20)).toBe(144)
  })

  it("uses the fixed rules without statistics", () => {
    const findings = evaluateVitalReading({ heartRate: 45, systolic: 110, diastolic: 60 }, { ageDays: ADULT, limits: null })
    expect(findings.map(f => f.kind)).toEqual(["bradycardia"])
    expect(findings[0].triggers).toEqual([{ sign: "hr", value: 45, rule: "fixed", limit: 50 }])
  })

  it("never asks about hypertension without statistics: there is no fixed rule", () => {
    expect(evaluateVitalReading({ systolic: 230, diastolic: 120 }, { ageDays: ADULT, limits: null })).toEqual([])
  })

  it("stops automatic logging only inside both limits", () => {
    const [tachy] = evaluateVitalReading({ heartRate: 150 }, { ageDays: ADULT, limits })
    expect(tachy.stopAt).toEqual([{ sign: "hr", value: Math.min(100, limits.hr.high!), direction: "atMost" }])
  })
})

describe("questions", () => {
  it("are not asked when the switches are off", () => {
    const log = [vital("r1", 0, { heartRate: 170 })]
    expect(vitalQuestions(log, context({ settings: parseIntraopAutomation({ enabled: true, vitalQuestions: { enabled: false } }) }))).toEqual([])
    expect(vitalQuestions(log, null)).toEqual([])
  })

  it("come from the latest reading only, never from an auto-filled copy", () => {
    const log = [vital("r1", 0, { heartRate: 170 }), vital("r2", 5, { heartRate: 75 })]
    expect(vitalQuestions(log, context())).toEqual([])
    const copied = [vital("r1", 0, { heartRate: 75 }), vital("r2", 5, { heartRate: 170, autoFilled: true })]
    expect(vitalQuestions(copied, context())).toEqual([])
  })

  it("lets each vital question be switched off without silencing the others", () => {
    const log = [vital("r1", 0, { heartRate: 170, systolic: 60, diastolic: 30 })]
    const filtered = context({ user: { automationLines: { "vital:hypotension": false } } })
    expect(vitalQuestions(log, filtered).map(question => question.kind)).toEqual(["tachycardia"])
  })

  it("ask again at every out-of-range reading after Not now", () => {
    let log = [vital("r1", 0, { heartRate: 170 })]
    const [first] = vitalQuestions(log, context())
    log = applyIntraopEventOps(log, vitalAnswerOps(first, "not_now", { keepLogging: true }, "2026-11-01T09:01:00Z"))
    expect(vitalQuestions(log, context())).toEqual([])
    log = [...log, vital("r2", 5, { heartRate: 168 })]
    expect(vitalQuestions(log, context()).map(q => q.key)).toEqual(["vital:tachycardia:r2"])
  })

  it("stay quiet during an episode and close it at the first reading back inside both limits", () => {
    let log = [vital("r1", 0, { heartRate: 170 })]
    const [question] = vitalQuestions(log, context())
    log = applyIntraopEventOps(log, vitalAnswerOps(question, "log_complication", { keepLogging: true }, "2026-11-01T09:01:00Z"))
    log = [...log, vital("r2", 5, { heartRate: 165 }), vital("r3", 10, { heartRate: 160 })]
    expect(vitalQuestions(log, context())).toEqual([])
    expect(vitalEpisodeOps(log, context()).update).toEqual([])
    log = [...log, vital("r4", 15, { heartRate: 80 })]
    const ops = vitalEpisodeOps(log, context())
    expect(ops.update).toHaveLength(1)
    expect(ops.update[0]).toMatchObject({ id: vitalComplicationId("r1", "tachycardia"), endTs: log.find(e => e.id === "r4")!.ts })
    log = applyIntraopEventOps(log, ops)
    log = [...log, vital("r5", 25, { heartRate: 175 })]
    expect(vitalQuestions(log, context()).map(q => q.key)).toEqual(["vital:tachycardia:r5"])
  })

  it("close an open episode at the case end when the readings never came back", () => {
    let log = [vital("r1", 0, { heartRate: 170 })]
    log = applyIntraopEventOps(log, vitalAnswerOps(vitalQuestions(log, context())[0], "log_complication", { keepLogging: true }, 0))
    const ops = vitalEpisodeOps(log, context(), "2026-11-01T10:00:00.000Z")
    expect(ops.update[0].endTs).toBe("2026-11-01T10:00:00.000Z")
  })

  it("with logging off, log a moment and ask again at the next reading", () => {
    let log = [vital("r1", 0, { heartRate: 170 })]
    log = applyIntraopEventOps(log, vitalAnswerOps(vitalQuestions(log, context({ keepLogging: false }))[0], "log_complication", { keepLogging: false }, 0))
    expect(log.find(e => e.type === "complication")!.endTs).toBe(log[0].ts)
    log = [...log, vital("r2", 5, { heartRate: 169 })]
    expect(vitalQuestions(log, context({ keepLogging: false })).map(q => q.key)).toEqual(["vital:tachycardia:r2"])
  })

  it("write the same entry id when an answer is replayed, so the server keeps one", () => {
    const log = [vital("r1", 0, { heartRate: 170 })]
    const [question] = vitalQuestions(log, context())
    const once = vitalAnswerOps(question, "log_complication", { keepLogging: true }, 0).add[0].id
    const again = vitalAnswerOps(question, "log_complication", { keepLogging: true }, 5000).add[0].id
    expect(again).toBe(once)
    expect(vitalAnswerOps(question, "not_now", { keepLogging: true }, 0).add[0].id).not.toBe(once)
  })

  it("say why, and when logging stops, in both languages", () => {
    const [question] = vitalQuestions([vital("r1", 0, { heartRate: 170 })], context())
    const en = vitalQuestionText(question, "en", true)
    expect(en.title).toBe("HR 170: log tachycardia?")
    expect(en.detail).toMatch(/^HR 170 is higher than \d+\.\d% of readings here \(\+\d+\.\d SD\) · Adult \(18–64 years\)$/)
    expect(en.stop).toMatch(/^Automatic logging stops when HR is \d+ or lower\.$/)
    const bg = vitalQuestionText(question, "bg", true)
    // Bulgarian names the signs as the Bulgarian chart does.
    expect(bg.title).toBe("СЧ 170: Тахикардия?")
    expect(bg.stop).toMatch(/^Автоматичното записване спира, когато СЧ е \d+ или по-малко\.$/)
    expect(vitalQuestionText(question, "en", false).stop).toBeNull()
  })

  it("explain a fixed rule when the statistics are not in use", () => {
    const [question] = vitalQuestions([vital("r1", 0, { heartRate: 45 })], context({ stats: null }))
    expect(vitalQuestionText(question, "en", true).detail).toBe("HR 45 is below the fixed limit of 50 bpm · Adult (18–64 years)")
    expect(vitalQuestionText(question, "bg", true).detail).toBe("СЧ 45 е под фиксираната граница от 50 bpm · Възрастни (18–64 г.)")
  })
})

describe("through the shared Waiting for your answer list", () => {
  it("lists the question and writes the complication", () => {
    const log = [vital("r1", 0, { heartRate: 170, systolic: 60, diastolic: 30 })]
    const ctx = { now: "2026-11-01T09:01:00Z", vitals: context() }
    const items = intraopAttentionItems(log, ctx)
    expect(items.map(item => [item.kind, item.key])).toEqual([
      ["vital_deviation", "vital:hypotension:r1"],
      ["vital_deviation", "vital:tachycardia:r1"],
    ])
    const ops = intraopResolveAttention(log, "vital:hypotension:r1", "log_complication", ctx)
    expect(ops.add).toEqual([expect.objectContaining({ type: "complication", label: "Hypotension", complicationSource: "vitals", ts: log[0].ts })])
    expect(intraopResolveAttention(log, "vital:hypotension:r1", "stopped", ctx)).toEqual({ add: [], update: [], remove: [] })
  })

  it("asks nothing from the vitals without their context", () => {
    expect(intraopAttentionItems([vital("r1", 0, { heartRate: 170 })], { now: "2026-11-01T09:01:00Z" })).toEqual([])
  })
})

describe("the cuff and the arterial line together (10.2.0)", () => {
  const limits = vitalLimitsFor(adultStats, on, "ADULT")
  const kinds = (event: Parameters<typeof evaluateVitalReading>[0]) => evaluateVitalReading(event, { ageDays: ADULT, limits, baseline: { sbp: 130, map: 95, source: "preop" }, hypertensionPercent: 20 }).map(f => f.kind)

  it("takes the lower of the two for each sign", () => {
    expect(lowestPressure({ systolic: 120, diastolic: 70, ibpSystolic: 95, ibpDiastolic: 80 })).toMatchObject({ sbp: 95, dbp: 70 })
    expect(lowestPressure({ ibpSystolic: 110, ibpDiastolic: 60 })).toEqual({ sbp: 110, dbp: 60, map: 77 })
    expect(lowestPressure({})).toEqual({ sbp: undefined, dbp: undefined, map: undefined })
  })

  it("uses the lowest mean, stored or worked out", () => {
    expect(lowestPressure({ systolic: 120, diastolic: 80, ibpMap: 58 }).map).toBe(58)
    expect(lowestPressure({ systolic: 120, diastolic: 80, nibpMap: 99 }).map).toBe(93)
  })

  it("asks about hypotension when either pressure is low, and not when both are fine", () => {
    expect(kinds({ systolic: 120, diastolic: 70, ibpSystolic: 50, ibpDiastolic: 30 })).toContain("hypotension")
    expect(kinds({ systolic: 50, diastolic: 30, ibpSystolic: 120, ibpDiastolic: 70 })).toContain("hypotension")
    expect(kinds({ systolic: 120, diastolic: 70, ibpSystolic: 118, ibpDiastolic: 72 })).not.toContain("hypotension")
  })

  it("takes the higher of the two for hypertension: a high pressure on either counts", () => {
    expect(highestPressure({ systolic: 120, diastolic: 70, ibpSystolic: 210, ibpDiastolic: 80 })).toMatchObject({ sbp: 210, dbp: 80 })
    expect(kinds({ systolic: 120, diastolic: 70, ibpSystolic: 230, ibpDiastolic: 130 })).toContain("hypertension")
    expect(kinds({ systolic: 230, diastolic: 130, ibpSystolic: 120, ibpDiastolic: 70 })).toContain("hypertension")
    expect(kinds({ systolic: 120, diastolic: 70, ibpSystolic: 118, ibpDiastolic: 72 })).not.toContain("hypertension")
  })

  it("an arterial line alone is enough", () => {
    expect(kinds({ ibpSystolic: 50, ibpDiastolic: 30 })).toContain("hypotension")
  })

  it("accepts a stored MAP without SBP/DBP as a question source", () => {
    expect(kinds({ ibpMap: 50 })).toContain("hypotension")
    expect(kinds({ nibpMap: 50 })).toContain("hypotension")
  })
})

describe("the hypertension baseline from the first reading", () => {
  it("is taken from the higher of the cuff and the arterial line, so a steady offset between them asks nothing", () => {
    const first: LogEvent = { id: "r1", ts: "2026-11-08T08:00:00.000Z", type: "vital", systolic: 100, diastolic: 60, ibpSystolic: 125, ibpDiastolic: 62 }
    const later: LogEvent = { id: "r2", ts: "2026-11-08T08:30:00.000Z", type: "vital", systolic: 100, diastolic: 60, ibpSystolic: 125, ibpDiastolic: 62 }
    expect(pressureBaseline([first, later])).toMatchObject({ sbp: 125, source: "first" })
    const findings = evaluateVitalReading(later, { ageDays: 40 * 365, limits: null, baseline: pressureBaseline([first, later]), hypertensionPercent: 20 })
    expect(findings.find(finding => finding.kind === "hypertension")).toBeUndefined()
  })

  it("still asks when the pressure really rises above that baseline", () => {
    const first: LogEvent = { id: "r1", ts: "2026-11-08T08:00:00.000Z", type: "vital", systolic: 100, ibpSystolic: 125 }
    const rise: LogEvent = { id: "r2", ts: "2026-11-08T08:30:00.000Z", type: "vital", systolic: 130, ibpSystolic: 155 }
    const findings = evaluateVitalReading(rise, { ageDays: 40 * 365, limits: null, baseline: pressureBaseline([first, rise]), hypertensionPercent: 20 })
    expect(findings.find(finding => finding.kind === "hypertension")?.triggers[0]).toMatchObject({ rule: "baseline", value: 155, reference: 125 })
  })
})
