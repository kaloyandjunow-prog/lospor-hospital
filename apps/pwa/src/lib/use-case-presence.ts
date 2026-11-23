import { useEffect, useState } from "react"
import { CASE_PRESENCE_HEARTBEAT_MS, type CasePresence } from "@lospor/core/case-presence"
import { apiFetch } from "@/lib/api"
import { getDeviceId } from "@/lib/use-case-lock"

/**
 * Who has this case open (10.8.0): the screen reports itself while the case is open and is told who else is
 * in it. A notice only -- several people work in one case and the last edit wins.
 */
export function useCasePresence(caseId: string | null, enabled = true): CasePresence | null {
  const [presence, setPresence] = useState<CasePresence | null>(null)

  useEffect(() => {
    if (!caseId || !enabled) return
    let stopped = false
    let timer: ReturnType<typeof setInterval> | null = null
    let deviceId = ""
    const send = (method: "POST" | "DELETE") => apiFetch(`/api/cases/${caseId}/presence`, { method, body: JSON.stringify({ deviceId }) })
    const report = async () => {
      try {
        const response = await send("POST")
        if (!response.ok || stopped) return
        setPresence(await response.json() as CasePresence)
      } catch { /* offline: the last answer stays until the next report */ }
    }
    void getDeviceId().then(id => {
      if (stopped) return
      deviceId = id
      void report()
      timer = setInterval(() => { void report() }, CASE_PRESENCE_HEARTBEAT_MS)
    })
    const leave = () => { if (deviceId) void send("DELETE").catch(() => {}) }
    // On the web build (the PWA) closing the tab does not unmount the screen: leave then too.
    const win = typeof window !== "undefined" && typeof window.addEventListener === "function" ? window : null
    win?.addEventListener("pagehide", leave)
    return () => {
      stopped = true
      if (timer) clearInterval(timer)
      win?.removeEventListener("pagehide", leave)
      leave()
    }
  }, [caseId, enabled])

  return presence
}
