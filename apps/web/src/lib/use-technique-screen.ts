"use client"

import { useEffect, useState } from "react"
import type { TechniqueScreen } from "@lospor/core/clinical-preferences"
import { readWebClinicalPreferences, syncWebClinicalPreferences } from "@/lib/clinical-preferences-web"

/**
 * Which Technique tab this clinician sees (10.2.0): Smart selection unless they chose the
 * legacy one in Settings. Read from the device first, then from the account, so the tab does not
 * flash the wrong one.
 */
export function useTechniqueScreen(): TechniqueScreen {
  const [screen, setScreen] = useState<TechniqueScreen>(() => readWebClinicalPreferences().techniqueScreen ?? "smart")
  useEffect(() => {
    let live = true
    void syncWebClinicalPreferences().then(preferences => { if (live) setScreen(preferences.techniqueScreen ?? "smart") }).catch(() => {})
    return () => { live = false }
  }, [])
  return screen
}
