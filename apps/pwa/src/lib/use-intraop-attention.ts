import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react"
import { serverNow } from "@/lib/server-clock"
import {
  intraopAttentionItems,
  intraopResolveAttention,
  type IntraopAttentionAction,
  type IntraopAttentionContext,
  type IntraopAttentionItem,
} from "@lospor/core/intraop-attention"
import { applyIntraopEventOps, isEmptyIntraopEventOps } from "@lospor/core/intraop-timetable-edit"
import type { LogEvent } from "@/lib/intraop-log-event"

/**
 * The log after one answer, exactly as Core writes it, or null when there is
 * nothing to write (answered elsewhere meanwhile). The PWA decides nothing
 * here: the items and the operations are Core's (9.13.0), and the web app
 * uses the same two functions, so the two cannot list or write differently.
 */
export function logAfterAttentionAnswer(
  log: LogEvent[],
  key: string,
  action: IntraopAttentionAction,
  context: IntraopAttentionContext,
): LogEvent[] | null {
  const ops = intraopResolveAttention(log, key, action, context)
  return isEmptyIntraopEventOps(ops) ? null : applyIntraopEventOps(log, ops) as LogEvent[]
}

/** "Now" to the minute, so a stop's time arriving shows without any other change. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => serverNow().getTime())
  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow().getTime()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return Math.floor(now / 60_000) * 60_000
}

export type IntraopAttention = {
  items: IntraopAttentionItem[]
  resolve: (key: string, action: IntraopAttentionAction) => Promise<void>
}

/** What the timeline is waiting for an answer on, live, and the answers. */
export function useIntraopAttention({ log, logRef, endedAtRef, syncLog, resyncActiveRef }: {
  log: LogEvent[]
  logRef: MutableRefObject<LogEvent[]>
  endedAtRef: MutableRefObject<Date | null>
  syncLog: (next: LogEvent[]) => Promise<boolean>
  resyncActiveRef: MutableRefObject<() => void>
}): IntraopAttention {
  const minute = useMinuteClock()
  const endedAt = endedAtRef.current
  const items = useMemo(
    () => intraopAttentionItems(log, { now: minute, endedAt }),
    [log, minute, endedAt],
  )
  // Stable across renders, so the chart rows it is handed to are not redrawn
  // on every tick; the latest syncLog is read through a ref.
  const syncLogRef = useRef(syncLog)
  syncLogRef.current = syncLog
  const resolve = useCallback(async (key: string, action: IntraopAttentionAction) => {
    const next = logAfterAttentionAnswer(logRef.current, key, action, { now: serverNow(), endedAt: endedAtRef.current })
    if (!next) return
    await syncLogRef.current(next)
    resyncActiveRef.current()
  }, [logRef, endedAtRef, resyncActiveRef])
  return { items, resolve }
}
