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

export function aldreteTotal(
  values: Partial<Record<AldreteField, number | null | undefined>>,
): number {
  return ALDRETE_FIELDS.reduce((total, field) => {
    const value = values[field]
    return total + (typeof value === "number" && Number.isFinite(value) ? value : 0)
  }, 0)
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
