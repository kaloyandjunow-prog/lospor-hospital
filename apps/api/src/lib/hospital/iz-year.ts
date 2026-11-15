import { calendarDayKey, DASHBOARD_TIMEZONE } from "@lospor/core/dashboard-date-scope"
import { daysBetweenDateKeys } from "@lospor/core/intraop-time"

/**
 * Which year an ИЗ № belongs to (hospital 1.9.2).
 *
 * ИЗ № restarts at 1 every January, so the number alone does not say which
 * admission it is. Until now the year was always the one the case was created
 * in: a patient admitted on 28 December and operated on 20 January was filed
 * under the new year, where the same number belongs to someone admitted later.
 *
 * For the first 60 days of the year the clinician chooses (A). The choice is
 * pre-set from: a case for this number already filed under one of the two
 * years; an EHR import staged last year (C); a number far higher than this
 * hospital reaches this early in a year (B). In that order.
 *
 * The year is the department's calendar year (Europe/Sofia), not the server's:
 * between 00:00 and 02:00 on 1 January a UTC clock is still in December.
 */
export const IZ_YEAR_CHOICE_DAYS = 60

export type IzYearReason = "earlier-case" | "ehr" | "high-number"

export type IzYearChoice = {
  /** False outside the first 60 days: the year is simply this one. */
  open: boolean
  /** This year first, then last year when the choice is open. */
  years: number[]
  suggestedYear: number
  /** What the suggestion rests on; null when nothing points either way. */
  reason: IzYearReason | null
}

/** The department's calendar year at an instant. */
export function departmentYear(at: Date): number {
  return Number(calendarDayKey(at, DASHBOARD_TIMEZONE).slice(0, 4))
}

/** Days since 1 January in the department's calendar: 0 on New Year's Day. */
export function dayOfDepartmentYear(at: Date): number {
  const key = calendarDayKey(at, DASHBOARD_TIMEZONE)
  return daysBetweenDateKeys(`${key.slice(0, 4)}-01-01`, key) ?? 0
}

export function izYearChoiceOpen(at: Date): boolean {
  return dayOfDepartmentYear(at) < IZ_YEAR_CHOICE_DAYS
}

/**
 * The year a new case's ИЗ № is filed under. Last year is accepted only while
 * the choice is open; a correction may always name last year, because a case
 * opened in January can be corrected in March.
 */
export function izYearFor(
  requested: unknown,
  at: Date,
  { correction = false }: { correction?: boolean } = {},
): { ok: true; year: number } | { ok: false } {
  const year = departmentYear(at)
  if (requested === undefined || requested === null || requested === "") return { ok: true, year }
  const value = typeof requested === "number" ? requested : Number(requested)
  if (value === year) return { ok: true, year }
  if (value === year - 1 && (correction || izYearChoiceOpen(at))) return { ok: true, year: value }
  return { ok: false }
}

/** The leading digits of a record number: "43233" and "43233-A" are 43233. */
export function izNumberValue(identifier: string): number | null {
  const match = /^\s*0*(\d{1,9})/.exec(identifier)
  return match ? Number(match[1]) : null
}

/**
 * The suggested year from the signals (B and C).
 *
 * B needs last year's highest number, which says how fast this hospital
 * issues them. A number more than twice what it would have reached by today,
 * and not past last year's total, is last year's. Without last year's data
 * (the first year of use) nothing is guessed. Ward admissions run ahead of
 * the surgical cases this appliance sees, hence the factor of two.
 */
export function suggestIzYear(input: {
  identifier: string
  at: Date
  thisYearHighest: number | null
  lastYearHighest: number | null
  /** Years an EHR import was found under for this number. */
  ehrYears: readonly number[]
}): IzYearChoice {
  const year = departmentYear(input.at)
  if (!izYearChoiceOpen(input.at)) return { open: false, years: [year], suggestedYear: year, reason: null }
  const years = [year, year - 1]
  const choice = (suggestedYear: number, reason: IzYearReason | null): IzYearChoice =>
    ({ open: true, years, suggestedYear, reason })

  // An import staged last year proves the admission is last year's: nothing
  // arrives before the patient is admitted. One staged this year proves less,
  // since a 28 December admission sent on 2 January is stamped January, so it
  // never outweighs the number.
  if (input.ehrYears.includes(year - 1) && !input.ehrYears.includes(year)) return choice(year - 1, "ehr")

  const value = izNumberValue(input.identifier)
  const last = input.lastYearHighest
  if (value !== null && last !== null && last > 0) {
    const reachedByNow = last * (dayOfDepartmentYear(input.at) + 1) / 365
    const ceiling = 2 * Math.max(input.thisYearHighest ?? 0, reachedByNow) + 50
    if (value > ceiling && value <= last * 1.1) return choice(year - 1, "high-number")
  }
  return choice(year, input.ehrYears.includes(year) ? "ehr" : null)
}
