import { useEffect, useRef, type MutableRefObject } from "react"

import { formatMessage } from "@/i18n/locale"
import type { SaveIntraopEvent } from "@/lib/intraop-stamp"
import {
  activeTimetableColumnForTimestamp,
  latestVitalColumn,
  normalizeAutoFillVitalsPreferences,
  planAutoFillVitalEvents,
} from "@/lib/intraop-vital-log"
import { roundDown5Min } from "@/lib/intraop-projection"
import type { LogEvent } from "@/lib/intraop-log-event"
import { actionSheet } from "@/lib/notify"
import { usePreferences } from "@/lib/preferences-context"
import { autoFillPauseAtMs } from "@lospor/core/intraop-vitals"

type AutofillContext = {
  /** The case end once ended: nothing is filled past it. */
  endedAtRef: MutableRefObject<Date | null>
  /** Opened from the "Is this case still running?" prompt. */
  onEndCase: () => void
}

/**
 * Carries the last vitals forward into empty rows (1.4.9 rules, from Core):
 * never the future, never past the case end, at most 30 minutes back, marked
 * auto-filled, and paused 60 minutes after the last manual entry until the
 * clinician says the case is still running.
 *
 * `log` is the rendered state, not only the ref: the reopen backfill used to
 * run before the screen copied the loaded log into the ref, saw no vitals and
 * silently did nothing.
 */
export function useIntraopAutofillVitals(
  caseLoaded: boolean,
  autoFillVitals: boolean,
  autoFillBP: boolean,
  autoFillBg: boolean,
  log: LogEvent[],
  logRef: MutableRefObject<LogEvent[]>,
  startRef: MutableRefObject<Date | null>,
  save: SaveIntraopEvent,
  context: AutofillContext,
) {
  const { tc } = usePreferences()
  const autoFillPrevColRef = useRef<number | null>(null)
  const autoFillBusyRef = useRef(false)
  const backfillOfferedRef = useRef(false)
  const pausePromptOpenRef = useRef(false)
  const acknowledgedAtRef = useRef<number | null>(null)
  const persistAutoFilledVitalsRef = useRef<(fromCol: number, toCol: number) => Promise<void>>(async () => {})
  const pausedTickRef = useRef<() => boolean>(() => false)
  const autoFillPreferences = normalizeAutoFillVitalsPreferences({
    enabled: autoFillVitals,
    includeBloodPressure: autoFillBP,
    backfillOnReopen: autoFillBg,
  })

  function plan(fromCol: number, toCol: number) {
    if (!startRef.current) return []
    const chartStart = roundDown5Min(startRef.current)
    const now = new Date()
    return planAutoFillVitalEvents({
      log: logRef.current,
      chartStart,
      fromCol,
      toCol,
      preferences: autoFillPreferences,
      now,
      endedAt: context.endedAtRef.current,
      pauseAt: autoFillPauseAtMs({ log: logRef.current, chartStart, now, acknowledgedAt: acknowledgedAtRef.current }),
    })
  }

  async function persistAutoFilledVitals(fromCol: number, toCol: number) {
    if (!autoFillPreferences.enabled || !startRef.current || autoFillBusyRef.current || toCol < fromCol) return
    autoFillBusyRef.current = true
    try {
      for (const plannedEvent of plan(fromCol, toCol)) {
        await save(plannedEvent.event, plannedEvent.ts, true)
      }
    } finally {
      autoFillBusyRef.current = false
    }
  }
  persistAutoFilledVitalsRef.current = persistAutoFilledVitals
  const planRef = useRef(plan)
  planRef.current = plan

  // After 60 minutes with no manual entry autofill stops and asks once.
  pausedTickRef.current = () => {
    if (!startRef.current || context.endedAtRef.current) return false
    const now = Date.now()
    const pauseAt = autoFillPauseAtMs({
      log: logRef.current,
      chartStart: roundDown5Min(startRef.current),
      now,
      acknowledgedAt: acknowledgedAtRef.current,
    })
    if (now < pauseAt) return false
    if (!pausePromptOpenRef.current) {
      pausePromptOpenRef.current = true
      actionSheet(tc("autofillPausedTitle"), tc("autofillPausedMessage"), [
        {
          label: tc("autofillStillRunning"),
          onPress: () => {
            pausePromptOpenRef.current = false
            acknowledgedAtRef.current = Date.now()
          },
        },
        { label: tc("tfEndCase"), onPress: () => { pausePromptOpenRef.current = false; context.onEndCase() } },
        { label: tc("cancelLabel"), cancel: true, onPress: () => { pausePromptOpenRef.current = false } },
      ])
    }
    return true
  }

  useEffect(() => {
    if (!autoFillPreferences.enabled) {
      autoFillPrevColRef.current = null
      return
    }
    const timer = setInterval(() => {
      if (!startRef.current || context.endedAtRef.current) return
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
      if (pausedTickRef.current()) return
      void persistAutoFilledVitalsRef.current(prevCol + 1, col).finally(() => {
        autoFillPrevColRef.current = col
      })
    }, 10_000)
    return () => clearInterval(timer)
  }, [autoFillPreferences.enabled, autoFillPreferences.includeBloodPressure, context.endedAtRef, startRef])

  // Reopen: offer the empty rows of the last 30 minutes, once, never more.
  useEffect(() => {
    if (!caseLoaded || backfillOfferedRef.current) return
    if (!autoFillPreferences.enabled || !autoFillPreferences.backfillOnReopen) return
    if (!startRef.current || context.endedAtRef.current || log.length === 0) return
    backfillOfferedRef.current = true
    logRef.current = log
    const chartStart = roundDown5Min(startRef.current)
    const lastDataCol = latestVitalColumn(log, chartStart)
    const currentCol = activeTimetableColumnForTimestamp(chartStart, Date.now())
    if (lastDataCol === null || currentCol === null || currentCol <= lastDataCol) return
    const planned = planRef.current(lastDataCol + 1, currentCol)
    if (planned.length === 0) return
    actionSheet(
      tc("autofillBackfillTitle"),
      formatMessage(tc("autofillBackfillMessage"), { count: planned.length }),
      [
        { label: tc("autofillFillLabel"), onPress: () => { void persistAutoFilledVitalsRef.current(lastDataCol + 1, currentCol) } },
        { label: tc("autofillSkipLabel"), cancel: true },
      ],
    )
  }, [caseLoaded, log, autoFillPreferences.enabled, autoFillPreferences.backfillOnReopen, context.endedAtRef, logRef, startRef, tc])
}
