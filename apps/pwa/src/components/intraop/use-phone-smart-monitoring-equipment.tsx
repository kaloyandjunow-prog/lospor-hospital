import React, { useEffect, useRef } from "react"
import { MonitoringSmart } from "@/components/intraop/MonitoringSmart"
import { TechniqueSmart } from "@/components/intraop/TechniqueSmart"
import { confirmAction } from "@/lib/notify"
import { techniqueColor } from "@/lib/intraop-technique"
import { useRecentTechniques } from "@/lib/use-recent-techniques"
import type { useSuggestionContext } from "@/lib/use-intraop-automation"
import type { LogEvent } from "@/lib/intraop-log-event"
import type { SaveIntraopEvent } from "@/lib/intraop-stamp"
import type { usePhoneAirwaySmart } from "./use-phone-smart-airway-vascular"
import type { usePhoneAirwayExchange } from "@/lib/use-phone-airway-exchange"
import { MONITORING_READINGS, asksNibpOff, isRelaxant, monitoringAutomationId, monitoringSuggestionKey, monitoringSuggestions, withoutNibp, type MonitoringSuggestion } from "@lospor/core/monitoring-smart"
import { monitoringDismissalEventId } from "@lospor/core/intraop-automation-actions"
import { toggleEquipmentFlag } from "@lospor/core/equipment-smart"
import { addAirwayDevice, airwayClinicalEvent, resolveAirwayTime, suggestedAirwayDetails } from "@lospor/core/airway-smart"
import { airwayPrimaryConflict, hasActiveTrachealTube } from "@lospor/core/airway-device-entries"
import { clinicalRecordId } from "@lospor/core/clinical-record-id"
import { techniquesAfterTciStart, techniqueSidesFor, type TechniqueSide } from "@lospor/core/technique-smart"

type Exchange = ReturnType<typeof usePhoneAirwayExchange>

/**
 * Smart selection for monitoring (10.2.0): standard in one switch, and the monitors this case calls for.
 * What is suggested and when a reading is due is Core's (monitoring-smart); a monitor added writes the same flag.
 */
export function usePhoneMonitoringSmart({ monitoringScreen, isWatching, log, save, monitoring, setMonitoring, saveMonitoring, techniques, airwayExchange, vascularLines, startRef, suggestionContext, tc, MONITORING_OPTS, fieldSaving, fieldSaveError, onReading }: {
  monitoringScreen: string
  isWatching: boolean
  log: LogEvent[]
  save: SaveIntraopEvent
  monitoring: string[]
  setMonitoring: (next: string[]) => void
  saveMonitoring: (next: string[]) => void
  techniques: string[]
  airwayExchange: Exchange
  vascularLines: () => unknown[]
  startRef: React.MutableRefObject<Date | null>
  suggestionContext: ReturnType<typeof useSuggestionContext>
  tc: (key: never) => string
  MONITORING_OPTS: React.ComponentProps<typeof MonitoringSmart>["monitoringOpts"]
  fieldSaving: string | null
  fieldSaveError: string | null
  /** Opens the full vitals sheet for a monitor that is due a reading. */
  onReading: () => void
}) {
  const say = tc as (key: string) => string
  const hiddenMonitors = React.useMemo(() => log
    .filter(event => event.type === "prompt_answer" && event.answer === "not_now" && event.answerKind?.startsWith("monitor:") && typeof event.answerFor === "string")
    .map(event => event.answerFor as string), [log])
  const monitoringSuggestionList = monitoringSuggestions({
    monitoring, techniques, airway: airwayExchange.entries(), lines: vascularLines() as never, hidden: hiddenMonitors,
    relaxantAt: log.find(event => event.type === "drug" && !!event.name && isRelaxant(event.name))?.ts ?? null,
    startedAt: startRef.current?.toISOString() ?? null, now: new Date(),
    settings: suggestionContext?.settings ?? null, user: suggestionContext?.user ?? null,
  })
  const lastMonitorReading = (field: string) => {
    const key = ({ bisValue: "bis", tofRatio: "tofRatio", cvpMmHg: "cvp", etco2: "etco2", temp: "temp" } as const)[(MONITORING_READINGS[field]?.vital ?? "temp") as "bisValue" | "tofRatio" | "cvpMmHg" | "etco2" | "temp"]
    // A value auto-fill carried forward is not a reading: counting it would keep EtCO2 and temperature from ever falling due.
    const event = [...log].reverse().find(item => item.type === "vital" && !item.autoFilled && typeof item[key] === "number")
    return event ? { text: String(event[key]), at: event.ts } : null
  }
  // An arterial line going on with the cuff still on asks once whether to turn the cuff off.
  const askNibpOff = (before: readonly string[], next: string[]) => {
    if (!asksNibpOff(before, next)) return
    void confirmAction(say("msmNibpOffTitle"), undefined, { confirmLabel: say("msmNibpOffYes"), cancelLabel: say("msmNibpOffKeep"), labelledOnWeb: true }).then(off => {
      if (!off) return
      const without = withoutNibp(next)
      setMonitoring(without)
      saveMonitoring(without)
    })
  }
  const applyMonitoring = (next: string[]) => { const before = monitoring; setMonitoring(next); saveMonitoring(next); askNibpOff(before, next) }
  const saveMonitoringAsking = (next: string[]) => { const before = monitoring; saveMonitoring(next); askNibpOff(before, next) }
  const dismissMonitoringSuggestion = (suggestion: MonitoringSuggestion) => {
    const occurrence = suggestion.key ?? monitoringSuggestionKey(suggestion.field, suggestion.at)
    const nowIso = new Date().toISOString()
    void save({
      id: monitoringDismissalEventId(suggestion.field, occurrence),
      type: "prompt_answer",
      answerKind: monitoringAutomationId(suggestion.field),
      answerFor: occurrence,
      answer: "not_now",
      suggestion: monitoringAutomationId(suggestion.field),
      recordedAt: nowIso,
    }, nowIso)
  }
  const monitoringSmart = monitoringScreen === "smart" && !isWatching ? (
    <MonitoringSmart monitoring={monitoring} onChange={applyMonitoring} monitoringOpts={MONITORING_OPTS} suggestions={monitoringSuggestionList}
      onHide={dismissMonitoringSuggestion} lastReading={lastMonitorReading} onReading={onReading} now={() => new Date().toISOString()} dueMinutes={suggestionContext?.settings?.monitoringDueMinutes}
      saving={fieldSaving === "monitoring"} saveError={fieldSaveError === "monitoring"} />
  ) : undefined
  return { monitoringSmart, applyMonitoring, saveMonitoringAsking }
}

