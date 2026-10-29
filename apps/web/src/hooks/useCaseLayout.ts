"use client"

import { useCallback, useEffect, useState } from "react"
import { caseLayoutWrites, DEFAULT_CASE_LAYOUT, isCaseLayoutKey, readCaseLayout, type CaseLayout } from "@/lib/case-layout"

function readStored(): CaseLayout {
  try {
    return readCaseLayout(key => window.localStorage.getItem(key))
  } catch {
    return DEFAULT_CASE_LAYOUT
  }
}

/**
 * The case screens' layout setting, kept in step across tabs and with the
 * Settings menu, which announces a change as a storage event.
 */
export function useCaseLayout(): [CaseLayout, (change: Partial<CaseLayout>) => void] {
  const [layout, setLayout] = useState<CaseLayout>(DEFAULT_CASE_LAYOUT)

  useEffect(() => {
    // localStorage is not readable while rendering on the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of stored preferences on mount
    setLayout(readStored())
    const onStorage = (event: StorageEvent) => { if (isCaseLayoutKey(event.key)) setLayout(readStored()) }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const update = useCallback((change: Partial<CaseLayout>) => {
    for (const [key, value] of caseLayoutWrites(change)) {
      try { window.localStorage.setItem(key, value) } catch { /* private mode: this session only */ }
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }))
    }
    setLayout(current => ({ ...current, ...change }))
  }, [])

  return [layout, update]
}
