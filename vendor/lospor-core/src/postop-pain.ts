/**
 * Postoperative pain and emergence delirium, scored item by item (10.0.0).
 *
 * The scales used to be entered as a single number on a slider, which showed
 * 0 or 5 before anyone had scored and let FPS-R take odd values. Each scale is
 * now entered the way it is defined -- FLACC and NIPS by behaviour, FPS-R by
 * face, NRS by number, PAED item by item -- and every item is stored with its
 * total, so research can read either.
 *
 * Which pain scales a case is offered follows the patient's age; the clinician
 * decides which of them, if any, to fill in (user decision, 2026-10-27):
 *
 * - a newborn (under 28 days, Core's neonate group): NIPS;
 * - a younger child (to 8 years): FLACC and FPS-R, both offered;
 * - from 8 years, and adults: NRS.
 *
 * PAED is offered for every child (0-18 years). As elsewhere a partial
 * assessment has no total: an item not scored is not an item scored zero.
 */

import { pediatricAgeToApproximateDays, type PediatricAgeUnit } from "./pediatric"
import { paedRiskBand, type PaedBandKey } from "./risk"

export type PainLanguage = "en" | "bg"
export type PainScale = "NIPS" | "FLACC" | "FPS_R" | "NRS"

export type ScaleItemChoice = { points: number; labelEn: string; labelBg: string }
export type ScaleItem<K extends string = string> = {
  key: K
  labelEn: string
  labelBg: string
  /** In the order the scale lists them, each with the points it scores. */
  choices: readonly ScaleItemChoice[]
}

const choice = (points: number, labelEn: string, labelBg: string): ScaleItemChoice => ({ points, labelEn, labelBg })

// ── FLACC (Merkel 1997): five behaviours, 0-2 each, total 0-10 ────────────

export const FLACC_FIELDS = ["flaccFace", "flaccLegs", "flaccActivity", "flaccCry", "flaccConsolability"] as const
export type FlaccField = (typeof FLACC_FIELDS)[number]

export const FLACC_ITEMS: readonly ScaleItem<FlaccField>[] = Object.freeze([
  { key: "flaccFace", labelEn: "Face", labelBg: "Лице", choices: [
    choice(0, "No particular expression or smile", "Без особено изражение или усмивка"),
    choice(1, "Occasional grimace or frown, withdrawn, disinterested", "Понякога гримаса или намръщване, затворено, безразлично"),
    choice(2, "Frequent to constant quivering chin, clenched jaw", "Често или постоянно треперене на брадичката, стиснати челюсти"),
  ] },
  { key: "flaccLegs", labelEn: "Legs", labelBg: "Крака", choices: [
    choice(0, "Normal position or relaxed", "Нормално положение или отпуснати"),
    choice(1, "Uneasy, restless, tense", "Неспокойни, напрегнати"),
    choice(2, "Kicking, or legs drawn up", "Рита или ги свива"),
  ] },
  { key: "flaccActivity", labelEn: "Activity", labelBg: "Активност", choices: [
    choice(0, "Lying quietly, normal position, moves easily", "Лежи спокойно, нормално положение, движи се свободно"),
    choice(1, "Squirming, shifting back and forth, tense", "Върти се, премества се напред-назад, напрегнато"),
    choice(2, "Arched, rigid or jerking", "Извито, сковано или с резки движения"),
  ] },
  { key: "flaccCry", labelEn: "Cry", labelBg: "Плач", choices: [
    choice(0, "No cry (awake or asleep)", "Не плаче (буден или спи)"),
    choice(1, "Moans or whimpers, occasional complaint", "Стене или хленчи, понякога се оплаква"),
    choice(2, "Crying steadily, screams or sobs, frequent complaints", "Плаче постоянно, пищи или ридае, често се оплаква"),
  ] },
  { key: "flaccConsolability", labelEn: "Consolability", labelBg: "Утешимост", choices: [
    choice(0, "Content, relaxed", "Доволно, отпуснато"),
    choice(1, "Reassured by touching, hugging or talking; distractible", "Успокоява се от докосване, прегръдка или говорене; разсейва се"),
    choice(2, "Difficult to console or comfort", "Трудно се утешава"),
  ] },
])

