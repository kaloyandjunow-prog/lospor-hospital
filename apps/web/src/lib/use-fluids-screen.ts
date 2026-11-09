"use client"

import { useEffect, useState } from "react"
import type { FluidsScreen } from "@lospor/core/clinical-preferences"
import { readWebClinicalPreferences, syncWebClinicalPreferences } from "@/lib/clinical-preferences-web"

/** Which Fluid status presentation this clinician sees. */
export function useFluidsScreen(): FluidsScreen {
  const [screen, setScreen] = useState<FluidsScreen>(() => readWebClinicalPreferences().fluidsScreen ?? "smart")
  useEffect(() => {
    let live = true
    void syncWebClinicalPreferences().then(preferences => { if (live) setScreen(preferences.fluidsScreen ?? "smart") }).catch(() => {})
    return () => { live = false }
  }, [])
  return screen
}
