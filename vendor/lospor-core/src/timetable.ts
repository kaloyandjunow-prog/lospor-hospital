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
