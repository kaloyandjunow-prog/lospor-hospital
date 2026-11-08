import { useCallback, useEffect, useRef, type MutableRefObject } from "react"
import { airwayDeviceEntriesOf, hasActiveTrachealTube } from "@lospor/core/airway-device-entries"
import { airwayClinicalEvent, resolveAirwayTime } from "@lospor/core/airway-smart"
import { clinicalRecordId } from "@lospor/core/clinical-record-id"
import { clinicalRelationForEventLabel } from "@lospor/core/intraop-automation-actions"
import { notify } from "@/lib/notify"
import type { LogEvent } from "@/lib/intraop-log-event"
import type { SaveIntraopEvent } from "@/lib/intraop-stamp"

export const AIRWAY_EVENT_COLORS: Record<string, string> = {
  Intubated: "#6366f1", Reintubation: "#f97316", "LMA in": "#6366f1", "DLT placed": "#6366f1", "Airway exchange": "#f97316",
}
export const VASCULAR_EVENT_COLORS: Record<string, string> = {
  "IV line in": "#a67cff", "Art line in": "#22c55e", "CVC in": "#a67cff", PICC: "#a67cff",
}

type ChartedEvent = { id?: string; label: string; ts: string; suggestion?: string; clinicalRelation?: string; intraopPatch?: Record<string, unknown> }
type PendingLegacy = Map<string, { previousDevices: string[]; airwayPatch: Record<string, unknown> }>

/**
 * Airway and vascular actions charted as timeline events (10.2.0): the event
 * carries the record patch, so one write saves both. An airway device chosen
 * on the legacy tab before the case has a start waits here until it does.
 */
export function usePhoneAirwayCharting({ log, save, startRef, syncLog, tc }: {
  log: LogEvent[]
  save: SaveIntraopEvent
  startRef: MutableRefObject<Date | null>
  syncLog: (next: LogEvent[]) => Promise<unknown>
  tc: (key: never) => string
}) {
  const pendingLegacyAirwayEventsRef = useRef<PendingLegacy>(new Map())
  const say = tc as (key: string) => string
  const chartAirwayEvent = useCallback((event: ChartedEvent) => {
    const existing = log.find(item => item.type === "clinical_event" && (event.id ? item.id === event.id : item.label === event.label && item.ts === event.ts))
    if (existing && !event.intraopPatch) return
    void save({
      ...(event.id || existing ? { id: event.id ?? existing?.id } : {}),
      type: "clinical_event", label: event.label, color: AIRWAY_EVENT_COLORS[event.label] ?? "#6366f1",
      clinicalRelation: event.clinicalRelation ?? clinicalRelationForEventLabel(event.label) ?? undefined,
      ...(event.suggestion ? { suggestion: event.suggestion } : {}),
      ...(event.intraopPatch ? { intraopPatch: event.intraopPatch } : {}),
    }, event.ts)
  }, [log, save])
  const chartVascularEvent = useCallback((event: ChartedEvent) => {
    const existing = log.find(item => item.type === "clinical_event" && (event.id ? item.id === event.id : item.label === event.label && item.ts === event.ts))
    if (existing && !event.intraopPatch) return
    void save({
      ...(event.id || existing ? { id: event.id ?? existing?.id } : {}),
      type: "clinical_event", label: event.label, color: VASCULAR_EVENT_COLORS[event.label] ?? "#a67cff",
      clinicalRelation: event.clinicalRelation ?? clinicalRelationForEventLabel(event.label) ?? undefined,
      ...(event.intraopPatch ? { intraopPatch: event.intraopPatch } : {}),
    }, event.ts)
  }, [log, save])
  const chartLegacyAirwayDevice = useCallback((device: string, previousDevices: readonly string[], airwayPatch: Record<string, unknown>) => {
    const insertedAt = resolveAirwayTime("start", { startedAt: startRef.current?.toISOString() ?? null, now: new Date().toISOString() })
    if (!insertedAt) {
      pendingLegacyAirwayEventsRef.current.set(device, { previousDevices: [...previousDevices], airwayPatch: { ...airwayPatch } })
      notify(say("errorLabel"), say("airwayMissingStart"))
      return false
    }
    pendingLegacyAirwayEventsRef.current.delete(device)
    const label = airwayClinicalEvent(device, {
      priorTrachealTube: hasActiveTrachealTube(airwayDeviceEntriesOf({ airwayDevices: previousDevices })),
    })
    if (!label) return false
    const at = insertedAt
    chartAirwayEvent({ id: clinicalRecordId("airway-event", at), label, ts: at, intraopPatch: { ...airwayPatch, airwayEventDevice: device } })
    return true
  }, [chartAirwayEvent, startRef, say])
  const removeLegacyAirwayEvents = async (device: string): Promise<void> => {
    pendingLegacyAirwayEventsRef.current.delete(device)
    const ids = log
      .filter(event => event.type === "clinical_event" && event.intraopPatch?.airwayEventDevice === device)
      .map(event => event.id)
    if (ids.length > 0) await syncLog(log.filter(event => !ids.includes(event.id)))
  }
  return { chartAirwayEvent, chartVascularEvent, chartLegacyAirwayDevice, removeLegacyAirwayEvents, pendingLegacyAirwayEventsRef }
}

/** Charts the waiting legacy airway devices once the case has a start. */
export function useRetryLegacyAirwayEvents({ startRef, isWatching, airwayScreen, awDevices, caseStartTime, chartLegacyAirwayDevice, pendingRef }: {
  startRef: MutableRefObject<Date | null>
  isWatching: boolean
  airwayScreen: string
  awDevices: string[]
  caseStartTime: string
  chartLegacyAirwayDevice: (device: string, previousDevices: readonly string[], airwayPatch: Record<string, unknown>) => boolean
  pendingRef: MutableRefObject<PendingLegacy>
}) {
  useEffect(() => {
    if (!startRef.current || isWatching || airwayScreen !== "legacy" || pendingRef.current.size === 0) return
    const devices = new Set(awDevices)
    for (const [device, pending] of [...pendingRef.current.entries()]) {
      if (!devices.has(device)) {
        pendingRef.current.delete(device)
        continue
      }
      chartLegacyAirwayDevice(device, pending.previousDevices, pending.airwayPatch)
    }
  }, [airwayScreen, awDevices, caseStartTime, chartLegacyAirwayDevice, isWatching, startRef, pendingRef])
}
