"use client"

import { useCallback, useEffect, useRef } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

import {
  activeTimetableColumnForTimestamp,
  autoFillPauseAtMs,
  latestVitalColumn,
  planAutoFillVitalEvents,
} from "@lospor/core/intraop-vitals"
import type { LogEvent } from "@lospor/core/intraop-types"
import { useWebAutoFillPreferences } from "@/lib/intraop-autofill-vitals"
import { randomId } from "@/lib/random-id"

type Args = {
  log: LogEvent[]
  chartStartMs: number | null
  endedAt: string | null | undefined
  /** Writes ready-made events through the timeline rules. */
  addEvents: (events: LogEvent[]) => boolean
}

/**
 * Vitals autofill on the web, as saved events (1.4.9), with the Core rules the
 * PWA uses: never the future, never past the case end, at most 30 minutes
 * back, marked auto-filled, and paused 60 minutes after the last manual entry
 * until the clinician says the case is still running. The preferences are the
 * account's (synced through /api/user by the settings menu).
 */
export function useIntraopEventAutofill({ log, chartStartMs, endedAt, addEvents }: Args) {
  const t = useTranslations("intraop.timelineRules")
  const preferences = useWebAutoFillPreferences()
  const logRef = useRef(log)
  const addRef = useRef(addEvents)
  useEffect(() => {
    logRef.current = log
    addRef.current = addEvents
  }, [log, addEvents])
  const acknowledgedAtRef = useRef<number | null>(null)
  const pausePromptRef = useRef(false)
  const backfillOfferedRef = useRef(false)

  const plan = useCallback((fromCol: number, toCol: number) => {
    if (chartStartMs === null) return []
    const chartStart = new Date(chartStartMs)
    const now = new Date()
    return planAutoFillVitalEvents({
      log: logRef.current,
      chartStart,
      fromCol,
      toCol,
      preferences,
      now,
      endedAt: endedAt ?? null,
      pauseAt: autoFillPauseAtMs({ log: logRef.current, chartStart, now, acknowledgedAt: acknowledgedAtRef.current }),
    })
  }, [chartStartMs, endedAt, preferences])
  const planRef = useRef(plan)
  useEffect(() => { planRef.current = plan }, [plan])

  const writeRef = useRef((planned: ReturnType<typeof planAutoFillVitalEvents>) => {
    if (planned.length === 0) return
    addRef.current(planned.map(item => ({ ...item.event, id: randomId(), ts: item.ts }) as LogEvent))
  })

  // Live: fill each new row as the clock reaches it, until paused.
  useEffect(() => {
    if (!preferences.enabled || chartStartMs === null || endedAt) return
    let previous: number | null = activeTimetableColumnForTimestamp(new Date(chartStartMs), Date.now())
    const timer = setInterval(() => {
      const chartStart = new Date(chartStartMs)
      const column = activeTimetableColumnForTimestamp(chartStart, Date.now())
      if (column === null || previous === null || column <= previous) { previous = column; return }
      const pauseAt = autoFillPauseAtMs({ log: logRef.current, chartStart, now: Date.now(), acknowledgedAt: acknowledgedAtRef.current })
      if (Date.now() >= pauseAt) {
        if (!pausePromptRef.current) {
          pausePromptRef.current = true
          toast(t("autofillPausedTitle"), {
            description: t("autofillPausedMessage"),
            duration: Infinity,
            action: {
              label: t("autofillStillRunning"),
              onClick: () => { acknowledgedAtRef.current = Date.now(); pausePromptRef.current = false },
            },
            onDismiss: () => { pausePromptRef.current = false },
          })
        }
        return
      }
      writeRef.current(planRef.current(previous + 1, column))
      previous = column
    }, 10_000)
    return () => clearInterval(timer)
  }, [preferences.enabled, preferences.includeBloodPressure, chartStartMs, endedAt, t])

  // Reopen: offer the empty rows of the last 30 minutes, once.
  useEffect(() => {
    if (backfillOfferedRef.current || !preferences.enabled || !preferences.backfillOnReopen) return
    if (chartStartMs === null || endedAt || log.length === 0) return
    backfillOfferedRef.current = true
    const chartStart = new Date(chartStartMs)
    const lastDataCol = latestVitalColumn(log, chartStart)
    const currentCol = activeTimetableColumnForTimestamp(chartStart, Date.now())
    if (lastDataCol === null || currentCol === null || currentCol <= lastDataCol) return
    const planned = planRef.current(lastDataCol + 1, currentCol)
    if (planned.length === 0) return
    toast(t("autofillBackfillTitle"), {
      description: t("autofillBackfillMessage", { count: planned.length }),
      duration: 30_000,
      action: { label: t("autofillFill"), onClick: () => writeRef.current(planRef.current(lastDataCol + 1, currentCol)) },
    })
  }, [chartStartMs, endedAt, log, preferences.backfillOnReopen, preferences.enabled, t])
}
