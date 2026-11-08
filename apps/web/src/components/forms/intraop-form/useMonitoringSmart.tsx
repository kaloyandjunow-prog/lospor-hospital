import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react"
import { useWatch, type Control, type UseFormGetValues, type UseFormSetValue } from "react-hook-form"
import { airwayDeviceEntriesOf } from "@lospor/core/airway-device-entries"
import { monitoringDismissalEventId } from "@lospor/core/intraop-automation-actions"
import type { LogEvent } from "@lospor/core/intraop-types"
import type { IntraopEventOps } from "@lospor/core/intraop-timetable-edit"
import { MONITORING_READINGS, asksNibpOff, isRelaxant, monitoringAutomationId, monitoringSuggestionKey, monitoringSuggestions, type MonitoringSuggestion } from "@lospor/core/monitoring-smart"
import { MonitoringSmart } from "@/components/intraop/MonitoringSmart"
import { serverNow } from "@/lib/intraop-clock"
import { useMonitoringScreen } from "@/lib/use-monitoring-screen"
import type { useSuggestionContext } from "@/lib/use-intraop-automation"
import type { useOptionLibrary } from "@/hooks/useOptionLibrary"
import type { VitalKey } from "@/types/timetable"
import type { IntraopFormFields } from "../intraopSchema"

/** The timetable row each monitor reading is entered in. */
const MONITOR_VITAL_KEY = { bisValue: "bis", tofRatio: "tofRatio", cvpMmHg: "cvp", etco2: "etco2", temp: "temp" } as const satisfies Record<string, VitalKey>

/**
 * Smart selection for monitoring (10.2.0): standard in one switch and the monitors this case calls for. What is
 * suggested and when a reading is due is Core's (monitoring-smart); a monitor added sets the same flag the legacy
 * section sets.
 */
export function useMonitoringSmart({ control, setValue, getValues, monitoringOptions, timelineLog, techniques, vascularLines, chartStartedAt, suggestionContext, onEventOps, readOnly, setVitalFocusRequest }: {
  control: Control<IntraopFormFields>
  setValue: UseFormSetValue<IntraopFormFields>
  getValues: UseFormGetValues<IntraopFormFields>
  monitoringOptions: ReturnType<typeof useOptionLibrary>["options"]
  timelineLog: readonly LogEvent[]
  techniques: string[]
  vascularLines: () => never[] | readonly unknown[]
  chartStartedAt: string | null | undefined
  suggestionContext: ReturnType<typeof useSuggestionContext>
  onEventOps?: (ops: IntraopEventOps) => void | Promise<void>
  readOnly: boolean
  setVitalFocusRequest: Dispatch<SetStateAction<{ key: VitalKey; nonce: number } | null>>
}) {
  const monitoringScreen = useMonitoringScreen()
  const watchedMonitoring = useWatch({ control, name: monitoringOptions.map(option => option.value as keyof IntraopFormFields) })
  const hiddenMonitors = useMemo(() => timelineLog
    .filter(event => event.type === "prompt_answer" && event.answer === "not_now" && event.answerKind?.startsWith("monitor:") && typeof event.answerFor === "string")
    .map(event => event.answerFor as string), [timelineLog])
  const activeMonitoring = monitoringOptions.filter((_option, index) => Boolean(watchedMonitoring[index])).map(option => option.value)
  const [nibpOffPrompt, setNibpOffPrompt] = useState<string[] | null>(null)
  function setMonitoringFields(next: readonly string[]) {
    for (const option of monitoringOptions) setValue(option.value as keyof IntraopFormFields, next.includes(option.value) as never, { shouldDirty: true })
  }
  function applyMonitoring(next: string[]) {
    setMonitoringFields(next)
    // An arterial line going on with the cuff still on asks once whether to turn the cuff off.
    if (asksNibpOff(activeMonitoring, next)) setNibpOffPrompt(next)
  }
  const monitoringSuggestionList = monitoringSuggestions({
    monitoring: activeMonitoring, techniques, airway: airwayDeviceEntriesOf(getValues() as Record<string, unknown>), lines: vascularLines() as never, hidden: hiddenMonitors,
    relaxantAt: timelineLog.find(event => event.type === "drug" && !!event.name && isRelaxant(event.name))?.ts ?? null,
    startedAt: chartStartedAt ?? null, now: serverNow(),
    settings: suggestionContext?.settings ?? null, user: suggestionContext?.user ?? null,
  })
  const dismissMonitoringSuggestion = useCallback((suggestion: MonitoringSuggestion) => {
    if (!onEventOps) return
    const occurrence = suggestion.key ?? monitoringSuggestionKey(suggestion.field, suggestion.at)
    const nowIso = serverNow().toISOString()
    void onEventOps({
      add: [{
        id: monitoringDismissalEventId(suggestion.field, occurrence),
        ts: nowIso,
        type: "prompt_answer",
        answerKind: monitoringAutomationId(suggestion.field),
        answerFor: occurrence,
        answer: "not_now",
        suggestion: monitoringAutomationId(suggestion.field),
        recordedAt: nowIso,
      }],
      update: [], remove: [],
    })
  }, [onEventOps])
  function lastMonitorReading(field: string) {
    const key = MONITOR_VITAL_KEY[MONITORING_READINGS[field]?.vital ?? "temp"]
    // A value auto-fill carried forward is not a reading: counting it would keep EtCO2 and temperature from ever falling due.
    const event = [...timelineLog].reverse().find(item => item.type === "vital" && !item.autoFilled && typeof item[key] === "number")
    return event ? { text: String(event[key]), at: event.ts } : null
  }
  const monitoringNode = monitoringScreen === "smart" && !readOnly ? (
    <MonitoringSmart monitoring={activeMonitoring} onChange={applyMonitoring} monitoringOptions={monitoringOptions} suggestions={monitoringSuggestionList}
      onHide={dismissMonitoringSuggestion} lastReading={lastMonitorReading} now={() => serverNow().toISOString()} dueMinutes={suggestionContext?.settings?.monitoringDueMinutes}
      onReading={field => setVitalFocusRequest(current => ({ key: MONITOR_VITAL_KEY[MONITORING_READINGS[field]?.vital ?? "temp"], nonce: (current?.nonce ?? 0) + 1 }))} />
  ) : undefined
  return { monitoringNode, applyMonitoring, setMonitoringFields, nibpOffPrompt, setNibpOffPrompt }
}
