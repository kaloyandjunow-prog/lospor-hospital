/**
 * The ИЗ № year choice, as the PWA shows it (hospital 1.9.2); the web keeps the same rules. The rule
 * and the suggestion are the API's (`/api/hospital/iz-year`); this only knows
 * when to ask, so nothing is fetched for ten months of the year.
 */
export const IZ_YEAR_CHOICE_DAYS = 60

export type IzYearReason = "earlier-case" | "ehr" | "high-number"
export type IzYearChoice = { open: boolean; years: number[]; suggestedYear: number; reason: IzYearReason | null }

function sofiaDate(at: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at)
  const part = (type: string) => Number(parts.find(item => item.type === type)?.value)
  return { year: part("year"), month: part("month"), day: part("day") }
}

export function departmentYear(at: Date = new Date()): number {
  return sofiaDate(at).year
}

/** Whether the year can still be last year's: the first 60 days in Sofia. */
export function izYearChoiceOpen(at: Date = new Date()): boolean {
  const { year, month, day } = sofiaDate(at)
  return (Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86_400_000 < IZ_YEAR_CHOICE_DAYS
}

export function readIzYearChoice(body: unknown): IzYearChoice | null {
  if (!body || typeof body !== "object") return null
  const value = body as Record<string, unknown>
  if (typeof value.open !== "boolean" || typeof value.suggestedYear !== "number" || !Array.isArray(value.years)) return null
  const years = value.years.filter((year): year is number => typeof year === "number")
  const reason = value.reason === "earlier-case" || value.reason === "ehr" || value.reason === "high-number" ? value.reason : null
  return { open: value.open, years, suggestedYear: value.suggestedYear, reason }
}

/** The line under the choice: what the pre-set year rests on. */
export function izYearHint(choice: Pick<IzYearChoice, "reason" | "suggestedYear"> | null, locale: "bg" | "en"): string {
  const year = choice?.suggestedYear
  const bg = locale === "bg"
  switch (choice?.reason) {
    case "earlier-case":
      return bg ? `Вече има случай с този номер от ${year} г.` : `A case with this number from ${year} already exists.`
    case "ehr":
      return bg ? `Болничната система има данни за този номер от ${year} г.` : `The hospital system holds data for this number from ${year}.`
    case "high-number":
      return bg
        ? `Номерът на ИЗ е много по-голям от този, достигнат през тази година. Вероятно е от ${year} г.`
        : `The record number is much higher than any reached this year. It is probably from ${year}.`
    default:
      return bg ? "Номерата на ИЗ започват от 1 всяка година." : "Record numbers start from 1 every year."
  }
}
