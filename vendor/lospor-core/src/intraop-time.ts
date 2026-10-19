export type IntraopStartTiming = {
  startTime: string
  startedAt: string
  timezone: string
}

export type IntraopEndTiming = {
  endTime: string
  endedAt: string
  timezone: string
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function partsInZone(instant: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant)

  const result: Record<string, number> = {}
  for (const part of parts) {
    if (part.type !== "literal") result[part.type] = Number(part.value)
  }
  return {
    year: result.year,
    month: result.month,
    day: result.day,
    hour: result.hour,
    minute: result.minute,
    second: result.second,
  }
}

function offsetMsAt(instant: Date, timeZone: string): number {
  const parts = partsInZone(instant, timeZone)
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  return asIfUtc - instant.getTime()
}

function addCalendarDays(
  date: { year: number; month: number; day: number },
  days: number,
): { year: number; month: number; day: number } {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days))
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

function instantFromCalendarTime(
  date: { year: number; month: number; day: number },
  hhmm: string,
  timeZone: string,
): Date | null {
  if (!HHMM.test(hhmm) || !isValidTimeZone(timeZone)) return null
  const [hour, minute] = hhmm.split(":").map(Number)
  const wallAsUtc = Date.UTC(date.year, date.month - 1, date.day, hour, minute)
  const firstPass = wallAsUtc - offsetMsAt(new Date(wallAsUtc), timeZone)
  const corrected = wallAsUtc - offsetMsAt(new Date(firstPass), timeZone)
  const instant = new Date(corrected)
  return Number.isNaN(instant.getTime()) ? null : instant
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value })
    return true
  } catch {
    return false
  }
}

export function resolvedTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return isValidTimeZone(zone) ? zone : null
  } catch {
    return null
  }
}

export function instantFromLocalTime(
  day: Date,
  hhmm: string,
  timeZone: string,
): Date | null {
  if (Number.isNaN(day.getTime()) || !isValidTimeZone(timeZone)) return null
  const parts = partsInZone(day, timeZone)
  return instantFromCalendarTime(parts, hhmm, timeZone)
}

export function localTimeOf(instant: Date, timeZone: string): string | null {
  if (Number.isNaN(instant.getTime()) || !isValidTimeZone(timeZone)) return null
  const parts = partsInZone(instant, timeZone)
  if (!Number.isFinite(parts.hour) || !Number.isFinite(parts.minute)) return null
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`
}

export function startInstantForWallClock(
  now: Date,
  hhmm: string,
  timeZone: string,
  futureToleranceMinutes = 5,
): Date | null {
  if (Number.isNaN(now.getTime()) || futureToleranceMinutes < 0) return null
  const candidate = instantFromLocalTime(now, hhmm, timeZone)
  if (!candidate) return null
  if (candidate.getTime() <= now.getTime() + futureToleranceMinutes * 60_000) {
    return candidate
  }

  const today = partsInZone(now, timeZone)
  return instantFromCalendarTime(addCalendarDays(today, -1), hhmm, timeZone)
}

/**
 * The end instant: the end clock time on the start's calendar date moved by
 * `dayOffset` days. A boolean is the older "next day" tick (true = 1 day).
 */
export function endInstantForWallClock(
  startedAt: Date,
  hhmm: string,
  timeZone: string,
  dayOffset: boolean | number,
): Date | null {
  if (Number.isNaN(startedAt.getTime()) || !isValidTimeZone(timeZone)) return null
  const days = typeof dayOffset === "boolean" ? (dayOffset ? 1 : 0) : dayOffset
  if (!Number.isInteger(days) || days < 0) return null
  const startDay = partsInZone(startedAt, timeZone)
  return instantFromCalendarTime(
    addCalendarDays(startDay, days),
    hhmm,
    timeZone,
  )
}

export function buildIntraopStartTiming(
  startedAt: Date,
  timeZone: string,
): IntraopStartTiming | null {
  const startTime = localTimeOf(startedAt, timeZone)
  if (!startTime) return null
  return {
    startTime,
    startedAt: startedAt.toISOString(),
    timezone: timeZone,
  }
}

export function buildIntraopEndTiming(
  endedAt: Date,
  timeZone: string,
): IntraopEndTiming | null {
  const endTime = localTimeOf(endedAt, timeZone)
  if (!endTime) return null
  return {
    endTime,
    endedAt: endedAt.toISOString(),
    timezone: timeZone,
  }
}

export function legacyWallClock(value: Date | null | undefined): string | null {
  if (!value || Number.isNaN(value.getTime())) return null
  return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`
}

export function durationMinutesBetween(
  start: Date | null,
  end: Date | null,
): number | null {
  if (!start || !end) return null
  const diff = Math.round((end.getTime() - start.getTime()) / 60_000)
  return diff >= 0 ? diff : null
}

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

function dateKeyParts(key: string): { year: number; month: number; day: number } | null {
  const match = DATE_KEY.exec(key)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
  return { year, month, day }
}

const pad = (value: number) => String(value).padStart(2, "0")
const keyOf = (date: { year: number; month: number; day: number }) => `${date.year}-${pad(date.month)}-${pad(date.day)}`

/**
 * The calendar date of an instant in the case's zone, as YYYY-MM-DD. The start
 * and end of surgery are stored as instants; this is the date a clinician sees
 * beside the time, never a UTC date (01:30 in Sofia is the previous day in UTC).
 */
