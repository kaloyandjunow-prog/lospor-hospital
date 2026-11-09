import type { MonitoringScreen } from "@lospor/core/clinical-preferences"
import { usePreferences } from "@/lib/preferences-context"
import { ScreenChoiceCard } from "./ScreenChoiceCard"

const SCREENS = [["smart", "mscrSmart"], ["legacy", "mscrLegacy"]] as const

/**
 * Which Vascular access tab this clinician sees (10.2.0): Smart selection, the default, or the legacy
 * tab as it was. The same account setting the web shows.
 */
export function MonitoringScreenCard({ compact = false }: { compact?: boolean }) {
  const { tc, monitoringScreen, setMonitoringScreen } = usePreferences()
  return (
    <ScreenChoiceCard
      title={tc("mscrTitle")}
      value={monitoringScreen}
      options={SCREENS.map(([value, label]) => ({ value, label: tc(label) }))}
      onChange={value => { void setMonitoringScreen(value as MonitoringScreen) }}
      testPrefix="monitoring-screen"
      compact={compact}
      selectedLabel={compact ? tc("screenChoiceSelected") : undefined}
    />
  )
}
