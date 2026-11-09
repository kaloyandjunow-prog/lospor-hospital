import type { EquipmentScreen } from "@lospor/core/clinical-preferences"
import { usePreferences } from "@/lib/preferences-context"
import { ScreenChoiceCard } from "./ScreenChoiceCard"

const SCREENS = [["smart", "escrSmart"], ["legacy", "escrLegacy"]] as const

/**
 * Which Vascular access tab this clinician sees (10.2.0): Smart selection, the default, or the legacy
 * tab as it was. The same account setting the web shows.
 */
export function EquipmentScreenCard({ compact = false }: { compact?: boolean }) {
  const { tc, equipmentScreen, setEquipmentScreen } = usePreferences()
  return (
    <ScreenChoiceCard
      title={tc("escrTitle")}
      value={equipmentScreen}
      options={SCREENS.map(([value, label]) => ({ value, label: tc(label) }))}
      onChange={value => { void setEquipmentScreen(value as EquipmentScreen) }}
      testPrefix="equipment-screen"
      compact={compact}
      selectedLabel={compact ? tc("screenChoiceSelected") : undefined}
    />
  )
}
