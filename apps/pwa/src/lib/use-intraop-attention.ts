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
import { vitalEpisodeOps, type VitalQuestionContext } from "@lospor/core/vital-questions"
import type { LogEvent } from "@/lib/intraop-log-event"
import type { SuggestionContext } from "@lospor/core/intraop-suggestions"
import type { IntraopEventOps } from "@lospor/core/intraop-timetable-edit"
import { statePatchFromEventOps, type EventStatePatch } from "@/lib/event-patch-state"

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
  /** A question with several answers: the complication picked (10.2.0). */
  choice?: string,
): LogEvent[] | null {
  const ops = intraopResolveAttention(log, key, action, context, choice)
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
  resolve: (key: string, action: IntraopAttentionAction, choice?: string) => Promise<void>
  /** The suggestions (10.2.0) as the screen has them now; null when none are asked. */
  suggestions: SuggestionContext | null
  /** Writes a card's own operations (a relabel, Done, an event) to the log. */
  applyOps: (ops: IntraopEventOps) => Promise<void>
  /** The suggestion line opened in its sheet, by key. */
  opened: string | null
  open: (key: string | null) => void
  log: LogEvent[]
}

/** What the timeline is waiting for an answer on, live, and the answers. */
export function useIntraopAttention({ log, logRef, endedAtRef, syncLog, resyncActiveRef, vitals = null, suggestions: suggestionBase = null, onEventPatch }: {
  log: LogEvent[]
  logRef: MutableRefObject<LogEvent[]>
  endedAtRef: MutableRefObject<Date | null>
  syncLog: (next: LogEvent[]) => Promise<boolean>
  resyncActiveRef: MutableRefObject<() => void>
  /** The vitals questions (10.1.0); null when they are not asked on this screen. */
  vitals?: VitalQuestionContext | null
  /** The suggestions (10.2.0), when any group is on and this screen holds the case. */
  suggestions?: Omit<SuggestionContext, "now"> | null
  /** What an answer's event changes in the screen's own state (the technique), in the moment it is saved. */
  onEventPatch?: (patch: EventStatePatch) => void
}): IntraopAttention {
  const minute = useMinuteClock()
  const endedAt = endedAtRef.current
  const suggestions = useMemo<SuggestionContext | null>(
    () => (suggestionBase ? { ...suggestionBase, now: minute } : null),
    [suggestionBase, minute],
  )
  const items = useMemo(
    () => intraopAttentionItems(log, { now: minute, endedAt, vitals, suggestions }),
    [log, minute, endedAt, vitals, suggestions],
  )
  // Stable across renders, so the chart rows it is handed to are not redrawn
  // on every tick; the latest syncLog is read through a ref.
  const syncLogRef = useRef(syncLog)
  syncLogRef.current = syncLog
  const vitalsRef = useRef(vitals)
  vitalsRef.current = vitals
  const suggestionsRef = useRef(suggestionBase)
  suggestionsRef.current = suggestionBase
  const writeQueue = useRef(Promise.resolve())
  const enqueue = useCallback((work: () => Promise<void> | void) => {
    const run = writeQueue.current.then(work)
    writeQueue.current = run.then(() => undefined, () => undefined)
    return run
  }, [])
  const resolve = useCallback(async (key: string, action: IntraopAttentionAction, choice?: string) => {
    await enqueue(async () => {
      const base = suggestionsRef.current
      const next = logAfterAttentionAnswer(logRef.current, key, action, {
        now: serverNow(), endedAt: endedAtRef.current, vitals: vitalsRef.current,
        suggestions: base ? { ...base, now: serverNow() } : null,
      }, choice)
      if (!next) return
      // syncLog updates logRef synchronously before it awaits the network.
      // Do not pre-apply here: syncLog needs the old ref to calculate the
      // durable event mutations. The shared queue makes the next action wait
      // until that local projection is installed.
      await syncLogRef.current(next)
      resyncActiveRef.current()
    })
  }, [enqueue, endedAtRef, logRef, resyncActiveRef])
  const applyOps = useCallback(async (ops: IntraopEventOps) => {
    if (isEmptyIntraopEventOps(ops)) return
    const statePatch = statePatchFromEventOps(ops)
    if (onEventPatch && Object.keys(statePatch).length > 0) onEventPatch(statePatch)
    await enqueue(async () => {
      const next = applyIntraopEventOps(logRef.current, ops) as LogEvent[]
      await syncLogRef.current(next)
      resyncActiveRef.current()
    })
  }, [enqueue, logRef, onEventPatch, resyncActiveRef])
  const [opened, open] = useState<string | null>(null)
  useAutoOpenCards(items, open, suggestionBase != null)
  useVitalEpisodeClosing(log, logRef, endedAtRef, vitalsRef, syncLogRef, enqueue)
  return { items, resolve, suggestions, applyOps, opened, open, log }
}

/**
 * A card opens by itself for a complication just logged on this screen (the
 * sheet you used turns into the card); one already waiting when the screen
 * opened stays a line in the list.
 */
function useAutoOpenCards(items: IntraopAttentionItem[], open: (key: string) => void, active: boolean) {
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    const cards = items.filter(item => item.suggestion?.item.type === "card")
    if (seen.current == null) { seen.current = new Set(cards.map(item => item.key)); return }
    const known = seen.current
    const fresh = cards.find(item => {
      const line = item.suggestion!.item
      if (line.type !== "card" || known.has(item.key)) return false
      const recorded = Date.parse(line.complication.recordedAt ?? line.complication.ts)
      return Number.isFinite(recorded) && serverNow().getTime() - recorded < 2 * 60_000
    })
    for (const item of cards) known.add(item.key)
    if (fresh && active) open(fresh.key)
  }, [items, open, active])
}

/**
 * Closes an episode from the vitals questions at the first reading back
 * inside both limits, or at the case end (10.1.0). Core decides; this only
 * saves what it returns, one save at a time, on the screen that holds the case.
 */
function useVitalEpisodeClosing(
  log: LogEvent[],
  logRef: MutableRefObject<LogEvent[]>,
  endedAtRef: MutableRefObject<Date | null>,
  vitalsRef: MutableRefObject<VitalQuestionContext | null>,
  syncLogRef: MutableRefObject<(next: LogEvent[]) => Promise<boolean>>,
  enqueue: (work: () => Promise<void> | void) => Promise<void>,
) {
  const closing = useRef(false)
  useEffect(() => {
    if (!vitalsRef.current || closing.current) return
    // The close operation shares the same queue as attention answers and card
    // actions. Without that, a reading arriving beside a prompt answer could
    // derive both writes from the same old log and lose one of them.
    logRef.current = log
    closing.current = true
    void enqueue(async () => {
      const current = logRef.current
      const ops = vitalEpisodeOps(current, vitalsRef.current, endedAtRef.current)
      if (isEmptyIntraopEventOps(ops)) return
      const next = applyIntraopEventOps(current, ops) as LogEvent[]
      await syncLogRef.current(next)
    })
      .finally(() => { closing.current = false })
  }, [log, logRef, endedAtRef, vitalsRef, syncLogRef, enqueue])
}
