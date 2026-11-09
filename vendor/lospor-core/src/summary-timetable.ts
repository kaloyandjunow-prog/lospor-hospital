import { INTRAOP_COLUMN_MINUTES } from "./intraop-engine"
import { eventClockTimes } from "./intraop-summary"

// Column times of the projected chart (the legacy wall-clock convention) and the numbered drug log. The
// summary, the web and the print draw the chart from `record-timetable`; what is left here is the two
// time helpers the record's time tests and its fallback still use.

type ProjectedDrug = { eventId?: string; colIdx?: number; name?: string; dose?: string; unit?: string }

export function colToHHMM(col: number, startISO?: string | null): string {
  if (!startISO) return `+${col * INTRAOP_COLUMN_MINUTES}m`
  const d = new Date(startISO)
  // DB times are UTC-encoded wall-clock; UTC getters recover the entered time.
  // Column 0 is the five-minute row the start falls in, so the labels count
  // from there: a 14:43 start labelled its rows 14:43, 14:48... while they
  // held 14:40-14:45, 14:45-14:50 (9.13.0).
  const startMins = d.getUTCHours() * 60 + d.getUTCMinutes()
  const mins = startMins - (startMins % INTRAOP_COLUMN_MINUTES) + col * INTRAOP_COLUMN_MINUTES
  return `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`
}

// Numbered drug administration log, sorted by column.
export type DrugLogEntry = { n: number; col: number; time: string; name: string; dose: string }
/**
 * The numbered log. With the case's time zone each dose is timed from its own
 * event, to the minute; without one (or for a dose with no event) from its
 * row. A dose given at 14:50 printed as its row's label before 9.13.0.
 */
export function buildDrugLogEntries(kev: unknown, startISO?: string | null, timeZone?: string | null): DrugLogEntry[] {
  const t = (kev && typeof kev === "object" && !Array.isArray(kev) ? kev : {}) as { drugs?: ProjectedDrug[] }
  const drugs = Array.isArray(t.drugs) ? t.drugs : []
  const log = (kev as { log?: unknown } | null)?.log
  const exact = eventClockTimes(Array.isArray(log) ? log : [], timeZone)
  return drugs
    .slice()
    .sort((a, b) => (a.colIdx ?? 0) - (b.colIdx ?? 0))
    .map((d, i) => ({
      n: i + 1,
      col: d.colIdx ?? 0,
      time: (d.eventId ? exact.get(d.eventId) : undefined) ?? colToHHMM(d.colIdx ?? 0, startISO),
      name: String(d.name ?? ""),
      dose: `${d.dose ?? ""} ${d.unit ?? ""}`.trim(),
    }))
}
