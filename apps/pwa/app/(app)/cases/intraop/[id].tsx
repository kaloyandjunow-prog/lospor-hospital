import React, { useCallback, useEffect, useRef, useState } from "react"
 
import {
  View, ScrollView, FlatList,
  TextInput,
  unstable_batchedUpdates, useWindowDimensions,
} from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import type { VascularEntry } from "@/lib/intraop-types"
import { formatHHMM } from "@/lib/intraop-format"
import {
  eventsToTimetable, roundDown5Min,
} from "@/lib/intraop-projection"
import { useCaseReminders } from "@/lib/use-case-reminders"
import { usePreferences } from "@/lib/preferences-context"
import { emptyTimetable, type TimetableData } from "@/components/IntraopTimetable"
import { colors } from "@/theme/colors"
import { useCaseLock } from "@/lib/use-case-lock"
import { VASC_PREEXISTING_QUICK, vascDefaultUnit, vascSiteColor } from "@/lib/vascular-access-tree"
import { useAgentEntry } from "@/lib/use-agent-entry"
import { useGasSettingsEntry } from "@/lib/use-gas-settings-entry"
import { useFluidEntry } from "@/lib/use-fluid-entry"
import { useInfusionEntry } from "@/lib/use-infusion-entry"
import { useDrugEntry } from "@/lib/use-drug-entry"
import { BOLUS_SCENARIOS, INFUSION_SCENARIOS } from "@lospor/core"
import { useVitalsEntry } from "@/lib/use-vitals-entry"
import { COMPLICATION_GROUPS, COMPLICATION_ITEMS, COMPLICATION_TC_TITLES } from "@/lib/intraop-static-options"
import type { IntraopTab } from "@/lib/intraop-tabs"
import { newChartFluidsWithTimestamps } from "@/lib/intraop-chart-change"
import type { IntraopPreopSummary } from "@/lib/intraop-preop-summary"
import { useIntraopOptionSets } from "@/lib/use-intraop-option-sets"
import { useIntraopCaseLifecycle } from "@/lib/use-intraop-case-lifecycle"
import { useIntraopPremedication } from "@/lib/use-intraop-premedication"
import { useIntraopAirwaySection } from "@/lib/use-intraop-airway-section"
import { useIntraopSectionSaves } from "@/lib/use-intraop-section-saves"
import { useIntraopComplicationState } from "@/lib/use-intraop-complication-state"
import { useIntraopAutofillVitals } from "@/lib/use-intraop-autofill-vitals"
import { useIntraopSectionPatch } from "@/lib/use-intraop-section-patch"
import { useIntraopTimetableViewport } from "@/lib/use-intraop-timetable-viewport"
import { useIntraopFavourites } from "@/lib/use-intraop-favourites"
import { useIntraopEventPersistence } from "@/lib/use-intraop-event-persistence"
import { useIntraopEventActions } from "@/lib/use-intraop-event-actions"
import { useIntraopRuntimeEffects } from "@/lib/use-intraop-runtime-effects"
import { useIntraopCaseLoader } from "@/lib/use-intraop-case-loader"
import { useIntraopAutofillPreferences } from "@/lib/use-intraop-autofill-preferences"
import { useIntraopClinicalViewState } from "@/lib/use-intraop-clinical-view-state"
import { enqueueIntraopCaseWrite } from "@/lib/intraop-write-queue"
import { IntraopScreenChrome } from "@/components/intraop/IntraopScreenChrome"
import { IntraopRenderSurface } from "@/components/intraop/IntraopRenderSurface"
import type { LogEvent, ActiveInfusion, ActiveFluid, ActiveGasSettings } from "@/lib/intraop-log-event"

// react-native-web does NOT export `unstable_batchedUpdates` (it's undefined there),
// so calling it directly throws "is not a function" and aborts the whole case load
// on the PWA. React 18+ auto-batches async setState anyway, so the fallback simply
// runs the updates directly on web while preserving explicit batching on native.
const runBatched: (fn: () => void) => void =
  typeof unstable_batchedUpdates === "function" ? unstable_batchedUpdates : (fn) => fn()

// ─── Types ────────────────────────────────────────────────────────────────────


