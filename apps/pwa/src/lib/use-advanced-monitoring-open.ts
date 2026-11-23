import { useEffect, useState } from "react"

/** The advanced monitoring section is open from the start when Settings say so, once the preferences are loaded. */
export function useAdvancedMonitoringOpen(preferencesReady: boolean, defaultMonitoring: string | undefined) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (preferencesReady && defaultMonitoring === "advanced") setOpen(true)
  }, [preferencesReady, defaultMonitoring])
  return [open, setOpen] as const
}