/**
 * Smart selection for equipment (10.2.0): calculated suggestions compare
 * with canonical records; preparation markers are separate and persisted.
 */
export function usePhoneEquipmentSmart({ equipmentScreen, isWatching, monitoring, applyMonitoring, airwayExchange, equipmentPrepared, setEquipmentPrepared, patchIntraopSection, smartCase, saveAirwayEntries }: {
  equipmentScreen: string
  isWatching: boolean
  monitoring: string[]
  applyMonitoring: (next: string[]) => void
  airwayExchange: Exchange
  equipmentPrepared: Record<string, boolean>
  setEquipmentPrepared: (next: Record<string, boolean>) => void
  patchIntraopSection: (patch: Record<string, unknown>) => unknown
  smartCase: ReturnType<typeof usePhoneAirwaySmart>["smartCase"]
  saveAirwayEntries: (next: Parameters<Exchange["save"]>[0], event?: Parameters<Exchange["save"]>[1]) => void
}) {
  return equipmentScreen === "smart" && !isWatching ? {
    flags: { urinaryCatheter: monitoring.includes("urinaryCatheter"), stomachTube: monitoring.includes("stomachTube") },
    airwayEntries: airwayExchange.entries(),
    prepared: equipmentPrepared,
    onFlag: (field: "urinaryCatheter" | "stomachTube") => applyMonitoring(toggleEquipmentFlag(monitoring, field)),
    onPreparedChange: (key: string, value: boolean) => {
      const next = { ...equipmentPrepared, [key]: value }
      setEquipmentPrepared(next)
      void patchIntraopSection({ equipmentPrepared: next })
    },
    // The button opens the same airway panel as the Airway tab, so the time (start, now, or picked) is asked there.
    airway: {
      entries: airwayExchange.entries(),
      patient: smartCase.patient, startedAt: smartCase.startedAt, now: smartCase.now, timeZone: smartCase.timeZone,
      difficultAirway: smartCase.difficultAirway, deviceLabel: smartCase.deviceLabel, toolLabel: smartCase.toolLabel, toolCodes: smartCase.availableTools,
      conflict: (device: "ORAL_ETT" | "LMA") => airwayPrimaryConflict(airwayExchange.entries(), device) != null,
      onSave: (next: Parameters<Exchange["save"]>[0], event?: Parameters<Exchange["save"]>[1]) => saveAirwayEntries(next, event),
    },
    onUseAirway: (device: "ORAL_ETT" | "LMA") => {
      const entries = airwayExchange.entries()
      if (airwayPrimaryConflict(entries, device)) return false
      // This shortcut writes a clinical airway record, so it must not invent
      // "now" when the anaesthesia start has not been documented.
      const insertedAt = resolveAirwayTime("start", { startedAt: smartCase.startedAt, now: smartCase.now() })
      if (!insertedAt) return false
      const eventId = clinicalRecordId("airway-event", insertedAt)
      const next = addAirwayDevice(entries, {
        id: clinicalRecordId("airway", insertedAt), device, details: suggestedAirwayDetails(device, smartCase.patient),
        insertedAt,
        sourceEventId: eventId,
      })
      const label = airwayClinicalEvent(device, {
        priorTrachealTube: hasActiveTrachealTube(entries),
      })
      saveAirwayEntries(next, label ? { id: eventId, label, ts: insertedAt } : undefined)
      return true
    },
  } : undefined
}

