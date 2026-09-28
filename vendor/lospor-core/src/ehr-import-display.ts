import type { EhrLabValue, EhrTagValue } from "./ehr-import"
import type { EhrReviewItem } from "./ehr-import-review"
import { SEX } from "./catalog/preop-postop-categorical"
import { clinicalDisplayLabel } from "./display"
import { administrationRouteLabel, normalizeAdministrationRoute } from "./clinical-rule-vocabulary"
import { importedProcedureOf, isExactProcedure, procedureDisplayText } from "./procedure-codes"

/**
 * What one row of the import review says, in the clinician's language.
 *
 * Both apps carried this word for word, and both showed the hospital's codes
 * as they arrived: "MALE", "YEARS", "true", a route of "TOPICAL", and a lab
 * dated by its UTC day (1.4.13 appliance test). One copy here, so the phone
 * and the web cannot word the same import differently.
 *
 * Clinical names -- a drug, a diagnosis, a test -- stay as the hospital sent
 * them; only LOSPOR's own codes are translated.
 */

export type EhrReviewLocale = "en" | "bg"

export type EhrReviewItemText = { title: string; detail?: string }

export type EhrReviewTextOptions = {
  locale: EhrReviewLocale
  /** The app's own words for a result with no time, and for "taken on". */
  undatedLabel: string
  takenLabel: string
  /** The zone whose calendar day a result is dated by; the device's when absent. */
  timeZone?: string
}

const YES_NO = { en: ["Yes", "No"], bg: ["Да", "Не"] } as const

const RH_FACTOR: Record<string, { en: string; bg: string }> = {
  POSITIVE: { en: "Positive", bg: "Положителен" },
  NEGATIVE: { en: "Negative", bg: "Отрицателен" },
}

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** A scalar the hospital sent, as the form itself would show it. */
export function ehrScalarText(field: string, value: unknown, locale: EhrReviewLocale): string {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "boolean") return YES_NO[locale][value ? 0 : 1]
  const raw = String(value)
  const code = raw.trim().toUpperCase()
  if (field === "sex") {
    const option = SEX.find(entry => entry.v === code)
    return option ? (locale === "bg" ? option.labelBg : option.label) : raw
  }
  if (field === "ageUnit") return clinicalDisplayLabel("ageUnit", code, locale)
  if (field === "rhFactor") return RH_FACTOR[code]?.[locale] ?? raw
  // Group O is written 0 in Bulgarian, as on the form's blood group buttons.
  if (field === "bloodType" && code === "O") return locale === "bg" ? "0" : "O"
  return raw
}

/** A route of administration by its name; one LOSPOR does not know stays as sent. */
export function ehrRouteText(route: string, locale: EhrReviewLocale): string {
  const code = normalizeAdministrationRoute(route)
  return code ? administrationRouteLabel(code, locale) : route
}

/**
 * The calendar day a result was taken, in the given zone.
 *
 * `takenAt` is stored as a UTC instant, so its first ten characters are the
 * UTC day: a sample drawn at 01:30 in Sofia read as the day before.
 */
export function ehrTakenDateText(takenAt: string, locale: EhrReviewLocale, timeZone?: string): string {
  const instant = new Date(takenAt)
  if (Number.isNaN(instant.getTime())) return takenAt.slice(0, 10)
  const parts = new Intl.DateTimeFormat("en-GB", {
    ...(timeZone ? { timeZone } : {}),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant)
  const part = (type: string) => parts.find(entry => entry.type === type)?.value ?? ""
  const day = part("day"), month = part("month"), year = part("year")
  return locale === "bg" ? `${day}.${month}.${year}` : `${day} ${MONTHS_EN[Number(month) - 1]} ${year}`
}

export function describeEhrReviewItem(item: EhrReviewItem, options: EhrReviewTextOptions): EhrReviewItemText {
  const { locale } = options
  const proposed = item.proposed
  if (proposed && typeof proposed === "object") {
    if ("takenAt" in (proposed as object)) {
      const lab = proposed as EhrLabValue
      return {
        title: `${lab.test} ${lab.value}${lab.unit ? ` ${lab.unit}` : ""}`,
        // Never silent. An undated result beside dated ones would otherwise
        // read as current, and a preoperative haemoglobin is only worth
        // anything if you know how old it is.
        detail: lab.takenAt === null
          ? options.undatedLabel
          : `${options.takenLabel} ${ehrTakenDateText(lab.takenAt, locale, options.timeZone)}`,
      }
    }
    // `sourceLabel` is the hospital's own wording when the label is a LOSPOR
    // term proposed for it (a Bulgarian procedure name under a procedure
    // group), so the clinician checks the proposal against what arrived.
    const tag = proposed as EhrTagValue & { sourceLabel?: string }
    const parts = [tag.dose, tag.route ? ehrRouteText(tag.route, locale) : undefined, tag.frequency].filter(Boolean)
    // An exact operation proposed for a hospital code reads as the operation,
    // with the code and wording the hospital actually sent beneath it.
    const exact = isExactProcedure(tag as unknown as Record<string, unknown>)
    const imported = exact ? importedProcedureOf(tag as unknown as Record<string, unknown>) : undefined
    const source = (imported ? [imported.code, imported.sourceLabel] : [tag.code, tag.sourceLabel]).filter(Boolean).join(" · ")
    const title = exact ? procedureDisplayText(tag as unknown as Record<string, unknown>) : tag.label
    return { title, detail: parts.length ? parts.join(" · ") : source || undefined }
  }
  return { title: ehrScalarText(item.field, proposed, locale) }
}
