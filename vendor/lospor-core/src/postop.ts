import { HANDOVER_ITEMS } from "./catalog/handover-items"
import { normalizeOptionCode, normalizeOptionCodes } from "./option-aliases"

export const POSTOP_DISPOSITIONS = ["WARD", "PACU", "ICU"] as const
export type PostopDisposition = (typeof POSTOP_DISPOSITIONS)[number]

export const ALDRETE_FIELDS = [
  "aldreteActivity",
  "aldreteRespiration",
  "aldreteCirculation",
  "aldreteConsciousness",
  "aldreteSpO2",
] as const
export type AldreteField = (typeof ALDRETE_FIELDS)[number]

export const ALDRETE_SCORE_MIN = 0
export const ALDRETE_SCORE_MAX = 2
export const ALDRETE_TOTAL_MAX = ALDRETE_FIELDS.length * ALDRETE_SCORE_MAX
export const ALDRETE_READY_TOTAL = 9

/**
 * The Aldrete total, or null when the patient has not been fully assessed.
 *
 * This used to count a missing component as zero, so a patient with one
 * component recorded scored as though the other four had been assessed and
 * found absent. That is not a conservative default: zero on every component
 * describes someone unresponsive, apnoeic and shut down — the app's own labels
 * are "no movement", "apnoeic", "BP more than 50% from baseline". An
 * unassessed patient would be documented as the worst score the scale can
 * express, and the total flowed into the research export as fact.
 *
 * "Not assessed" and "assessed as zero" are different clinical statements, so
 * they now have different values. A partial assessment has no total.
 */
export function aldreteTotal(
  values: Partial<Record<AldreteField, number | null | undefined>>,
): number | null {
  let total = 0
  for (const field of ALDRETE_FIELDS) {
    const value = values[field]
    if (typeof value !== "number" || !Number.isFinite(value)) return null
    total += value
  }
  return total
}

/** Whether every component of the score has actually been recorded. */
export function isAldreteComplete(
  values: Partial<Record<AldreteField, number | null | undefined>>,
): boolean {
  return aldreteTotal(values) !== null
}

export type AldreteBand = "not_ready" | "observe" | "ready"

export function aldreteBand(total: number): AldreteBand {
  if (total >= ALDRETE_READY_TOTAL) return "ready"
  if (total >= 7) return "observe"
  return "not_ready"
}

/**
 * What the recovery observations suggest for two Aldrete items (10.0.0). Only
 * a suggestion: the clinician confirms it with one tap, nothing is set for
 * them. Null when the readings do not decide the item.
 *
 * SpO2: below 90% scores 0 whatever the oxygen; 90-92% cannot be 2 (that needs
 * more than 92% on room air), so it scores 1. Above 92% depends on whether the
 * patient breathes room air, which the record does not hold: no suggestion.
 */
export function suggestAldreteSpO2(spo2: number | null | undefined): 0 | 1 | null {
  if (typeof spo2 !== "number" || !Number.isFinite(spo2)) return null
  if (spo2 < 90) return 0
  if (spo2 <= 92) return 1
  return null
}

/**
 * Circulation, from the recovery systolic pressure against the preoperative
 * one: within 20% scores 2, 20-49% away 1, 50% or more 0.
 */
export function suggestAldreteCirculation(
  recoverySystolic: number | null | undefined,
  preopSystolic: number | null | undefined,
): 0 | 1 | 2 | null {
  if (typeof recoverySystolic !== "number" || typeof preopSystolic !== "number") return null
  if (!Number.isFinite(recoverySystolic) || !Number.isFinite(preopSystolic) || preopSystolic <= 0) return null
  const change = Math.abs(recoverySystolic - preopSystolic) / preopSystolic
  if (change <= 0.2) return 2
  if (change < 0.5) return 1
  return 0
}

/**
 * The Steward recovery score, used for children in place of Aldrete (10.0.0).
 * Three components scored 0-2 (Steward, Can Anaesth Soc J 1975):
 *
 * - consciousness: 0 not responding, 1 responding to stimuli, 2 awake;
 * - airway: 0 airway requires maintenance, 1 maintains a good airway,
 *   2 coughs on command or cries;
 * - movement: 0 not moving, 1 non-purposeful movements, 2 moving limbs
 *   purposefully.
 *
 * As with Aldrete, a partial assessment has no total: zero is a finding, not
 * "not assessed".
 */
export const STEWARD_FIELDS = [
  "stewardConsciousness",
  "stewardAirway",
  "stewardMovement",
] as const
export type StewardField = (typeof STEWARD_FIELDS)[number]

export const STEWARD_SCORE_MIN = 0
export const STEWARD_SCORE_MAX = 2
export const STEWARD_TOTAL_MAX = STEWARD_FIELDS.length * STEWARD_SCORE_MAX
/**
 * Ready to leave recovery at 4 or more, as most units use the score; below
 * that the child is not ready. Steward has no agreed middle band.
 */
export const STEWARD_READY_TOTAL = 4

export function stewardTotal(
  values: Partial<Record<StewardField, number | null | undefined>>,
): number | null {
  let total = 0
  for (const field of STEWARD_FIELDS) {
    const value = values[field]
    if (typeof value !== "number" || !Number.isFinite(value)) return null
    total += value
  }
  return total
}

export function stewardBand(total: number): AldreteBand {
  return total >= STEWARD_READY_TOTAL ? "ready" : "not_ready"
}

/**
 * Which recovery score a case is scored on: Steward for a child, Aldrete for
 * an adult. The case's clinical mode decides, as it does for every other
 * paediatric scale.
 */
export type RecoveryScore = "ALDRETE" | "STEWARD"
export function recoveryScoreFor(clinicalMode: string | null | undefined): RecoveryScore {
  return clinicalMode === "PEDIATRIC" ? "STEWARD" : "ALDRETE"
}

export type HandoverLocale = "en" | "bg"
export type HandoverItem = { code: string; label: string }
export type HandoverGroup = {
  id: string
  group: string
  items: HandoverItem[]
}

function localizedLabel(
  option: { label: string; labelBg?: string },
  locale: HandoverLocale,
): string {
  return locale === "bg" && option.labelBg ? option.labelBg : option.label
}

export function handoverGroups(locale: HandoverLocale = "en"): HandoverGroup[] {
  return HANDOVER_ITEMS.map(group => ({
    id: group.v,
    group: localizedLabel(group, locale),
    items: (group.children ?? []).map(item => ({
      code: item.v,
      label: localizedLabel(item, locale),
    })),
  }))
}

export function normalizeHandoverCodes(codes: readonly string[]): string[] {
  return normalizeOptionCodes("HANDOVER_ITEM", codes)
}

export function handoverLabel(
  code: string,
  locale: HandoverLocale = "en",
): string | undefined {
  const normalized = normalizeOptionCode("HANDOVER_ITEM", code)
  for (const group of handoverGroups(locale)) {
    const item = group.items.find(candidate => candidate.code === normalized)
    if (item) return item.label
  }
  return undefined
}
