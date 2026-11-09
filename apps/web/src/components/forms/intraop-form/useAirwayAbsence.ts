import { useWatch, type Control, type UseFormGetValues, type UseFormSetValue } from "react-hook-form"
import { airwayAbsentReason } from "@lospor/core/intraop"
import { airwayRecordFields, AIRWAY_RECORD_PATCH_KEYS, stripAirwayRecordPatch } from "@lospor/core/airway-smart"
import type { LogEvent } from "@lospor/core/intraop-types"
import type { IntraopEventOps } from "@lospor/core/intraop-timetable-edit"
import type { IntraopFormFields } from "../intraopSchema"
import { AIRWAY_EVENT_COLORS } from "./useChartedAirwayEvents"

/**
 * "Arrived intubated" and "no airway intervention". Form fields, not component
 * state: these are clinical facts, and holding them in useState meant they
 * relaxed the finalisation gate, were never saved, and vanished on reload,
 * leaving a record with no airway device and no reason for it.
 *
 * Both toggles go through core, so web and mobile cannot drift apart on them.
 * They are independent: a patient can arrive from the ICU already intubated AND
 * have no airway intervention here, which is both at once.
 */
export function useAirwayAbsence({ control, setValue, getValues, onEventOps, timelineLog, t }: {
  control: Control<IntraopFormFields>
  setValue: UseFormSetValue<IntraopFormFields>
  getValues: UseFormGetValues<IntraopFormFields>
  onEventOps?: (ops: IntraopEventOps) => void | Promise<void>
  timelineLog: readonly LogEvent[]
  t: (key: string) => string
}) {
  const presentsIntubated = useWatch({ control, name: "presentsIntubated" }) ?? false
  const airwayNA = useWatch({ control, name: "airwayNotApplicable" }) ?? false
  const applyAirwayAbsentReason = (which: "presentsIntubated" | "airwayNotApplicable") => {
    const next = airwayAbsentReason(which, { presentsIntubated, airwayNotApplicable: airwayNA })
    setValue("presentsIntubated", next.presentsIntubated, { shouldDirty: true })
    setValue("airwayNotApplicable", next.airwayNotApplicable, { shouldDirty: true })
    if (!next.airwayNotApplicable) return
    // “No airway intervention” is mutually exclusive with every selected
    // airway device and instrument, including the Smart airway entries.
    for (const [field, value] of Object.entries(airwayRecordFields([]))) {
      setValue(field as keyof IntraopFormFields, value as never, { shouldDirty: true })
    }
    if (which !== "airwayNotApplicable" || !onEventOps) return
    const update: LogEvent[] = []
    const remove: string[] = []
    for (const event of timelineLog) {
      if (event.type !== "clinical_event") continue
      const rawPatch = event.intraopPatch
      const patch = rawPatch && typeof rawPatch === "object" ? rawPatch as Record<string, unknown> : null
      const hasAirway = event.clinicalRelation === "airway-record"
        || AIRWAY_EVENT_COLORS[event.label ?? ""] != null
        || !!patch && Object.keys(patch).some(key => AIRWAY_RECORD_PATCH_KEYS.includes(key))
      if (!hasAirway) continue
      if (!patch) {
        if (event.id) remove.push(event.id)
        continue
      }
      const stripped = stripAirwayRecordPatch(patch)
      if (Object.keys(stripped).length === 0) {
        if (event.id) remove.push(event.id)
      } else {
        update.push({ ...event, intraopPatch: stripped } as unknown as LogEvent)
      }
    }
    if (update.length > 0 || remove.length > 0) void onEventOps({ add: [], update, remove })
  }
  const setPresentsIntubated = () => applyAirwayAbsentReason("presentsIntubated")
  const setAirwayNA = () => {
    if (!airwayNA) {
      const values = getValues()
      const hasRecordedAirway = (values.airwayDevices?.length ?? 0) > 0
        || (values.airwayDeviceEntries?.length ?? 0) > 0
        || (values.airwayTools?.length ?? 0) > 0
      if (hasRecordedAirway && typeof window !== "undefined" && !window.confirm(t("intraop.airway.clearRecorded"))) return
    }
    applyAirwayAbsentReason("airwayNotApplicable")
  }
  const clearAirwayNotApplicable = () => {
    if (airwayNA) setValue("airwayNotApplicable", false, { shouldDirty: true })
  }
  return { presentsIntubated, airwayNA, setPresentsIntubated, setAirwayNA, clearAirwayNotApplicable }
}
