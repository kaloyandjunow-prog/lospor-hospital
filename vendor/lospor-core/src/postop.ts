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
