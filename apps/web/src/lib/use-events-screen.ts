"use client"

import { useEffect, useState } from "react"
import type { EventsScreen } from "@lospor/core/clinical-preferences"
import { readWebClinicalPreferences, syncWebClinicalPreferences } from "@/lib/clinical-preferences-web"

/**
 * Which Event selector this clinician sees (10.2.0): Smart selection unless they chose the
 * legacy one in Settings. Read from the device first, then from the account, so the tab does not
 * flash the wrong one.
 */
export function useEventsScreen(): EventsScreen {
  const [screen, setScreen] = useState<EventsScreen>(() => readWebClinicalPreferences().eventsScreen ?? "smart")
  useEffect(() => {
    let live = true
    void syncWebClinicalPreferences().then(preferences => { if (live) setScreen(preferences.eventsScreen ?? "smart") }).catch(() => {})
    return () => { live = false }
  }, [])
  return screen
}
