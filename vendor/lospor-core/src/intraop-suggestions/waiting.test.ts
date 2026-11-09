import { describe, expect, it } from "vitest"
import { intraopAttentionItems, intraopAttentionText, intraopResolveAttention } from "../intraop-attention"
import { parseIntraopAutomation } from "../intraop-automation"
import type { LogEvent } from "../intraop-types"
import { resolveCard } from "./cards"
import { suggestionCardFor } from "./catalogue"
import {
  cardAlsoLogOps,
  cardCloseOps,
  cardEventOps,
  cardQuestionOps,
  cardRelabelOps,
  cardResolveOps,
  suggestionLines,
  type SuggestionContext,
} from "./waiting"

const T0 = Date.parse("2026-11-02T10:00:00.000Z")
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString()
const ALL_ON = parseIntraopAutomation({
  enabled: true,
  groups: { treatmentSuggestions: true, reverseQuestions: true, readingQuestions: true, labQuestions: true, reminders: true, timers: true },
  vitalQuestions: { enabled: true },
})

let seq = 0
const complication = (label: string, minutes = 0): LogEvent => ({ id: `c${++seq}`, ts: at(minutes), type: "complication", label })
const drug = (name: string, minutes: number, dose: string, extra: Partial<LogEvent> = {}): LogEvent => ({ id: `d${++seq}`, ts: at(minutes), type: "drug", name, dose, unit: "mg", ...extra })
const vital = (minutes: number, values: Partial<LogEvent>): LogEvent => ({ id: `v${++seq}`, ts: at(minutes), type: "vital", ...values })

const context = (extra: Partial<SuggestionContext> = {}): SuggestionContext => ({
  settings: ALL_ON, patient: { ageDays: 40 * 365, weightKg: 80 }, preop: {}, tofMonitor: false, keepLogging: true, labs: [], now: at(5), ...extra,
})
const types = (log: LogEvent[], extra: Partial<SuggestionContext> = {}) => suggestionLines(log, context(extra)).map(line => line.item.type)

describe("the waiting lines", () => {
  it("lists nothing without a context, or with the groups off", () => {
    expect(suggestionLines([complication("Hypotension")], null)).toEqual([])
    expect(types([complication("Hypotension")], { settings: parseIntraopAutomation({ enabled: true, groups: { treatmentSuggestions: false } }) })).toEqual([])
    expect(types([complication("Hypotension")], { user: { treatmentSuggestions: false } })).toEqual([])
  })

  it("keeps a card waiting until something from it is given", () => {
    const hypotension = complication("Hypotension", 0)
    expect(types([hypotension])).toEqual(["card"])
    expect(types([hypotension, drug("Ephedrine", 1, "10")])).toEqual([])
  })

  it("keeps a checklist waiting after a dose, until Done or Not now", () => {
    const arrest = complication("Cardiac arrest", 0)
    const log = [arrest, drug("Epinephrine / Adrenaline", 1, "1000", { unit: "mcg" })]
    expect(types(log, { now: at(1.5) })).toContain("card")
    expect(types([...log, ...cardCloseOps(arrest, "done", at(2)).add], { now: at(2.5) })).not.toContain("card")
    expect(types([...log, ...cardCloseOps(arrest, "not_now", at(2)).add], { now: at(2.5) })).not.toContain("card")
  })

  it("gates each group on its own switch", () => {
    const log = [{ id: "f", ts: at(0), type: "fluid_start", name: "Lipid emulsion 20%", fluidId: "x" } as LogEvent]
    expect(types(log)).toEqual(["reverse"])
    expect(types(log, { user: { reverseQuestions: false } })).toEqual([])
    expect(types([vital(0, { spO2: 85 })])).toEqual(["reading"])
    expect(types([], { labs: [{ test: "Potassium (K⁺)", value: "6.8", unit: "mmol/L", takenAt: at(0) }] })).toEqual(["lab"])
    expect(types([{ id: "pe", ts: at(0), type: "clinical_event", label: "Procedure ended" }], { preop: { apfelScore: 3 } })).toEqual(["reminder"])
    expect(types([{ id: "t", ts: at(0), type: "clinical_event", label: "Tourniquet on", site: "rThigh" }], { now: at(95) })).toEqual(["timer"])
  })
})

