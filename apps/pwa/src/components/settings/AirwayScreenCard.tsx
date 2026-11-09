import type { AirwayScreen } from "@lospor/core/clinical-preferences"
import { usePreferences } from "@/lib/preferences-context"
import { ScreenChoiceCard } from "./ScreenChoiceCard"

const SCREENS = [["smart", "ascrSmart"], ["legacy", "ascrLegacy"]] as const

/**
 * Which Airway tab this clinician sees (10.2.0): Smart selection, the default,
 * or the legacy tab as it was. The same account setting the web shows.
 */
export function AirwayScreenCard({ compact = false }: { compact?: boolean }) {
  const { tc, airwayScreen, setAirwayScreen } = usePreferences()
  return (
    <ScreenChoiceCard
      title={tc("ascrTitle")}
      value={airwayScreen}
      options={SCREENS.map(([value, label]) => ({ value, label: tc(label) }))}
      onChange={value => { void setAirwayScreen(value as AirwayScreen) }}
      testPrefix="airway-screen"
      compact={compact}
      selectedLabel={compact ? tc("screenChoiceSelected") : undefined}
    />
  )
}
