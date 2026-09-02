/**
 * Working out how old the patient is, from what the hospital can actually tell
 * us.
 *
 * Three sources, in descending order of how much they can be trusted:
 *
 *   1. A date of birth — from the ЕГН, which encodes it in its first six
 *      digits. Exact, and correct at the moment the case is opened.
 *   2. A reported age in years, months and days, which is how Bulgarian
 *      hospital systems usually express it.
 *   3. A single number the hospital calls "age".
 *
 * The first is materially better than the other two and not for tidiness. A
 * transmitted age is stale from the instant it is written: a worklist entry
 * generated three weeks ago saying "5 days old" describes a neonate who is now
 * approaching a month, and dosing, equipment sizing and the neonate/infant
 * boundary all move underneath it. A date of birth does not go stale. So when
 * the ЕГН is available, the age is computed here rather than believed.
 *
 * Nothing in this module stores a date of birth. It exists to turn one into an
 * age at a moment in time and then be done with it — the age is what the record
 * keeps, exactly as when a clinician types it.
 */

import type { PediatricAgeUnit } from "./pediatric"

export type ResolvedAge = {
  value: number
  unit: PediatricAgeUnit
}

/**
 * Which unit an age is expressed in, following the bands the rest of the
 * product already uses (`pediatricAgeGroup`): under 28 days is a neonate, where
 * days are the unit that means anything; under two years the months carry the
 * clinical weight; after that, years.
 *
 * Picking the unit this way is what makes "3" unambiguous downstream — the
 * value and the unit only mean something together.
 */
function unitForDays(days: number, months: number): PediatricAgeUnit {
  if (days < 28) return "DAYS"
  if (months < 24) return "MONTHS"
  return "YEARS"
}

/** Whole months between two dates, not counting a month that has not completed. */
function completedMonths(from: Date, to: Date): number {
  const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12
    + (to.getUTCMonth() - from.getUTCMonth())
  return to.getUTCDate() < from.getUTCDate() ? months - 1 : months
}

/**
 * The patient's age at a given moment, from a date of birth.
 *
 * Calendar arithmetic rather than division by an average year, so a birthday is
 * a birthday and nobody turns 18 a day early at the boundary the clinical mode
 * check sits on.
 */
export function ageOn(birthDate: Date, asOf: Date = new Date()): ResolvedAge | null {
  const birth = Date.UTC(
    birthDate.getUTCFullYear(), birthDate.getUTCMonth(), birthDate.getUTCDate(),
  )
  const now = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())
  if (!Number.isFinite(birth) || !Number.isFinite(now) || now < birth) return null

  const days = Math.floor((now - birth) / 86_400_000)
  const months = completedMonths(new Date(birth), new Date(now))
  const unit = unitForDays(days, months)
  if (unit === "DAYS") return { value: days, unit }
  if (unit === "MONTHS") return { value: months, unit }
  return { value: Math.floor(months / 12), unit }
}

// ── ЕГН ──────────────────────────────────────────────────────────────────────

/**
 * The century lives in the month digits, which is the part that catches people
 * out: 01–12 is a birth in the 1900s, 21–32 shifts it back to the 1800s, and
 * 41–52 forward to the 2000s. A paediatric patient today is always in the third
 * range, so getting this wrong does not produce a slightly odd age — it
 * produces an adult, in a case that should be in paediatric mode.
 */
const EGN_CENTURY_OFFSETS = [
  { min: 41, max: 52, century: 2000, shift: 40 },
  { min: 21, max: 32, century: 1800, shift: 20 },
  { min: 1, max: 12, century: 1900, shift: 0 },
] as const

/** Positional weights for the ЕГН check digit. */
const EGN_WEIGHTS = [2, 4, 8, 5, 10, 9, 7, 3, 6]

/**
 * Does this ЕГН's check digit agree with the rest of it?
 *
 * Worth testing before believing the date inside. A mistyped ЕГН that still
 * parses as a date would silently hand back the wrong patient's age, and an age
 * is one of the few imported values that changes what the software itself does
 * — it decides the clinical mode, the dosing model and the equipment sizing.
 */
