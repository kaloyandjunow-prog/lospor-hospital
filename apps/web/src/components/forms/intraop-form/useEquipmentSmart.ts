import { useWatch, type Control, type UseFormGetValues, type UseFormSetValue } from "react-hook-form"
import { airwayDeviceEntriesOf, airwayPrimaryConflict, hasActiveTrachealTube, type AirwayDeviceEntry } from "@lospor/core/airway-device-entries"
import { addAirwayDevice, airwayClinicalEvent, airwayRecordFields, resolveAirwayTime, suggestedAirwayDetails, type AirwayPatient } from "@lospor/core/airway-smart"
import { clinicalRecordId } from "@lospor/core/clinical-record-id"
import { useEquipmentScreen } from "@/lib/use-equipment-screen"
import type { MutableRefObject } from "react"
import type { IntraopFormFields } from "../intraopSchema"

/**
 * Smart selection for equipment (10.2.0). Calculated suggestions compare with the canonical Airway/monitoring
 * record; preparation markers are persisted separately and never imply clinical use.
 */
export function useEquipmentSmart({ control, setValue, getValues, readOnly, smartProps, applyAirwayEntries, chartAirwayEvent, atomicAirwayEventPendingRef }: {
  control: Control<IntraopFormFields>
  setValue: UseFormSetValue<IntraopFormFields>
  getValues: UseFormGetValues<IntraopFormFields>
  readOnly: boolean
  smartProps: { startedAt: string | null; now: () => string; patient: AirwayPatient }
  applyAirwayEntries: (next: AirwayDeviceEntry[]) => void
  chartAirwayEvent: (event: { id?: string; label: string; ts: string; intraopPatch?: Record<string, unknown> }) => boolean
  atomicAirwayEventPendingRef: MutableRefObject<boolean>
}) {
  const equipmentScreen = useEquipmentScreen()
  const [catheterOn, ngtOn, equipmentPrepared] = useWatch({ control, name: ["urinaryCatheter", "stomachTube", "equipmentPrepared"] })
  const equipmentAirwayEntries = airwayDeviceEntriesOf(getValues() as Record<string, unknown>)
  return equipmentScreen === "smart" && !readOnly ? {
    flags: { urinaryCatheter: !!catheterOn, stomachTube: !!ngtOn },
    airwayEntries: equipmentAirwayEntries,
    prepared: (equipmentPrepared ?? {}) as Record<string, boolean>,
    onFlag: (field: "urinaryCatheter" | "stomachTube") => setValue(field, !getValues(field), { shouldDirty: true }),
    onPreparedChange: (key: string, value: boolean) => setValue("equipmentPrepared", { ...(getValues("equipmentPrepared") ?? {}), [key]: value }, { shouldDirty: true }),
    onUseAirway: (device: "ORAL_ETT" | "LMA") => {
      const entries = airwayDeviceEntriesOf(getValues() as Record<string, unknown>)
      if (airwayPrimaryConflict(entries, device)) return false
      // The equipment shortcut is still a clinical airway record. Do not
      // silently stamp a later device with "now" when the case has no start.
      const insertedAt = resolveAirwayTime("start", { startedAt: smartProps.startedAt, now: smartProps.now() })
      if (!insertedAt) return false
      const eventId = clinicalRecordId("airway-event", insertedAt)
      const next = addAirwayDevice(entries, {
        id: clinicalRecordId("airway", insertedAt), device, details: suggestedAirwayDetails(device, smartProps.patient),
        insertedAt,
        sourceEventId: eventId,
      })
      atomicAirwayEventPendingRef.current = true
      applyAirwayEntries(next)
      const label = airwayClinicalEvent(device, {
        priorTrachealTube: hasActiveTrachealTube(entries),
      })
      if (label) chartAirwayEvent({ id: eventId, label, ts: insertedAt, intraopPatch: airwayRecordFields(next) })
      return true
    },
  } : undefined
}