// ─── Data ─────────────────────────────────────────────────────────────────────

// Populated in place from the OptionLibrary API (see hook calls + useMemo
// blocks inside IntraopLiveScreen, below) instead of hardcoded here. This is
// also where this screen's lists used to drift from the IntraopTimetable
// widget's own copies — both now read the same rows.
// Colour palettes, value types, technique tree/colour,
// and format helpers now live in src/lib/intraop-{constants,types,technique,
// format}.ts (see imports above).

// ─── Helpers ──────────────────────────────────────────────────────────────────




// eventLabel moved inside IntraopLiveScreen below — it depends on
// drugColor/clinicalEventColor, which read library-derived local data.


// ─── Sheet ────────────────────────────────────────────────────────────────────


// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function IntraopLiveScreen() {
  const {
    DRUG_CATS, INF_DRUGS, FLUID_LIST, FLUID_QUICK_VOLUMES, FLUID_CONCENTRATIONS,
    FLUID_DEFAULT_CONCENTRATIONS, VOLATILE_AGENTS, DRUG_QUICK_DOSES, DRUG_ROUTES,
    DRUG_LA_CONCENTRATIONS, DRUG_ROUTE_PROFILES, DRUG_BASE_PROFILES, DRUG_RANGES,
    DRUG_DOSE_CALCS, INFUSION_QUICK_RATES, INFUSION_SUGGESTED_RATES,
    INFUSION_ROUTES, INFUSION_LA_CONCENTRATIONS, INFUSION_RANGES,
    INFUSION_ROUTE_PROFILES, INFUSION_BASE_PROFILES, DRUG_CODES, INFUSION_CODES,
    AGENT_QUICK_PERCENTS, CLINICAL_EVENT_CATS,
    POSITIONS_LIST, MONITORING_OPTS, TECHNIQUE_TREE, VASC_TREE, AIRWAY_TOOLS, AIRWAY_DEVICES,
    PREMED_LIBRARY, eventLabel, techniqueLabel,
  } = useIntraopOptionSets()

  const { id } = useLocalSearchParams<{ id: string }>()
  const router  = useRouter()
  const { isWatching, takeover } = useCaseLock(id, true)
  const {
    tc,
    etco2Unit,
    temperatureUnit,
    defaultMonitoring,
    clinicalPreferencesReady,
  } = usePreferences()

  const [caseInfo, setCaseInfo] = useState<{
    caseCode: string; procedure?: string; diagnosis?: string; techniques?: string[]
    status?: string; finalizedAt?: string | null
  } | null>(null)

  const [log,             setLog]             = useState<LogEvent[]>([])
  const logRef = useRef<LogEvent[]>([])
  const legacyWebLogNeedsSyncRef = useRef(false)
  const baseIntraopUpdatedAtRef = useRef<string | null>(null)
  const [activeInfusions, setActiveInfusions] = useState<ActiveInfusion[]>([])
  const [activeFluids,    setActiveFluids]    = useState<ActiveFluid[]>([])
  const [activeAgent,     setActiveAgent]     = useState<{ name: string; color: string; percent?: number } | null>(null)
  const [activeGas,       setActiveGas]       = useState<ActiveGasSettings>(null)

  const { width: screenWidth } = useWindowDimensions()
  const tabRailRef  = useRef<ScrollView>(null)
  const tabLayouts  = useRef<Partial<Record<string, { x: number; width: number }>>>({})

  const [tab,       setTab]       = useState<IntraopTab>("equipment")
  const [elapsedMs, setElapsedMs] = useState(0)
  const [caseLoaded, setCaseLoaded] = useState(false)
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const startRef                  = useRef<Date | null>(null)
  const verticalTimetableRef      = useRef<FlatList<number>>(null)
  const [entryTs, setEntryTs]     = useState<string | null>(null)
  const [slotOpen, setSlotOpen]       = useState(false)
  const [slotTs, setSlotTs]           = useState<Date | null>(null)
  const [slotEventSearch, setSlotEventSearch] = useState("")
  const [slotCompExpanded, setSlotCompExpanded] = useState(false)
  const [syncState, setSyncState] = useState<"saved" | "saving" | "failed" | "offline">("saved")
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  // Tracks concurrent in-flight section saves so case refresh does not reset
  // user-selected state while a save is still outstanding.
  const pendingSaveCountRef = useRef(0)
  const patchIntraopSection = useIntraopSectionPatch({
    caseId: id,
    pendingSaveCountRef,
    setSyncState,
    setSyncErrorMessage,
    setLastSavedAt,
  })

  const enqueueEventSave = useCallback(<T,>(operation: () => Promise<T>): Promise<T> =>
    enqueueIntraopCaseWrite(id, operation),
  [id])
  // Vitals sheet — text input refs for auto-advance focus chaining (state +
  // logic now in useVitalsEntry, called further down once setTimetable exists)
  const vSysRef = useRef<TextInput | null>(null)
  const vDiaRef = useRef<TextInput | null>(null)
  const vHRRef = useRef<TextInput | null>(null)
  const vSpO2Ref = useRef<TextInput | null>(null)
  const vEtco2Ref = useRef<TextInput | null>(null)
  const vTempRef = useRef<TextInput | null>(null)
  const vBglRef = useRef<TextInput | null>(null)
  const [timetable,  setTimetable]  = useState<TimetableData>(emptyTimetable())
  const [ttColCount, setTtColCount] = useState(12)
  const [chartPage,  setChartPage]  = useState(0)
  const noteVitalsRef = useRef<() => void>(() => {})
  const {
    save,
    syncLog,
    retryPendingEvents,
    removeEvent,
    undoLastEvent,
    undoEv,
    setUndoEv,
  } = useIntraopEventPersistence({
    caseId: id,
    entryTs,
    setEntryTs,
    log,
    logRef,
    startRef,
    legacyWebLogNeedsSyncRef,
    baseIntraopUpdatedAtRef,
    enqueueEventSave,
    setLog,
    setTimetable,
    setElapsedMs,
    setSyncState,
    setLastSavedAt,
    setPendingCount,
    noteVitalsRef,
  })

  // Infusion sheets
  const {
    infOpen, setInfOpen, infDrug, setInfDrug, infRate, setInfRate,
    infRoute, setInfRoute, infConcentration, setInfConcentration,
    infActOpen, setInfActOpen, infActTgt, setInfActTgt, infActRate, setInfActRate,
    infActConcentration, setInfActConcentration, setInfActTs,
    openInfusion, confirmInfusion, stopInfusion, changeRate,
  } = useInfusionEntry(save, setEntryTs, setActiveInfusions, INFUSION_CODES)

  // Drug sheet
  const {
    drugOpen, setDrugOpen, drugCat, setDrugCat, drugPick, setDrugPick, drugDose, setDrugDose,
    drugRoute, setDrugRoute, drugConcentration, setDrugConcentration,
    openDrug, confirmDrug, startDrugAsInfusion,
  } = useDrugEntry(save, setEntryTs, DRUG_CATS, INF_DRUGS, setInfDrug, setInfRate, setInfOpen, DRUG_CODES, INFUSION_QUICK_RATES, DRUG_DOSE_CALCS)

  // Fluid sheet + end options
  const {
    flOpen, setFlOpen, flFluid, setFlFluid, flVol, setFlVol,
    flConcentration, setFlConcentration,
    flEndOpen, setFlEndOpen, flEndTarget, flEndCustom, setFlEndCustom,
    openFluid, confirmFluid, openFluidEnd, confirmFluidEnd, stopFluidDirect,
  } = useFluidEntry(save, setEntryTs, setActiveFluids)

  // Agent sheet
  const { agOpen, setAgOpen, agPick, setAgPick, agPercent, setAgPercent, openAgent, confirmAgent, stopAgent } =
    useAgentEntry(save, setEntryTs, activeAgent, setActiveAgent)
  // Gas settings sheet (FGF/carrier gas/FiO2) - event-based gas_start/gas_change/gas_stop.
  const { gasOpen, setGasOpen, gasFgf, setGasFgf, gasCarrierGas, setGasCarrierGas, gasFio2, setGasFio2, openGasSettings, confirmGasSettings, stopGasSettings } =
    useGasSettingsEntry(save, setEntryTs, activeGas, setActiveGas)
  const { favouriteDrugs, favouriteInfusions } = useIntraopFavourites()

  const {
    compOpen,
    setCompOpen,
    selectedComplications,
    setSelectedComplications,
    complicationsNotes,
    setComplicationsNotes,
    compGroupExpanded,
    compSaving,
    addComplicationFromEvent,
    saveComplications,
    toggleComplication,
    toggleComplicationGroup,
  } = useIntraopComplicationState(patchIntraopSection, tc("errorLabel"))

  const {
    premedEveningText,
    setPremedEveningText,
    premedMorningText,
    setPremedMorningText,
    savePremedication,
    openPremedPicker,
    premedPickOpen,
    setPremedPickOpen,
    premedPickPhase,
    premedPickCat,
    setPremedPickCat,
    premedPickDrug,
    setPremedPickDrug,
    premedPickDose,
    setPremedPickDose,
    premedPickRoute,
    setPremedPickRoute,
    addSelectedPremedication,
  } = useIntraopPremedication(tab, patchIntraopSection, tc("errorLabel"))

  // Equipment tab
  const [preop, setPreop] = useState<IntraopPreopSummary | null>(null)

  // Timing tab
  const [caseMonthYear,   setCaseMonthYear]   = useState("")
  const [caseStartTime,   setCaseStartTime]   = useState("")
  const [caseEndTime,     setCaseEndTime]     = useState("")
  const [caseEndNextDay,  setCaseEndNextDay]  = useState(false)
  const [caseTimezone,    setCaseTimezone]    = useState<string | null>(null)

  // Position / Monitoring / Techniques tab state
  const [positions,      setPositions]      = useState<string[]>([])
  const [monitoring,     setMonitoring]     = useState<string[]>([])
  const [techniques,     setTechniques]     = useState<string[]>([])
  const {
    timingSaving,
    fieldSaving,
    vascularSaving,
    saveTiming,
    saveVascularAccesses,
    savePositions,
    saveMonitoring,
    saveTechniques,
  } = useIntraopSectionSaves({
    patchIntraopSection,
    monitoringOptions: MONITORING_OPTS,
    monitoring,
    setMonitoring,
    setCaseInfo,
    caseMonthYear,
    caseStartTime,
    caseEndTime,
    caseEndNextDay,
    caseTimezone,
    startRef,
  })

  const {
    endCaseOpen,
    setEndCaseOpen,
    startAtOpen,
    setStartAtOpen,
    startAtInput,
    setStartAtInput,
    endCaseDecisions,
    setEndCaseDecisions,
    continuedPostopItems,
    caseEnded,
    resumeSecsLeft,
    startCaseNow,
    startCaseAt,
    openEndCase,
    finaliseCase,
    resumeCase,
    endCaseRunningItems,
  } = useIntraopCaseLifecycle({
    startRef,
    setElapsedMs,
    setCaseInfo,
    setCaseStartTime,
    setCaseEndTime,
    setCaseEndNextDay,
    caseTimezone,
    save,
    saveTiming,
    patchIntraopSection,
    cancelLabel: tc("cancelLabel"),
    activeAgent,
    activeGas,
    activeInfusions,
    activeFluids,
    stopAgent,
    stopGasSettings,
    stopInfusion,
    stopFluidDirect,
    getReadinessInput: () => ({
      startedAt: startRef.current?.toISOString(),
      startTime: caseStartTime,
      techniques,
      airwayDevices: awDevices,
      ventilationModes: awVentModes,
      positions,
      vascularAccesses,
      ...Object.fromEntries(monitoring.map(field => [field, true])),
      timetableData: timetable,
      keyEvents: log,
      complications: selectedComplications.length > 0 || complicationsNotes.trim()
        ? selectedComplications.join(", ") || complicationsNotes
        : "",
    }),
  })

  // Vitals reminder notifications (opt-in; reset on each manual vitals entry)
  const { noteVitals } = useCaseReminders(!caseEnded)
  noteVitalsRef.current = noteVitals

  // Monitoring advanced section
  const [advMonOpen, setAdvMonOpen] = useState(false)
  useEffect(() => {
    if (clinicalPreferencesReady && defaultMonitoring === "advanced") {
      setAdvMonOpen(true)
    }
  }, [clinicalPreferencesReady, defaultMonitoring])
  const { autoFillVitals, autoFillBP, autoFillBg } = useIntraopAutofillPreferences()

  // Carry vitals forward as the timetable advances, when enabled in Settings.
  // This hook was imported but never called — so the feature silently did
  // nothing regardless of the toggle. (An unused import is only a lint warning,
  // and mobile lints with --quiet, so it went unnoticed.)
  useIntraopAutofillVitals(caseLoaded, autoFillVitals, autoFillBP, autoFillBg, logRef, startRef, save)

  const {
    awTools,
    setAwTools,
    awDevices,
    setAwDevices,
    awLmaSize,
    setAwLmaSize,
    awOralTubeSize,
    setAwOralTubeSize,
    awOralCuffed,
    setAwOralCuffed,
    awNasalTubeSize,
    setAwNasalTubeSize,
    awNasalCuffed,
    setAwNasalCuffed,
    awDltType,
    setAwDltType,
    awDltSide,
    setAwDltSide,
    awDltSize,
    setAwDltSize,
    awEbSize,
    setAwEbSize,
    awExpandedDevice,
    setAwExpandedDevice,
    awExpandedWasComplete,
    awClGrade,
    setAwClGrade,
    awVentModes,
    setAwVentModes,
    awVentExpanded,
    setAwVentExpanded,
    awNotes,
    setAwNotes,
    saveAirwaySection,
  } = useIntraopAirwaySection(caseLoaded, patchIntraopSection, tc("errorLabel"))

  // Vascular access tab
  const [vascularAccesses, setVascularAccesses] = useState<VascularEntry[]>([])

  // Technique tree navigation
  const [techPath,      setTechPath]      = useState<string[]>([])
  const [otherTechText, setOtherTechText] = useState("")

  const {
    vitOpen, setVitOpen, vitMode, vitScanBusy, editingVitalId, setEditingVitalId,
    vSys, setVSys, vDia, setVDia, vHR, setVHR, vSpO2, setVSpO2, vEtco2, setVEtco2, vTemp, setVTemp, vBgl, setVBgl,
    openVitals, confirmVitals, scanVitalsFromCamera, setAndAdvance,
  } = useVitalsEntry(save, syncLog, setEntryTs, entryTs, log, logRef, setLog, startRef, setTimetable, eventsToTimetable, roundDown5Min, id, tc("errorLabel"), etco2Unit, temperatureUnit)

  // ── Load auto-fill settings from SecureStore (once) ──────────────────
  useIntraopCaseLoader({
    caseId: id,
    monitoringOptions: MONITORING_OPTS,
    complicationItems: COMPLICATION_ITEMS,
    errorLabel: tc("errorLabel"),
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
  })
  useIntraopRuntimeEffects({
    log,
    logRef,
    startRef,
    setElapsedMs,
    setTimetable,
  })
  // ── Computed ──────────────────────────────────────────────────────────

  const {
    lastVitals,
    timeStr,
    prevVitalFor,
    isGACase,
    vitalVisibility,
  } = useIntraopClinicalViewState(log, techniques, caseInfo, monitoring)
  const {
    chartStart,
    currentCol,
    nowSlotPercent,
    eventRows,
    chartRows,
    jumpVerticalTimetableToNow,
    tabSwipeResponder,
  } = useIntraopTimetableViewport({
    log,
    timetable,
    startRef,
    verticalTimetableRef,
    tab,
    setTab,
    expandedRow,
    tabLayouts,
    tabRailRef,
    screenWidth,
  })

  const {
    editOpen,
    setEditOpen,
    editEv,
    editDose,
    setEditDose,
    editTime,
    setEditTime,
    eventActions,
    confirmEdit,
    promptDelete,
    openRowQuickAdd,
    openSlotEvent,
  } = useIntraopEventActions({
    log,
    save,
    syncLog,
    removeEvent,
    eventLabel,
    cancelLabel: tc("cancelLabel"),
    chartStart,
    openVitals,
    openDrug,
    openInfusion,
    openFluid,
    openAgent,
    openGasSettings,
    setSlotTs,
    slotTs,
    setSlotOpen,
    addComplicationFromEvent,
  })

  function handleChartTimetableChange(newData: TimetableData) {
    if (startRef.current) {
      const base = roundDown5Min(startRef.current)
      for (const { fluid: fl, ts } of newChartFluidsWithTimestamps(timetable, newData, base)) {
        setActiveFluids(prev => [...prev, { fluidId: fl.id, name: fl.name, volume: fl.volume, color: fl.color }])
        void save({ type: "fluid_start", fluidId: fl.id, name: fl.name, volume: fl.volume, color: fl.color }, ts, true)
      }
    }
    setTimetable(newData)
  }

  // ─────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────

  return (
    <>
      <View style={{ flex:1, backgroundColor: colors.background }}>
        <IntraopScreenChrome
          caseId={id}
          status={caseInfo?.status}
          finalizedAt={caseInfo?.finalizedAt}
          isWatching={isWatching}
          onTakeover={takeover}

          monitor={{
            techniquesLabel: caseInfo?.techniques?.map(techniqueLabel).join(" · ") ?? "Anaesthesia",
            procedure: caseInfo?.procedure ?? "–",
            diagnosis: caseInfo?.diagnosis,
            timeStr,
            started: !!startRef.current,
            elapsedMs,
            onStartNow: startCaseNow,
            onStartAt: () => {
              const now = new Date()
              setStartAtInput(formatHHMM(now))
              setStartAtOpen(true)
            },
            syncState,
            syncErrorMessage,
            pendingCount,
            lastSavedAt,
            onRetrySync: retryPendingEvents,
            lastVitals,
          }}

          ended={caseEnded ? { tc, resumeSecsLeft, onResume: resumeCase } : undefined}
          tabBar={{ tab, onSelect: setTab, tc, screenWidth, railRef: tabRailRef, layouts: tabLayouts }}
        >

        <IntraopRenderSurface {...{
          screenWidth, tabSwipeResponder, tab, undoEv, chartRows, chartStart, currentCol,
          expandedRow, nowSlotPercent, timetable, eventRows, activeInfusions, activeFluids,
          activeAgent, activeGas, startRef, isWatching, verticalTimetableRef, undoLastEvent,
          setUndoEv, setExpandedRow, eventLabel, setInfActTgt, setInfActRate, setInfActTs,
          openFluidEnd, openGasSettings, tc, stopAgent, openRowQuickAdd, jumpVerticalTimetableToNow,
          openEndCase, preop, techPath, setTechPath, TECHNIQUE_TREE, techniques, setTechniques,
          saveTechniques, techniqueLabel, otherTechText, setOtherTechText, caseMonthYear,
          setCaseMonthYear, caseStartTime, setCaseStartTime, caseEndTime, setCaseEndTime,
          caseEndNextDay, setCaseEndNextDay, timingSaving, saveTiming, positions, setPositions,
          savePositions, fieldSaving, POSITIONS_LIST, monitoring, setMonitoring, saveMonitoring,
          MONITORING_OPTS, advMonOpen, setAdvMonOpen, awTools, setAwTools, awClGrade,
          setAwClGrade, awDevices, setAwDevices, awLmaSize, setAwLmaSize, awOralTubeSize,
          setAwOralTubeSize, awOralCuffed, setAwOralCuffed, awNasalTubeSize, setAwNasalTubeSize,
          awNasalCuffed, setAwNasalCuffed, awDltType, setAwDltType, awDltSide, setAwDltSide,
          awDltSize, setAwDltSize, awEbSize, setAwEbSize, awVentModes, setAwVentModes,
          awNotes, setAwNotes, saveAirwaySection, awExpandedDevice, setAwExpandedDevice,
          awExpandedWasComplete, AIRWAY_TOOLS, AIRWAY_DEVICES, awVentExpanded, setAwVentExpanded,
          vascularAccesses, setVascularAccesses, saveVascularAccesses, vascularSaving,
          vascSiteColor, VASC_TREE, vascDefaultUnit, VASC_PREEXISTING_QUICK, premedEveningText,
          setPremedEveningText, premedMorningText, setPremedMorningText, savePremedication,
          openPremedPicker, log, selectedComplications, complicationsNotes, setComplicationsNotes,
          saveComplications, setCompOpen, eventActions, promptDelete, prevVitalFor, ttColCount,
          chartPage, caseEnded, resumeSecsLeft, resumeCase, setChartPage, setTtColCount,
          handleChartTimetableChange, setEntryTs, slotOpen, slotTs, timeStr, slotEventSearch,
          slotCompExpanded, CLINICAL_EVENT_CATS, COMPLICATION_GROUPS, COMPLICATION_ITEMS, isGACase, setSlotOpen,
          setSlotEventSearch, setSlotCompExpanded, openSlotEvent, openDrug, openAgent,
          stopGasSettings, gasOpen, gasFgf, setGasOpen, setGasFgf, gasCarrierGas,
          setGasCarrierGas, gasFio2, setGasFio2, confirmGasSettings, drugOpen, setDrugOpen,
          DRUG_CATS, favouriteDrugs, BOLUS_SCENARIOS, drugCat, setDrugCat, drugPick,
          setDrugPick, drugDose, setDrugDose, DRUG_QUICK_DOSES, DRUG_RANGES, INF_DRUGS,
          confirmDrug, startDrugAsInfusion, DRUG_ROUTES, drugRoute, setDrugRoute,
          DRUG_LA_CONCENTRATIONS, drugConcentration, setDrugConcentration, DRUG_BASE_PROFILES,
          DRUG_ROUTE_PROFILES, DRUG_DOSE_CALCS, vitOpen, vitMode, editingVitalId, vitScanBusy,
          vitalVisibility, etco2Unit, temperatureUnit, vSysRef, vDiaRef, vHRRef, vSpO2Ref,
          vEtco2Ref, vTempRef, vBglRef, vSys, vDia, vHR, vSpO2, vEtco2, vTemp, vBgl,
          setVitOpen, setEditingVitalId, scanVitalsFromCamera, setAndAdvance, setVSys, setVDia,
          setVHR, setVSpO2, setVEtco2, setVTemp, setVBgl, confirmVitals, infOpen, setInfOpen,
          setInfDrug, setInfRate, setInfRoute, setInfConcentration, INFUSION_SCENARIOS,
          INFUSION_QUICK_RATES, INFUSION_ROUTES, INFUSION_LA_CONCENTRATIONS, INFUSION_RANGES,
          INFUSION_SUGGESTED_RATES, INFUSION_BASE_PROFILES, INFUSION_ROUTE_PROFILES,
          favouriteInfusions, infDrug, infRate, confirmInfusion, infRoute, infConcentration,
          infActOpen, setInfActOpen, infActTgt, infActRate, changeRate, stopInfusion,
          infActConcentration, setInfActConcentration, flOpen, setFlOpen, setFlFluid, setFlVol,
          setFlConcentration, FLUID_LIST, flFluid, flVol, confirmFluid, FLUID_QUICK_VOLUMES,
          FLUID_CONCENTRATIONS, FLUID_DEFAULT_CONCENTRATIONS, flConcentration, flEndOpen,
          setFlEndOpen, flEndTarget, flEndCustom, setFlEndCustom, confirmFluidEnd, agOpen,
          setAgOpen, setAgPick, setAgPercent, VOLATILE_AGENTS, agPick, confirmAgent,
          AGENT_QUICK_PERCENTS, agPercent, editOpen, editEv, editDose, editTime, setEditOpen,
          setEditDose, setEditTime, confirmEdit, compOpen, COMPLICATION_TC_TITLES,
          compGroupExpanded, compSaving, toggleComplicationGroup, toggleComplication,
          setSelectedComplications, startAtOpen, startAtInput, setStartAtOpen, setStartAtInput,
          startCaseAt, endCaseOpen, setEndCaseOpen, endCaseRunningItems, endCaseDecisions,
          setEndCaseDecisions, finaliseCase, premedPickOpen, premedPickPhase, PREMED_LIBRARY,
          premedPickCat, premedPickDrug, premedPickDose, premedPickRoute, setPremedPickOpen,
          setPremedPickCat, setPremedPickDrug, setPremedPickDose, setPremedPickRoute,
          addSelectedPremedication, continuedPostopItems, router, id,
        }} />
        </IntraopScreenChrome>
      </View>
    </>
  )
}
