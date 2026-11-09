"use client"

import { useCallback, useEffect, useState } from "react"
import { caseLayoutWrites, DEFAULT_CASE_LAYOUT, isCaseLayoutKey, readCaseLayout, type CaseLayout } from "@/lib/case-layout"
import { patchWebClinicalPreferences, syncWebClinicalPreferences } from "@/lib/clinical-preferences-web"

/** The same layout keeps the same object, so a re-read that finds nothing new re-renders nobody. */
function keep(current: CaseLayout, next: CaseLayout): CaseLayout {
  return (Object.keys(next) as Array<keyof CaseLayout>).every(key => current[key] === next[key]) ? current : next
}

function readStored(): CaseLayout {
  try {
    return readCaseLayout(key => window.localStorage.getItem(key))
  } catch {
    return DEFAULT_CASE_LAYOUT
  }
}

/**
 * The case screens' account-wide layout, kept in step across tabs and with the
 * Settings menu. localStorage remains a compatibility/migration layer and the
 * API is the account authority once it responds.
 */
export function useCaseLayout(): [CaseLayout, (change: Partial<CaseLayout>) => void] {
  const [layout, setLayout] = useState<CaseLayout>(DEFAULT_CASE_LAYOUT)

  useEffect(() => {
    // localStorage is not readable while rendering on the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of stored preferences on mount
    setLayout(current => keep(current, readStored()))
    let active = true
    void syncWebClinicalPreferences().then(preferences => {
      if (!active) return
      const accountLayout = preferences.caseLayout
      setLayout(current => keep(current, accountLayout))
      for (const [key, value] of caseLayoutWrites(accountLayout)) {
        try { window.localStorage.setItem(key, value) } catch { /* private mode: session only */ }
      }
    }).catch(() => {})
    const onStorage = (event: StorageEvent) => { if (isCaseLayoutKey(event.key)) setLayout(current => keep(current, readStored())) }
    window.addEventListener("storage", onStorage)
    return () => {
      active = false
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  const update = useCallback((change: Partial<CaseLayout>) => {
    for (const [key, value] of caseLayoutWrites(change)) {
      try { window.localStorage.setItem(key, value) } catch { /* private mode: this session only */ }
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }))
    }
    setLayout(current => ({ ...current, ...change }))
    void patchWebClinicalPreferences({ caseLayout: change }).catch(() => {})
  }, [])

  return [layout, update]
}