export function isValidEgnChecksum(egn: string): boolean {
  const digits = egn.trim()
  if (!/^\d{10}$/.test(digits)) return false
  const sum = EGN_WEIGHTS.reduce((total, weight, index) =>
    total + Number(digits[index]) * weight, 0)
  const expected = sum % 11
  return Number(digits[9]) === (expected === 10 ? 0 : expected)
}

/**
 * The date of birth encoded in the first six digits of an ЕГН.
 *
 * Returns null for anything that is not a well-formed, checksum-valid ЕГН
 * describing a real calendar date. Refusing is the only safe failure here: a
 * guess would become an age, and an age decides the clinical mode.
 */
export function egnBirthDate(egn: string): Date | null {
  const digits = egn.trim()
  if (!isValidEgnChecksum(digits)) return null

  const yy = Number(digits.slice(0, 2))
  const rawMonth = Number(digits.slice(2, 4))
  const day = Number(digits.slice(4, 6))

  const era = EGN_CENTURY_OFFSETS.find(e => rawMonth >= e.min && rawMonth <= e.max)
  if (!era) return null

  const month = rawMonth - era.shift
  const year = era.century + yy
  const date = new Date(Date.UTC(year, month - 1, day))

  // Rejects 31 February and friends: the constructor rolls them over rather
  // than failing, so the only way to catch one is to read the date back.
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null

  return date
}

/** The patient's age now, worked out from their ЕГН. */
export function ageFromEgn(egn: string, asOf: Date = new Date()): ResolvedAge | null {
  const birthDate = egnBirthDate(egn)
  return birthDate ? ageOn(birthDate, asOf) : null
}

// ── A reported age ───────────────────────────────────────────────────────────

/**
 * Collapse an age reported as years, months and days into one value and unit.
 *
 * Bulgarian hospital systems usually send all three, and the record keeps a
 * single value with a unit — so somebody has to decide which. Doing it here
 * means the three transports cannot each decide differently, which is the whole
 * reason the canonical format exists.
 *
 * The parts are summed rather than the largest one taken: a child reported as
 * "1 year 8 months" is 20 months, and rounding that to 1 year throws away the
 * part that matters most at that age.
 */
export function collapseReportedAge(parts: {
  years?: number | null
  months?: number | null
  days?: number | null
}): ResolvedAge | null {
  const years = finite(parts.years)
  const months = finite(parts.months)
  const days = finite(parts.days)
  if (years === null && months === null && days === null) return null

  const totalMonths = (years ?? 0) * 12 + (months ?? 0)
  const approximateDays = totalMonths * 30.44 + (days ?? 0)

  const unit = unitForDays(approximateDays, totalMonths)
  if (unit === "DAYS") return { value: Math.round(approximateDays), unit }
  if (unit === "MONTHS") return { value: totalMonths, unit }
  return { value: Math.floor(totalMonths / 12), unit }
}

function finite(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

/**
 * The age fields to propose, from whatever the hospital could supply.
 *
 * An ЕГН wins over a reported age whenever both are present, because it is the
 * one that is still true today. The result is a proposal like any other — it
 * goes to the review screen and is written only if the clinician accepts it,
 * and it never carries a clinical mode with it.
 */
export function ehrAgeProposal(input: {
  egn?: string | null
  years?: number | null
  months?: number | null
  days?: number | null
  asOf?: Date
}): { ageValue: number; ageUnit: PediatricAgeUnit; source: "egn" | "reported" } | null {
  const asOf = input.asOf ?? new Date()

  if (input.egn) {
    const derived = ageFromEgn(input.egn, asOf)
    if (derived) return { ageValue: derived.value, ageUnit: derived.unit, source: "egn" }
  }

  const reported = collapseReportedAge(input)
  return reported
    ? { ageValue: reported.value, ageUnit: reported.unit, source: "reported" }
    : null
}
