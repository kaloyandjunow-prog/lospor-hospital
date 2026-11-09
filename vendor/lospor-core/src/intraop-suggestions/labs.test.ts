import { describe, expect, it } from "vitest"
import type { LabResult } from "../labs"
import type { LogEvent } from "../intraop-types"
import type { SuggestionPatient } from "./context"
import { labAnswerOps, labQuestions, labQuestionText } from "./labs"

const T0 = Date.parse("2026-11-02T10:00:00.000Z")
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString()
const ADULT: SuggestionPatient = { ageDays: 40 * 365, weightKg: 80 }
const lab = (test: string, value: string, minutes = 0, extra: Partial<LabResult> = {}): LabResult => ({ test, value, unit: "", takenAt: at(minutes), ...extra })
const kinds = (results: LabResult[], log: LogEvent[] = [], patient = ADULT) => labQuestions(results, log, patient, at(5)).map(question => question.kind)

describe("lab questions", () => {
  it("asks at the fallback limits", () => {
    expect(kinds([lab("Potassium (K⁺)", "6.1")])).toEqual(["hyperkalaemia"])
    expect(kinds([lab("Potassium (K⁺)", "2.9")])).toEqual(["hypokalaemia"])
    expect(kinds([lab("Potassium (K⁺)", "6.0")])).toEqual([])
    expect(kinds([lab("Glucose", "3.9")])).toEqual(["hypoglycaemia"])
    expect(kinds([lab("Glucose", "12.1")])).toEqual(["hyperglycaemia"])
    expect(kinds([lab("Sodium (Na⁺)", "129")])).toEqual(["hyponatraemia"])
    expect(kinds([lab("Sodium (Na⁺)", "151")])).toEqual(["hypernatraemia"])
    expect(kinds([lab("Fibrinogen", "1.2")])).toEqual(["lowFibrinogen"])
    expect(kinds([lab("Troponin I (hs-cTnI)", "40")])).toEqual(["troponin"])
  })

  it("reads a decimal comma", () => {
    expect(kinds([lab("Potassium (K⁺)", "6,4")])).toEqual(["hyperkalaemia"])
  })

  it("uses the newborn glucose limit under 28 days", () => {
    expect(kinds([lab("Glucose", "3.0")], [], { ageDays: 3, weightKg: 3.2 })).toEqual([])
    expect(kinds([lab("Glucose", "2.4")], [], { ageDays: 3, weightKg: 3.2 })).toEqual(["hypoglycaemia"])
  })

  it("prefers the hospital's own critical bound", () => {
    expect(kinds([lab("Potassium (K⁺)", "6.3", 0, { criticalHigh: 6.5 })])).toEqual([])
    expect(kinds([lab("Potassium (K⁺)", "5.8", 0, { criticalHigh: 5.5 })])).toEqual(["hyperkalaemia"])
  })

  it("reads ionised calcium first, total calcium only for a draw without it", () => {
    expect(kinds([lab("Ionised Ca²⁺", "0.95")])).toEqual(["hypocalcaemia"])
    expect(kinds([lab("Calcium (Ca²⁺)", "1.8")])).toEqual(["hypocalcaemia"])
    expect(kinds([lab("Calcium (Ca²⁺)", "1.8"), lab("Ionised Ca²⁺", "1.15")])).toEqual([])
    expect(kinds([
      lab("Calcium (Ca²⁺)", "1.8", 0, { takenAt: undefined }),
      lab("Ionised Ca²⁺", "1.15", 0, { takenAt: undefined }),
    ])).toEqual(["hypocalcaemia"])
  })

  it("asks about massive haemorrhage for Hb under 70 or a fall of 20 since the previous draw", () => {
    expect(kinds([lab("Haemoglobin (Hb)", "65")])).toEqual(["haemorrhage"])
    const fall = labQuestions([lab("Haemoglobin (Hb)", "120", -30), lab("Haemoglobin (Hb)", "98", 0)], [], ADULT, at(5))
    expect(fall[0]).toMatchObject({ kind: "haemorrhage", fall: 22 })
    expect(labQuestionText(fall[0]!, "en")).toBe("Haemoglobin (Hb) 98, down 22: log massive haemorrhage?")
    expect(kinds([lab("Haemoglobin (Hb)", "120", -30), lab("Haemoglobin (Hb)", "105", 0)])).toEqual([])
  })

  it("asks only for the latest draw of each test", () => {
    expect(kinds([lab("Potassium (K⁺)", "6.5", -30), lab("Potassium (K⁺)", "4.5", 0)])).toEqual([])
  })

  it("skips imported results it could not read", () => {
    expect(kinds([lab("Potassium (K⁺)", "7.0", 0, { unconverted: true })])).toEqual([])
  })

  it("stays quiet when the complication is logged near the draw, or after a Not now", () => {
    const complication: LogEvent = { id: "c", ts: at(-10), type: "complication", label: "Hyperkalaemia", endTs: at(-10) }
    expect(kinds([lab("Potassium (K⁺)", "6.4")], [complication])).toEqual([])
    const [question] = labQuestions([lab("Potassium (K⁺)", "6.4")], [], ADULT, at(5))
    const dismissal = labAnswerOps(question!, "not_now", at(6)).add
    expect(kinds([lab("Potassium (K⁺)", "6.4")], dismissal)).toEqual([])
  })

  it("logs at the draw's time; the fibrinogen suggestion logs nothing", () => {
    const [question] = labQuestions([lab("Potassium (K⁺)", "6.4", -3)], [], ADULT, at(5))
    expect(labAnswerOps(question!, "log", at(6)).add[0]).toMatchObject({ type: "complication", label: "Hyperkalaemia", ts: at(-3), suggestion: "lab:hyperkalaemia" })
    const [fibrinogen] = labQuestions([lab("Fibrinogen", "1.1")], [], ADULT, at(5))
    expect(labAnswerOps(fibrinogen!, "log", at(6)).add).toEqual([])
    expect(labQuestionText(fibrinogen!, "bg")).toContain("криопреципитат")
  })

  it("does not present the current time as a missing specimen time", () => {
    const result = { ...lab("Potassium (K⁺)", "6.4"), takenAt: undefined }
    const [question] = labQuestions([result], [], ADULT, at(5))
    expect(question).toMatchObject({ timeKnown: false })
    expect(labQuestionText(question!, "en")).toContain("specimen time unknown")
    expect(labAnswerOps(question!, "log", at(6)).add[0]).toMatchObject({
      type: "complication",
      ts: at(6),
      endTs: at(6),
      value: "specimen time unknown",
    })
  })

  it("keeps an undated result's prompt identity when another undated row is inserted", () => {
    const earlier = { ...lab("Potassium (K⁺)", "6.4"), id: "lab-a", takenAt: undefined }
    const latest = { ...lab("Potassium (K⁺)", "6.5"), id: "lab-b", takenAt: undefined }
    const before = labQuestions([earlier, latest], [], ADULT, at(5))[0]!
    const after = labQuestions([{ ...lab("Potassium (K⁺)", "6.4"), id: "lab-new", takenAt: undefined }, earlier, latest], [], ADULT, at(5))[0]!
    expect(after.key).toBe(before.key)
    expect(labAnswerOps(before, "not_now", at(6)).add[0]?.answerFor).toBe(after.key)
  })
})
