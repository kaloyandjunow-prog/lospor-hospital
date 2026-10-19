import { hhmmFromStoredTime } from "./intraop-projection"
import { monthYearForDate } from "@lospor/core/intraop"
import {
  instantFromDateKey,
  localDateKey,
  localTimeOf,
  startInstantForWallClock,
  type IntraopEndTiming,
  type IntraopStartTiming,
} from "@lospor/core/intraop-time"

export type IntraopTimingOverrides = {
  startTime?: IntraopStartTiming["startTime"]
  startedAt?: IntraopStartTiming["startedAt"] | null
  endTime?: IntraopEndTiming["endTime"]
  endedAt?: IntraopEndTiming["endedAt"] | null
  timezone?: string
  endTimeNextDay?: boolean
  /** The case month, taken from the start date. */
  monthYear?: string
  /** A start date the clinician stepped to (YYYY-MM-DD); absent = today's rule. */
  startDayKey?: string
  /** Days from the start's date to the end's, when the clinician stepped it. */
  endDayOffset?: number
}

/**
 * The start instant for a typed time, from the Time tab or the Start at sheet.
 * Left at today (or no day), a time ahead of now means yesterday, as always; a
 * stepped day places the time on that day. Web's applyStartWallClock does the same.
 */
export function startInstantForEntry(now: Date, hhmm: string, dayKey: string | null | undefined, timeZone: string): Date | null {
  return dayKey && dayKey !== localDateKey(now, timeZone)
    ? instantFromDateKey(dayKey, hhmm, timeZone)
    : startInstantForWallClock(now, hhmm, timeZone)
}

/** The Start at sheet's day: today until stepped; stepping back to today clears it, so a time ahead of now means yesterday again. */
export function startAtDayProps(dayKey: string | null, todayKey: string, setDayKey: (key: string | null) => void) {
  return {
    dayKey: dayKey ?? todayKey,
    todayKey,
    onDayChange: (key: string) => setDayKey(key === todayKey ? null : key),
  }
}

// Re-exported: the stored format is core's, shared with web.
export { monthYearForDate }

export function normalizeLoadedIntraopTiming(
  intraop: {
    monthYear?: unknown
    startTime?: unknown
    endTime?: unknown
    endTimeNextDay?: unknown
    startedAt?: unknown
    endedAt?: unknown
    timezone?: unknown
  } | null | undefined,
  now = new Date(),
): {
  monthYear: string
  startTime: string | null
  endTime: string | null
  endTimeNextDay: boolean | null
  startedAt: string | null
  endedAt: string | null
  timezone: string | null
} {
  const timezone = typeof intraop?.timezone === "string" ? intraop.timezone : null
  const startedAt = typeof intraop?.startedAt === "string" ? intraop.startedAt : null
  const endedAt = typeof intraop?.endedAt === "string" ? intraop.endedAt : null
  const startInstant = startedAt ? new Date(startedAt) : null
  const endInstant = endedAt ? new Date(endedAt) : null
  return {
    monthYear: typeof intraop?.monthYear === "string" && intraop.monthYear
      ? intraop.monthYear
      : monthYearForDate(now),
    startTime: timezone && startInstant && !Number.isNaN(startInstant.getTime())
      ? localTimeOf(startInstant, timezone)
      : hhmmFromStoredTime(intraop?.startTime),
    endTime: timezone && endInstant && !Number.isNaN(endInstant.getTime())
      ? localTimeOf(endInstant, timezone)
      : hhmmFromStoredTime(intraop?.endTime),
    endTimeNextDay: intraop?.endTimeNextDay != null ? !!intraop.endTimeNextDay : null,
    startedAt,
    endedAt,
    timezone,
  }
}

export function buildIntraopTimingPatch(
  current: {
    monthYear: string
    startTime: string
    endTime: string
    endTimeNextDay: boolean
    startedAt?: string | null
    endedAt?: string | null
    timezone?: string | null
  },
  overrides: IntraopTimingOverrides = {},
): Record<string, string | boolean | null> {
  const patch: Record<string, string | boolean | null> = {
    monthYear: (overrides.monthYear ?? current.monthYear) || null,
    startTime: (overrides?.startTime ?? current.startTime) || null,
    endTime: (overrides?.endTime ?? current.endTime) || null,
    endTimeNextDay: overrides.endTimeNextDay ?? current.endTimeNextDay,
  }
  const startedAt = "startedAt" in overrides ? overrides.startedAt : current.startedAt
  const endedAt = "endedAt" in overrides ? overrides.endedAt : current.endedAt
  const timezone = "timezone" in overrides ? overrides.timezone : current.timezone
  if (startedAt !== undefined) patch.startedAt = startedAt
  if (endedAt !== undefined) patch.endedAt = endedAt
  if (timezone !== undefined) patch.timezone = timezone
  return patch
}

export function promoteDraftCaseToInProgress<T extends { status?: string }>(caseInfo: T | null): T | null {
  return caseInfo && caseInfo.status === "DRAFT" ? { ...caseInfo, status: "IN_PROGRESS" } : caseInfo
}
