import { useCallback, type MutableRefObject } from "react"
import { AirwaySmart } from "@/components/intraop/AirwaySmart"
import { VascularSmart } from "@/components/intraop/VascularSmart"
import { displayClinicalCode } from "@/lib/clinical-display"
import { usePhoneVascularEvents } from "@/lib/use-phone-vascular-smart"
import { AIRWAY_EVENT_COLORS, VASCULAR_EVENT_COLORS } from "@/lib/use-phone-airway-charting"
import type { LogEvent } from "@/lib/intraop-log-event"
import type { SaveIntraopEvent } from "@/lib/intraop-stamp"
import type { VascularEntry } from "@/lib/intraop-types"
import { airwayDeviceSummary } from "@lospor/core/intraop"
import { resolvedTimeZone } from "@lospor/core/intraop-time"
import { clinicalRelationForEventLabel } from "@lospor/core/intraop-automation-actions"
import { AIRWAY_RECORD_PATCH_KEYS, stripAirwayRecordPatch } from "@lospor/core/airway-smart"
import type { AirwayDeviceEntry } from "@lospor/core/airway-device-entries"
import type { VascularLine } from "@lospor/core/vascular-access-lines"
import type { IntraopPreopSummary } from "@/lib/intraop-preop-summary"
import type { usePhoneAirwayExchange } from "@/lib/use-phone-airway-exchange"

type Exchange = ReturnType<typeof usePhoneAirwayExchange>
type Preop = IntraopPreopSummary | null
type Option = { code: string; label: string }
type Charted = (event: { id?: string; label: string; ts: string; suggestion?: string; clinicalRelation?: string; intraopPatch?: Record<string, unknown> }) => void

/**
 * Smart selection (10.2.0) for the Airway tab: it opens on what is in place.
 * What it offers and how it saves is Core's (airway-smart); this hands it the
 * case and writes the result.
 */
export function usePhoneAirwaySmart({ airwayScreen, isWatching, airwayExchange, setAwNotApplicable, log, syncLog, removeEvent, chartAirwayEvent, preop, clinicalMode, techniques, startRef, AIRWAY_DEVICES, AIRWAY_TOOLS, clockOf }: {
  airwayScreen: string
  isWatching: boolean
  airwayExchange: Exchange
  setAwNotApplicable: (updater: (prev: boolean) => boolean) => void
  log: LogEvent[]
  syncLog: (next: LogEvent[]) => Promise<unknown>
  removeEvent: (event: LogEvent) => unknown
  chartAirwayEvent: Charted
  preop: Preop
  clinicalMode: "ADULT" | "PEDIATRIC"
  techniques: string[]
  startRef: MutableRefObject<Date | null>
  AIRWAY_DEVICES: Option[]
  AIRWAY_TOOLS: Option[]
  clockOf?: (iso: string) => string
}) {
  const saveAirwayEntries = (next: Parameters<Exchange["save"]>[0], event?: Parameters<Exchange["save"]>[1]) => {
    if (next.length > 0) setAwNotApplicable(() => false)
    airwayExchange.save(next, event)
  }
  const onNoAirwayInterventionSelected = () => {
    const nextLog = log.flatMap(event => {
      if (event.type !== "clinical_event") return [event]
      const rawPatch = event.intraopPatch
      const patch = rawPatch && typeof rawPatch === "object" ? rawPatch as Record<string, unknown> : null
      const hasAirway = event.clinicalRelation === "airway-record"
        || AIRWAY_EVENT_COLORS[event.label ?? ""] != null
        || !!patch && Object.keys(patch).some(key => AIRWAY_RECORD_PATCH_KEYS.includes(key))
      if (!hasAirway) return [event]
      if (!patch || Object.keys(stripAirwayRecordPatch(patch)).length === 0) return []
      return [{ ...event, intraopPatch: stripAirwayRecordPatch(patch) }]
    })
    if (nextLog.length !== log.length || nextLog.some((event, index) => event !== log[index])) void syncLog(nextLog)
    airwayExchange.clear()
  }
  const removeSmartAirwayEntry = (entry: AirwayDeviceEntry, next: AirwayDeviceEntry[]) => {
    saveAirwayEntries(next)
    if (entry.sourceEventId) {
      const linked = log.find(event => event.id === entry.sourceEventId)
      if (linked) void removeEvent(linked)
    }
  }
  const airwayLabel = (code: string) => [...AIRWAY_DEVICES, ...AIRWAY_TOOLS].find(option => option.code === code)?.label ?? code
  const smartCase = {
    patient: { clinicalMode, ageYears: preop?.age ?? null, age: preop?.ageValue != null && preop.ageUnit ? { value: preop.ageValue, unit: preop.ageUnit } : null,
      weightKg: preop?.weight ?? null, heightCm: preop?.height ?? null, sex: preop?.sex ?? null },
    techniques, startedAt: startRef.current?.toISOString() ?? null, now: () => new Date().toISOString(), timeZone: resolvedTimeZone(),
    difficultAirway: preop?.mallampati === "III" || preop?.mallampati === "IV", deviceLabel: airwayLabel, toolLabel: airwayLabel,
    availableDevices: AIRWAY_DEVICES.map(option => option.code), availableTools: AIRWAY_TOOLS.map(option => option.code),
  }
  const smartClock = (iso: string) => clockOf?.(iso) ?? iso.slice(11, 16)
  const airwaySmart = airwayScreen === "smart" && !isWatching ? (
    <AirwaySmart {...smartCase} entries={airwayExchange.entries()} onChange={saveAirwayEntries} onRemove={removeSmartAirwayEntry} onEvent={chartAirwayEvent}
      onAtomicSave={(next, event) => saveAirwayEntries(next, event)}
      describe={entry => airwayDeviceSummary(entry.device, entry.details, { device: airwayLabel, attribute: code => code }) ?? airwayLabel(entry.device)}
      timeOf={smartClock} />
  ) : undefined
  return { saveAirwayEntries, onNoAirwayInterventionSelected, airwaySmart, smartCase, smartClock, airwayLabel }
}

