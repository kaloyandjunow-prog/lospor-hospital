import type { EventLogScreen } from "@lospor/core/clinical-preferences"
import { usePreferences } from "@/lib/preferences-context"
import { ScreenChoiceCard } from "./ScreenChoiceCard"

const SCREENS = [["smart", "elgscrSmart"], ["legacy", "elgscrLegacy"]] as const

/** Which intraoperative Event log this clinician sees. */
export function EventLogScreenCard({ compact = false }: { compact?: boolean }) {
  const { tc, eventLogScreen, setEventLogScreen } = usePreferences()
  return (
    <ScreenChoiceCard
      title={tc("elgscrTitle")}
      value={eventLogScreen}
      options={SCREENS.map(([value, label]) => ({ value, label: tc(label) }))}
      onChange={value => { void setEventLogScreen(value as EventLogScreen) }}
      testPrefix="event-log-screen"
      compact={compact}
      selectedLabel={compact ? tc("screenChoiceSelected") : undefined}
    />
  )
}