// ── NIPS (Lawrence 1993): six behaviours, total 0-7 ───────────────────────

export const NIPS_FIELDS = ["nipsFacialExpression", "nipsCry", "nipsBreathing", "nipsArms", "nipsLegs", "nipsArousal"] as const
export type NipsField = (typeof NIPS_FIELDS)[number]

export const NIPS_ITEMS: readonly ScaleItem<NipsField>[] = Object.freeze([
  { key: "nipsFacialExpression", labelEn: "Facial expression", labelBg: "Изражение на лицето", choices: [
    choice(0, "Relaxed muscles", "Отпуснати мускули"),
    choice(1, "Grimace", "Гримаса"),
  ] },
  { key: "nipsCry", labelEn: "Cry", labelBg: "Плач", choices: [
    choice(0, "No cry", "Не плаче"),
    choice(1, "Whimper", "Хленчи"),
    choice(2, "Vigorous cry", "Плаче силно"),
  ] },
  { key: "nipsBreathing", labelEn: "Breathing pattern", labelBg: "Дишане", choices: [
    choice(0, "Relaxed", "Спокойно"),
    choice(1, "Change in breathing", "Променено дишане"),
  ] },
  { key: "nipsArms", labelEn: "Arms", labelBg: "Ръце", choices: [
    choice(0, "Relaxed or restrained", "Отпуснати или обездвижени"),
    choice(1, "Flexed or extended", "Свити или изпънати"),
  ] },
  { key: "nipsLegs", labelEn: "Legs", labelBg: "Крака", choices: [
    choice(0, "Relaxed or restrained", "Отпуснати или обездвижени"),
    choice(1, "Flexed or extended", "Свити или изпънати"),
  ] },
  { key: "nipsArousal", labelEn: "State of arousal", labelBg: "Състояние", choices: [
    choice(0, "Sleeping or awake", "Спи или е будно"),
    choice(1, "Fussy", "Неспокойно"),
  ] },
])

// ── PAED (Sikich 2004): five items, 0-4 each, total 0-20 ──────────────────

export const PAED_FIELDS = ["paedEyeContact", "paedPurposeful", "paedAware", "paedRestless", "paedInconsolable"] as const
export type PaedField = (typeof PAED_FIELDS)[number]

const PAED_ANSWERS = [
  ["Not at all", "Изобщо не"],
  ["Just a little", "Малко"],
  ["Quite a bit", "Доста"],
  ["Very much", "Много"],
  ["Extremely", "Изключително"],
] as const

/** The first three items score in reverse: "not at all" making eye contact is 4. */
function paedChoices(reverse: boolean): ScaleItemChoice[] {
  return PAED_ANSWERS.map(([en, bg], index) => choice(reverse ? 4 - index : index, en, bg))
}

export const PAED_ITEMS: readonly ScaleItem<PaedField>[] = Object.freeze([
  { key: "paedEyeContact", labelEn: "Makes eye contact with the caregiver", labelBg: "Осъществява зрителен контакт с придружителя", choices: paedChoices(true) },
  { key: "paedPurposeful", labelEn: "Actions are purposeful", labelBg: "Действията са целенасочени", choices: paedChoices(true) },
  { key: "paedAware", labelEn: "Aware of the surroundings", labelBg: "Осъзнава обкръжението си", choices: paedChoices(true) },
  { key: "paedRestless", labelEn: "Restless", labelBg: "Неспокойно", choices: paedChoices(false) },
  { key: "paedInconsolable", labelEn: "Inconsolable", labelBg: "Неутешимо", choices: paedChoices(false) },
])

// ── FPS-R (Hicks 2001): six faces, 0-10 in steps of 2 ─────────────────────

export const FPSR_SCORES = [0, 2, 4, 6, 8, 10] as const
export const NRS_SCORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

export function isFpsrScore(value: unknown): boolean {
  return typeof value === "number" && (FPSR_SCORES as readonly number[]).includes(value)
}

