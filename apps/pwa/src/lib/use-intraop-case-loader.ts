import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react"

import { apiJson } from "@/lib/api"
import { notify } from "@/lib/notify"
import { useCaseLiveUpdates } from "@/lib/use-case-live-updates"
import { loadPendingIntraopEvents } from "@/lib/pending-intraop-events"
import { autosaveManager } from "@/lib/autosave-manager"
import { buildLoadedIntraopCaseState } from "@/lib/intraop-case-hydration"
import type { MonitoringOption } from "@/lib/intraop-option-mappers"
import type { TimetableData } from "@/components/IntraopTimetable"
import type { LogEvent, ActiveInfusion, ActiveFluid, ActiveGasSettings } from "@/lib/intraop-log-event"
import type { VascularEntry } from "@/lib/intraop-types"
import type { IntraopPreopSummary } from "@/lib/intraop-preop-summary"
import type { VentilationPanel } from "@/lib/airway-ventilation"
import type { CaseDetailDto } from "@lospor/core/case-detail"

type CaseInfo = {
  caseCode: string
  procedure?: string
  diagnosis?: string
  techniques?: string[]
  status?: string
  finalizedAt?: string | null
} | null

type UseIntraopCaseLoaderArgs = {
  caseId: string
  monitoringOptions: MonitoringOption[]
  complicationItems: string[]
  errorLabel: string
  enqueueEventSave: <T>(operation: () => Promise<T>) => Promise<T>
  runBatched: (fn: () => void) => void
  pendingSaveCountRef: MutableRefObject<number>
  legacyWebLogNeedsSyncRef: MutableRefObject<boolean>
  baseIntraopUpdatedAtRef: MutableRefObject<string | null>
  startRef: MutableRefObject<Date | null>
  setCaseInfo: Dispatch<SetStateAction<CaseInfo>>
  setTechniques: Dispatch<SetStateAction<string[]>>
  setPositions: Dispatch<SetStateAction<string[]>>
  setMonitoring: Dispatch<SetStateAction<string[]>>
  setPreop: Dispatch<SetStateAction<IntraopPreopSummary | null>>
  setCaseMonthYear: Dispatch<SetStateAction<string>>
  setCaseStartTime: Dispatch<SetStateAction<string>>
  setCaseEndTime: Dispatch<SetStateAction<string>>
  setCaseEndNextDay: Dispatch<SetStateAction<boolean>>
  setCaseTimezone: Dispatch<SetStateAction<string | null>>
  setAwTools: Dispatch<SetStateAction<string[]>>
  setAwDevices: Dispatch<SetStateAction<string[]>>
  setAwLmaSize: Dispatch<SetStateAction<string | null>>
  setAwOralTubeSize: Dispatch<SetStateAction<string | null>>
  setAwOralCuffed: Dispatch<SetStateAction<boolean | null>>
  setAwNasalTubeSize: Dispatch<SetStateAction<string | null>>
  setAwNasalCuffed: Dispatch<SetStateAction<boolean | null>>
  setAwDltType: Dispatch<SetStateAction<"Carlens" | "Robertshaw" | null>>
  setAwDltSide: Dispatch<SetStateAction<"Left" | "Right" | null>>
  setAwDltSize: Dispatch<SetStateAction<number | null>>
  setAwEbSize: Dispatch<SetStateAction<number | null>>
  setAwClGrade: Dispatch<SetStateAction<string>>
  setAwVentModes: Dispatch<SetStateAction<string[]>>
  setAwVentExpanded: Dispatch<SetStateAction<VentilationPanel>>
  setAwNotes: Dispatch<SetStateAction<string>>
  setAdvMonOpen: Dispatch<SetStateAction<boolean>>
  setVascularAccesses: Dispatch<SetStateAction<VascularEntry[]>>
  setPremedEveningText: Dispatch<SetStateAction<string>>
  setPremedMorningText: Dispatch<SetStateAction<string>>
  setSelectedComplications: Dispatch<SetStateAction<string[]>>
  setComplicationsNotes: Dispatch<SetStateAction<string>>
  setPendingCount: Dispatch<SetStateAction<number>>
  setSyncState: Dispatch<SetStateAction<"saved" | "saving" | "failed" | "offline">>
  setSyncErrorMessage: Dispatch<SetStateAction<string | null>>
  setLog: Dispatch<SetStateAction<LogEvent[]>>
  setElapsedMs: Dispatch<SetStateAction<number>>
  setActiveInfusions: Dispatch<SetStateAction<ActiveInfusion[]>>
  setActiveFluids: Dispatch<SetStateAction<ActiveFluid[]>>
  setActiveAgent: Dispatch<SetStateAction<{ name: string; color: string; percent?: number } | null>>
  setActiveGas: Dispatch<SetStateAction<ActiveGasSettings>>
  setTimetable: Dispatch<SetStateAction<TimetableData>>
  setTtColCount: Dispatch<SetStateAction<number>>
  setCaseLoaded: Dispatch<SetStateAction<boolean>>
}

