import type { TimetableData } from "@/components/IntraopTimetable"
import type { LogEvent } from "@/lib/intraop-log-event"
import {
  INTRAOP_COLUMN_MS,
  intraopColumnForInstant,
  intraopInstantForColumn,
  projectIntraopEvents,
  reverseProjectIntraop,
  roundDownToIntraopColumn,
} from "@lospor/core/intraop-engine"
import { parseLegacyKeyEvents } from "@lospor/core/intraop-types"

// Mobile keeps its newest-first log convention at this adapter boundary.
// Core owns the clinical projection itself and sorts events deterministically.
export function eventsToTimetable(
  log: LogEvent[],
  startTs: Date,
  now?: Date,
): TimetableData {
  const projected = projectIntraopEvents(log, {
    start: startTs,
    openThrough: now,
  })
  return {
    ...projected,
    infusions: projected.infusions.map(infusion => ({
      ...infusion,
      rate: String(infusion.rate),
      rateChanges: infusion.rateChanges?.map(change => ({
        ...change,
        rate: String(change.rate),
      })),
    })),
  }
}

export function eventCol(ev: LogEvent, startTs: Date): number {
  return intraopColumnForInstant(ev.ts, startTs)
}

export function computeVerticalTimetableWindow(
  log: LogEvent[],
  timetable: TimetableData,
  chartStart: Date,
  now = new Date(),
): {
  currentCol: number
  nowSlotPercent: number
  eventRows: Record<number, LogEvent[]>
  lastEventCol: number
  chartRows: number[]
} {
  const currentCol = Math.max(
    0,
    Math.floor((now.getTime() - chartStart.getTime()) / INTRAOP_COLUMN_MS),
  )
  const nowSlotPercent = Math.max(
    3,
    Math.min(
      97,
      (((now.getTime() - chartStart.getTime()) % INTRAOP_COLUMN_MS)
        / INTRAOP_COLUMN_MS) * 100,
    ),
  )
  const eventRows = log.reduce<Record<number, LogEvent[]>>((acc, ev) => {
    const col = eventCol(ev, chartStart)
    if (!acc[col]) acc[col] = []
    acc[col].push(ev)
    return acc
  }, {})
  const lastEventCol = Math.max(0, ...log.map(ev => eventCol(ev, chartStart)))
  const maxProjectedCol = Math.max(
    currentCol + 6,
    lastEventCol + 6,
    ...timetable.infusions.map(infusion => infusion.endCol + 1),
    ...timetable.fluids.map(fluid => fluid.endCol + 1),
    ...timetable.agents.map(agent => agent.endCol + 1),
  )
  const chartRows = Array.from(
    { length: Math.max(12, maxProjectedCol + 1) },
    (_, col) => col,
  )
  return {
    currentCol,
    nowSlotPercent,
    eventRows,
    lastEventCol,
    chartRows,
  }
}

export function loadedTimetableStateFromLog(
  log: LogEvent[],
  now = new Date(),
  trustedStart: Date | null = null,
): {
  startDate: Date | null
  elapsedMs: number
  timetable: TimetableData | null
  columnCount: number
} {
  if (log.length === 0 && !trustedStart) {
    return {
      startDate: null,
      elapsedMs: 0,
      timetable: null,
      columnCount: 12,
    }
  }
  const oldestTimestamp = log.length > 0
    ? Math.min(...log.map(event => new Date(event.ts).getTime()))
    : null
  const startDate = trustedStart ?? new Date(oldestTimestamp!)
  const roundedStart = roundDown5Min(startDate)
  const elapsedMs = Math.max(0, now.getTime() - startDate.getTime())
  return {
    startDate,
    elapsedMs,
    timetable: log.length > 0 ? eventsToTimetable(log, roundedStart, now) : null,
    columnCount: Math.max(
      12,
      Math.ceil(Math.max(0, now.getTime() - roundedStart.getTime()) / INTRAOP_COLUMN_MS) + 12,
    ),
  }
}

