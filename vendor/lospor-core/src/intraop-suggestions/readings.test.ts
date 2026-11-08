import { describe, expect, it } from "vitest"
import type { LogEvent } from "../intraop-types"
import type { SuggestionPatient } from "./context"
import { readingAnswerOps, readingEpisodeOps, readingQuestions, readingQuestionText, type ReadingContext } from "./readings"

const T0 = Date.parse("2026-11-02T10:00:00.000Z")
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString()
const ADULT: SuggestionPatient = { ageDays: 40 * 365, weightKg: 80 }

let seq = 0
const vital = (minutes: number, values: Partial<LogEvent>): LogEvent => ({ id: `v${++seq}`, ts: at(minutes), type: "vital", ...values })
const event = (label: string, minutes: number): LogEvent => ({ id: `e${++seq}`, ts: at(minutes), type: "clinical_event", label })
const drug = (name: string, minutes: number, atcCode: string): LogEvent => ({ id: `d${++seq}`, ts: at(minutes), type: "drug", name, dose: "1", atcCode })
const sevo: LogEvent = { id: "agent", ts: at(-60), type: "agent_start", name: "SEVOFLURANE", agentMode: "concurrent" }
const context = (extra: Partial<ReadingContext> = {}): ReadingContext => ({ patient: ADULT, preop: {}, keepLogging: true, ...extra })
const kinds = (log: LogEvent[], extra: Partial<ReadingContext> = {}) => readingQuestions(log, context(extra)).map(question => question.kind)

describe("R1, R2, R4: episodes from SpO2, EtCO2 and temperature", () => {
  it("asks below 90% SpO2, above 60 mmHg EtCO2 and below 36.0 °C", () => {
    expect(kinds([vital(0, { spO2: 89 })])).toEqual(["hypoxaemia"])
    expect(kinds([vital(0, { spO2: 90 })])).toEqual([])
    expect(kinds([vital(0, { etco2: 61 })])).toEqual(["hypercapnia"])
    expect(kinds([vital(0, { etco2: 60 })])).toEqual([])
    expect(kinds([vital(0, { temp: 35.9 })])).toEqual(["hypothermia"])
    expect(kinds([vital(0, { temp: 36 })])).toEqual([])
  })

  it("never asks from an auto-filled copy", () => {
    expect(kinds([vital(0, { spO2: 80, autoFilled: true })])).toEqual([])
  })

  it("names cyanotic heart disease in the question when the preop record has it", () => {
    const [question] = readingQuestions([vital(0, { spO2: 78 })], context({ preop: { cyanoticHeartDisease: true } }))
    expect(readingQuestionText(question!, "en")).toBe("SpO₂ 78%: cyanotic heart disease logged. Log hypoxaemia anyway?")
    expect(readingQuestionText(question!, "bg")).toContain("цианотична сърдечна болест")
  })

  it("keeps one episode open while out of range and closes it at the first reading back", () => {
    const low = vital(0, { spO2: 85 })
    const [question] = readingQuestions([low], context())
    const ops = readingAnswerOps(question!, "log", context(), at(1))
    expect(ops.add[0]).toMatchObject({ type: "complication", label: "Hypoxia / desaturation", complicationSource: "readings", suggestion: "reading:hypoxaemia" })
    expect(ops.add[0]!.endTs).toBeUndefined()
    const still = vital(5, { spO2: 87 })
    expect(kinds([low, ...ops.add, still])).toEqual([])
    const back = vital(10, { spO2: 95 })
    expect(readingEpisodeOps([low, ...ops.add, still, back]).update[0]).toMatchObject({ endTs: back.ts })
  })

  it("logs a moment, not an episode, when the clinician keeps logging off", () => {
    const low = vital(0, { temp: 35 })
    const [question] = readingQuestions([low], context({ keepLogging: false }))
    expect(readingAnswerOps(question!, "log", { keepLogging: false }, at(1)).add[0]!.endTs).toBe(low.ts)
  })

  it("asks again at the next out-of-range reading after a Not now", () => {
    const low = vital(0, { spO2: 85 })
    const [question] = readingQuestions([low], context())
    const dismissal = readingAnswerOps(question!, "not_now", context(), at(1)).add
    expect(kinds([low, ...dismissal])).toEqual([])
    expect(kinds([low, ...dismissal, vital(5, { spO2: 84 })])).toEqual(["hypoxaemia"])
  })

  it("closes an open episode at the case end when the readings never came back", () => {
    const episode: LogEvent = { id: "ep", ts: at(0), type: "complication", label: "Hypothermia", complicationSource: "readings" }
    expect(readingEpisodeOps([episode, vital(0, { temp: 35 })], at(60)).update[0]).toMatchObject({ endTs: at(60) })
  })
})

