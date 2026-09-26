"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

import { projectIntraopEvents } from "@lospor/core/intraop-engine"
import { intraopCascadeDeleteIds, newIntraopTimelineIssues } from "@lospor/core/intraop-commands"
import {
  applyIntraopEventOps,
  isEmptyIntraopEventOps,
  timetableEditToEventOps,
  type IntraopEventOps,
} from "@lospor/core/intraop-timetable-edit"
import { parseLogEvents, type LogEvent as CoreLogEvent } from "@lospor/core/intraop-types"
import { gridOriginMs } from "@/lib/intraop-clock"
import { isValidTimeZone, resolvedTimeZone, startInstantForWallClock } from "@lospor/core/intraop-time"
import { randomId } from "@/lib/random-id"
import type { LogEvent, TimetableData } from "@/types/timetable"

const COLUMN_MS = 5 * 60_000

type Args = {
  /** The saved event log: the only source of the chart. */
  eventLog: LogEvent[] | undefined
  /** The case start instant; column 0 is its five-minute row. */
  startedAt: string | null | undefined
  /**
   * The start as typed ("HH:MM") and the case's zone. Without a start instant
   * (a start time typed rather than stamped by Start Case, before the server
   * has resolved it) the instant is derived from these, as the server does.
   */
  startTime?: string | null
  timezone?: string | null
  /** The case end instant once ended: the chart is read there. */
  endedAt: string | null | undefined
  /** Writes the operations (outbox). Absent in read-only use. */
  onEventOps?: (ops: IntraopEventOps) => void | Promise<void>
  /** Shown when there is no start instant to position events against. */
  legacyTimetable: TimetableData
}

/**
 * The web intraoperative chart as a projection of the event log (1.4.9).
 *
 * The timetable component still edits a chart; `onTimetableChange` turns that
 * edit into event operations with Core (only the events that changed, stamped
 * by the row rule), checks them against the timeline rules and writes them.
 * The chart shown is always re-projected from the log, so an edit the log
 * cannot express simply does not stick, and the whole chart is never saved.
 */
export function useIntraopEventTimeline({ eventLog, startedAt, startTime, timezone, endedAt, onEventOps, legacyTimetable }: Args) {
  const t = useTranslations("intraop.timelineRules")
  const log = useMemo(() => parseLogEvents(eventLog ?? []), [eventLog])
  const effectiveStartedAt = useMemo(() => {
    if (startedAt && Number.isFinite(Date.parse(startedAt))) return startedAt
    if (!startTime || !/^d{2}:d{2}$/.test(startTime)) return null
    const zone = isValidTimeZone(timezone) ? timezone : resolvedTimeZone()
    if (!zone) return null
    // The most recent such time not after the first entry (or now): the day
    // the case happened, even when it is reopened days later.
    const first = log.reduce<number | null>((min, event) => {
      const ms = Date.parse(event.ts)
      return Number.isFinite(ms) && (min === null || ms < min) ? ms : min
    }, null)
    return startInstantForWallClock(first === null ? new Date() : new Date(first), startTime, zone)?.toISOString() ?? null
  }, [log, startTime, startedAt, timezone])
  const startMs = effectiveStartedAt ? Date.parse(effectiveStartedAt) : NaN
  const chartStartMs = Number.isFinite(startMs) ? gridOriginMs(startMs) : null

  // "Now", advanced when the five-minute row changes: running bars end there.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (endedAt) return
    const timer = setInterval(() => {
      setNowMs(previous => Math.floor(Date.now() / COLUMN_MS) === Math.floor(previous / COLUMN_MS) ? previous : Date.now())
    }, 10_000)
    return () => clearInterval(timer)
  }, [endedAt])

  const timetable = useMemo<TimetableData>(() => {
    if (chartStartMs === null) return legacyTimetable
    return projectIntraopEvents(log, { start: chartStartMs, openThrough: nowMs, endedAt: endedAt ?? null }) as TimetableData
  }, [chartStartMs, endedAt, legacyTimetable, log, nowMs])

  // What the last render showed: an edit is compared with this.
  const logRef = useRef(log)
  const timetableRef = useRef(timetable)
  useLayoutEffect(() => {
    logRef.current = log
    timetableRef.current = timetable
  }, [log, timetable])

  /** Validates operations against the Core timeline rules, then writes them. */
  const commit = useCallback((ops: IntraopEventOps): boolean => {
    if (isEmptyIntraopEventOps(ops)) return true
    const next = applyIntraopEventOps(logRef.current, ops)
    const [issue] = newIntraopTimelineIssues(logRef.current, next, { now: new Date() })
    if (issue) {
      toast.error(t(`refused.${issue.code}`))
      return false
    }
    void onEventOps?.(ops)
    return true
  }, [onEventOps, t])

  const onTimetableChange = useCallback((after: TimetableData) => {
    if (chartStartMs === null) {
      toast.error(t("needsStart"))
      return
    }
    commit(timetableEditToEventOps({
      log: logRef.current,
      before: timetableRef.current as Parameters<typeof timetableEditToEventOps>[0]["before"],
      after: after as Parameters<typeof timetableEditToEventOps>[0]["after"],
      chartStart: chartStartMs,
      now: new Date(),
      newId: randomId,
    }))
  }, [chartStartMs, commit, t])

  /** Deleting a start deletes its changes and its stop. */
  const removeEvent = useCallback((eventId: string) => {
    commit({ add: [], update: [], remove: intraopCascadeDeleteIds(logRef.current, eventId) })
  }, [commit])

  /** Adds ready-made events (autofill, End case stops). */
  const addEvents = useCallback((events: CoreLogEvent[]) => commit({ add: events, update: [], remove: [] }), [commit])

  return { timetable, log, chartStartMs, startedAt: effectiveStartedAt, nowMs, onTimetableChange, removeEvent, addEvents, commit }
}
