import { intraopAtcCode } from "../catalog"
import { intraopRunningItemsAt, type IntraopRunningItem } from "../intraop-commands"
import { sortIntraopEvents } from "../intraop-engine"
import type { LogEvent } from "../intraop-types"

/**
 * What SPS (10.2.0) knows about the patient and the
 * case. Built once by the screen that holds the case; every rule reads it.
 */

const YEAR_DAYS = 365.2425

export type SuggestionPatient = {
  /** Age in days, from the preoperative record. Null: unknown. */
  ageDays: number | null
  /** Actual (total) body weight in kg. Null: not recorded. */
  weightKg: number | null
  /** Ideal body weight in kg, when it could be worked out. */
  idealWeightKg?: number | null
  sex?: "MALE" | "FEMALE" | null
}

/** Facts from the preoperative record the suggestions use (P1-P4, R1, anaphylaxis). */
export type SuggestionPreop = {
  mhHistory?: boolean
  latexAllergy?: boolean
  diabetes?: boolean
  apfelScore?: number | null
  ponvHistory?: boolean
  betaBlocker?: boolean
  cyanoticHeartDisease?: boolean
}

export const isChild = (patient: SuggestionPatient): boolean =>
  patient.ageDays != null && patient.ageDays < 18 * YEAR_DAYS

export const ageYears = (patient: SuggestionPatient): number | null =>
  patient.ageDays == null ? null : patient.ageDays / YEAR_DAYS

/* ---------- drug classes ---------- */

const atcOf = (event: LogEvent): string => (event.atcCode ?? (event.name ? intraopAtcCode(event.name) : undefined) ?? "").toUpperCase()

const OPIOID = /^N0(2A|1AH)/
const BENZODIAZEPINE = /^N0(5CD|5BA|3AE)/
const LOCAL_ANAESTHETIC = /^N01B/
const NON_DEPOLARISING = /^M03AC/
const STEROIDAL_RELAXANT = /^M03AC0[39]$/ // vecuronium, rocuronium
const SUXAMETHONIUM = /^M03AB01$/
const ANTIEMETIC_NAMES = new Set([
  "Ondansetron", "Granisetron", "Dexamethasone", "Droperidol", "Metoclopramide", "Cyclizine",
  "Aprepitant", "Fosaprepitant", "Haloperidol", "Promethazine", "Scopolamine / Hyoscine",
])

export type DrugClass = "opioid" | "benzodiazepine" | "localAnaesthetic" | "nonDepolarising" | "steroidalRelaxant" | "suxamethonium" | "antiemetic"

export function drugClasses(event: LogEvent): Set<DrugClass> {
  const classes = new Set<DrugClass>()
  const atc = atcOf(event)
  if (OPIOID.test(atc)) classes.add("opioid")
  if (BENZODIAZEPINE.test(atc)) classes.add("benzodiazepine")
  if (LOCAL_ANAESTHETIC.test(atc)) classes.add("localAnaesthetic")
  if (NON_DEPOLARISING.test(atc)) classes.add("nonDepolarising")
  if (STEROIDAL_RELAXANT.test(atc)) classes.add("steroidalRelaxant")
  if (SUXAMETHONIUM.test(atc)) classes.add("suxamethonium")
  if (event.name && ANTIEMETIC_NAMES.has(event.name)) classes.add("antiemetic")
  return classes
}

const ms = (value: string | number | Date) => value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value)

/** Drugs and infusion starts charted up to an instant, newest first. */
export function givenUpTo(log: LogEvent[], at: string | number | Date = Number.POSITIVE_INFINITY): LogEvent[] {
  const limit = ms(at)
  return sortIntraopEvents(log)
    .filter(event => (event.type === "drug" || event.type === "infusion_start") && ms(event.ts) <= limit)
    .reverse()
}

/** Whether a drug of a class was charted (a bolus or an infusion) up to an instant. */
export function given(log: LogEvent[], drugClass: DrugClass, at?: string | number | Date): boolean {
  return givenUpTo(log, at).some(event => drugClasses(event).has(drugClass))
}

/** Whether a volatile agent ran at any time up to an instant. */
export function volatileCharted(log: LogEvent[], at: string | number | Date = Number.POSITIVE_INFINITY): boolean {
  const limit = ms(at)
  return log.some(event => event.type === "agent_start" && ms(event.ts) <= limit)
}

/** MH triggers: a volatile or suxamethonium charted (R5, FNHTR, hypercapnia). */
export function mhTriggerCharted(log: LogEvent[], at?: string | number | Date): boolean {
  return volatileCharted(log, at) || given(log, "suxamethonium", at)
}

export function runningAt(log: LogEvent[], at: string | number | Date): IntraopRunningItem[] {
  return intraopRunningItemsAt(log, at)
}

/** A clinical event of this label charted up to an instant, the latest one. */
export function lastEvent(log: LogEvent[], label: string, at: string | number | Date = Number.POSITIVE_INFINITY): LogEvent | undefined {
  const limit = ms(at)
  return sortIntraopEvents(log).filter(event => event.type === "clinical_event" && event.label === label && ms(event.ts) <= limit).pop()
}

/** The latest charted (not auto-filled) value of a vital sign up to an instant. */
export function lastVital(log: LogEvent[], sign: "heartRate" | "spO2" | "etco2" | "temp" | "tofRatio" | "systolic", at: string | number | Date = Number.POSITIVE_INFINITY): { value: number; event: LogEvent } | null {
  const limit = ms(at)
  const event = sortIntraopEvents(log)
    .filter(item => item.type === "vital" && !item.autoFilled && typeof item[sign] === "number" && ms(item.ts) <= limit)
    .pop()
  return event ? { value: event[sign] as number, event } : null
}
