"use client"

import { useCallback, useState } from "react"
import { addRecentTechniques } from "@lospor/core/technique-smart"

const KEY = "recentTechniques"

function read(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]")
    return Array.isArray(parsed) ? addRecentTechniques(parsed.filter((item): item is string => typeof item === "string"), []) : []
  } catch {
    return []
  }
}

/**
 * The techniques this clinician used last (10.2.0), kept in this browser. The list and how it is ordered are
 * Core's (technique-smart); this only reads and writes it.
 */
export function useRecentTechniques() {
  const [recents, setRecents] = useState<string[]>(() => (typeof window === "undefined" ? [] : read()))
  const remember = useCallback((used: readonly string[]) => {
    if (used.length === 0) return
    setRecents(current => {
      const next = addRecentTechniques(current, used)
      try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* a private window keeps none */ }
      return next
    })
  }, [])
  return { recents, remember }
}
