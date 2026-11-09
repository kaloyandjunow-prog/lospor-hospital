"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  intraopAttentionItems,
  intraopAttentionText,
  intraopRefusedEntry,
  intraopResolveAttention,
  type IntraopAttentionAction,
  type IntraopAttentionItem,
} from "@lospor/core/intraop-attention"
import { localTimeOf } from "@lospor/core/intraop-time"
import { applyIntraopEventOps, isEmptyIntraopEventOps, type IntraopEventOps } from "@lospor/core/intraop-timetable-edit"
import { vitalEpisodeOps, vitalQuestionText, type VitalQuestionContext } from "@lospor/core/vital-questions"
import type { LogEvent } from "@lospor/core/intraop-types"
import type { SuggestionContext } from "@lospor/core/intraop-suggestions"
import { useCaseSaveState, type CaseSaveState } from "@/lib/use-case-save-state"
import { serverNow } from "@/lib/intraop-clock"

export type IntraopAttentionEntry = IntraopAttentionItem & {
  time: string
  label: string
  /** A question from the vitals (10.1.0): why the reading is unusual, and when logging stops. */
  detail?: string
  stop?: string | null
}

/** A change the server refused for good, as listed above the chart. */
export type RefusedLine = { key: string; time: string; text: string }

export type WebIntraopAttention = {
  /** Waiting now: unconfirmed stops, and on an ended case what is left after the end. */
  entries: IntraopAttentionEntry[]
  /** What End case would ask if the case ended this minute. */
  endCaseEntries: IntraopAttentionEntry[]
  answer: (key: string, action: IntraopAttentionAction, atEndCase?: boolean, choice?: string) => void
  /** The suggestions (10.2.0) as the screen has them now, for a card to resolve against; null when none are asked. */
  suggestions: SuggestionContext | null
  /** Writes a card's own operations (a row saved, Done, a relabel) through the save path. */
  applyOps: (ops: IntraopEventOps) => void
  /** The saved log the questions were asked of. */
  log: LogEvent[]
  /** The suggestion line opened beside the chart (a card, a follow-up, a reminder), by key. */
  opened: string | null
  open: (key: string | null) => void
  /** False on a screen watching another screen's case: it shows, and writes nothing. */
  canAnswer: boolean
  /** Whether each change reached the server (9.13.0). */
  saveState: CaseSaveState
  /** What the server refused and why, in Core's words -- the PWA's lines. */
  refused: RefusedLine[]
  /** The case's own zone, in which every time on the chart is said. */
  timeZone: string | null
}

function comparableAttentionEvent(event: LogEvent): string {
  return JSON.stringify({
    id: event.id, ts: event.ts, type: event.type, label: event.label, name: event.name,
    answer: event.answer, answerFor: event.answerFor, answerKind: event.answerKind,
    endTs: event.endTs, intraopPatch: event.intraopPatch,
  })
}

function attentionOpsAcknowledged(current: LogEvent[], ops: IntraopEventOps): boolean {
  const byId = new Map(current.map(event => [event.id, event]))
  return ops.add.every(event => byId.has(event.id))
    && ops.update.every(event => comparableAttentionEvent(byId.get(event.id) ?? ({} as LogEvent)) === comparableAttentionEvent(event))
    && ops.remove.every(id => !byId.has(id))
}

/**
 * The questions the timeline is waiting on, for the web form (9.13.0). The
 * items and what each answer writes are Core's (intraop-attention), exactly as
 * the PWA uses them, so the two cannot list or write differently; the web only
 * adds the time of day, in the case's own zone, and the event's label.
 */