// ── Totals ────────────────────────────────────────────────────────────────

type ItemValues<K extends string> = Partial<Record<K, number | null | undefined>>

function itemsTotal<K extends string>(items: readonly ScaleItem<K>[], values: ItemValues<K>): number | null {
  let total = 0
  for (const item of items) {
    const value = values[item.key]
    if (typeof value !== "number" || !item.choices.some(option => option.points === value)) return null
    total += value
  }
  return total
}

export const flaccTotal = (values: ItemValues<FlaccField>) => itemsTotal(FLACC_ITEMS, values)
export const nipsTotal = (values: ItemValues<NipsField>) => itemsTotal(NIPS_ITEMS, values)
export const paedTotal = (values: ItemValues<PaedField>) => itemsTotal(PAED_ITEMS, values)

/** The points an item can score, for validation. */
export function scaleItemPoints(field: FlaccField | NipsField | PaedField): readonly number[] {
  const item = [...FLACC_ITEMS, ...NIPS_ITEMS, ...PAED_ITEMS].find(entry => entry.key === field)
  return item ? item.choices.map(option => option.points) : []
}

export const FLACC_TOTAL_MAX = 10
export const NIPS_TOTAL_MAX = 7
export const PAED_TOTAL_MAX = 20

export type PainBand = "none" | "mild" | "moderate" | "severe"

/** FLACC: 0 relaxed, 1-3 mild, 4-6 moderate, 7-10 severe. */
export function flaccBand(total: number): PainBand {
  if (total === 0) return "none"
  if (total <= 3) return "mild"
  if (total <= 6) return "moderate"
  return "severe"
}

/** NIPS: 0-2 none to mild, 3-4 mild to moderate, above 4 severe. */
export function nipsBand(total: number): PainBand {
  if (total === 0) return "none"
  if (total <= 2) return "mild"
  if (total <= 4) return "moderate"
  return "severe"
}

/** FPS-R and NRS share the 0-10 reading: 0 none, 1-3 mild, 4-6 moderate, 7-10 severe. */
export function selfReportBand(score: number): PainBand {
  if (score === 0) return "none"
  if (score <= 3) return "mild"
  if (score <= 6) return "moderate"
  return "severe"
}

// ── Which scales a patient is offered ─────────────────────────────────────

const NEONATE_DAYS = 28
const NUMERIC_FROM_YEARS = 8

export type PainPatient = {
  clinicalMode: string | null | undefined
  /** The child's age as entered (value + unit), or the completed years. */
  ageValue?: number | null
  ageUnit?: PediatricAgeUnit | null
  ageYears?: number | null
}

function approximateAgeDays(patient: PainPatient): number | null {
  if (typeof patient.ageValue === "number" && Number.isFinite(patient.ageValue) && patient.ageUnit) {
    return pediatricAgeToApproximateDays(patient.ageValue, patient.ageUnit)
  }
  if (typeof patient.ageYears === "number" && Number.isFinite(patient.ageYears)) {
    // A child entered in completed years only: 0 years is an infant, not a newborn.
    return patient.ageYears === 0 ? NEONATE_DAYS : pediatricAgeToApproximateDays(patient.ageYears, "YEARS")
  }
  return null
}

/**
 * The pain scales this patient is offered, in the order shown. An adult, or a
 * child of 8 or more, has NRS; a younger child FLACC and FPS-R; a newborn NIPS.
 * A child whose age is not known yet is offered all four.
 */
export function painScalesFor(patient: PainPatient): PainScale[] {
  if (patient.clinicalMode !== "PEDIATRIC") return ["NRS"]
  const days = approximateAgeDays(patient)
  if (days === null) return ["NIPS", "FLACC", "FPS_R", "NRS"]
  if (days < NEONATE_DAYS) return ["NIPS"]
  if (days < pediatricAgeToApproximateDays(NUMERIC_FROM_YEARS, "YEARS")) return ["FLACC", "FPS_R"]
  return ["NRS"]
}