describe("in the attention list", () => {
  const items = (log: LogEvent[], extra: Partial<SuggestionContext> = {}, vitals = false) => intraopAttentionItems(log, {
    now: at(5),
    suggestions: context(extra),
    vitals: vitals ? { settings: ALL_ON, stats: null, ageDays: 40 * 365, keepLogging: true } : null,
  })

  it("shows each line in the screen's language", () => {
    const [card] = items([complication("Hypotension", 0)])
    expect(card).toMatchObject({ kind: "suggestion", actions: ["not_now", "open"] })
    expect(intraopAttentionText(card!, "en")).toBe("Hypotension: treat now?")
    expect(intraopAttentionText(card!, "bg")).toBe("Хипотенсия: лечение сега?")
    const [checklist] = items([complication("Cardiac arrest", 0)], { now: at(0.2) })
    expect(intraopAttentionText(checklist!, "en")).toBe("Cardiac arrest: next steps")
    const [reverse] = items([drug("Adenosine", 0, "12")])
    expect(intraopAttentionText(reverse!, "en")).toBe("Adenosine 12 mg: log supraventricular arrhythmia?")
  })

  it("logs the complication picked for a question with several answers", () => {
    const shock: LogEvent = { id: "s1", ts: at(0), type: "defibrillation", energyJ: 200, synchronized: false }
    const [item] = items([shock])
    expect(intraopAttentionText(item!, "en")).toBe("Defibrillation 200 J: log which? Ventricular fibrillation / Ventricular tachycardia / Cardiac arrest")
    const ctx = { now: at(5), suggestions: context() }
    expect(intraopResolveAttention([shock], item!.key, "log_complication", ctx).add).toEqual([])
    expect(intraopResolveAttention([shock], item!.key, "log_complication", ctx, "Ventricular fibrillation").add[0]).toMatchObject({ label: "Ventricular fibrillation", ts: shock.ts })
  })

  it("writes Not now for any line, and nothing for Open", () => {
    const hypotension = complication("Hypotension", 0)
    const [item] = items([hypotension])
    const ctx = { now: at(5), suggestions: context() }
    expect(intraopResolveAttention([hypotension], item!.key, "open", ctx).add).toEqual([])
    const ops = intraopResolveAttention([hypotension], item!.key, "not_now", ctx)
    expect(ops.add[0]).toMatchObject({ type: "prompt_answer", answerKind: "card", answerFor: hypotension.id, answer: "not_now" })
  })

  it("lets the MH question replace the separate tachycardia question", () => {
    const sevo: LogEvent = { id: "a", ts: at(-60), type: "agent_start", name: "SEVOFLURANE", agentMode: "concurrent" }
    const pattern = [sevo, vital(-20, { etco2: 40, heartRate: 80 }), vital(0, { etco2: 56, heartRate: 130 })]
    const list = items(pattern, {}, true)
    expect(list.some(item => item.vital?.kind === "tachycardia")).toBe(false)
    expect(list.some(item => item.suggestion?.item.type === "reading")).toBe(true)
    const noTrigger = items(pattern.slice(1), {}, true)
    expect(noTrigger.some(item => item.vital?.kind === "tachycardia")).toBe(true)
  })
})

describe("card actions", () => {
  it("re-labels the complication, so its own card opens", () => {
    const hypoxia = complication("Hypoxia / desaturation", 0)
    const ops = cardRelabelOps(hypoxia, "Laryngospasm", "cause")
    expect(ops.update[0]).toMatchObject({ id: hypoxia.id, label: "Laryngospasm", suggestion: "card:Hypoxia / desaturation:cause" })
    expect(suggestionCardFor(ops.update[0]!.label)?.complications).toContain("Laryngospasm")
  })

  it("logs a second complication at the same time", () => {
    const haemolysis = complication("Haemolytic transfusion reaction", 0)
    expect(cardAlsoLogOps(haemolysis, "DIC (disseminated intravascular coagulation)", "dic", at(3)).add[0])
      .toMatchObject({ type: "complication", ts: haemolysis.ts, label: "DIC (disseminated intravascular coagulation)", complicationSource: "suggestion" })
  })

  it("shows hyponatraemia's hypertonic saline only after a symptom", () => {
    const hyponatraemia = complication("Hyponatraemia", 0)
    const card = (log: LogEvent[]) => resolveCard(suggestionCardFor("Hyponatraemia")!, { log, patient: { ageDays: 40 * 365, weightKg: 70 }, preop: {}, complication: hyponatraemia, tofMonitor: false, now: at(2) })
    expect(card([hyponatraemia]).rows.some(row => row.id === "hypertonic-saline")).toBe(false)
    const confused = cardQuestionOps(hyponatraemia, "consciousness", ["hypertonic-saline"], undefined, at(1)).add
    expect(card([hyponatraemia, ...confused]).rows.find(row => row.id === "hypertonic-saline")?.prefill?.amount).toBe(150)
    const seizures = cardQuestionOps(hyponatraemia, "seizures", ["hypertonic-saline"], "Seizure", at(1)).add
    expect(seizures.some(event => event.type === "complication" && event.label === "Seizure")).toBe(true)
    expect(card([hyponatraemia, ...seizures]).rows.some(row => row.id === "hypertonic-saline")).toBe(true)
  })

  it("ends an episode at the time given, never before its start", () => {
    const failure = complication("Gas supply failure", 0)
    expect(cardResolveOps(failure, at(12)).update[0]).toMatchObject({ endTs: at(12) })
    expect(cardResolveOps(failure, at(-5)).update).toEqual([])
  })

  it("charts an event row tagged with its card", () => {
    const arrest = complication("Cardiac arrest", 0)
    expect(cardEventOps(arrest, "ROSC", "rosc", at(8), at(8)).add[0]).toMatchObject({ type: "clinical_event", label: "ROSC", ts: at(8), suggestion: "card:Cardiac arrest:rosc" })
  })
})