export function localDateKey(instant: Date, timeZone: string): string | null {
  if (Number.isNaN(instant.getTime()) || !isValidTimeZone(timeZone)) return null
  return keyOf(partsInZone(instant, timeZone))
}

/** A calendar date moved by whole days. Days, not 24-hour steps: a clock change does not move it. */
export function shiftDateKey(key: string, days: number): string | null {
  const parts = dateKeyParts(key)
  return parts && Number.isInteger(days) ? keyOf(addCalendarDays(parts, days)) : null
}

/** Whole calendar days from one date to another (negative when `to` is earlier). */
export function daysBetweenDateKeys(from: string, to: string): number | null {
  const a = dateKeyParts(from)
  const b = dateKeyParts(to)
  if (!a || !b) return null
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000)
}

/**
 * The instant of a wall-clock time on a chosen calendar date in the case's
 * zone. Used when the clinician picked the date; a time typed without
 * touching the date keeps startInstantForWallClock's rules.
 */
export function instantFromDateKey(key: string, hhmm: string, timeZone: string): Date | null {
  const parts = dateKeyParts(key)
  return parts ? instantFromCalendarTime(parts, hhmm, timeZone) : null
}

/**
 * How many days after the start an end time falls when the clinician has not
 * said: the same day, or the next when the end clock time is earlier than the
 * start's. The rule the PWA's End case already used.
 */
export function defaultEndDayOffset(startedAt: Date, endHhmm: string, timeZone: string): number {
  const startHhmm = localTimeOf(startedAt, timeZone)
  return startHhmm != null && HHMM.test(endHhmm) && endHhmm < startHhmm ? 1 : 0
}

/** YYYY-MM of an instant in the case's zone: the case month, now taken from the start. */
export function monthYearOf(instant: Date, timeZone: string): string | null {
  const key = localDateKey(instant, timeZone)
  return key ? key.slice(0, 7) : null
}

/**
 * How the day stepper names a date: "today", "yesterday", "tomorrow", or the
 * date itself as weekday and day.month ("Thu 16.10" / "чт 16.10"). Formatted
 * in UTC from the date key, so the device's own zone cannot shift it.
 */
export function dayStepLabel(
  key: string,
  todayKey: string,
  locale: "en" | "bg",
): { kind: "today" | "yesterday" | "tomorrow" | "date"; text: string } {
  const days = daysBetweenDateKeys(todayKey, key)
  const words = locale === "bg"
    ? { today: "Днес", yesterday: "Вчера", tomorrow: "Утре" }
    : { today: "Today", yesterday: "Yesterday", tomorrow: "Tomorrow" }
  if (days === 0) return { kind: "today", text: words.today }
  if (days === -1) return { kind: "yesterday", text: words.yesterday }
  if (days === 1) return { kind: "tomorrow", text: words.tomorrow }
  return { kind: "date", text: formatDateKeyShort(key, locale) ?? key }
}

/** "Thu 16.10" / "чт 16.10" from a date key. */
export function formatDateKeyShort(key: string, locale: "en" | "bg"): string | null {
  const parts = dateKeyParts(key)
  if (!parts) return null
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  const weekday = new Intl.DateTimeFormat(locale === "bg" ? "bg-BG" : "en-GB", { weekday: "short", timeZone: "UTC" }).format(date)
  return `${weekday} ${pad(parts.day)}.${pad(parts.month)}`
}

/**
 * The earliest date the end may be put on: the start's date, or the next day
 * when the end clock time is not after the start's -- so the end stepper can
 * never place the end before the start.
 */
export function earliestEndDateKey(startedAt: Date, endHhmm: string, timeZone: string): string | null {
  const startKey = localDateKey(startedAt, timeZone)
  const startHhmm = localTimeOf(startedAt, timeZone)
  if (!startKey || !startHhmm || !HHMM.test(endHhmm)) return startKey
  return endHhmm <= startHhmm ? shiftDateKey(startKey, 1) : startKey
}

const MONTHS_SHORT_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "16 Oct 2026" / "16.10.2026" from a date key: the date of a record. */
export function formatDateKeyLong(key: string, locale: "en" | "bg"): string | null {
  const parts = dateKeyParts(key)
  if (!parts) return null
  return locale === "bg"
    ? `${pad(parts.day)}.${pad(parts.month)}.${parts.year}`
    : `${pad(parts.day)} ${MONTHS_SHORT_EN[parts.month - 1]} ${parts.year}`
}

/** Calendar days from the start's date to the end's, in the case's zone. */
export function endDayOffsetBetween(startedAt: Date, endedAt: Date, timeZone: string): number | null {
  const startKey = localDateKey(startedAt, timeZone)
  const endKey = localDateKey(endedAt, timeZone)
  return startKey && endKey ? daysBetweenDateKeys(startKey, endKey) : null
}

/** "+1 day" / "+1 ден" beside an end on a later date; null on the same day. */
export function endDayOffsetLabel(offset: number | null | undefined, locale: "en" | "bg"): string | null {
  if (!offset || offset <= 0) return null
  if (locale === "bg") return `+${offset} ${offset === 1 ? "ден" : "дни"}`
  return `+${offset} ${offset === 1 ? "day" : "days"}`
}
