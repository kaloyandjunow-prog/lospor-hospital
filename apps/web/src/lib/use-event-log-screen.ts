"use client"

import { useEffect, useState } from "react"
import type { EventLogScreen } from "@lospor/core/clinical-preferences"
import { readWebClinicalPreferences, syncWebClinicalPreferences } from "@/lib/clinical-preferences-web"

/** Which intraoperative Event log presentation this clinician sees. */
export function useEventLogScreen(): EventLogScreen {
  const [screen, setScreen] = useState<EventLogScreen>(() => readWebClinicalPreferences().eventLogScreen ?? "smart")
  useEffect(() => {
    let live = true
    void syncWebClinicalPreferences().then(preferences => { if (live) setScreen(preferences.eventLogScreen ?? "smart") }).catch(() => {})
    return () => { live = false }
  }, [])
  return screen
}
