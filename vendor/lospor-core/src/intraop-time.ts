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

export function endInstantForWallClock(
  startedAt: Date,
  hhmm: string,
  timeZone: string,
  nextDay: boolean,
): Date | null {
  if (Number.isNaN(startedAt.getTime()) || !isValidTimeZone(timeZone)) return null
  const startDay = partsInZone(startedAt, timeZone)
  return instantFromCalendarTime(
    addCalendarDays(startDay, nextDay ? 1 : 0),
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
