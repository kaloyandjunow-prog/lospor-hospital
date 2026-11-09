import type { TechniqueScreen } from "@lospor/core/clinical-preferences"
import { usePreferences } from "@/lib/preferences-context"
import { ScreenChoiceCard } from "./ScreenChoiceCard"

const SCREENS = [["smart", "tscrSmart"], ["legacy", "tscrLegacy"]] as const

/**
 * Which Vascular access tab this clinician sees (10.2.0): Smart selection, the default, or the legacy
 * tab as it was. The same account setting the web shows.
 */
export function TechniqueScreenCard({ compact = false }: { compact?: boolean }) {
  const { tc, techniqueScreen, setTechniqueScreen } = usePreferences()
  return (
    <ScreenChoiceCard
      title={tc("tscrTitle")}
      value={techniqueScreen}
      options={SCREENS.map(([value, label]) => ({ value, label: tc(label) }))}
      onChange={value => { void setTechniqueScreen(value as TechniqueScreen) }}
      testPrefix="technique-screen"
      compact={compact}
      selectedLabel={compact ? tc("screenChoiceSelected") : undefined}
    />
  )
}
