import { roundDownToIntraopColumn } from "@lospor/core/intraop-engine"
import { floorTo5, timeToMins } from "@/lib/timetable-time"

// How long after its start time a case may still be running and still be read
// as having crossed midnight. Used to tell a genuine overnight case apart from
// a start time typed in the future — see resolveStartAnchor.
export const MAX_OVERNIGHT_ELAPSED_SECS = 12 * 3600

/**
 * Resolve the wall-clock moment that column 0 of the timetable anchors to.
 * Returns `null` when the start time is in the future — i.e. the case has not
 * begun, so there is no "now" on the chart yet.
 *
 * The intraop form stores the start as a bare "HH:MM" with no date, so a start
 * time later than the current clock reading is ambiguous. It could mean:
 *
 *   a) the case began yesterday evening and has crossed midnight, or
 *   b) the user typed a start time in the future (planned start, or a typo).
 *
 * We read it as (a) only when the implied elapsed time is short enough for a
 * case that is plausibly still running; beyond that, (b) is far more likely.
 *
 * This is not cosmetic. Reading a start an hour ahead as "≈23 hours elapsed"
 * walked the now-marker forward, grew the timetable by an hour on every tick,
 * dragged live infusion/agent bars along with it, and — via the vitals
 * backfill — could write hours of fabricated observations into the record.
 */
export function resolveStartAnchor(startHHMM: string | undefined, now: Date): number | null {
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  const startMs = midnight.getTime() + timeToMins(floorTo5(startHHMM || "08:00")) * 60_000

  if (startMs <= now.getTime()) return startMs
  const wrappedMs = startMs - 24 * 3600_000
  return now.getTime() - wrappedMs <= MAX_OVERNIGHT_ELAPSED_SECS * 1000 ? wrappedMs : null
}

/** Seconds elapsed since the case started, or `null` if it hasn't started. */
export function elapsedSecsSinceStart(startHHMM: string | undefined, now: Date): number | null {
  const anchor = resolveStartAnchor(startHHMM, now)
  if (anchor === null) return null
  return Math.max(0, Math.floor((now.getTime() - anchor) / 1000))
}

/**
 * The instant column 0 begins: the case start floored to the 5-minute column
 * grid, exactly as the column labels are.
 *
 * The now-marker must be measured from this, not from the raw start. A case
 * started at 22:37 sits in the 22:35–22:40 column, so measuring the marker from
 * 22:37 put its zero on the 22:35 gridline and left it up to 4:59 early for the
 * whole case. The same origin also drives which column back-filled vitals land
 * in, so the two must never diverge.
 *
 * Floors through core's `roundDownToIntraopColumn` so web and mobile agree.
 */
export function gridOriginMs(startedAtMs: number | null): number | null {
  if (startedAtMs === null || !Number.isFinite(startedAtMs)) return null
  return roundDownToIntraopColumn(new Date(startedAtMs)).getTime()
}

/**
 * Seconds from the grid origin to `now` — what the now-marker offset is drawn
 * from. Null when the case has not begun.
 */
export function secondsFromGridOrigin(startedAtMs: number | null, now: Date): number | null {
  const origin = gridOriginMs(startedAtMs)
  if (origin === null) return null
  const diff = Math.floor((now.getTime() - origin) / 1000)
  return diff < 0 ? null : diff
}
