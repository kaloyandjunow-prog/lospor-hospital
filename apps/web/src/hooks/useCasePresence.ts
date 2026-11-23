"use client"

import { useEffect, useState } from "react"
import { CASE_PRESENCE_HEARTBEAT_MS, type CasePresence } from "@lospor/core/case-presence"
import { getDeviceId } from "./useCaseLock"

/**
 * Who has this case open (10.8.0): the screen reports itself while the case is open and is told who else
 * is in it. A notice only -- several people work in one case and the last edit wins.
 */
export function useCasePresence(caseId: string | null, enabled = true): CasePresence | null {
  // The answer belongs to the case it was given for: another case, or the notice switched off, shows nothing.
  const [answer, setAnswer] = useState<{ caseId: string; presence: CasePresence } | null>(null)

  useEffect(() => {
    if (!caseId || !enabled) return
    const deviceId = getDeviceId()
    const url = `/api/cases/${caseId}/presence`
    const send = (method: "POST" | "DELETE", signal?: AbortSignal) => fetch(url, {
      method,
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
      keepalive: method === "DELETE",
    })
    let stopped = false
    const controller = new AbortController()
    const report = async () => {
      // Never report after leaving: a report that lands after the DELETE would keep this screen listed until the TTL.
      if (stopped) return
      try {
        const response = await send("POST", controller.signal)
        if (!response.ok || stopped) return
        const presence = await response.json() as CasePresence
        if (!stopped) setAnswer({ caseId, presence })
      } catch { /* offline: the last answer stays until the next report */ }
    }
    void report()
    const timer = setInterval(() => { void report() }, CASE_PRESENCE_HEARTBEAT_MS)
    const leave = () => { void send("DELETE").catch(() => {}) }
    // Closing the tab or leaving the page does not unmount the hook: leave then too, or the others hear of it a minute late.
    window.addEventListener("pagehide", leave)
    return () => {
      stopped = true
      controller.abort()
      clearInterval(timer)
      window.removeEventListener("pagehide", leave)
      leave()
    }
  }, [caseId, enabled])

  return enabled && caseId && answer?.caseId === caseId ? answer.presence : null
}