/** PAED is offered for every child, 0-18 years. */
export function paedOffered(clinicalMode: string | null | undefined): boolean {
  return clinicalMode === "PEDIATRIC"
}

export function painScaleLabel(scale: PainScale): string {
  return scale === "FPS_R" ? "FPS-R" : scale
}

export function painBandLabel(band: PainBand, language: PainLanguage): string {
  const labels: Record<PainBand, [string, string]> = {
    none: ["No pain", "Без болка"],
    mild: ["Mild pain", "Лека болка"],
    moderate: ["Moderate pain", "Умерена болка"],
    severe: ["Severe pain", "Силна болка"],
  }
  return labels[band][language === "bg" ? 1 : 0]
}

export function scaleText(entry: { labelEn: string; labelBg: string }, language: PainLanguage): string {
  return language === "bg" ? entry.labelBg : entry.labelEn
}

// ── Reading a record back ─────────────────────────────────────────────────

export type PainRecord = {
  painScoreNRS?: number | null
  flaccTotal?: number | null
  fpsrScore?: number | null
  nipsTotal?: number | null
  paedScore?: number | null
  /** The single-scale entry used before 10.0.0, still shown on older records. */
  pediatricPainScale?: string | null
  pediatricPainScore?: number | null
}

export type PainSummaryEntry = { key: PainScale | "PAED"; label: string; value: string }

const PAED_BANDS: Record<PaedBandKey, [string, string]> = {
  paed_none: ["no emergence delirium", "без делир при събуждане"],
  paed_possible: ["possible emergence delirium", "възможен делир при събуждане"],
  paed_likely: ["emergence delirium likely", "вероятен делир при събуждане"],
}

/**
 * What the record holds of pain and delirium, one line per scale, for the
 * case summary and the printed record. Empty when nothing was scored.
 */
export function painSummaryEntries(record: PainRecord | null | undefined, language: PainLanguage): PainSummaryEntry[] {
  if (!record) return []
  const bg = language === "bg"
  const band = (value: PainBand) => painBandLabel(value, language).toLowerCase()
  const entries: PainSummaryEntry[] = []
  const scored = new Set<string>()
  if (typeof record.nipsTotal === "number") {
    entries.push({ key: "NIPS", label: "NIPS", value: `${record.nipsTotal} / ${NIPS_TOTAL_MAX} · ${band(nipsBand(record.nipsTotal))}` })
    scored.add("NIPS")
  }
  if (typeof record.flaccTotal === "number") {
    entries.push({ key: "FLACC", label: "FLACC", value: `${record.flaccTotal} / ${FLACC_TOTAL_MAX} · ${band(flaccBand(record.flaccTotal))}` })
    scored.add("FLACC")
  }
  if (typeof record.fpsrScore === "number") {
    entries.push({ key: "FPS_R", label: "FPS-R", value: `${record.fpsrScore} / 10 · ${band(selfReportBand(record.fpsrScore))}` })
    scored.add("FPS_R")
  }
  if (typeof record.painScoreNRS === "number") {
    entries.push({ key: "NRS", label: "NRS", value: `${record.painScoreNRS} / 10 · ${band(selfReportBand(record.painScoreNRS))}` })
    scored.add("NRS")
  }
  const legacy = record.pediatricPainScale
  if ((legacy === "FLACC" || legacy === "FPS_R" || legacy === "NRS") && typeof record.pediatricPainScore === "number" && !scored.has(legacy)) {
    entries.push({ key: legacy, label: painScaleLabel(legacy), value: `${record.pediatricPainScore} / 10` })
  }
  if (typeof record.paedScore === "number") {
    const paed = paedRiskBand(record.paedScore).key
    entries.push({ key: "PAED", label: "PAED", value: `${record.paedScore} / ${PAED_TOTAL_MAX} · ${PAED_BANDS[paed][bg ? 1 : 0]}` })
  }
  return entries
}

/** Every item-scored field a postoperative record stores, for the clients' form mapping. */
export const POSTOP_PAIN_ITEM_FIELDS = [...FLACC_FIELDS, "fpsrScore", ...NIPS_FIELDS, ...PAED_FIELDS] as const
