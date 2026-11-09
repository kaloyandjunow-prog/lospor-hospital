import type { EventsScreen } from "@lospor/core/clinical-preferences"
import { usePreferences } from "@/lib/preferences-context"
import { ScreenChoiceCard } from "./ScreenChoiceCard"

const SCREENS = [["smart", "evscrSmart"], ["legacy", "evscrLegacy"]] as const

/**
 * Which Vascular access tab this clinician sees (10.2.0): Smart selection, the default, or the legacy
 * tab as it was. The same account setting the web shows.
 */
export function EventsScreenCard({ compact = false }: { compact?: boolean }) {
  const { tc, eventsScreen, setEventsScreen } = usePreferences()
  return (
    <ScreenChoiceCard
      title={tc("evscrTitle")}
      value={eventsScreen}
      options={SCREENS.map(([value, label]) => ({ value, label: tc(label) }))}
      onChange={value => { void setEventsScreen(value as EventsScreen) }}
      testPrefix="events-screen"
      compact={compact}
      selectedLabel={compact ? tc("screenChoiceSelected") : undefined}
    />
  )
}
