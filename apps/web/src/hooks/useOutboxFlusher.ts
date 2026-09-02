"use client"

// Replays the offline save tray (src/lib/case-outbox.ts): once on mount
// (with a crash-recovery reconcile), then on a self-scheduling rhythm from
// the shared backoff policy — 15 s heartbeat while healthy, 5 s → 15 s → 60 s
// while saves keep failing — and immediately (with a streak reset) on
// reconnect and tab focus. Mount ONCE app-wide (OutboxBadge); pages that
// want the result subscribe via onOutboxChange instead of mounting again.
import { useEffect, useRef } from "react"
import { createBackoffPolicy } from "@lospor/core/sync"
import { autosaveManager } from "@/lib/autosave-manager"

export function useOutboxFlusher(onFlushed?: (result: { saved: number; failed: number; discarded: number }) => void): void {
  const onFlushedRef = useRef(onFlushed)
  useEffect(() => { onFlushedRef.current = onFlushed }, [onFlushed])

  useEffect(() => {
    let cancelled = false
    let flushing = false
    let reconciled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const policy = createBackoffPolicy()

    const schedule = (delay: number) => {
      if (cancelled) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { void flush() }, delay)
    }

    const flush = async () => {
      if (cancelled || flushing) return
      flushing = true
      let outcome: "ok" | "failed" | "idle" = "idle"
      try {
        // Cross-TAB exclusivity: only one tab flushes at a time so two tabs
        // can't double-send or lost-update the queue indexes. Falls back to
        // unguarded flush where the Web Locks API is unavailable.
        const run = async () => {
          if (!reconciled) {
            reconciled = true
            await autosaveManager.outbox.reconcile()
          }
          const result = await autosaveManager.flushAll()
          // A conflict is not a network problem — it is waiting on a
          // clinician, not on connectivity — so it does not trip backoff;
          // the item stays queued and this same flush re-reports it next
          // cycle until resolveConflict (or a same-page save) clears it.
          outcome = result.failed > 0 ? "failed" : result.saved > 0 || result.discarded > 0 ? "ok" : "idle"
          if (!cancelled && (result.saved > 0 || result.failed > 0 || result.discarded > 0)) {
            onFlushedRef.current?.(result)
          }
        }
        if (typeof navigator !== "undefined" && navigator.locks?.request) {
          await navigator.locks.request("lospor-outbox-flush", { ifAvailable: true }, async (lock) => {
            if (lock) await run() // another tab holds it — skip this cycle
          })
        } else {
          await run()
        }
      } catch {
        outcome = "failed"
      } finally {
        flushing = false
        schedule(policy.nextDelay(outcome))
      }
    }

    // Connectivity returned / user came back: forget the failure streak and
    // try right away.
    const flushNow = () => {
      policy.reset()
      void flush()
    }

    void flush()
    window.addEventListener("online", flushNow)
    window.addEventListener("focus", flushNow)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      window.removeEventListener("online", flushNow)
      window.removeEventListener("focus", flushNow)
    }
  }, [])
}
