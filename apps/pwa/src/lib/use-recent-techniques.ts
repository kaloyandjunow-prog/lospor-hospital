import { useCallback, useEffect, useState } from "react"
import { addRecentTechniques } from "@lospor/core/technique-smart"
import { clinicalSyncKv } from "@/lib/clinical-sync-kv"

const KEY = "prefs:recentTechniques"

/**
 * The techniques this clinician used last (10.2.0), kept on this device. The list and how it is ordered are
 * Core's (technique-smart); this only reads and writes it.
 */
export function useRecentTechniques() {
  const [recents, setRecents] = useState<string[]>([])
  useEffect(() => {
    let live = true
    void clinicalSyncKv.get(KEY).then(raw => {
      if (!live || !raw) return
      try {
        const parsed: unknown = JSON.parse(raw)
        if (Array.isArray(parsed)) setRecents(addRecentTechniques(parsed.filter((item): item is string => typeof item === "string"), []))
      } catch { /* an unreadable list is an empty one */ }
    }).catch(() => {})
    return () => { live = false }
  }, [])
  const remember = useCallback((used: readonly string[]) => {
    if (used.length === 0) return
    setRecents(current => {
      const next = addRecentTechniques(current, used)
      void clinicalSyncKv.set(KEY, JSON.stringify(next)).catch(() => {})
      return next
    })
  }, [])
  return { recents, remember }
}
