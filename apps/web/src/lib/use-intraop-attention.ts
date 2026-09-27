"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  intraopAttentionItems,
  intraopAttentionText,
  intraopRefusedEntry,
  intraopResolveAttention,
  type IntraopAttentionAction,
  type IntraopAttentionItem,
} from "@lospor/core/intraop-attention"
import { localTimeOf } from "@lospor/core/intraop-time"
import { isEmptyIntraopEventOps, type IntraopEventOps } from "@lospor/core/intraop-timetable-edit"
import type { LogEvent } from "@lospor/core/intraop-types"
import { useCaseSaveState, type CaseSaveState } from "@/lib/use-case-save-state"
import { serverNow } from "@/lib/intraop-clock"

export type IntraopAttentionEntry = IntraopAttentionItem & { time: string; label: string }

/** A change the server refused for good, as listed above the chart. */
export type RefusedLine = { key: string; time: string; text: string }

export type WebIntraopAttention = {
  /** Waiting now: unconfirmed stops, and on an ended case what is left after the end. */
  entries: IntraopAttentionEntry[]
  /** What End case would ask if the case ended this minute. */
  endCaseEntries: IntraopAttentionEntry[]
  answer: (key: string, action: IntraopAttentionAction, atEndCase?: boolean) => void
  /** False on a screen watching another screen's case: it shows, and writes nothing. */
  canAnswer: boolean
  /** Whether each change reached the server (9.13.0). */
  saveState: CaseSaveState
  /** What the server refused and why, in Core's words -- the PWA's lines. */
  refused: RefusedLine[]
  /** The case's own zone, in which every time on the chart is said. */
  timeZone: string | null
}

/**
 * The questions the timeline is waiting on, for the web form (9.13.0). The
 * items and what each answer writes are Core's (intraop-attention), exactly as
 * the PWA uses them, so the two cannot list or write differently; the web only
 * adds the time of day, in the case's own zone, and the event's label.
 */
export function useIntraopAttention({ caseId = null, log, endedAt, timeZone, locale = "en", onEventOps, readOnly }: {
  caseId?: string | null
  log: LogEvent[]
  /** The screen's language: the questions are said in it, from Core. */
  locale?: string
  endedAt?: string | null
  timeZone?: string | null
  onEventOps?: (ops: IntraopEventOps) => void | Promise<void>
  readOnly?: boolean
}): WebIntraopAttention {
  const [now, setNow] = useState(() => serverNow().getTime())
  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow().getTime()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const minute = Math.floor(now / 60_000) * 60_000
  const entries = useMemo(() => decorate(intraopAttentionItems(log, { now: minute, endedAt }), timeZone, locale), [log, minute, endedAt, timeZone, locale])
  const endCaseEntries = useMemo(
    () => decorate(intraopAttentionItems(log, { now: minute, endedAt: endedAt ?? minute }), timeZone, locale),
    [log, minute, endedAt, timeZone, locale],
  )

  const answer = useCallback((key: string, action: IntraopAttentionAction, atEndCase = false) => {
    if (readOnly || !onEventOps) return
    const at = new Date(Math.floor(serverNow().getTime() / 60_000) * 60_000)
    const ops = intraopResolveAttention(log, key, action, {
      now: serverNow(),
      endedAt: endedAt ?? (atEndCase ? at : null),
    })
    if (!isEmptyIntraopEventOps(ops)) void onEventOps(ops)
  }, [endedAt, log, onEventOps, readOnly])

  const saveState = useCaseSaveState(caseId)
  const refused = useMemo(() => saveState.refused.map(item => {
    const entry = intraopRefusedEntry(item, locale, log)
    return {
      key: `${item.eventId}-${item.at}`,
      time: (timeZone ? localTimeOf(new Date(entry.at), timeZone) : null) ?? "",
      text: entry.text,
    }
  }), [saveState.refused, locale, log, timeZone])
  return { entries, endCaseEntries, answer, canAnswer: !readOnly && !!onEventOps, saveState, refused, timeZone: timeZone ?? null }
}

function decorate(items: IntraopAttentionItem[], timeZone: string | null | undefined, locale: string): IntraopAttentionEntry[] {
  return items.map(item => ({
    ...item,
    // The case's zone, never the machine's: a hosted server runs at GMT+1.
    time: (timeZone ? localTimeOf(new Date(item.event.ts), timeZone) : null) ?? "",
    label: intraopAttentionText(item, locale),
  }))
}