export function loadedTimetableStateFromLegacySnapshot(value: unknown): {
  startDate: null
  elapsedMs: 0
  timetable: TimetableData
  columnCount: number
} | null {
  const parsed = parseLegacyKeyEvents(value)
  const timetable: TimetableData = {
    vitals: parsed.vitals ?? [],
    drugs: parsed.drugs ?? [],
    fluids: parsed.fluids ?? [],
    infusions: parsed.infusions ?? [],
    agents: parsed.agents ?? [],
    gasSettings: parsed.gasSettings ?? [],
    clinicalEvents: parsed.clinicalEvents ?? [],
    positions: parsed.positions ?? [],
    phases: parsed.phases ?? [],
  }
  const columns = [
    timetable.vitals.length,
    ...timetable.drugs.map(item => item.colIdx + 1),
    ...timetable.fluids.map(item => item.endCol + 1),
    ...timetable.infusions.map(item => item.endCol + 1),
    ...timetable.agents.map(item => item.endCol + 1),
    ...(timetable.gasSettings ?? []).map(item => item.endCol + 1),
    ...(timetable.clinicalEvents ?? []).map(item => item.colIdx + 1),
    ...(timetable.positions ?? []).map(item => item.startCol + 1),
    ...(timetable.phases ?? []).map(item => item.startCol + 1),
  ]
  if (Math.max(...columns) === 0) return null
  return {
    startDate: null,
    elapsedMs: 0,
    timetable,
    columnCount: Math.max(12, ...columns),
  }
}

export function timeAtCol(startTs: Date, col: number): Date {
  return intraopInstantForColumn(startTs, col)
}

export function formatDateHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export function hhmmFromStoredTime(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null
  if (/^\d{2}:\d{2}$/.test(value)) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`
}

export function caseDateForHHMM(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number)
  const d = new Date()
  d.setHours(h || 0, m || 0, 0, 0)
  if (d.getTime() - Date.now() > INTRAOP_COLUMN_MS) d.setDate(d.getDate() - 1)
  return d
}

export function eventTimeForCol(startTs: Date, col: unknown): string {
  const n = typeof col === "number" && Number.isFinite(col) ? col : 0
  return timeAtCol(startTs, Math.max(0, n)).toISOString()
}

export function numOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

export function hasAnyValue(
  value: Record<string, unknown>,
  keys: string[],
): boolean {
  return keys.some(key => value[key] != null && value[key] !== "")
}

// Core emits chronological events. Mobile stores and renders newest first.
export function webTimetableToLog(
  value: unknown,
  startTs: Date,
): LogEvent[] {
  return reverseProjectIntraop(
    parseLegacyKeyEvents(value),
    startTs,
  ).reverse()
}

export function roundDown5Min(d: Date): Date {
  return roundDownToIntraopColumn(d)
}

export function safeTimetableScrollIndex(
  targetCol: number,
  rowCount: number,
): number {
  return Math.min(targetCol, rowCount - 1)
}

export function timetableTabInitialScrollTarget(
  lastEventCol: number,
  currentCol: number,
  rowCount: number,
): number {
  return lastEventCol < currentCol - 6
    ? Math.min(lastEventCol + 3, rowCount - 1)
    : Math.min(currentCol, rowCount - 1)
}

export function pickVitalsForColumn(
  log: LogEvent[],
  start: Date | null,
  ts?: string | null,
): { existing?: LogEvent; carryForward?: LogEvent } {
  const startMs = start?.getTime()
  if (startMs == null) return {}
  const colOf = (value: string) =>
    Math.floor((new Date(value).getTime() - startMs) / INTRAOP_COLUMN_MS)
  const targetCol = ts ? colOf(ts) : Number.POSITIVE_INFINITY

  let existing: LogEvent | undefined
  let carryForward: LogEvent | undefined
  let carryCol = -1
  for (const event of log) {
    if (event.type !== "vital") continue
    const currentCol = colOf(event.ts)
    if (currentCol === targetCol) {
      if (!existing) existing = event
    } else if (currentCol < targetCol && currentCol > carryCol) {
      carryCol = currentCol
      carryForward = event
    }
  }
  return { existing, carryForward }
}
