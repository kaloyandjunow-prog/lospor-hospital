import { describe, expect, it } from "vitest"
import { intraopAttentionItems, intraopResolveAttention } from "../intraop-attention"
import { parseIntraopAutomation } from "../intraop-automation"
import { applyIntraopEventOps } from "../intraop-timetable-edit"
import type { LogEvent } from "../intraop-types"
import { cardOfSuggestion } from "./cards"
import { cardAlsoLogOps, cardCloseOps, cardSuggestionTag, suggestionLines, type SuggestionContext } from "./waiting"
import { reverseAnswerOps, reverseQuestions } from "./reverse"

/**
 * Several cards and questions at once (10.2.0): what one answer does to the others, and what a repeated or
 * replayed answer does. Cards share drugs (ephedrine, atropine, adrenaline, FiO2 100%), so a dose must close
 * the card it was given from and no other.
 */

const T0 = Date.parse("2026-11-02T10:00:00.000Z")
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString()
const ALL_ON = parseIntraopAutomation({
  enabled: true,
  groups: { treatmentSuggestions: true, reverseQuestions: true, readingQuestions: true, labQuestions: true, reminders: true, timers: true },
  vitalQuestions: { enabled: true },
})
const patient = { ageDays: 40 * 365, weightKg: 80, idealWeightKg: 70 }
const context = (now = at(5), extra: Partial<SuggestionContext> = {}): SuggestionContext =>
  ({ settings: ALL_ON, patient, preop: {}, tofMonitor: false, keepLogging: true, labs: [], now, ...extra })
const complication = (id: string, label: string, minutes = 0): LogEvent => ({ id, ts: at(minutes), type: "complication", label })
const drug = (id: string, name: string, minutes: number, extra: Partial<LogEvent> = {}): LogEvent => ({ id, ts: at(minutes), type: "drug", name, dose: "10", unit: "mg", ...extra })
const cards = (log: LogEvent[], now = at(5)) => suggestionLines(log, context(now)).filter(line => line.item.type === "card").map(line => (line.item as { complication: LogEvent }).complication.id)

describe("a card's tag", () => {
  it("names the card an entry was written from, and nothing for an entry charted by hand", () => {
    expect(cardOfSuggestion(cardSuggestionTag("Hypotension", "ephedrine"))).toBe("Hypotension")
    expect(cardOfSuggestion(cardSuggestionTag("CICO (can't intubate can't oxygenate)", "cricothyrotomy"))).toBe("CICO (can't intubate can't oxygenate)")
    expect(cardOfSuggestion("reverse:lipid")).toBeNull()
    expect(cardOfSuggestion(undefined)).toBeNull()
    expect(cardOfSuggestion("card:")).toBeNull()
  })
})

describe("two cards that share a drug", () => {
  const log = [complication("hypo", "Hypotension"), complication("spinal", "High spinal")]

  it("lists both, oldest first, and in a stable order when they share a time", () => {
    expect(cards(log)).toEqual(["hypo", "spinal"])
    expect(cards([...log].reverse())).toEqual(["spinal", "hypo"])
  })

  it("closes only the Hypotension card when ephedrine is given from it", () => {
    const given = drug("e1", "Ephedrine", 1, { suggestion: cardSuggestionTag("Hypotension", "ephedrine") })
    expect(cards([...log, given])).toEqual(["spinal"])
  })

  it("closes only the High spinal card when atropine is given from it, though Bradycardia has it too", () => {
    // Atropine shows on the High spinal card only while the heart rate is low.
    const slow: LogEvent = { id: "hr", ts: at(-1), type: "vital", heartRate: 38 }
    const both = [slow, ...log, complication("brady", "Bradycardia")]
    const given = drug("a1", "Atropine", 1, { suggestion: cardSuggestionTag("High spinal", "atropine") })
    expect(cards([...both, given]).sort()).toEqual(["brady", "hypo"])
  })

  it("still lets a dose charted by hand close every card it fits, since nothing says which it was for", () => {
    expect(cards([...log, drug("e2", "Ephedrine", 1)])).toEqual([])
  })

  it("keeps counting a dose given from this card before it was relabelled", () => {
    // The same event, first a hypoxia card (100% oxygen from it), then relabelled laryngospasm: its oxygen counts.
    const relabelled = complication("c", "Laryngospasm")
    const gas: LogEvent = { id: "g", ts: at(1), type: "gas_change", fio2: 100, suggestion: cardSuggestionTag("Hypoxia / desaturation", "oxygen") }
    expect(cards([relabelled, gas])).toEqual([])
  })

  it("does not count a dose from the card of another complication that is on the log", () => {
    const hypoxia = complication("hypoxia", "Hypoxia / desaturation")
    const laryngospasm = complication("laryngo", "Laryngospasm")
    const gas: LogEvent = { id: "g", ts: at(1), type: "gas_change", fio2: 100, suggestion: cardSuggestionTag("Hypoxia / desaturation", "oxygen") }
    expect(cards([hypoxia, laryngospasm, gas])).toEqual(["laryngo"])
  })
})

