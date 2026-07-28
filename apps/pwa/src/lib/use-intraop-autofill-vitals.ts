import { useEffect, useRef, type MutableRefObject } from "react"

import {
  activeTimetableColumnForTimestamp,
  latestVitalColumn,
  normalizeAutoFillVitalsPreferences,
  planAutoFillVitalEvents,
} from "@/lib/intraop-vital-log"
import { roundDown5Min } from "@/lib/intraop-projection"
import type { LogEvent } from "@/lib/intraop-log-event"

type SaveIntraopEvent = (
  partial: Omit<LogEvent, "id" | "ts">,
  tsOverride?: string,
  silent?: boolean,
) => Promise<LogEvent>

export function useIntraopAutofillVitals(
  caseLoaded: boolean,
  autoFillVitals: boolean,
  autoFillBP: boolean,
  autoFillBg: boolean,
  logRef: MutableRefObject<LogEvent[]>,
  startRef: MutableRefObject<Date | null>,
  save: SaveIntraopEvent,
) {
  const autoFillPrevColRef = useRef<number | null>(null)
  const autoFillBusyRef = useRef(false)
  const persistAutoFilledVitalsRef = useRef<(fromCol: number, toCol: number) => Promise<void>>(async () => {})
  const autoFillPreferences = normalizeAutoFillVitalsPreferences({
    enabled: autoFillVitals,
    includeBloodPressure: autoFillBP,
    backfillOnReopen: autoFillBg,
  })

  async function persistAutoFilledVitals(fromCol: number, toCol: number) {
    if (!autoFillPreferences.enabled || !startRef.current || autoFillBusyRef.current || toCol < fromCol) return
    autoFillBusyRef.current = true
    try {
      const chartStart = roundDown5Min(startRef.current)
      const planned = planAutoFillVitalEvents({
        log: logRef.current,
        chartStart,
        fromCol,
        toCol,
        preferences: autoFillPreferences,
      })

      for (const plannedEvent of planned) {
        await save(plannedEvent.event, plannedEvent.ts, true)
      }
    } finally {
      autoFillBusyRef.current = false
    }
  }

  persistAutoFilledVitalsRef.current = persistAutoFilledVitals

  useEffect(() => {
    if (!autoFillPreferences.enabled) {
      autoFillPrevColRef.current = null
      return
    }
    const timer = setInterval(() => {
      if (!startRef.current) return
      const col = activeTimetableColumnForTimestamp(roundDown5Min(startRef.current), Date.now())
      if (col === null) {
        autoFillPrevColRef.current = null
        return
      }

      const prevCol = autoFillPrevColRef.current
      if (prevCol === null) {
        autoFillPrevColRef.current = col
        return
      }
      if (col <= prevCol) return
      if (autoFillBusyRef.current) return
      void persistAutoFilledVitalsRef.current(prevCol + 1, col).finally(() => {
        autoFillPrevColRef.current = col
      })
    }, 10_000)
    return () => clearInterval(timer)
  }, [autoFillPreferences.enabled, autoFillPreferences.includeBloodPressure, startRef])

  useEffect(() => {
    if (!caseLoaded) return
    if (!autoFillPreferences.enabled || !autoFillPreferences.backfillOnReopen) return
    if (!startRef.current) return
    const chartStart = roundDown5Min(startRef.current)
    const lastDataCol = latestVitalColumn(logRef.current, chartStart)
    if (lastDataCol === null) return
    const currentCol = activeTimetableColumnForTimestamp(chartStart, Date.now())
    if (currentCol === null) return
    if (currentCol > lastDataCol) void persistAutoFilledVitalsRef.current(lastDataCol + 1, currentCol)
  }, [
    caseLoaded,
    autoFillPreferences.enabled,
    autoFillPreferences.includeBloodPressure,
    autoFillPreferences.backfillOnReopen,
    logRef,
    startRef,
  ])
}
