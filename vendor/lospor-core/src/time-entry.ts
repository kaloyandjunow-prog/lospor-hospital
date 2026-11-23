import { instantFromDateKey, localDateKey, shiftDateKey } from "./intraop-time"

/**
 * The one way to enter a time and a date (10.8.0), shared by the web app and
 * the PWA: two looping wheels for the time (hours 00-23, minutes 00-59) and
 * three for the date (day 1-31 following the month, month 1-12, year
 * 2000-2100). On the web the time can also be typed: 1024 is 10:24.
 */

export const TIME_WHEEL = Object.freeze({ hours: 24, minutes: 60 })
export const DATE_WHEEL = Object.freeze({ minYear: 2000, maxYear: 2100 })

export type ClockTime = { hour: number; minute: number }
export type CalendarDate = { year: number; month: number; day: number }

/** A wheel that loops: one step past the last value is the first. */
export function wrapWheel(value: number, size: number): number {
  return ((Math.round(value) % size) + size) % size
}

/**
 * A typed time, digits only or with a separator: "1024", "10:24", "10.24",
 * "924" (9:24), "9" (09:00), "09" (09:00). Anything that is not a time is null.
 */
export function parseTypedTime(input: string): ClockTime | null {
  const text = input.trim()
  if (!text) return null
  const separated = text.match(/^(\d{1,2})\s*[:.,h ]\s*(\d{1,2})$/)
  let hour: number
  let minute: number
  if (separated) {
    hour = Number(separated[1])
    minute = Number(separated[2])
  } else if (/^\d{1,4}$/.test(text)) {
    if (text.length <= 2) {
      hour = Number(text)
      minute = 0
    } else {
      hour = Number(text.slice(0, text.length - 2))
      minute = Number(text.slice(-2))
    }
  } else {
    return null
  }
  if (hour > 23 || minute > 59) return null
  return { hour, minute }
}

/** HH:MM with leading zeros. */
export function formatClockTime(time: ClockTime): string {
  return `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`
}

/** What typing has produced so far, for the field while the user types ("10" → "10", "102" → "1:02", "1024" → "10:24"). */
export function typedTimeProgress(digits: string): string {
  const only = digits.replace(/\D/g, "").slice(0, 4)
  if (only.length <= 2) return only
  return `${only.slice(0, only.length - 2)}:${only.slice(-2)}`
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** Days in a month (1-12). */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

/** The date with its day kept within its month: 31 February becomes 28 or 29. */
export function clampCalendarDate(date: CalendarDate): CalendarDate {
  const year = Math.min(DATE_WHEEL.maxYear, Math.max(DATE_WHEEL.minYear, Math.round(date.year)))
  const month = Math.min(12, Math.max(1, Math.round(date.month)))
  const day = Math.min(daysInMonth(year, month), Math.max(1, Math.round(date.day)))
  return { year, month, day }
}

/** YYYY-MM-DD for a calendar date. */
export function calendarDateKey(date: CalendarDate): string {
  const clamped = clampCalendarDate(date)
  return `${clamped.year}-${String(clamped.month).padStart(2, "0")}-${String(clamped.day).padStart(2, "0")}`
}

/** A calendar date from YYYY-MM-DD; null when it is not one. */
export function parseCalendarDateKey(key: string | null | undefined): CalendarDate | null {
  const match = key?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
  const clamped = clampCalendarDate(date)
  return clamped.day === date.day && clamped.month === date.month && clamped.year === date.year ? date : null
}

/**
 * The instant a time of day means inside a case: on the day it falls within
 * the case. A case that started at 23:20 and a time of 00:15 means the next
 * day. With no case bounds, the day of the reference instant.
 */
export function instantForTimeInCase(
  time: ClockTime,
  options: {
    timeZone: string
    /** The instant the wheel opened at (the item's own time, or now). */
    reference: Date
    startedAt?: Date | null
    endedAt?: Date | null
  },
): Date | null {
  const hhmm = formatClockTime(time)
  const referenceKey = localDateKey(options.reference, options.timeZone)
  if (!referenceKey) return null
  const candidates = [-1, 0, 1]
    .map(offset => shiftDateKey(referenceKey, offset))
    .map(key => (key ? instantFromDateKey(key, hhmm, options.timeZone) : null))
    .filter((instant): instant is Date => instant !== null)
  const startMs = options.startedAt?.getTime() ?? -Infinity
  const endMs = options.endedAt?.getTime() ?? Infinity
  const inside = candidates.filter(instant => instant.getTime() >= startMs && instant.getTime() <= endMs)
  const pool = inside.length > 0 ? inside : candidates
  const refMs = options.reference.getTime()
  return pool.reduce((best, instant) => (Math.abs(instant.getTime() - refMs) < Math.abs(best.getTime() - refMs) ? instant : best))
}
