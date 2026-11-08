import type { FluidsScreen } from "@lospor/core/clinical-preferences"
import { usePreferences } from "@/lib/preferences-context"
import { ScreenChoiceCard } from "./ScreenChoiceCard"

const SCREENS = [["smart", "fscrSmart"], ["legacy", "fscrLegacy"]] as const

/** Which Fluid status tab this clinician sees: the hybrid summary or the tab as it was. */
export function FluidScreenCard({ compact = false }: { compact?: boolean }) {
  const { tc, fluidsScreen, setFluidsScreen } = usePreferences()
  return (
    <ScreenChoiceCard
      title={tc("fscrTitle")}
      value={fluidsScreen}
      options={SCREENS.map(([value, label]) => ({ value, label: tc(label) }))}
      onChange={value => { void setFluidsScreen(value as FluidsScreen) }}
      testPrefix="fluids-screen"
      compact={compact}
      selectedLabel={compact ? tc("screenChoiceSelected") : undefined}
    />
  )
}
