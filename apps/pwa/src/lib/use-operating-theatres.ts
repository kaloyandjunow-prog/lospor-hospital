import { useCallback, useEffect, useState } from "react"
import { OPERATING_THEATRES_OFF, parseOperatingTheatreConfig, type OperatingTheatreConfig } from "@lospor/core/operating-theatres"
import { ApiError, apiJson } from "@/lib/api"

/**
 * The site's operating theatres (10.0.0): whether it uses them and which it
 * offers, from Status. Off, or offline before the first read, the phone shows
 * nothing of them.
 */
let cached: OperatingTheatreConfig | null = null
const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const

export function useOperatingTheatres(): { config: OperatingTheatreConfig; reload: () => Promise<boolean> } {
  const [config, setConfig] = useState<OperatingTheatreConfig>(cached ?? OPERATING_THEATRES_OFF)
  const reload = useCallback(async (): Promise<boolean> => {
    try {
      cached = parseOperatingTheatreConfig(await apiJson<unknown>("/api/operating-theatres"))
      setConfig(cached)
      return true
    } catch {
      // Keep what was last read: a dropped connection is not the site switching theatres off.
      return false
    }
  }, [])
  useEffect(() => {
    let disposed = false
    let inFlight = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let retryIndex = 0

    const cancelRetry = () => {
      if (retryTimer !== null) clearTimeout(retryTimer)
      retryTimer = null
    }

    const load = async () => {
      if (disposed || inFlight) return
      inFlight = true
      const success = await reload()
      inFlight = false
      if (disposed) return
      if (success) {
        retryIndex = 0
        cancelRetry()
        return
      }
      const delay = RETRY_DELAYS_MS[Math.min(retryIndex, RETRY_DELAYS_MS.length - 1)]
      retryIndex += 1
      retryTimer = setTimeout(() => {
        retryTimer = null
        void load()
      }, delay)
    }

    const refreshWhenForeground = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return
      cancelRetry()
      retryIndex = 0
      void load()
    }

    void load()
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", refreshWhenForeground)
    if (typeof window !== "undefined") window.addEventListener("focus", refreshWhenForeground)

    return () => {
      disposed = true
      cancelRetry()
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", refreshWhenForeground)
      if (typeof window !== "undefined") window.removeEventListener("focus", refreshWhenForeground)
    }
  }, [reload])
  return { config, reload }
}

/** Someone changed the case's theatre after this screen last read it. */
export class TheatreChangedError extends Error {
  constructor(readonly current: { id: string; name: string } | null, readonly changedBy: string | null) {
    super("THEATRE_CHANGED")
  }
}

/**
 * Assigns a case's theatre, or clears it (null). `expected` is the theatre the
 * screen showed: if the case has another by now the server refuses, and this
 * throws TheatreChangedError rather than overwriting it. Any other refusal is
 * thrown in the app's language.
 */
export async function assignCaseTheatre(caseId: string, theatreId: string | null, expected: string | null): Promise<void> {
  try {
    await apiJson(`/api/cases/${caseId}/theatre`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theatreId, expectedTheatreId: expected }),
    })
  } catch (error) {
    if (error instanceof ApiError && error.sourceMessage === "THEATRE_CHANGED") {
      const details = error.details as { current?: { id: string; name: string } | null; changedBy?: string | null } | undefined
      throw new TheatreChangedError(details?.current ?? null, details?.changedBy ?? null)
    }
    throw error
  }
}

/** The dashboard's filters as the case list takes them (10.0.0). */
export type DashboardFilter = { theatre: string | null; assignee: string | null }

export function dashboardFilterQuery(filter: DashboardFilter): string {
  const params = new URLSearchParams()
  if (filter.theatre) params.set("theatre", filter.theatre)
  if (filter.assignee) params.set("assignee", filter.assignee)
  const query = params.toString()
  return query ? `&${query}` : ""
}
