import { normalizeAdministrationRoute } from "../clinical-rule-vocabulary"
import { sortIntraopEvents } from "../intraop-engine"
import { localAnaestheticMg, parseLocalAnaestheticPercent } from "../intraop-totals"
import type { LabResult } from "../labs"
import type { IntraopEventOps } from "../intraop-timetable-edit"
import type { LogEvent } from "../intraop-types"
import { drugClasses, given, lastEvent, type SuggestionPatient, type SuggestionPreop } from "./context"

/**
 * Reminders (10.2.0): the local anaesthetic maximum in the drug sheet (E2),
 * the ПОГП check at procedure end (E5, P3), the MH-history warning (P1), the
 * diabetes glucose check (P2) and the latex banner (P4). Every one can be
 * dismissed; none charts anything.
 */

/* ---------- E2: the local anaesthetic maximum ---------- */

/** Plain maximum doses in mg/kg of ideal weight (no adrenaline switch, by decision). */
export const LOCAL_ANAESTHETIC_MAX_MG_PER_KG: Readonly<Record<string, number>> = Object.freeze({
  Lidocaine: 4.5,
  Bupivacaine: 2,
  Levobupivacaine: 2.5,
  Ropivacaine: 3,
  Mepivacaine: 4.5,
  Prilocaine: 6,
  Chloroprocaine: 11,
})

const ms = (value: string | number | Date) => value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value)
const intrathecal = (route: string | undefined) => route != null && normalizeAdministrationRoute(route) === "INTRATHECAL"

/** The base drug name: "Bupivacaine 0.5%" and "Bupivacaine" are one drug. */
function localAnaestheticName(name: string | undefined): string | null {
  if (!name) return null
  return Object.keys(LOCAL_ANAESTHETIC_MAX_MG_PER_KG).find(candidate => name.toLowerCase().startsWith(candidate.toLowerCase())) ?? null
}

function percentOf(event: LogEvent): number | null {
  if (event.concentrationUnit === "PERCENT" && event.concentrationValue != null) return event.concentrationValue
  return parseLocalAnaestheticPercent(event.concentration ?? "") ?? parseLocalAnaestheticPercent(event.name ?? "")
}

/** mg in one bolus: mg as charted, or mL × the strength. Null when the strength is unknown. */
export function localAnaestheticBolusMg(event: LogEvent): number | null {
  const amount = Number.parseFloat(event.dose ?? "")
  if (!Number.isFinite(amount)) return null
  const unit = (event.unit ?? "").toLowerCase()
  if (unit === "mg") return amount
  if (unit === "mcg") return amount / 1000
  if (unit === "ml") {
    const percent = percentOf(event)
    return percent == null ? null : localAnaestheticMg(amount, percent)
  }
  return null
}

/** mg an infusion delivered up to an instant, from its rates (mL/hr × strength, mg/hr, mL/kg/hr). */
function infusionMg(log: LogEvent[], start: LogEvent, until: number, weightKg: number | null): number {
  const events = sortIntraopEvents(log).filter(event => event.infId === start.infId && ms(event.ts) >= ms(start.ts))
  let total = 0
  let rate = Number.parseFloat(start.rate ?? "") || 0
  let unit = start.unit ?? ""
  let from = ms(start.ts)
  const percent = percentOf(start)
  const add = (to: number) => {
    const hours = Math.max(0, Math.min(to, until) - from) / 3_600_000
    const perHourMl = unit === "mL/hr" ? rate : unit === "mL/kg/hr" && weightKg ? rate * weightKg : null
    if (perHourMl != null && percent != null) total += localAnaestheticMg(perHourMl * hours, percent)
    else if (unit === "mg/hr") total += rate * hours
    else if (unit === "mg/kg/hr" && weightKg) total += rate * weightKg * hours
  }
  for (const event of events.slice(1)) {
    if (ms(event.ts) > until) break
    add(ms(event.ts))
    from = ms(event.ts)
    if (event.type === "infusion_stop") return total
    if (event.type === "infusion_rate") { rate = Number.parseFloat(event.rate ?? "") || 0; unit = event.unit ?? unit }
  }
  add(until)
  return total
}

