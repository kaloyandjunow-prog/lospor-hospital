"use client"

import { useEffect, useState } from "react"
import type { VascularScreen } from "@lospor/core/clinical-preferences"
import { readWebClinicalPreferences, syncWebClinicalPreferences } from "@/lib/clinical-preferences-web"

/**
 * Which Vascular access tab this clinician sees (10.2.0): Smart selection unless they chose the
 * legacy one in Settings. Read from the device first, then from the account, so the tab does not
 * flash the wrong one.
 */
export function useVascularScreen(): VascularScreen {
  const [screen, setScreen] = useState<VascularScreen>(() => readWebClinicalPreferences().vascularScreen ?? "smart")
  useEffect(() => {
    let live = true
    void syncWebClinicalPreferences().then(preferences => { if (live) setScreen(preferences.vascularScreen ?? "smart") }).catch(() => {})
    return () => { live = false }
  }, [])
  return screen
}
