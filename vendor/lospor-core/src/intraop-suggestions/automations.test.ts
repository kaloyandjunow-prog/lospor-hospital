import { describe, expect, it } from "vitest"
import { AUTOMATION_GROUPS, automationEnabled, parseIntraopAutomation, VITAL_QUESTION_KINDS, vitalQuestionAutomationId } from "../intraop-automation"
import type { LogEvent } from "../intraop-types"
import {
  AUTOMATIONS, AUTOMATION_IDS, cardAutomationId, labAutomationId, readingAutomationId, REMINDER_IDS, reverseAutomationId, timerAutomationId,
} from "./automations"
import { suggestionLines, type SuggestionContext } from "./waiting"

const T0 = Date.parse("2026-11-02T10:00:00.000Z")
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString()
const on = (disabled: string[] = []) => parseIntraopAutomation({
  enabled: true,
  groups: { treatmentSuggestions: true, reverseQuestions: true, readingQuestions: true, labQuestions: true, reminders: true, timers: true },
  disabled,
})
const context = (disabled: string[], extra: Partial<SuggestionContext> = {}): SuggestionContext => ({
  settings: on(disabled), patient: { ageDays: 40 * 365, weightKg: 80 }, preop: {}, tofMonitor: false, keepLogging: true, labs: [], now: at(5), ...extra,
})
const hypotension: LogEvent = { id: "c1", ts: at(0), type: "complication", label: "Hypotension" }
const arrest: LogEvent = { id: "c2", ts: at(0), type: "complication", label: "Cardiac arrest" }

describe("every automation has its own switch (10.2.0)", () => {
  it("lists each automation once, with both languages, under a real group", () => {
    expect(AUTOMATIONS.length).toBeGreaterThan(60)
    expect(AUTOMATION_IDS.size).toBe(AUTOMATIONS.length)
    for (const item of AUTOMATIONS) {
      expect([...AUTOMATION_GROUPS, "vitalQuestions"]).toContain(item.group)
      for (const text of [item.en, item.bg, item.detailEn, item.detailBg]) expect(text.trim().length).toBeGreaterThan(2)
    }
    expect(AUTOMATIONS.find(item => item.id === cardAutomationId("Hypotension"))?.bg).toBe("Хипотенсия")
    expect(VITAL_QUESTION_KINDS.map(vitalQuestionAutomationId).every(id => AUTOMATION_IDS.has(id))).toBe(true)
  })

  it("keeps every automation on for settings saved before they had switches", () => {
    const old = parseIntraopAutomation({ enabled: true, groups: { treatmentSuggestions: true } })
    expect(old.disabled).toEqual([])
    expect(automationEnabled(old, "treatmentSuggestions", cardAutomationId("Hypotension"))).toBe(true)
  })

  it("reads the switched-off list as saved: strings only, once each, sorted", () => {
    expect(parseIntraopAutomation({ disabled: ["b", "a", "a", 3, "", null] }).disabled).toEqual(["a", "b"])
    expect(parseIntraopAutomation({ disabled: "card:Hypotension" }).disabled).toEqual([])
  })

  it("a group off switches its lines off, a line off switches only itself off", () => {
    const settings = on([cardAutomationId("Hypotension")])
    expect(automationEnabled(settings, "treatmentSuggestions", cardAutomationId("Hypotension"))).toBe(false)
    expect(automationEnabled(settings, "treatmentSuggestions", cardAutomationId("Hypertension"))).toBe(true)
    expect(automationEnabled(parseIntraopAutomation({ enabled: true, groups: { treatmentSuggestions: false } }), "treatmentSuggestions", cardAutomationId("Hypertension"))).toBe(false)
    expect(automationEnabled(on(), "treatmentSuggestions", cardAutomationId("Hypertension"), { treatmentSuggestions: false })).toBe(false)
  })

  it("a card switched off no longer waits, and the others still do", () => {
    const kinds = (disabled: string[], log: LogEvent[]) => suggestionLines(log, context(disabled)).map(line => line.item.type)
    expect(kinds([], [hypotension])).toEqual(["card"])
    expect(kinds([cardAutomationId("Hypotension")], [hypotension])).toEqual([])
    expect(kinds([cardAutomationId("Hypotension")], [hypotension, arrest]).length).toBe(kinds([], [arrest]).length)
  })

  it("a timer family switched off stops its follow-ups", () => {
    const withArrest = (disabled: string[]) => suggestionLines([arrest], context(disabled, { now: at(3) })).filter(line => line.item.type === "timer")
    expect(withArrest([]).length).toBeGreaterThan(0)
    expect(withArrest([timerAutomationId("arrestRhythmCheck")])).toEqual([])
  })

  it("names the ids the rules use, so a rule that is renamed is noticed", () => {
    for (const id of [
      reverseAutomationId("lipid"), readingAutomationId("hypoxaemia"), readingAutomationId("reverseBeforeExtubation"),
      labAutomationId("troponin"), timerAutomationId("tourniquetLimit"), ...Object.values(REMINDER_IDS),
    ]) expect(AUTOMATION_IDS.has(id), id).toBe(true)
  })
})
