import { useCallback, useEffect, useRef } from "react"
import { toast } from "sonner"
import type { UseFormGetValues } from "react-hook-form"
import { airwayDeviceEntriesOf, hasActiveTrachealTube } from "@lospor/core/airway-device-entries"
import { airwayClinicalEvent, resolveAirwayTime } from "@lospor/core/airway-smart"
import { clinicalRecordId } from "@lospor/core/clinical-record-id"
import { clinicalRelationForEventLabel } from "@lospor/core/intraop-automation-actions"
import type { LogEvent } from "@lospor/core/intraop-types"
import type { IntraopEventOps } from "@lospor/core/intraop-timetable-edit"
import { serverNow } from "@/lib/intraop-clock"
import { randomId } from "@/lib/random-id"
import { useAirwayScreen } from "@/lib/use-airway-screen"
import type { IntraopFormFields } from "../intraopSchema"

export const AIRWAY_EVENT_COLORS: Record<string, string> = {
  Intubated: "#6366f1", Reintubation: "#f97316", "LMA in": "#6366f1", "DLT placed": "#6366f1", "Airway exchange": "#f97316",
  "Mask vent": "#0891b2", "OPA in": "#6366f1", "NPA in": "#6366f1", "Endobronchial tube in": "#6366f1", "Surgical airway in": "#dc2626", "Airway device in": "#6366f1",
}
const VASCULAR_EVENT_COLORS: Record<string, string> = {
  "IV line in": "#a67cff", "Art line in": "#22c55e", "CVC in": "#a67cff", PICC: "#a67cff",
}

type ChartedEvent = { id?: string; label: string; ts: string; clinicalRelation?: string; intraopPatch?: Record<string, unknown> }

/**
 * Charting airway and vascular actions as timeline events, and the autosave
 * suppression that goes with them: a structured action persists its form patch
 * and event atomically, so the next form snapshot leaves those fields out once.
 */
export function useChartedAirwayEvents({ onEventOps, timelineLog, getValues, chartStartedAt, readOnly, t }: {
  onEventOps?: (ops: IntraopEventOps) => void | Promise<void>
  timelineLog: readonly LogEvent[]
  getValues: UseFormGetValues<IntraopFormFields>
  chartStartedAt: string | null | undefined
  readOnly: boolean
  t: (key: string) => string
}) {
  const airwayScreen = useAirwayScreen()
  const atomicAirwayEventPendingRef = useRef(false)
  const atomicVascularEventPendingRef = useRef(false)
  const pendingLegacyAirwayEventsRef = useRef(new Map<string, { previousDevices: string[]; airwayPatch: Record<string, unknown> }>())

  const chartEvent = useCallback((event: ChartedEvent, colors: Record<string, string>, fallbackColor: string): boolean => {
    if (!onEventOps) return false
    const existing = timelineLog.find(item => item.type === "clinical_event" && (event.id ? item.id === event.id : item.label === event.label && item.ts === event.ts))
    const clinicalRelation = event.clinicalRelation ?? clinicalRelationForEventLabel(event.label) ?? undefined
    if (existing) {
      if (!event.intraopPatch) return false
      void onEventOps({ add: [], update: [{ ...existing, ...event, id: existing.id, clinicalRelation, recordedAt: serverNow().toISOString() }], remove: [] })
      return true
    }
    void onEventOps({
      add: [{ id: event.id ?? randomId(), ts: event.ts, type: "clinical_event", label: event.label, color: colors[event.label] ?? fallbackColor, clinicalRelation, recordedAt: serverNow().toISOString(), ...(event.intraopPatch ? { intraopPatch: event.intraopPatch } : {}) }],
      update: [], remove: [],
    })
    return true
  }, [onEventOps, timelineLog])
  const chartAirwayEvent = useCallback((event: ChartedEvent) => chartEvent(event, AIRWAY_EVENT_COLORS, "#6366f1"), [chartEvent])
  const chartVascularEvent = useCallback((event: ChartedEvent) => { chartEvent(event, VASCULAR_EVENT_COLORS, "#a67cff") }, [chartEvent])

  const legacyAirwayPatch = useCallback((nextDevices: readonly string[]) => {
    const values = getValues()
    return {
      airwayDevices: [...nextDevices],
      airwayNotApplicable: false,
      airwayTools: values.airwayTools ?? [],
      lmaSize: values.lmaSize ?? null,
      oralTubeSize: values.oralTubeSize ?? null,
      oralCuffed: values.oralCuffed ?? null,
      nasalTubeSize: values.nasalTubeSize ?? null,
      nasalCuffed: values.nasalCuffed ?? null,
      dltType: values.dltType ?? null,
      dltSide: values.dltSide ?? null,
      dltSize: values.dltSize ?? null,
      endobronchialSize: values.endobronchialSize ?? null,
    }
  }, [getValues])
  const chartLegacyAirwayDevice = useCallback((device: string, previousDevices: readonly string[], patch?: Record<string, unknown>): boolean => {
    if (readOnly) return false
    const insertedAt = resolveAirwayTime("start", { startedAt: chartStartedAt ?? null, now: serverNow().toISOString() })
    if (!insertedAt) {
      pendingLegacyAirwayEventsRef.current.set(device, { previousDevices: [...previousDevices], airwayPatch: { ...(patch ?? {}) } })
      toast.error(t("intraop.airway.missingStart"))
      return false
    }
    pendingLegacyAirwayEventsRef.current.delete(device)
    const label = airwayClinicalEvent(device, {
      priorTrachealTube: hasActiveTrachealTube(airwayDeviceEntriesOf({ airwayDevices: previousDevices })),
    })
    if (!label) return false
    const nextDevices = Array.isArray(patch?.airwayDevices) ? patch.airwayDevices.filter((value): value is string => typeof value === "string") : [...previousDevices, device]
    const eventPatch = { ...legacyAirwayPatch(nextDevices), ...(patch ?? {}), airwayDevices: nextDevices, airwayNotApplicable: false, airwayEventDevice: device }
    const added = chartAirwayEvent({ id: clinicalRecordId("airway-event", insertedAt), label, ts: insertedAt, intraopPatch: eventPatch })
    if (added) atomicAirwayEventPendingRef.current = true
    return added
  }, [chartAirwayEvent, chartStartedAt, legacyAirwayPatch, readOnly, t])
  const removeLegacyAirwayEvents = (device: string) => {
    pendingLegacyAirwayEventsRef.current.delete(device)
    if (!onEventOps) return
    const ids = timelineLog
      .filter(event => event.type === "clinical_event" && event.intraopPatch?.airwayEventDevice === device)
      .map(event => event.id)
    if (ids.length > 0) void onEventOps({ add: [], update: [], remove: ids })
  }
  useEffect(() => {
    if (!chartStartedAt || readOnly || airwayScreen !== "legacy" || pendingLegacyAirwayEventsRef.current.size === 0) return
    const devices = new Set(getValues("airwayDevices") ?? [])
    for (const [device, pending] of [...pendingLegacyAirwayEventsRef.current.entries()]) {
      if (!devices.has(device)) {
        pendingLegacyAirwayEventsRef.current.delete(device)
        continue
      }
      chartLegacyAirwayDevice(device, pending.previousDevices, legacyAirwayPatch([...devices]))
    }
  }, [airwayScreen, chartStartedAt, chartLegacyAirwayDevice, getValues, legacyAirwayPatch, readOnly])

  return { airwayScreen, atomicAirwayEventPendingRef, atomicVascularEventPendingRef, chartAirwayEvent, chartVascularEvent, legacyAirwayPatch, chartLegacyAirwayDevice, removeLegacyAirwayEvents }
}