describe("a dose given from a card does not ask its own question", () => {
  const arrest = complication("arrest", "Cardiac arrest")

  it("asks nothing for amiodarone given from the arrest card, and still asks for one charted by hand", () => {
    const fromCard = drug("m1", "Amiodarone", 1, { dose: "300", suggestion: cardSuggestionTag("Cardiac arrest", "amiodarone") })
    expect(reverseQuestions([arrest, fromCard], { patient })).toEqual([])
    expect(reverseQuestions([drug("m2", "Amiodarone", 1, { dose: "300" })], { patient }).map(q => q.rule)).toEqual(["amiodarone"])
  })

  it("asks nothing for salbutamol given from the Hyperkalaemia card", () => {
    const hyperkalaemia = complication("k", "Hyperkalaemia")
    const given = drug("s1", "Salbutamol / Albuterol", 1, { suggestion: cardSuggestionTag("Hyperkalaemia", "salbutamol") })
    expect(reverseQuestions([hyperkalaemia, given], { patient })).toEqual([])
  })
})

describe("answers that arrive twice, or from another screen", () => {
  const hypotension = complication("hypo", "Hypotension")

  it("closes a card once however many times the same answer is applied", () => {
    const ops = cardCloseOps(hypotension, "not_now", at(2))
    const once = applyIntraopEventOps([hypotension], ops)
    const twice = applyIntraopEventOps(once, ops)
    expect(twice.filter(event => event.type === "prompt_answer")).toHaveLength(1)
    expect(cards(twice)).toEqual([])
  })

  it("writes nothing for an answer already given on another screen", () => {
    const answered = applyIntraopEventOps([hypotension], cardCloseOps(hypotension, "not_now", at(2)))
    const ops = intraopResolveAttention(answered, "card:hypo", "not_now", { now: at(3), suggestions: context(at(3)) })
    expect(ops).toEqual({ add: [], update: [], remove: [] })
  })

  it("gives a second client's reverse answer the same id, so the two do not make two complications", () => {
    const trigger = drug("lip", "Dantrolene", 1)
    const [question] = reverseQuestions([trigger], { patient })
    const first = reverseAnswerOps(question!, { log: "Malignant hyperthermia" }, at(2))
    const second = reverseAnswerOps(question!, { log: "Malignant hyperthermia" }, at(3))
    expect(first.add[0]!.id).toBe(second.add[0]!.id)
    expect(applyIntraopEventOps(applyIntraopEventOps([trigger], first), second).filter(event => event.type === "complication")).toHaveLength(1)
  })

  it("gives an 'also log' row one id, so a second tap cannot spawn a second complication", () => {
    const arrest = complication("arrest", "Cardiac arrest")
    const ops = cardAlsoLogOps(arrest, "Massive haemorrhage", "massive-haemorrhage", at(2))
    const log = applyIntraopEventOps(applyIntraopEventOps([arrest], ops), cardAlsoLogOps(arrest, "Massive haemorrhage", "massive-haemorrhage", at(3)))
    expect(log.filter(event => event.type === "complication" && event.label === "Massive haemorrhage")).toHaveLength(1)
  })
})

describe("everything waiting at once", () => {
  it("lists a hypotension, a bradycardia and a high spinal as separate, ordered lines", () => {
    const log = [complication("hypo", "Hypotension", 0), complication("brady", "Bradycardia", 0), complication("spinal", "High spinal", 0)]
    const items = intraopAttentionItems(log, { now: at(2), suggestions: context(at(2)) })
    expect(items.map(item => item.key)).toEqual(["card:hypo", "card:brady", "card:spinal"])
    expect(new Set(items.map(item => item.key)).size).toBe(items.length)
  })
})
