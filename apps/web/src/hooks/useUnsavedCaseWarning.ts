"use client"

import { useEffect } from "react"

/** Browser-only guard: warns on close/reload but never serialises clinical data. */
export function useUnsavedCaseWarning(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [enabled])
}