export function useIntraopAttention({ caseId = null, log, endedAt, timeZone, locale = "en", onEventOps, readOnly, vitals = null, suggestions: suggestionBase = null }: {
  caseId?: string | null
  log: LogEvent[]
  /** The screen's language: the questions are said in it, from Core. */
  locale?: string
  endedAt?: string | null
  timeZone?: string | null
  onEventOps?: (ops: IntraopEventOps) => void | Promise<void>
  readOnly?: boolean
  /** The vitals questions (10.1.0), when the hospital has them on and this screen holds the case. */
  vitals?: VitalQuestionContext | null
  /** The suggestions (10.2.0), when any group is on and this screen holds the case. */
  suggestions?: Omit<SuggestionContext, "now"> | null
}): WebIntraopAttention {
  const [now, setNow] = useState(() => serverNow().getTime())
  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow().getTime()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const minute = Math.floor(now / 60_000) * 60_000
  const suggestions = useMemo<SuggestionContext | null>(
    () => (suggestionBase ? { ...suggestionBase, now: minute } : null),
    [suggestionBase, minute],
  )
  const entries = useMemo(
    () => decorate(intraopAttentionItems(log, { now: minute, endedAt, vitals, suggestions }), timeZone, locale, vitals?.keepLogging ?? true),
    [log, minute, endedAt, timeZone, locale, vitals, suggestions],
  )
  const endCaseEntries = useMemo(
    () => decorate(intraopAttentionItems(log, { now: minute, endedAt: endedAt ?? minute }), timeZone, locale),
    [log, minute, endedAt, timeZone, locale],
  )

  // Attention actions can be answered from a sheet while the chart is also
  // receiving a device/timetable write. Keep the newest inputs in refs and
  // serialize the writes so two answers cannot both derive from the same old
  // log snapshot.
  const logRef = useRef(log)
  const endedAtRef = useRef(endedAt)
  const vitalsRef = useRef(vitals)
  const suggestionsRef = useRef(suggestionBase)
  const onEventOpsRef = useRef(onEventOps)
  const writeQueue = useRef<Promise<void> | null>(null)
  const baseLogRef = useRef(log)
  const optimisticOps = useRef<IntraopEventOps[]>([])
  useLayoutEffect(() => {
    baseLogRef.current = log
    optimisticOps.current = optimisticOps.current.filter(ops => !attentionOpsAcknowledged(log, ops))
    // Reapply writes that are still waiting for the parent projection. This
    // prevents an unrelated render carrying the previous `log` prop from
    // replacing the local answer before the API acknowledgement arrives.
    logRef.current = optimisticOps.current.reduce(
      (current, ops) => applyIntraopEventOps(current, ops) as LogEvent[],
      log,
    )
    endedAtRef.current = endedAt
    vitalsRef.current = vitals
    suggestionsRef.current = suggestionBase
    onEventOpsRef.current = onEventOps
  }, [log, endedAt, vitals, suggestionBase, onEventOps])
  const enqueue = useCallback((produce: () => IntraopEventOps | null | undefined | Promise<IntraopEventOps | null | undefined>) => {
    const apply = (ops: IntraopEventOps | null | undefined): void | Promise<void> => {
      if (!ops || isEmptyIntraopEventOps(ops)) return
      const callback = onEventOpsRef.current
      if (!callback) return
      // Keep the next queued action based on the latest local projection even
      // when React has not rendered the server acknowledgement yet.
      optimisticOps.current.push(ops)
      logRef.current = applyIntraopEventOps(logRef.current, ops) as LogEvent[]
      const removeOnFailure = () => {
        optimisticOps.current = optimisticOps.current.filter(item => item !== ops)
        logRef.current = optimisticOps.current.reduce(
          (current, pending) => applyIntraopEventOps(current, pending) as LogEvent[],
          baseLogRef.current,
        )
      }
      try {
        const result = callback(ops)
        if (result && typeof result === "object" && "then" in result) {
          return Promise.resolve(result).catch(error => {
            removeOnFailure()
            throw error
          })
        }
        return result
      } catch (error) {
        removeOnFailure()
        throw error
      }
    }
    const run = async () => apply(await produce())
    if (writeQueue.current) {
      const queued = writeQueue.current.then(run)
      writeQueue.current = queued.then(() => undefined, () => undefined)
      return queued
    }

    // Keep the first action synchronous when Core produces its operations
    // synchronously. This preserves immediate UI feedback while a Promise
    // returned by the save path still keeps later actions serialized.
    const produced = produce()
    if (produced && typeof produced === "object" && "then" in produced) {
      const started = Promise.resolve(produced).then(apply)
      writeQueue.current = started.then(() => undefined, () => undefined)
      return started
    }
    const callback = apply(produced)
    if (callback && typeof callback === "object" && "then" in callback) {
      const started = Promise.resolve(callback)
      writeQueue.current = started.then(() => undefined, () => undefined)
      return started
    }
    return Promise.resolve()
  }, [])

  const answer = useCallback((key: string, action: IntraopAttentionAction, atEndCase = false, choice?: string) => {
    if (readOnly || !onEventOpsRef.current) return
    const at = new Date(Math.floor(serverNow().getTime() / 60_000) * 60_000)
    enqueue(() => intraopResolveAttention(logRef.current, key, action, {
      now: serverNow(),
      endedAt: endedAtRef.current ?? (atEndCase ? at : null),
      vitals: vitalsRef.current,
      suggestions: suggestionsRef.current ? { ...suggestionsRef.current, now: serverNow() } : null,
    }, choice))
  }, [enqueue, readOnly])

  // A card opens by itself for a complication just logged on this screen ("the
  // picker you used turns into the card"); one already waiting when the
  // screen opened stays a line in the list.
  const [opened, open] = useState<string | null>(null)
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    const keys = entries.filter(entry => entry.suggestion?.item.type === "card").map(entry => entry.key)
    if (seen.current == null) { seen.current = new Set(keys); return }
    const fresh = entries.find(entry => {
      const item = entry.suggestion?.item
      if (item?.type !== "card" || seen.current!.has(entry.key)) return false
      const recorded = Date.parse(item.complication.recordedAt ?? item.complication.ts)
      return Number.isFinite(recorded) && serverNow().getTime() - recorded < 2 * 60_000
    })
    for (const key of keys) seen.current.add(key)
    if (fresh && !readOnly) open(fresh.key)
  }, [entries, readOnly])

  const applyOps = useCallback((ops: IntraopEventOps) => {
    if (readOnly || !onEventOpsRef.current || isEmptyIntraopEventOps(ops)) return
    enqueue(() => ops)
  }, [enqueue, readOnly])

  // An episode from the vitals questions closes at the first reading back
  // inside both limits, or at the case end -- Core decides, one save at a time.
  const closing = useRef(false)
  useEffect(() => {
    if (readOnly || !onEventOpsRef.current || !vitals || closing.current) return
    closing.current = true
    const run = enqueue(() => vitalEpisodeOps(logRef.current, vitalsRef.current, endedAtRef.current))
    void run.finally(() => { closing.current = false })
  }, [log, vitals, endedAt, readOnly, enqueue])

  const saveState = useCaseSaveState(caseId)
  const refused = useMemo(() => saveState.refused.map(item => {
    const entry = intraopRefusedEntry(item, locale, log)
    return {
      key: `${item.eventId}-${item.at}`,
      time: (timeZone ? localTimeOf(new Date(entry.at), timeZone) : null) ?? "",
      text: entry.text,
    }
  }), [saveState.refused, locale, log, timeZone])
  return { entries, endCaseEntries, answer, suggestions, applyOps, opened, open, log, canAnswer: !readOnly && !!onEventOps, saveState, refused, timeZone: timeZone ?? null }
}

function decorate(items: IntraopAttentionItem[], timeZone: string | null | undefined, locale: string, keepLogging = true): IntraopAttentionEntry[] {
  return items.map(item => {
    const vital = item.vital ? vitalQuestionText(item.vital, locale, keepLogging) : null
    return {
      ...item,
      // The case's zone, never the machine's: a hosted server runs at GMT+1.
      time: (timeZone ? localTimeOf(new Date(item.event.ts), timeZone) : null) ?? "",
      label: intraopAttentionText(item, locale),
      ...(vital ? { detail: vital.detail, stop: vital.stop } : {}),
    }
  })
}
