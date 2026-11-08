import type { VascularScreen } from "@lospor/core/clinical-preferences"
import { usePreferences } from "@/lib/preferences-context"
import { ScreenChoiceCard } from "./ScreenChoiceCard"

const SCREENS = [["smart", "vscrSmart"], ["legacy", "vscrLegacy"]] as const

/**
 * Which Vascular access tab this clinician sees (10.2.0): Smart selection, the default, or the legacy
 * tab as it was. The same account setting the web shows.
 */
export function VascularScreenCard({ compact = false }: { compact?: boolean }) {
  const { tc, vascularScreen, setVascularScreen } = usePreferences()
  return (
    <ScreenChoiceCard
      title={tc("vscrTitle")}
      value={vascularScreen}
      options={SCREENS.map(([value, label]) => ({ value, label: tc(label) }))}
      onChange={value => { void setVascularScreen(value as VascularScreen) }}
      testPrefix="vascular-screen"
      compact={compact}
      selectedLabel={compact ? tc("screenChoiceSelected") : undefined}
    />
  )
}
