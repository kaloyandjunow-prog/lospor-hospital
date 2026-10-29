import { useCallback, useEffect, useState } from "react"
import { OPERATING_THEATRES_OFF, parseOperatingTheatreConfig, type OperatingTheatreConfig } from "@lospor/core/operating-theatres"
import { ApiError, apiJson } from "@/lib/api"

/**
 * The site's operating theatres (10.0.0): whether it uses them and which it
 * offers, from Status. Off, or offline before the first read, the phone shows
 * nothing of them.
 */
let cached: OperatingTheatreConfig | null = null

export function useOperatingTheatres(): { config: OperatingTheatreConfig; reload: () => Promise<void> } {
  const [config, setConfig] = useState<OperatingTheatreConfig>(cached ?? OPERATING_THEATRES_OFF)
  const reload = useCallback(async () => {
    try {
      cached = parseOperatingTheatreConfig(await apiJson<unknown>("/api/operating-theatres"))
      setConfig(cached)
    } catch {
      // Keep what was last read: a dropped connection is not the site switching theatres off.
    }
  }, [])
  useEffect(() => { void reload() }, [reload])
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