export type LocalAnaestheticBudget = {
  /** Each drug given: mg so far and its maximum for this patient. */
  drugs: { drug: string; mg: number; maxMg: number }[]
  /** The sum of each drug's share of its maximum: 1 is the maximum reached. */
  fraction: number
  /** The weight the maximum was worked out on, and which weight it was. */
  weightKg: number
  basis: "IBW" | "TBW"
  /** Doses whose strength was not known, left out of the total. */
  uncounted: number
}

/**
 * What has been given against the patient's maximum, up to an instant.
 * Intrathecal doses are left out (they do not cause systemic toxicity).
 * Null without a weight.
 */
export function localAnaestheticBudget(log: LogEvent[], patient: SuggestionPatient, at: string | number | Date): LocalAnaestheticBudget | null {
  const ideal = patient.idealWeightKg != null && patient.weightKg != null ? Math.min(patient.idealWeightKg, patient.weightKg) : patient.idealWeightKg
  const weightKg = ideal ?? patient.weightKg
  if (weightKg == null || !(weightKg > 0)) return null
  const until = ms(at)
  const mgByDrug = new Map<string, number>()
  let uncounted = 0
  for (const event of sortIntraopEvents(log)) {
    if (ms(event.ts) > until) break
    const name = localAnaestheticName(event.name)
    if (!name || intrathecal(event.drugRoute)) continue
    if (event.type === "drug") {
      const mg = localAnaestheticBolusMg(event)
      if (mg == null) { uncounted++; continue }
      mgByDrug.set(name, (mgByDrug.get(name) ?? 0) + mg)
    } else if (event.type === "infusion_start") {
      mgByDrug.set(name, (mgByDrug.get(name) ?? 0) + infusionMg(log, event, until, patient.weightKg))
    }
  }
  const drugs = [...mgByDrug].map(([drug, mg]) => ({ drug, mg: Math.round(mg * 10) / 10, maxMg: Math.round(LOCAL_ANAESTHETIC_MAX_MG_PER_KG[drug]! * weightKg) }))
  return {
    drugs,
    fraction: drugs.reduce((sum, item) => sum + item.mg / item.maxMg, 0),
    weightKg,
    basis: ideal != null ? "IBW" : "TBW",
    uncounted,
  }
}

/**
 * The drug sheet's check before saving a local anaesthetic: the budget with
 * this dose added, and whether it would go over. Null for a drug that is not
 * counted (not a local anaesthetic with a maximum, or intrathecal).
 */
export function localAnaestheticCheck(log: LogEvent[], patient: SuggestionPatient, dose: LogEvent): (LocalAnaestheticBudget & { wouldExceed: boolean; doseMg: number | null }) | null {
  const name = localAnaestheticName(dose.name)
  if (!name || intrathecal(dose.drugRoute)) return null
  const budget = localAnaestheticBudget(log, patient, dose.ts)
  if (!budget) return null
  const doseMg = localAnaestheticBolusMg(dose)
  const maxMg = LOCAL_ANAESTHETIC_MAX_MG_PER_KG[name]! * budget.weightKg
  const fraction = budget.fraction + (doseMg == null ? 0 : doseMg / maxMg)
  return { ...budget, fraction, doseMg, wouldExceed: fraction > 1 + 1e-9 }
}

/** The sheet's line: "Total so far: 95 mg of 160 mg max". */
export function localAnaestheticBudgetText(budget: LocalAnaestheticBudget, drug: string, locale: string): string | null {
  const name = localAnaestheticName(drug)
  if (!name) return null
  const mine = budget.drugs.find(item => item.drug === name)
  const maxMg = Math.round(LOCAL_ANAESTHETIC_MAX_MG_PER_KG[name]! * budget.weightKg)
  const others = budget.drugs.filter(item => item.drug !== name)
  const share = others.length ? Math.round(budget.fraction * 100) : null
  const base = locale === "bg"
    ? `Общо досега: ${mine?.mg ?? 0} mg от максимум ${maxMg} mg`
    : `Total so far: ${mine?.mg ?? 0} mg of ${maxMg} mg max`
  return share == null ? base : locale === "bg" ? `${base} · всички локални анестетици: ${share}% от максимума` : `${base} · all local anaesthetics: ${share}% of the maximum`
}

/* ---------- P1: the MH-history warning ---------- */