describe("R3: EtCO2 near zero", () => {
  it("asks what happened after a fall from 25 or more to under 10 with an airway in", () => {
    const log = [event("Intubated", -30), vital(-5, { etco2: 38 }), vital(0, { etco2: 4 })]
    const [question] = readingQuestions(log, context())
    expect(question).toMatchObject({ kind: "nearZero" })
    expect(question!.kind === "nearZero" && question!.choices).toContain("Accidental extubation")
  })

  it("stays quiet without an airway, after extubation, or after a slow fall", () => {
    expect(kinds([vital(-5, { etco2: 38 }), vital(0, { etco2: 4 })])).toEqual([])
    expect(kinds([event("Intubated", -30), event("Extubated", -2), vital(-5, { etco2: 38 }), vital(0, { etco2: 4 })])).toEqual([])
    expect(kinds([event("Intubated", -30), vital(-5, { etco2: 20 }), vital(0, { etco2: 4 })])).toEqual([])
  })

  it("logs the pick, and the artefact answer logs nothing", () => {
    const log = [event("LMA in", -30), vital(-5, { etco2: 38 }), vital(0, { etco2: 2 })]
    const [question] = readingQuestions(log, context())
    expect(readingAnswerOps(question!, { log: "Circuit disconnection" }, context(), at(1)).add[0]).toMatchObject({ label: "Circuit disconnection", complicationSource: "suggestion" })
    expect(readingAnswerOps(question!, { log: "Hypotension" }, context(), at(1)).add).toEqual([])
    expect(readingAnswerOps(question!, "not_now", context(), at(1)).add[0]).toMatchObject({ type: "prompt_answer", answer: "not_now" })
  })
})

describe("R5: the malignant hyperthermia pattern", () => {
  const pattern = [sevo, vital(-20, { etco2: 40, heartRate: 80 }), vital(0, { etco2: 55, heartRate: 120 })]

  it("asks on rising EtCO2 with a fast heart, without waiting for the temperature", () => {
    const questions = readingQuestions(pattern, context())
    expect(questions.map(question => question.kind)).toEqual(["mh"])
    expect(readingQuestionText(questions[0]!, "en")).toBe("EtCO₂ 55 mmHg, HR 120: is this malignant hyperthermia?")
  })

  it("notes a rising temperature but does not need it", () => {
    const [question] = readingQuestions([...pattern, vital(-25, { temp: 37 }), vital(-1, { temp: 37.6 })], context())
    expect(question).toMatchObject({ kind: "mh", temperatureRising: true })
  })

  it("needs a trigger: no volatile and no suxamethonium, no question", () => {
    expect(kinds(pattern.slice(1))).toEqual([])
    expect(kinds([drug("Succinylcholine / Suxamethonium", -60, "M03AB01"), ...pattern.slice(1)])).toEqual(["mh"])
  })

  it("replaces the separate hypercapnia question while it waits", () => {
    const high = [sevo, vital(-20, { etco2: 45, heartRate: 80 }), vital(0, { etco2: 66, heartRate: 125 })]
    expect(kinds(high)).toEqual(["mh"])
  })

  it("after a Not now, asks again only when the pattern is worse", () => {
    const [question] = readingQuestions(pattern, context())
    const dismissal = readingAnswerOps(question!, "not_now", context(), at(1)).add
    expect(kinds([...pattern, ...dismissal, vital(2, { etco2: 57, heartRate: 122 })])).toEqual([])
    expect(kinds([...pattern, ...dismissal, vital(4, { etco2: 62, heartRate: 124 })])).toEqual(["mh"])
  })
})

describe("R6 and E3: residual blockade around extubation", () => {
  const rocuronium = drug("Rocuronium", -90, "M03AC09")

  it("asks to log residual blockade for TOF under 0.9 within 10 minutes before extubation or after", () => {
    expect(kinds([rocuronium, vital(-5, { tofRatio: 0.7 }), event("Extubated", 0)])).toEqual(["residualBlock"])
    expect(kinds([rocuronium, event("Extubated", 0), vital(3, { tofRatio: 0.8 })])).toEqual(["residualBlock"])
  })

  it("warns before extubation without logging anything", () => {
    const log = [rocuronium, vital(-30, { tofRatio: 0.7 })]
    const [question] = readingQuestions(log, context())
    expect(question).toMatchObject({ kind: "reverseBeforeExtubation" })
    expect(readingQuestionText(question!, "en")).toBe("TOF 0.7: reverse before extubating?")
    expect(readingAnswerOps(question!, "log", context(), at(1)).add).toEqual([])
  })

  it("needs a relaxant: a low TOF with none is a measurement problem", () => {
    expect(kinds([vital(-5, { tofRatio: 0.5 }), event("Extubated", 0)])).toEqual([])
  })

  it("E3: extubated with TOF monitoring, no reversal and no recovered TOF asks too", () => {
    expect(kinds([rocuronium, event("Extubated", 0)], { tofMonitor: true })).toEqual(["residualBlock"])
    expect(kinds([rocuronium, event("Extubated", 0)], { tofMonitor: false })).toEqual([])
    expect(kinds([rocuronium, drug("Sugammadex", -5, "V03AB35"), event("Extubated", 0)], { tofMonitor: true })).toEqual([])
    expect(kinds([rocuronium, vital(-3, { tofRatio: 0.95 }), event("Extubated", 0)], { tofMonitor: true })).toEqual([])
  })
})
