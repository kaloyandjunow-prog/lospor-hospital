import { format } from "date-fns"

// Dates and durations on the printed record, in the record's language.
//
// The sheet printed "September 2026", "0h 31m" and "Generated 27 Sep 2026" in
// English on a Bulgarian record (9.12.3). Units stay canonical ("mL", "mcg")
// in both languages; only words are translated.

const MONTHS = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  bg: ["Януари", "Февруари", "Март", "Април", "Май", "Юни", "Юли", "Август", "Септември", "Октомври", "Ноември", "Декември"],
}

function language(locale: string): "en" | "bg" {
  return locale === "bg" ? "bg" : "en"
}

/** "2026-09" → "September 2026" / "Септември 2026". */
export function printMonthYear(monthYear: string | null | undefined, locale: string): string {
  if (!monthYear) return ""
  const [year, month] = monthYear.split("-")
  return `${MONTHS[language(locale)][parseInt(month, 10) - 1] ?? ""} ${year}`
}

/** "0h 31m" / "0 ч 31 мин". */
export function printDuration(minutes: number, locale: string): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return language(locale) === "bg"
    ? `${hours} ч ${rest} мин`
    : `${hours}h ${String(rest).padStart(2, "0")}m`
}

/**
 * "08:05 → 09:40 · 1h 35m". Stored times are UTC-encoded wall clock; UTC
 * getters recover the entered time (the timetable's colToHHMM convention).
 */
export function printTimeSpan(
  startTime: string | Date | null | undefined,
  endTime: string | Date | null | undefined,
  locale: string,
): string | null {
  if (!startTime || !endTime) return null
  const start = new Date(startTime), end = new Date(endTime)
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000)
  const hhmm = (date: Date) => `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`
  return `${hhmm(start)} → ${hhmm(end)} · ${printDuration(minutes, locale)}`
}

const MONTHS_SHORT_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/**
 * "27 Sep 2026" / "27.09.2026", the date form each language writes, on the
 * case's own calendar. The page is first drawn on the server, which runs at
 * GMT+1: without the case's zone, a record printed just after midnight in
 * Sofia carried the previous day (9.13.0).
 */
export function printGeneratedDate(date: Date, locale: string, timeZone?: string | null): string {
  const parts = timeZone ? zonedDateParts(date, timeZone) : null
  if (!parts) return format(date, language(locale) === "bg" ? "dd.MM.yyyy" : "dd MMM yyyy")
  return language(locale) === "bg"
    ? `${parts.day}.${parts.month}.${parts.year}`
    : `${parts.day} ${MONTHS_SHORT_EN[Number(parts.month) - 1]} ${parts.year}`
}

function zonedDateParts(date: Date, timeZone: string): { day: string; month: string; year: string } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(date)
    const of = (type: string) => parts.find(part => part.type === type)?.value ?? ""
    return { day: of("day"), month: of("month"), year: of("year") }
  } catch {
    return null
  }
}
