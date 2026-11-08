import { useState } from "react"
import { instantFromDateKey, isValidTimeZone, localDateKey, localTimeOf, resolvedTimeZone } from "@lospor/core/intraop-time"
import { serverNow } from "@/lib/server-clock"

export type EndCaseTimeError = "before_start" | "future" | "invalid"

/**
 * The end the End case sheet records (10.1.0): now, or a time chosen the way
 * Start at chooses one -- a day and a clock time -- so a case charted after
 * the fact ends when it really ended. Never before the start, never in the
 * future: there is no planned end.
 */
export function endCaseInstant(input: {
  mode: "now" | "at"
  dayKey: string
  hhmm: string
  startedAt: Date | null
  timeZone: string | null
  now: Date
}): { endTs: string | null; error: EndCaseTimeError | null } {
  if (input.mode === "now") return { endTs: input.now.toISOString(), error: null }
  const zone = input.timeZone && isValidTimeZone(input.timeZone) ? input.timeZone : null
  if (!zone || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.hhmm)) return { endTs: null, error: "invalid" }
  const end = instantFromDateKey(input.dayKey, input.hhmm, zone)
  if (!end) return { endTs: null, error: "invalid" }
  if (input.startedAt && end.getTime() < input.startedAt.getTime()) return { endTs: null, error: "before_start" }
  // A minute of grace: "now" typed as a clock time is not the future.
  if (end.getTime() > input.now.getTime() + 60_000) return { endTs: null, error: "future" }
  return { endTs: end.toISOString(), error: null }
}

export function useEndCaseTime(startedAt: Date | null, timeZone: string | null) {
  const zone = timeZone && isValidTimeZone(timeZone) ? timeZone : resolvedTimeZone()
  const now = serverNow()
  const todayKey = (zone && localDateKey(now, zone)) ?? now.toISOString().slice(0, 10)
  const startKey = startedAt && zone ? localDateKey(startedAt, zone) : null
  const [mode, setMode] = useState<"now" | "at">("now")
  const [dayKey, setDayKey] = useState(todayKey)
  const [hhmm, setHhmm] = useState(() => (zone && localTimeOf(now, zone)) ?? "")
  const result = endCaseInstant({ mode, dayKey, hhmm, startedAt, timeZone: zone, now })
  return { mode, setMode, dayKey, setDayKey, hhmm, setHhmm, todayKey, startKey, ...result }
}