/**
 * Smart selection for technique (10.2.0): search, the preop plan, the usual ones and the side of a block. The saved
 * data is the list of technique codes with the side beside it; finding and sides are Core's (technique-smart).
 * Also the TCI rule: starting TCI Propofol or Remifentanil documents the technique too. Core owns which TCI models
 * qualify; the effect only applies the rule to a newly saved start event.
 */
export function usePhoneTechniqueSmart({ techniqueScreen, isWatching, caseLoaded, log, techniques, setTechniques, techniqueSides, setTechniqueSides, saveTechniques, TECHNIQUE_TREE, techniqueLabel, plannedTechniques, fieldSaving, fieldSaveError }: {
  techniqueScreen: string
  isWatching: boolean
  caseLoaded: boolean
  log: LogEvent[]
  techniques: string[]
  setTechniques: (next: string[]) => void
  techniqueSides: Record<string, TechniqueSide>
  setTechniqueSides: (next: Record<string, TechniqueSide>) => void
  saveTechniques: (next: string[], sides: Record<string, TechniqueSide>) => unknown
  TECHNIQUE_TREE: React.ComponentProps<typeof TechniqueSmart>["tree"]
  techniqueLabel: React.ComponentProps<typeof TechniqueSmart>["label"]
  plannedTechniques: string[] | undefined
  fieldSaving: string | null
  fieldSaveError: string | null
}) {
  const recentTechniques = useRecentTechniques()
  const applyTechniques = (next: string[], sides: Record<string, TechniqueSide>, added: string[]) => {
    setTechniques(next)
    setTechniqueSides(sides)
    recentTechniques.remember(added)
    void saveTechniques(next, sides)
  }
  const seenTciStartIds = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!caseLoaded) return
    const starts = log.filter(event => event.type === "infusion_start" && event.tciModel)
    if (seenTciStartIds.current === null) seenTciStartIds.current = new Set()
    // Existing starts matter too: opening the case on a second device, or
    // mounting after a reload, must still backfill the technique. Watching is
    // read-only, so leave them unmarked until this screen can write.
    if (isWatching) return
    const fresh = starts.filter(event => !seenTciStartIds.current!.has(event.id))
    if (fresh.length === 0) return
    for (const event of fresh) seenTciStartIds.current!.add(event.id)
    const next = fresh.reduce((current, event) => techniquesAfterTciStart(current, event.tciModel), techniques)
    if (next.length === techniques.length) return
    const nextSides = techniqueSidesFor(next, techniqueSides)
    setTechniques(next)
    setTechniqueSides(nextSides)
    void saveTechniques(next, nextSides)
  }, [caseLoaded, isWatching, log, saveTechniques, setTechniques, setTechniqueSides, techniqueSides, techniques])
  return techniqueScreen === "smart" && !isWatching ? (
    <TechniqueSmart techniques={techniques} sides={techniqueSides} onChange={applyTechniques} tree={TECHNIQUE_TREE} label={techniqueLabel} color={techniqueColor}
      planned={plannedTechniques ?? []} recents={recentTechniques.recents}
      saving={fieldSaving === "techniques"} saveError={fieldSaveError === "techniques"} />
  ) : undefined
}
