import type { LogEvent } from "./intraop-types"
import { INTRAOP_COLUMN_MS } from "./intraop-engine"

export type AutoFillVitalKey = "etco2" | "temp" | "spO2" | "systolic" | "diastolic" | "heartRate"
export type AutoFillVitalsPreferences = {
  enabled: boolean
  includeBloodPressure: boolean
  backfillOnReopen: boolean
}
export type AutoFillVitalsPreferenceInput = Partial<AutoFillVitalsPreferences>
export type PlannedAutoFilledVitalEvent = {
  col: number
  ts: string
  event: Omit<LogEvent, "id" | "ts">
}

const COLUMN_INTERVAL_MS = INTRAOP_COLUMN_MS

export function latestVitalEvent(log: LogEvent[]): LogEvent | undefined {
  return log.find(event => event.type === "vital")
}

export function previousVitalAfterIndex(log: LogEvent[], index: number): LogEvent | undefined {
  for (let i = index + 1; i < log.length; i += 1) {
    if (log[i].type === "vital") return log[i]
  }
}

export function autoFillVitalKeys(includeBloodPressure: boolean): AutoFillVitalKey[] {
  return includeBloodPressure
    ? ["etco2", "temp", "spO2", "systolic", "diastolic", "heartRate"]
    : ["etco2", "temp", "spO2"]
}

export function normalizeAutoFillVitalsPreferences(
  input: AutoFillVitalsPreferenceInput,
): AutoFillVitalsPreferences {
  const enabled = input.enabled === true
  return {
    enabled,
    includeBloodPressure: enabled && input.includeBloodPressure === true,
    backfillOnReopen: enabled && input.backfillOnReopen === true,
  }
}

export function timetableColumnForTimestamp(chartStart: Date, timestampMs: number): number {
  return Math.max(0, Math.floor((timestampMs - chartStart.getTime()) / COLUMN_INTERVAL_MS))
}

export function activeTimetableColumnForTimestamp(chartStart: Date, timestampMs: number): number | null {
  const chartStartMs = chartStart.getTime()
  if (!Number.isFinite(chartStartMs) || !Number.isFinite(timestampMs) || timestampMs < chartStartMs) {
    return null
  }
  return Math.floor((timestampMs - chartStartMs) / COLUMN_INTERVAL_MS)
}

export function latestVitalColumn(log: LogEvent[], chartStart: Date): number | null {
  let latest: number | null = null
  for (const event of log) {
    if (event.type !== "vital") continue
    const col = activeTimetableColumnForTimestamp(chartStart, new Date(event.ts).getTime())
    if (col === null) continue
    latest = latest === null ? col : Math.max(latest, col)
  }
  return latest
}

export function buildAutoFilledVitalEvent(
  source: LogEvent,
  includeBloodPressure: boolean,
): Omit<LogEvent, "id" | "ts"> | null {
  const copied: Omit<LogEvent, "id" | "ts"> = { type: "vital" }
  const keys = autoFillVitalKeys(includeBloodPressure)
  for (const key of keys) {
    const value = source[key]
    if (typeof value === "number") copied[key] = value
  }
  return keys.some(key => typeof copied[key] === "number") ? copied : null
}

function vitalTimestampMs(event: LogEvent): number | null {
  if (event.type !== "vital") return null
  const ms = new Date(event.ts).getTime()
  return Number.isFinite(ms) ? ms : null
}

function hasVitalInColumn(log: LogEvent[], colStartMs: number, colEndMs: number): boolean {
  return log.some(event => {
    const ms = vitalTimestampMs(event)
    return ms !== null && ms >= colStartMs && ms < colEndMs
  })
}

function latestVitalBeforeColumn(log: LogEvent[], chartStartMs: number, colStartMs: number): LogEvent | undefined {
  let source: LogEvent | undefined
  let sourceMs = -Infinity
  for (const event of log) {
    const ms = vitalTimestampMs(event)
    if (ms === null || ms < chartStartMs || ms >= colStartMs || ms <= sourceMs) continue
    sourceMs = ms
    source = event
  }
  return source
}

export function planAutoFillVitalEvents({
  log,
  chartStart,
  fromCol,
  toCol,
  preferences,
}: {
  log: LogEvent[]
  chartStart: Date
  fromCol: number
  toCol: number
  preferences: AutoFillVitalsPreferenceInput
}): PlannedAutoFilledVitalEvent[] {
  const effective = normalizeAutoFillVitalsPreferences(preferences)
  const chartStartMs = chartStart.getTime()
  if (!effective.enabled || !Number.isFinite(chartStartMs) || !Number.isFinite(fromCol) || !Number.isFinite(toCol)) {
    return []
  }

  const firstCol = Math.max(0, Math.floor(fromCol))
  const lastCol = Math.floor(toCol)
  if (lastCol < firstCol) return []

  const workingLog = [...log]
  const planned: PlannedAutoFilledVitalEvent[] = []

  for (let col = firstCol; col <= lastCol; col += 1) {
    const colStartMs = chartStartMs + col * COLUMN_INTERVAL_MS
    const colEndMs = colStartMs + COLUMN_INTERVAL_MS
    if (hasVitalInColumn(workingLog, colStartMs, colEndMs)) continue

    const source = latestVitalBeforeColumn(workingLog, chartStartMs, colStartMs)
    if (!source) continue

    const event = buildAutoFilledVitalEvent(source, effective.includeBloodPressure)
    if (!event) continue

    const ts = new Date(colStartMs).toISOString()
    planned.push({ col, ts, event })
    workingLog.push({ id: `auto-fill-${col}`, ts, ...event })
  }

  return planned
}

export function vitalFieldVisibility(
  isGeneralAnesthesiaCase: boolean,
  monitoringSelections: string[],
): { showEtco2: boolean; showTemperature: boolean; showGlucose: boolean } {
  const selected = new Set(monitoringSelections)
  return {
    showEtco2: isGeneralAnesthesiaCase
      || selected.has("etco2Monitor")
      || monitoringSelections.some(label => label.includes("EtCO")),
    showTemperature: isGeneralAnesthesiaCase
      || selected.has("tempMonitor")
      || monitoringSelections.some(label => label.includes("Temperature")),
    showGlucose: selected.has("bglMonitor")
      || monitoringSelections.some(label => label.toLocaleLowerCase("en").includes("glucose")),
  }
}
