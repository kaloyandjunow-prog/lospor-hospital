"use client"

import { useEffect, useState } from "react"
import {
  autoFillVitalKeys,
  normalizeAutoFillVitalsPreferences,
  type AutoFillVitalKey,
  type AutoFillVitalsPreferences,
  type PlannedAutoFilledVitalEvent,
} from "@lospor/core/intraop-vitals"
import { INTRAOP_COLUMN_MINUTES } from "@lospor/core/intraop-engine"
import type { LogEvent as CoreLogEvent } from "@lospor/core/intraop-types"
import type { VitalsEntry } from "@/types/timetable"

/**
 * Vitals auto-fill: carrying a recorded observation forward into the columns
 * that follow it, so a chart chosen for readability does not read as a gap in
 * monitoring.
 *
 * Extracted from IntraopTimetable because this is the highest-consequence logic
 * in that file: it is the one path that can add observations to a clinical
 * record which were never taken. Two rules keep it honest, and both are tested:
 * it only ever fills a value that is absent, and it only fills columns the
 * caller asked for.
 */

type VitalLogKey = AutoFillVitalKey | "bgl"

/** Preference keys mirrored into localStorage by the settings menu. */
export const WEB_AUTOFILL_STORAGE_KEYS = new Set([
  "autoFillVitals",
  "autoFillBP",
  "autoFillBackground",
])

const VITAL_LOG_KEYS: VitalLogKey[] = [...autoFillVitalKeys(true), "bgl"]
const VITAL_COPY_KEYS = autoFillVitalKeys(true)

export function readWebAutoFillPreferences(): AutoFillVitalsPreferences {
  if (typeof window === "undefined") return normalizeAutoFillVitalsPreferences({})
  return normalizeAutoFillVitalsPreferences({
    enabled: localStorage.getItem("autoFillVitals") === "on",
    includeBloodPressure: localStorage.getItem("autoFillBP") === "on",
    backfillOnReopen: localStorage.getItem("autoFillBackground") === "on",
  })
}

/** Live preferences, kept in step with other tabs through the storage event. */
export function useWebAutoFillPreferences(): AutoFillVitalsPreferences {
  const [preferences, setPreferences] = useState(readWebAutoFillPreferences)

  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key && !WEB_AUTOFILL_STORAGE_KEYS.has(e.key)) return
      setPreferences(readWebAutoFillPreferences())
    }
    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [])

  return preferences
}

/** True when the column holds at least one recorded number. */
export function hasAnyVitalValue(entry: VitalsEntry | undefined): boolean {
  return !!entry && VITAL_LOG_KEYS.some(key => typeof entry[key] === "number")
}

/**
 * Project the vitals grid back into timestamped events for the core planner.
 * `chartStart` must be column 0's own start (the floored grid origin), or the
 * events land in the wrong columns.
 */
export function vitalsToAutoFillLog(
  vitals: VitalsEntry[] | undefined,
  chartStart: Date,
): CoreLogEvent[] {
  const chartStartMs = chartStart.getTime()
  return (vitals ?? []).flatMap((entry, col) => {
    if (!hasAnyVitalValue(entry)) return []
    return [{
      id: `web-vital-${col}`,
      ts: new Date(chartStartMs + col * INTRAOP_COLUMN_MINUTES * 60_000).toISOString(),
      type: "vital",
      ...entry,
    }]
  })
}

/**
 * Apply a planned fill to the vitals grid.
 *
 * Never overwrites a value that is already present — a recorded observation
 * always wins over a projected one. Returns the columns actually changed so the
 * caller can mark exactly those dirty rather than re-saving the whole grid.
 */
export function applyAutoFillVitalPlan(
  vitals: VitalsEntry[] | undefined,
  planned: PlannedAutoFilledVitalEvent[],
): { vitals: VitalsEntry[]; filledCols: number[] } {
  const sourceVitals = vitals ?? []
  let nextVitals = sourceVitals
  const filledCols: number[] = []

  for (const plannedEvent of planned) {
    if (nextVitals === sourceVitals) nextVitals = [...sourceVitals]
    while (nextVitals.length <= plannedEvent.col) nextVitals.push({} as VitalsEntry)

    const current = nextVitals[plannedEvent.col] ?? ({} as VitalsEntry)
    let updated = current
    for (const key of VITAL_COPY_KEYS) {
      const value = plannedEvent.event[key]
      if (typeof value !== "number" || current[key] != null) continue
      if (updated === current) updated = { ...current }
      updated[key] = value
    }

    if (updated !== current) {
      nextVitals[plannedEvent.col] = updated
      filledCols.push(plannedEvent.col)
    }
  }

  return { vitals: nextVitals, filledCols }
}
