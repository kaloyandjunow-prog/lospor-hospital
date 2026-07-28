"use client"
import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createSingleFlightPoller } from "@lospor/core/sync"

const POLL_MS = 10_000

/**
 * Keeps an open case in step with edits made elsewhere (a colleague, or your
 * own phone).
 *
 * This previously held an SSE stream open. On serverless that can never work:
 * the request that writes the change and the request holding the stream open
 * are handled by different instances, and the in-process emitter they shared
 * existed in only one of them — so the stream stayed silent and the page never
 * updated. Polling a few timestamps is less elegant but actually delivers the
 * update, on any deployment.
 *
 * Refreshes only when something really changed, so a case left open does not
 * re-render on a timer.
 */
export function LiveCaseUpdater({ caseId }: { caseId: string }) {
  const router = useRouter()
  const lastSeen = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function check() {
      // No point polling a case nobody is currently looking at.
      if (typeof document !== "undefined" && document.hidden) return
      try {
        const res = await fetch(`/api/cases/${caseId}/version`, { cache: "no-store" })
        if (!res.ok || cancelled) return
        const v = await res.json() as Record<string, string | null>
        const stamp = [v.updatedAt, v.preopUpdatedAt, v.intraopUpdatedAt, v.postopUpdatedAt, v.status].join("|")
        if (lastSeen.current === null) {
          lastSeen.current = stamp   // first read is the baseline, not a change
          return
        }
        if (stamp !== lastSeen.current) {
          lastSeen.current = stamp
          window.dispatchEvent(new CustomEvent("case-live-update", { detail: v }))
          router.refresh()
        }
      } catch {
        // Offline or a blip — the next tick tries again.
      }
    }

    const poller = createSingleFlightPoller({
      intervalMs: POLL_MS,
      poll: check,
      isActive: () => !document.hidden,
      scheduler: {
        schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
        cancel: handle => window.clearTimeout(handle as number),
      },
    })
    // Catch up immediately when the user returns to the tab.
    const onVisible = () => { if (!document.hidden) void poller.trigger() }
    document.addEventListener("visibilitychange", onVisible)
    poller.start()
    void poller.trigger()

    return () => {
      cancelled = true
      poller.stop()
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [caseId, router])

  return null
}
