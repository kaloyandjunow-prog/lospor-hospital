export function addMinutes(hhmm: string, min: number): string {
  const [h, m] = (hhmm || "00:00").split(":").map(Number)
  const t = (h * 60 + m + min + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`
}

export function floorTo5(hhmm: string): string {
  const [h, m] = (hhmm || "00:00").split(":").map(Number)
  return `${String(h).padStart(2, "0")}:${String(
    Math.floor(m / INTRAOP_COLUMN_MINUTES) * INTRAOP_COLUMN_MINUTES,
  ).padStart(2, "0")}`
}

export function timeToMins(hhmm: string): number {
  const [h, m] = (hhmm || "00:00").split(":").map(Number)
  return h * 60 + m
}

export function toHHMM(t: string): string {
  if (/^\d{2}:\d{2}$/.test(t)) return t
  try {
    const d = new Date(t)
    if (!isNaN(d.getTime())) return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`
  } catch {
    // fall through
  }
  return t
}

export function calcDuration(start: string, end: string | undefined, cols: number): string {
  if (end) {
    const s = toHHMM(start)
    const e = toHHMM(end)
    const [sh, sm] = s.split(":").map(Number)
    const [eh, em] = e.split(":").map(Number)
    let diff = eh * 60 + em - (sh * 60 + sm)
    if (diff < 0) diff += 1440
    const h = Math.floor(diff / 60)
    const mn = diff % 60
    return h > 0 ? `${h}h ${mn}min` : `${mn}min`
  }
  const total = cols * INTRAOP_COLUMN_MINUTES
  const h = Math.floor(total / 60)
  const mn = total % 60
  return h > 0 ? `${h}h ${mn}min` : `${mn}min`
}

export type LaneItem = { startCol: number; endCol: number }

export function packLaneRows<T extends LaneItem>(items: T[]): T[][] {
  const sorted = [...items].sort((a, b) => a.startCol - b.startCol)
  const lanes: T[][] = []
  for (const item of sorted) {
    let placed = false
    for (const lane of lanes) {
      if (!lane.some(existing => !(item.endCol < existing.startCol || item.startCol > existing.endCol))) {
        lane.push(item)
        placed = true
        break
      }
    }
    if (!placed) lanes.push([item])
  }
  return lanes
}
import { INTRAOP_COLUMN_MINUTES } from "./intraop-engine"

/**
 * The chart column a wall-clock time falls in.
 *
 * Used when an anaesthetist records something that happened earlier — the pump
 * was turned down at 14:20, entered at 14:35 — so the entry lands against the
 * time it happened rather than the time it was typed.
 *
 * Two things make it worth having on its own. Night lists cross midnight, and a
 * naive subtraction gives a negative offset that would place the entry before
 * the start of the case. And a time after the end of the chart has to clamp to
 * the last column rather than index past it.
 */
export function columnForWallClock({
  time,
  caseStart,
  intervalMinutes,
  columnCount,
}: {
  /** "HH:MM" the entry happened at. */
  time: string
  /** "HH:MM" the case started at. */
  caseStart: string
  intervalMinutes: number
  columnCount: number
}): number {
  const startMinutes = timeToMins(floorTo5(caseStart || "08:00"))
  const changeMinutes = timeToMins(time)

  // Wrap forward over midnight rather than going negative: a case starting at
  // 23:00 and a change at 00:30 is ninety minutes in, not a day back.
  const elapsed = (changeMinutes - startMinutes + 1440) % 1440

  return Math.min(Math.floor(elapsed / intervalMinutes), columnCount - 1)
}