/** Whether charting this needs the MH warning: a volatile or suxamethonium for a patient with an MH history. */
export function mhHistoryWarning(preop: SuggestionPreop, item: Pick<LogEvent, "type" | "name" | "atcCode">): boolean {
  if (!preop.mhHistory) return false
  if (item.type === "agent_start") return true
  return drugClasses(item as LogEvent).has("suxamethonium")
}

export const MH_HISTORY_WARNING = {
  en: "Malignant hyperthermia history, or anaesthetic problems in the family, on the preop record. Give anyway?",
  bg: "В предоперативния запис има анамнеза за малигнена хипертермия или проблеми с анестезия в семейството. Приложи въпреки това?",
} as const

/* ---------- P4: the latex banner ---------- */

export function latexBanner(preop: SuggestionPreop, locale: string): string | null {
  if (!preop.latexAllergy) return null
  return locale === "bg" ? "Алергия към латекс" : "Latex allergy"
}

/* ---------- E5 / P3: ПОГП at procedure end ---------- */

export type PonvReminder = { key: string; kind: "ponv"; trigger: LogEvent; apfel: number | null }

export function ponvReminder(log: LogEvent[], preop: SuggestionPreop): PonvReminder | null {
  const atRisk = (preop.apfelScore ?? 0) >= 2 || !!preop.ponvHistory
  if (!atRisk) return null
  const ended = lastEvent(log, "Procedure ended")
  if (!ended || given(log, "antiemetic")) return null
  if (log.some(event => event.type === "prompt_answer" && event.answerKind === "reminder:ponv" && event.answerFor === ended.id)) return null
  return { key: `reminder:ponv:${ended.id}`, kind: "ponv", trigger: ended, apfel: preop.apfelScore ?? null }
}

export function ponvReminderText(reminder: PonvReminder, locale: string): string {
  const apfel = reminder.apfel != null ? `Apfel ${reminder.apfel}` : null
  if (locale === "bg") return apfel ? `${apfel}, не е даден антиеметик: профилактика на ПОГП?` : "Не е даден антиеметик: профилактика на ПОГП?"
  return apfel ? `${apfel}, no antiemetic given: give PONV prophylaxis?` : "No antiemetic given: give PONV prophylaxis?"
}

/* ---------- P2: the diabetes glucose check ---------- */

export const GLUCOSE_CHECK_HOURS = 2

export type GlucoseReminder = { key: string; kind: "glucose"; dueAt: string }

/**
 * Two hours without a glucose result (since the start, the last result or the
 * last dismissal) asks to check glucose. The entry opens the lab sheet.
 */
export function glucoseReminder(preop: SuggestionPreop, labs: readonly LabResult[], log: LogEvent[], startedAt: string | null | undefined, now: Date | string | number): GlucoseReminder | null {
  if (!preop.diabetes || !startedAt) return null
  const times = [
    ms(startedAt),
    ...labs.filter(result => result.test === "Glucose" && result.takenAt).map(result => ms(result.takenAt!)),
    ...log.filter(event => event.type === "prompt_answer" && event.answerKind === "reminder:glucose").map(event => ms(event.ts)),
  ].filter(Number.isFinite)
  const dueAt = Math.max(...times) + GLUCOSE_CHECK_HOURS * 3_600_000
  if (ms(now) < dueAt) return null
  return { key: `reminder:glucose:${dueAt}`, kind: "glucose", dueAt: new Date(dueAt).toISOString() }
}

export function glucoseReminderText(locale: string): string {
  return locale === "bg" ? `Диабет: няма глюкоза от ${GLUCOSE_CHECK_HOURS} h. Проверка?` : `Diabetes: no glucose result for ${GLUCOSE_CHECK_HOURS} h. Check glucose?`
}

/** A reminder's "Not now": the ПОГП one for that procedure end, the glucose one from now on. */
export function reminderDismissOps(reminder: PonvReminder | GlucoseReminder, now: Date | string | number): IntraopEventOps {
  const ts = new Date(now).toISOString()
  const answerFor = reminder.kind === "ponv" ? reminder.trigger.id : reminder.dueAt
  return { add: [{ id: `pa-${reminder.key.replace(/[^a-z0-9]+/gi, "-")}`, ts, type: "prompt_answer", answerKind: `reminder:${reminder.kind}`, answerFor, answer: "not_now", recordedAt: ts }], update: [], remove: [] }
}