export function useIntraopCaseLoader({
  caseId,
  monitoringOptions,
  complicationItems,
  errorLabel,
  enqueueEventSave,
  runBatched,
  pendingSaveCountRef,
  legacyWebLogNeedsSyncRef,
  baseIntraopUpdatedAtRef,
  startRef,
  setCaseInfo,
  setTechniques,
  setPositions,
  setMonitoring,
  setPreop,
  setCaseMonthYear,
  setCaseStartTime,
  setCaseEndTime,
  setCaseEndNextDay,
  setCaseTimezone,
  setAwTools,
  setAwDevices,
  setAwLmaSize,
  setAwOralTubeSize,
  setAwOralCuffed,
  setAwNasalTubeSize,
  setAwNasalCuffed,
  setAwDltType,
  setAwDltSide,
  setAwDltSize,
  setAwEbSize,
  setAwClGrade,
  setAwVentModes,
  setAwVentExpanded,
  setAwNotes,
  setAdvMonOpen,
  setVascularAccesses,
  setPremedEveningText,
  setPremedMorningText,
  setSelectedComplications,
  setComplicationsNotes,
  setPendingCount,
  setSyncState,
  setSyncErrorMessage,
  setLog,
  setElapsedMs,
  setActiveInfusions,
  setActiveFluids,
  setActiveAgent,
  setActiveGas,
  setTimetable,
  setTtColCount,
  setCaseLoaded,
}: UseIntraopCaseLoaderArgs) {
  const loadCase = useCallback(async (silent = false) => {
    try {
      if (!silent) await autosaveManager.flushCase(caseId).catch(() => {})
      const data = await apiJson<CaseDetailDto>(`/api/cases/${caseId}`)
      const localIntraop = await autosaveManager.outbox.load<Record<string, unknown>>(caseId, "intraop")
      const visibleData: CaseDetailDto = localIntraop
        ? ({ ...data, intraop: { ...(data.intraop ?? {}), ...localIntraop } } as CaseDetailDto)
        : data
      const pending = await loadPendingIntraopEvents<LogEvent>(caseId)
      const pendingMutations = await autosaveManager.eventMutations.load(caseId)
      const hydrated = buildLoadedIntraopCaseState(
        visibleData,
        pending,
        monitoringOptions,
        complicationItems,
        pendingMutations,
      )
      legacyWebLogNeedsSyncRef.current = hydrated.legacyWebLogNeedsSync
      baseIntraopUpdatedAtRef.current = hydrated.baseIntraopUpdatedAt ?? baseIntraopUpdatedAtRef.current
      autosaveManager.hydrateSection(
        caseId,
        "intraop",
        (data.intraop ?? {}) as Record<string, unknown>,
        hydrated.baseIntraopRevision ?? hydrated.baseIntraopUpdatedAt ?? null,
      )
      runBatched(() => {
        setCaseInfo(hydrated.caseInfo)
        if (!silent) {
          if (pendingSaveCountRef.current === 0) {
            setTechniques(hydrated.caseTechniques)
            if (hydrated.positions) setPositions(hydrated.positions)
            setMonitoring(hydrated.monitoring)
            if (hydrated.airway.tools) setAwTools(hydrated.airway.tools)
            if (hydrated.airway.devices) setAwDevices(hydrated.airway.devices)
            if (hydrated.airway.lmaSize != null) setAwLmaSize(hydrated.airway.lmaSize)
            if (hydrated.airway.oralTubeSize != null) setAwOralTubeSize(hydrated.airway.oralTubeSize)
            if (hydrated.airway.oralCuffed != null) setAwOralCuffed(hydrated.airway.oralCuffed)
            if (hydrated.airway.nasalTubeSize != null) setAwNasalTubeSize(hydrated.airway.nasalTubeSize)
            if (hydrated.airway.nasalCuffed != null) setAwNasalCuffed(hydrated.airway.nasalCuffed)
            if (hydrated.airway.dltType != null) setAwDltType(hydrated.airway.dltType)
            if (hydrated.airway.dltSide != null) setAwDltSide(hydrated.airway.dltSide)
            if (hydrated.airway.dltSize != null) setAwDltSize(hydrated.airway.dltSize)
            if (hydrated.airway.ebSize != null) setAwEbSize(hydrated.airway.ebSize)
            if (hydrated.airway.clGrade != null) setAwClGrade(hydrated.airway.clGrade)
            if (hydrated.airway.ventilationModes) {
              setAwVentModes(hydrated.airway.ventilationModes)
              if (hydrated.airway.ventilationExpanded !== undefined) setAwVentExpanded(hydrated.airway.ventilationExpanded)
            }
            if (hydrated.airway.notes != null) setAwNotes(hydrated.airway.notes)
            if (hydrated.vascularAccesses) setVascularAccesses(hydrated.vascularAccesses)
            if (hydrated.premedication.evening != null) setPremedEveningText(hydrated.premedication.evening)
            if (hydrated.premedication.morning != null) setPremedMorningText(hydrated.premedication.morning)
            if (hydrated.complications) {
              setSelectedComplications(hydrated.complications.selected)
              setComplicationsNotes(hydrated.complications.notes)
            }
          }
          setPreop(hydrated.preop)
          setCaseMonthYear(hydrated.timing.monthYear)
          if (hydrated.timing.startTime) setCaseStartTime(hydrated.timing.startTime)
          if (hydrated.timing.endTime) setCaseEndTime(hydrated.timing.endTime)
          if (hydrated.timing.endTimeNextDay != null) setCaseEndNextDay(hydrated.timing.endTimeNextDay)
          setCaseTimezone(hydrated.timing.timezone)
          if (hydrated.hasAdvancedMonitoring) setAdvMonOpen(true)
        }

        const managerState = autosaveManager.getState(caseId)
        setPendingCount(pending.length)
        setSyncErrorMessage(managerState.blocked?.message ?? null)
        setSyncState(
          managerState.status === "blocked" || managerState.status === "failed"
            ? "failed"
            : pending.length > 0 || managerState.status === "queued"
              ? "offline"
              : "saved",
        )
        setLog(hydrated.rawLog)
        const loadedTimetable = hydrated.loadedTimetable
        startRef.current = loadedTimetable.startDate
        if (loadedTimetable.startDate) setElapsedMs(loadedTimetable.elapsedMs)
        const active = hydrated.active
        setActiveInfusions(active.infusions)
        setActiveFluids(active.fluids)
        setActiveAgent(active.agent)
        setActiveGas(active.gas)
        if (loadedTimetable.timetable) {
          setTimetable(loadedTimetable.timetable)
          setTtColCount(loadedTimetable.columnCount)
        }
        setCaseLoaded(true)
      })
    } catch (err) {
      if (!silent) {
        const message = err instanceof Error ? err.message : "Could not load case."
        notify(errorLabel, message)
      }
    }
  }, [
    baseIntraopUpdatedAtRef,
    caseId,
    complicationItems,
    errorLabel,
    legacyWebLogNeedsSyncRef,
    monitoringOptions,
    pendingSaveCountRef,
    runBatched,
    setActiveAgent,
    setActiveFluids,
    setActiveGas,
    setActiveInfusions,
    setAdvMonOpen,
    setAwClGrade,
    setAwDevices,
    setAwDltSide,
    setAwDltSize,
    setAwDltType,
    setAwEbSize,
    setAwLmaSize,
    setAwNasalCuffed,
    setAwNasalTubeSize,
    setAwNotes,
    setAwOralCuffed,
    setAwOralTubeSize,
    setAwTools,
    setAwVentExpanded,
    setAwVentModes,
    setCaseEndNextDay,
    setCaseEndTime,
    setCaseTimezone,
    setCaseInfo,
    setCaseLoaded,
    setCaseMonthYear,
    setCaseStartTime,
    setComplicationsNotes,
    setElapsedMs,
    setLog,
    setMonitoring,
    setPendingCount,
    setPositions,
    setPremedEveningText,
    setPremedMorningText,
    setPreop,
    setSelectedComplications,
    setSyncErrorMessage,
    setSyncState,
    setTechniques,
    setTimetable,
    setTtColCount,
    setVascularAccesses,
    startRef,
  ])

  useEffect(() => {
    loadCase()
  }, [loadCase])

  useCaseLiveUpdates(caseId, async () => {
    await enqueueEventSave(() => loadCase(true))
  }, { pollIntervalMs: 15_000 })

  return { loadCase }
}