/**
 * Smart selection for vascular access (10.2.0): the Vascular access tab that
 * opens on what is in place. What it offers and how it saves is Core's
 * (vascular-smart); this hands it the case and writes the result.
 */
export function usePhoneVascularSmart({ vascularScreen, isWatching, caseLoaded, log, save, vascularAccesses, setVascularAccesses, saveVascularAccesses, vascularSaving, fieldSaveError, preop, clinicalMode, startRef, language, techniques, smartClock, chartVascularEvent }: {
  vascularScreen: string
  isWatching: boolean
  caseLoaded: boolean
  log: LogEvent[]
  save: SaveIntraopEvent
  vascularAccesses: VascularEntry[]
  setVascularAccesses: (next: VascularEntry[]) => void
  saveVascularAccesses: (next: VascularEntry[]) => unknown
  vascularSaving: boolean
  fieldSaveError: string | null
  preop: Preop
  clinicalMode: "ADULT" | "PEDIATRIC"
  startRef: MutableRefObject<Date | null>
  language: string
  techniques: string[]
  smartClock: (iso: string) => string
  chartVascularEvent: Charted
}) {
  const vascularLines = useCallback(() => vascularAccesses as unknown as VascularLine[], [vascularAccesses])
  const applyVascularLines = (next: VascularLine[], event?: { id?: string; label: string; ts: string; clinicalRelation?: string; intraopPatch?: Record<string, unknown> }) => {
    const entries = next as unknown as VascularEntry[]
    setVascularAccesses(entries)
    if (event) {
      void save({ ...(event.id ? { id: event.id } : {}), type: "clinical_event", label: event.label, color: VASCULAR_EVENT_COLORS[event.label] ?? "#a67cff", clinicalRelation: event.clinicalRelation ?? clinicalRelationForEventLabel(event.label) ?? undefined, intraopPatch: { vascularAccesses: entries } }, event.ts)
    } else {
      void saveVascularAccesses(entries)
    }
  }
  const vascularEvents = usePhoneVascularEvents({ log, active: caseLoaded && !isWatching, smart: vascularScreen === "smart", lines: vascularLines })
  const vascularCase = {
    patient: { clinicalMode, ageYears: preop?.age ?? null },
    startedAt: startRef.current?.toISOString() ?? null, now: () => new Date().toISOString(), timeZone: resolvedTimeZone(),
    siteLabel: (code: string) => displayClinicalCode("option:VASCULAR_ACCESS", code, language as never),
  }
  const vascularSmart = vascularScreen === "smart" && !isWatching ? (
    <VascularSmart {...vascularCase} lines={vascularLines()} onChange={applyVascularLines} onEvent={chartVascularEvent}
      onAtomicSave={(next, event) => applyVascularLines(next, event)} techniques={techniques} timeOf={smartClock}
      saving={vascularSaving} saveError={fieldSaveError === "vascular"} />
  ) : undefined
  return { vascularLines, applyVascularLines, vascularEvents, vascularCase, vascularSmart }
}
