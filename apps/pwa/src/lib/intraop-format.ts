// Pure formatting helpers for the intraop timeline.

export function formatTs(ts: string): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export function formatHHMM(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

export function caseStartDateForHHMM(hhmm: string, now = new Date()): Date | null {
  const [hours, minutes] = hhmm.split(":").map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  const date = new Date(now)
  date.setHours(hours, minutes, 0, 0)
  if (date.getTime() > now.getTime()) date.setDate(date.getDate() - 1)
  return date
}

export function fmtElapsed(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// Up/down arrow when a value moved by >=5 units vs the previous reading.
export function trendArrow(cur?: number, prev?: number): string {
  if (cur == null || prev == null || Math.abs(cur - prev) < 5) return ""
  return cur > prev ? " ↑" : " ↓"
}
