import { DRUG_CATALOG } from "../catalog/intraop-drugs"
import { CLINICAL_EVENT_CATS } from "../catalog/intraop-events"
import type { IntraopAttentionContext } from "../intraop-attention"
import { parseIntraopAutomation } from "../intraop-automation"
import type { LogEvent } from "../intraop-types"
import { SUGGESTION_CARDS } from "./catalogue"
import { cardSuggestionTag, type SuggestionContext } from "./waiting"

/**
 * Random but repeatable intraoperative cases (10.2.0): a log of vitals, complications, doses, infusions, fluids, gas
 * changes and events, a patient and the settings, for stress tests of everything the clinician can be asked.
 * The same seed is always the same case. Used by the engine's own stress test here and by the API, which runs
 * every answer the engine can write through its real event schema.
 */

export const T0 = Date.parse("2026-11-02T10:00:00.000Z")
export const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString()
export const ALL_ON = parseIntraopAutomation({
  enabled: true,
  groups: { treatmentSuggestions: true, reverseQuestions: true, readingQuestions: true, labQuestions: true, reminders: true, timers: true },
  vitalQuestions: { enabled: true },
})

function rng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const COMPLICATIONS = [...new Set(SUGGESTION_CARDS.flatMap(card => card.complications)), "Hypoxia / desaturation", "Massive haemorrhage", "Hypertension"]
const EVENTS = CLINICAL_EVENT_CATS.flatMap(category => category.events.map(event => event.label))
const DRUGS = DRUG_CATALOG.map(entry => entry.name)

export function scenario(seed: number): { log: LogEvent[]; context: IntraopAttentionContext } {
  const random = rng(seed)
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!
  const between = (low: number, high: number) => low + Math.floor(random() * (high - low + 1))
  const maybe = (chance: number) => random() < chance
  const log: LogEvent[] = []
  let n = 0
  const id = (prefix: string) => `${prefix}${++n}`
  const count = between(0, 28)
  for (let index = 0; index < count; index++) {
    const ts = at(between(0, 120))
    const kind = between(0, 9)
    if (kind <= 2) {
      const vital: LogEvent = { id: id("v"), ts, type: "vital" }
      if (maybe(0.8)) vital.systolic = between(40, 230)
      if (maybe(0.6)) vital.diastolic = between(20, 140)
      if (maybe(0.8)) vital.heartRate = between(15, 210)
      if (maybe(0.5)) vital.spO2 = between(55, 100)
      if (maybe(0.4)) vital.etco2 = between(0, 85)
      if (maybe(0.3)) vital.temp = between(330, 415) / 10
      if (maybe(0.2)) vital.tofRatio = between(0, 120) / 100
      log.push(vital)
    } else if (kind === 3) {
      const label = pick(COMPLICATIONS)
      log.push({ id: id("c"), ts, type: "complication", label, ...(maybe(0.3) ? { endTs: ts } : {}) })
    } else if (kind === 4 || kind === 5) {
      const name = pick(DRUGS)
      log.push({
        id: id("d"), ts, type: "drug", name, dose: String(between(1, 1200)), unit: pick(["mg", "mcg", "mL"]),
        ...(maybe(0.4) ? { suggestion: cardSuggestionTag(pick(COMPLICATIONS), "row") } : {}),
      })
    } else if (kind === 6) {
      const infId = id("i")
      log.push({ id: id("is"), ts, type: "infusion_start", name: pick(DRUGS), rate: String(between(1, 50)), unit: "mg/h", infId })
      // A stop entered ahead of its time: recorded before it, and not yet confirmed.
      if (maybe(0.5)) { const stopAt = between(10, 120); log.push({ id: id("ie"), ts: at(stopAt), recordedAt: at(stopAt - 8), type: "infusion_stop", infId }) }
    } else if (kind === 7) {
      const fluidId = id("f")
      log.push({ id: id("fs"), ts, type: "fluid_start", name: pick(["Ringer's lactate", "Lipid emulsion 20%", "PRBC", "Glucose"]), volume: String(between(50, 1000)), fluidId })
      if (maybe(0.4)) log.push({ id: id("fe"), ts: at(between(0, 125)), type: "fluid_end", fluidId })
    } else if (kind === 8) {
      log.push({ id: id("g"), ts, type: maybe(0.5) ? "gas_change" : "gas_start", fio2: between(21, 100), fgf: between(1, 10) })
    } else {
      log.push({ id: id("e"), ts, type: "clinical_event", label: pick(EVENTS) })
    }
  }
  if (maybe(0.2)) log.push({ id: id("sh"), ts: at(between(0, 120)), type: "defibrillation", energyJ: between(50, 360), synchronized: maybe(0.5) })
  const child = maybe(0.35)
  const suggestions: SuggestionContext = {
    settings: ALL_ON,
    patient: { ageDays: child ? between(10, 5000) : between(6000, 32000), weightKg: maybe(0.1) ? null : child ? between(3, 40) : between(45, 130) },
    preop: { diabetes: maybe(0.3), apfelScore: maybe(0.7) ? between(0, 4) : null, mhHistory: maybe(0.1), latexAllergy: maybe(0.1), ponvHistory: maybe(0.2), betaBlocker: maybe(0.2), cyanoticHeartDisease: maybe(0.1) },
    tofMonitor: maybe(0.5),
    keepLogging: maybe(0.5),
    labs: [],
    bloodLossMl: maybe(0.3) ? between(0, 3500) : null,
    startedAt: at(0),
    now: at(between(60, 140)),
    techniques: maybe(0.5) ? ["GENERAL_TIVA"] : [],
  }
  return { log, context: { now: suggestions.now, suggestions, vitals: { settings: ALL_ON, stats: null, ageDays: suggestions.patient.ageDays ?? null, keepLogging: suggestions.keepLogging, preopPressure: maybe(0.5) ? { systolic: between(100, 180), diastolic: between(60, 110) } : null } } }
}

