import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
 
import { View, FlatList, unstable_batchedUpdates, useWindowDimensions, type ScrollViewInstance } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import type { VascularEntry } from "@/lib/intraop-types"
import { formatHHMM } from "@/lib/intraop-format"
import { roundDown5Min } from "@/lib/intraop-projection"
import { useCaseReminders } from "@/lib/use-case-reminders"
import { usePreferences } from "@/lib/preferences-context"
import { emptyTimetable, type TimetableData } from "@/components/IntraopTimetable"
import { colors } from "@/theme/colors"
import { useCaseLock } from "@/lib/use-case-lock"
import { useSuggestionContext, useVitalQuestionContext } from "@/lib/use-intraop-automation"
import { DefibrillationHost } from "@/components/intraop/DefibrillationHost"
import { confirmAction } from "@/lib/notify"
import { autosaveManager } from "@/lib/autosave-manager"
import { usePhoneDeathPrompt } from "@/lib/use-phone-death-prompt"
import { jetSheet } from "@/lib/jet-sheet"
import { JetHost } from "@/components/intraop/JetHost"
import { TourniquetHost } from "@/components/intraop/TourniquetHost"
import { preopAgeDays } from "@lospor/core/vital-questions"
import { parseTechniqueSides, type TechniqueSide } from "@lospor/core/technique-smart"
import { useLikelyEvents } from "@/lib/use-likely-events"
import { usePhoneAirwayExchange } from "@/lib/use-phone-airway-exchange"
import { defibrillationSheet } from "@/lib/defibrillation-knob"
import { VASC_PREEXISTING_QUICK, vascDefaultUnit, vascSiteColor } from "@/lib/vascular-access-tree"
import { useAgentEntry } from "@/lib/use-agent-entry"
import { useGasSettingsEntry } from "@/lib/use-gas-settings-entry"
import { useFluidEntry } from "@/lib/use-fluid-entry"
import { useInfusionEntry } from "@/lib/use-infusion-entry"
import { useDrugEntry } from "@/lib/use-drug-entry"
import { BOLUS_SCENARIOS, INFUSION_SCENARIOS } from "@lospor/core"
import { plannedProcedureLabel } from "@lospor/core/procedure-codes"
import { useVitalsEntry } from "@/lib/use-vitals-entry"
import { COMPLICATION_ITEMS } from "@/lib/intraop-static-options"
import { applyIntraopChartChange } from "@/lib/apply-intraop-chart-change"
import { pediatricAgeFromPreop, useAllergyCheck, type IntraopPreopSummary } from "@/lib/intraop-preop-summary"
import { useIntraopOptionSets } from "@/lib/use-intraop-option-sets"
import { useIntraopCaseLifecycle, useEventStatePatch } from "@/lib/use-intraop-case-lifecycle"
import { useIntraopPremedication } from "@/lib/use-intraop-premedication"
import { useIntraopPremedicationPrefill } from "@/lib/use-intraop-premedication-prefill"
import { useIntraopFluidStatus } from "@/lib/use-intraop-fluid-status"
import { useCaseWeights } from "@/lib/use-case-weights"
import { useIntraopAirwaySection } from "@/lib/use-intraop-airway-section"
import { useIntraopSectionSaves } from "@/lib/use-intraop-section-saves"
import { useIntraopSyncStatusStore } from "@/lib/intraop-sync-status"
import { useIntraopComplicationState } from "@/lib/use-intraop-complication-state"
import { useIntraopAutofillVitals } from "@/lib/use-intraop-autofill-vitals"
import { useIntraopSectionPatch } from "@/lib/use-intraop-section-patch"
import { useIntraopTimetableViewport } from "@/lib/use-intraop-timetable-viewport"
import { usePhoneAirwayCharting, useRetryLegacyAirwayEvents } from "@/lib/use-phone-airway-charting"
import { airwayExchangePersist } from "@/lib/airway-exchange-persist"
import { usePhoneAirwaySmart, usePhoneVascularSmart } from "@/components/intraop/use-phone-smart-airway-vascular"
import { usePhoneMonitoringSmart, usePhoneEquipmentSmart, usePhoneTechniqueSmart } from "@/components/intraop/use-phone-smart-monitoring-equipment"
import { IntraopSmartSheets } from "@/components/intraop/IntraopSmartSheets"
import { useIntraopTabTiming } from "@/lib/use-intraop-tab-timing"
import { usePhoneSuggestionFacts } from "@/lib/use-phone-suggestion-facts"
import { PhoneSuggestionSheetsHost } from "@/components/intraop/PhoneSuggestionSheetsHost"
import { usePhoneTaggedSave } from "@/lib/use-phone-tagged-save"
import { intraopReadinessInput } from "@/lib/intraop-readiness-input"
import { useVitalInputRefs } from "@/lib/use-vital-input-refs"
import { useIntraopFavourites } from "@/lib/use-intraop-favourites"

import { useIntraopEventPersistence } from "@/lib/use-intraop-event-persistence"
import { useIntraopEventActions } from "@/lib/use-intraop-event-actions"
import { useIntraopLabs } from "@/lib/use-intraop-labs"
import { LabsSheet } from "@/components/intraop/LabsSheet"
import { IntraopEhrLabs } from "@/components/intraop/IntraopEhrLabs"
import { useIntraopRuntimeEffects } from "@/lib/use-intraop-runtime-effects"
import { useIntraopCaseLoader } from "@/lib/use-intraop-case-loader"
import { useIntraopAutofillPreferences } from "@/lib/use-intraop-autofill-preferences"
import { useIntraopClinicalViewState } from "@/lib/use-intraop-clinical-view-state"
import { useClinicalRules } from "@/lib/pediatric-clinical-rules"
import { enqueueIntraopCaseWrite } from "@/lib/intraop-write-queue"
import { IntraopScreenChrome } from "@/components/intraop/IntraopScreenChrome"
import { IntraopRenderSurface } from "@/components/intraop/IntraopRenderSurface"
import type { LogEvent } from "@/lib/intraop-log-event"
import { useIntraopRunningState } from "@/lib/use-intraop-running-state"

// react-native-web does NOT export `unstable_batchedUpdates` (it's undefined there),
// so calling it directly throws "is not a function" and aborts the whole case load
// on the PWA. React 18+ auto-batches async setState anyway, so the fallback simply
// runs the updates directly on web while preserving explicit batching on native.
const runBatched: (fn: () => void) => void =
  typeof unstable_batchedUpdates === "function" ? (unstable_batchedUpdates as unknown as (fn: () => void) => void) : (fn) => fn()

// This module holds the screen and nothing else. Colour palettes, value types,
// the technique tree and the format helpers live in
// src/lib/intraop-{constants,types,technique,format}.ts. The option lists are
// filled from the OptionLibrary API inside the component rather than hardcoded
// here — this file's lists used to drift from the IntraopTimetable widget's own
// copies, and both now read the same rows. eventLabel stays inside the
// component because it depends on drugColor/clinicalEventColor, which read
// library-derived local state.

export default function IntraopLiveScreen() {
  const [preop, setPreop] = useState<IntraopPreopSummary | null>(null)
  const clinicalMode = preop?.clinicalMode === "PEDIATRIC" ? "PEDIATRIC" : "ADULT"
  const pediatricMode = clinicalMode === "PEDIATRIC"
  const {
    snapshot: clinicalRulesSnapshot,
    loading: clinicalRulesLoading,
    error: clinicalRulesError,
    prospectiveGuidanceEnabled,
  } = useClinicalRules(clinicalMode, preop !== null)
  const {
    DRUG_CATS, INF_DRUGS, SEARCH_ONLY_DRUGS, SEARCH_ONLY_INFUSIONS, FLUID_LIST, FLUID_QUICK_VOLUMES, FLUID_CONCENTRATIONS,
    FLUID_DEFAULT_CONCENTRATIONS, FLUID_ROUTES, VOLATILE_AGENTS, DRUG_QUICK_DOSES, DRUG_ROUTES,
    DRUG_LA_CONCENTRATIONS, DRUG_ROUTE_PROFILES, DRUG_BASE_PROFILES, DRUG_RANGES,
    DRUG_DOSE_CALCS, INFUSION_QUICK_RATES, INFUSION_SUGGESTED_RATES,
    INFUSION_ROUTES, INFUSION_LA_CONCENTRATIONS, INFUSION_RANGES,
    INFUSION_ROUTE_PROFILES, INFUSION_BASE_PROFILES, DRUG_CODES, INFUSION_CODES,
    AGENT_QUICK_PERCENTS, CLINICAL_EVENT_CATS, PEDIATRIC_DRUG_PROFILES,
    PEDIATRIC_FLUID_PROFILES, PEDIATRIC_INFUSION_PROFILES,
    POSITIONS_LIST, MONITORING_OPTS, TECHNIQUE_TREE, VASC_TREE, AIRWAY_TOOLS, AIRWAY_DEVICES,
    PREMED_LIBRARY, eventLabel, techniqueLabel, INFUSION_WEIGHT_BASIS,
  } = useIntraopOptionSets(
    clinicalRulesSnapshot?.adultDoseProfiles ?? [],
    clinicalRulesSnapshot?.pediatricDrugProfiles ?? [],
    clinicalRulesSnapshot?.pediatricFluidProfiles ?? [],
    clinicalRulesSnapshot?.pediatricInfusionProfiles ?? [],
    // Pediatric availability (AUTO/MANUAL/LOCAL/HIDDEN) is band-specific, so the
    // pickers can only honour it once the patient's age and weight are known.
    pediatricAgeFromPreop(preop),
    preop?.weight ?? null,
    clinicalRulesSnapshot?.preset ?? null,
    prospectiveGuidanceEnabled,
  )
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>()
  const router  = useRouter()
  // Read-only chart view of the case so far: the same panel the finished-case
  // viewer draws, reachable mid-case. Pushed rather than shown as a modal so
  // the back gesture returns to the cockpit with its state untouched — this
  // opens nothing, edits nothing, and saves nothing.
  const openChartView = useCallback(() => {
    router.push(`/(app)/cases/timetable/${id}`)
  }, [router, id])
  const { isWatching, isWatchingRef, takeover } = useCaseLock(id, true)
  const vitalQuestionContext = useVitalQuestionContext(preop, isWatching) // vitals questions (10.1.0)
  const {
    tc, language, etco2Unit, temperatureUnit, cvpUnit, defaultMonitoring, clinicalPreferencesReady, airwayScreen, vascularScreen, monitoringScreen,
    equipmentScreen, techniqueScreen, eventsScreen, fluidsScreen, eventLogScreen,
  } = usePreferences()

  const [caseInfo, setCaseInfo] = useState<{
    caseCode: string; procedure?: string; procedureUndetermined?: boolean; diagnosis?: string; techniques?: string[]
    status?: string; finalizedAt?: string | null; theatre?: string | null
  } | null>(null)

  const [log,             setLog]             = useState<LogEvent[]>([])
  const logRef = useRef<LogEvent[]>([])
  const legacyWebLogNeedsSyncRef = useRef(false)
  const baseIntraopUpdatedAtRef = useRef<string | null>(null)
  const { activeInfusions, setActiveInfusions, activeFluids, setActiveFluids, activeAgents, setActiveAgents, activeAgent,
    activeGas, setActiveGas, applyActiveState, resyncActiveRef, endedAtRef, projectTimetable } = useIntraopRunningState(logRef)

  const { width: screenWidth } = useWindowDimensions()
  const tabRailRef  = useRef<ScrollViewInstance>(null)
  const tabLayouts  = useRef<Partial<Record<string, { x: number; width: number }>>>({})

  const { tab, selectTab } = useIntraopTabTiming(focus, () => pendingSaveCountRef.current)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [caseLoaded, setCaseLoaded] = useState(false)
  const [equipmentPrepared, setEquipmentPrepared] = useState<Record<string, boolean>>({})
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const startRef                  = useRef<Date | null>(null)
  const verticalTimetableRef      = useRef<FlatList<number>>(null)
  const [entryTs, setEntryTs]     = useState<string | null>(null)
  const [slotOpen, setSlotOpen]       = useState(false)
  const [slotTs, setSlotTs]           = useState<Date | null>(null)
  const [slotEventSearch, setSlotEventSearch] = useState("")
  const [slotCompExpanded, setSlotCompExpanded] = useState(false)
  // In a store, not this component's state: every autosave moves it twice, and
  // holding it here re-rendered the whole screen for what only a badge shows.
  // See intraop-sync-status.ts. The setters keep a fixed identity.
  const { store: syncStatusStore, setSyncState, setPendingCount, setLastSavedAt, setSyncErrorMessage }
    = useIntraopSyncStatusStore()
  // Tracks concurrent in-flight section saves so case refresh does not reset
  // user-selected state while a save is still outstanding.
  const pendingSaveCountRef = useRef(0)
  const patchIntraopSection = useIntraopSectionPatch({
    caseId: id,
    pendingSaveCountRef,
    setSyncState,
    setSyncErrorMessage,
    setLastSavedAt, watchingRef: isWatchingRef,
  })

  const enqueueEventSave = useCallback(<T,>(operation: () => Promise<T>): Promise<T> =>
    enqueueIntraopCaseWrite(id, operation),
  [id])
  // Vitals sheet — text input refs for auto-advance focus chaining (state +
  // logic now in useVitalsEntry, called further down once setTimetable exists)
  const { vSysRef, vDiaRef, vHRRef, vSpO2Ref, vEtco2Ref, vTempRef, vBisRef, vTofRef, vCvpRef } = useVitalInputRefs()
  const [timetable,  setTimetable]  = useState<TimetableData>(emptyTimetable())
  const [ttColCount, setTtColCount] = useState(12)
  const [chartPage,  setChartPage]  = useState(0)
  const noteVitalsRef = useRef<() => void>(() => {})
  const {
    save, stampFor,
    syncLog,
    retryPendingEvents,
    removeEvent, deleteEvent, removalUndo,
    undoLastEvent,
    undoEv,
    setUndoEv,
  } = useIntraopEventPersistence({
    caseId: id,
    entryTs, setEntryTs, log, logRef, startRef, legacyWebLogNeedsSyncRef, baseIntraopUpdatedAtRef, enqueueEventSave, setLog, setTimetable,
    setElapsedMs, setSyncState, setLastSavedAt, setPendingCount,
    noteVitalsRef, resyncActiveRef, endedAtRef, watchingRef: isWatchingRef,
  })

  // Pediatric cases remain manually chartable but must not inherit unreviewed
  // adult dose, rate, concentration, fluid, gas, or equipment presets.
  const allergyCheck = useAllergyCheck(preop, tc) // infusion + drug sheets check recorded allergies (1.5.0)
  const { saveTagged, pendingSuggestion, suggestionContextRef } = usePhoneTaggedSave({ save, logRef, language, tc: tc as never })
  const {
    infOpen, setInfOpen, infDrug, setInfDrug, infRate, setInfRate,
    infRoute, setInfRoute, infConcentration, setInfConcentration,
    infCustomConcentration, setInfCustomConcentration, infFormulation, setInfFormulation,
    infRule, setInfRule,
    infActOpen, setInfActOpen, infActTgt, setInfActTgt, infActRate, setInfActRate,
    infActConcentration, setInfActConcentration, infActTs, setInfActTs,
    openInfusion, confirmInfusion, stopInfusion, changeRate,
  } = useInfusionEntry(saveTagged, setEntryTs, setActiveInfusions, INFUSION_CODES, INFUSION_WEIGHT_BASIS, allergyCheck)

  // Drug sheet
  const {
    drugOpen, setDrugOpen, drugCat, setDrugCat, drugPick, setDrugPick, drugDose, setDrugDose,
    drugRoute, setDrugRoute, drugConcentration, setDrugConcentration,
    drugCustomConcentration, setDrugCustomConcentration, drugFormulation, setDrugFormulation,
    drugRule, applyDrugSelection,
    openDrug, confirmDrug, startDrugAsInfusion, openDrugPreset,
  } = useDrugEntry(
    saveTagged, setEntryTs, DRUG_CATS, INF_DRUGS, setInfDrug, setInfRate, setInfOpen, DRUG_CODES,
    pediatricMode ? {} : INFUSION_QUICK_RATES,
    pediatricMode ? {} : DRUG_DOSE_CALCS, allergyCheck,
  )

  // Fluid sheet + end options
  const {
    flOpen, setFlOpen, flFluid, setFlFluid, flVol, setFlVol,
    flEntryMode, setFlEntryMode, flRate, setFlRate, resetFluidDraft,
    flConcentration, setFlConcentration, flRoute, setFlRoute, setFlRule,
    flEndOpen, setFlEndOpen, flEndTarget, flEndCustom, setFlEndCustom,
    flEndRate, setFlEndRate, changeFluidRate,
    openFluid, confirmFluid, openFluidEnd, confirmFluidEnd, stopFluidDirect,
  } = useFluidEntry(saveTagged, setEntryTs, setActiveFluids, stampFor)
  // (Cleared below, once the gas and shock sheets are known: a card can open those too.)

  // Agent sheet
  const { agOpen, setAgOpen, agPick, setAgPick, agPercent, setAgPercent, openAgent, confirmAgent, stopAgent } =
    useAgentEntry(saveTagged, setEntryTs, activeAgents, setActiveAgents)
  // Gas settings sheet (FGF/carrier gas/FiO2) - event-based gas_start/gas_change/gas_stop.
  const { gasOpen, setGasOpen, gasFgf, setGasFgf, gasCarrierGas, setGasCarrierGas, gasFio2, setGasFio2, openGasSettings, confirmGasSettings, stopGasSettings } =
    useGasSettingsEntry(saveTagged, setEntryTs, activeGas, setActiveGas)
  // A card can open the gas and shock sheets too: leave no tag behind when every sheet is closed unsaved.
  const defibOpen = useSyncExternalStore(defibrillationSheet.subscribe, defibrillationSheet.current, defibrillationSheet.current) != null
  useEffect(() => { if (!drugOpen && !infOpen && !flOpen && !gasOpen && !defibOpen) pendingSuggestion.current = null }, [drugOpen, infOpen, flOpen, gasOpen, defibOpen, pendingSuggestion])
  const { favouriteDrugs, favouriteInfusions } = useIntraopFavourites()

  const {
    selectedComplications, setSelectedComplications, complicationsNotes, setComplicationsNotes, removeLegacyComplication, saveComplications,
  } = useIntraopComplicationState(patchIntraopSection, tc("errorLabel"))

  const {
    premedEveningText, setPremedEveningText, premedMorningText, setPremedMorningText, savePremedication, openPremedPicker, premedPickOpen,
    setPremedPickOpen, premedPickPhase, premedPickCat, setPremedPickCat, premedPickDrug, setPremedPickDrug, premedPickDose, setPremedPickDose,
    premedPickRoute, setPremedPickRoute, addSelectedPremedication,
  } = useIntraopPremedication(patchIntraopSection, tc("errorLabel"))
  // The premedication starts from what the preop visit ordered (1.7.0).
  useIntraopPremedicationPrefill({
    ready: caseLoaded,
    // Watching mode saves nothing, so the order waits for a take-over rather than
    // showing as applied while the server never hears of it.
    readOnly: isWatching || caseInfo?.status === "COMPLETE" || !!caseInfo?.finalizedAt,
    ordered: preop?.premedicationOrders,
    current: { evening: premedEveningText, morning: premedMorningText },
    fill: texts => {
      if (texts.evening != null) setPremedEveningText(texts.evening)
      if (texts.morning != null) setPremedMorningText(texts.morning)
      void savePremedication(texts)
    },
  })

  // Fluid status tab — urine output, blood loss and the blood products note.
  const {
    urineMl, setUrineMl,
    bloodLossMl, setBloodLossMl,
    hydrateFluidStatus,
  } = useIntraopFluidStatus(tab, patchIntraopSection, tc("errorLabel"))
  // Laboratory draws taken during the case, each stamped with its own time.
  const { labResults, hydrateLabs, saveLabs } = useIntraopLabs(patchIntraopSection, tc("errorLabel"))
  const [labsOpen, setLabsOpen] = useState(false)
  const [labsTs, setLabsTs] = useState<string | null>(null)
  const openLabs = useCallback((ts: string) => { setLabsTs(ts); setLabsOpen(true) }, [])
  const { caseIbw, caseTbw, caseBsa } = useCaseWeights({
    clinicalMode, sex: preop?.sex, heightCm: preop?.height,
    weightKg: preop?.weight, ageValue: preop?.ageValue, ageUnit: preop?.ageUnit,
  })

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
  // The side of a block or unilateral spinal, by technique code (10.2.0).
  const [techniqueSides, setTechniqueSides] = useState<Record<string, TechniqueSide>>({})
  const {
    timingSaving, fieldSaving, fieldSaveError, vascularSaving, saveTiming, saveVascularAccesses, savePositions, saveMonitoring, saveTechniques,
  } = useIntraopSectionSaves({
    patchIntraopSection,
    monitoringOptions: MONITORING_OPTS,
    monitoring, setMonitoring, setCaseInfo, caseMonthYear, caseStartTime, caseEndTime, caseEndNextDay, caseTimezone,
    startRef, endedAtRef, setCaseMonthYear,
  })

  // SPS (10.2.0), when any group is on and this screen holds the case.
  const startedAtIso = startRef.current?.toISOString() ?? null
  const endedAtIso = endedAtRef.current?.toISOString() ?? null
  const { chartAirwayEvent, chartVascularEvent, chartLegacyAirwayDevice, removeLegacyAirwayEvents, pendingLegacyAirwayEventsRef } =
    usePhoneAirwayCharting({ log, save, startRef, syncLog, tc: tc as never })
  const {
    awTools, setAwTools, awDevices, setAwDevices, awLmaSize, setAwLmaSize, awOralTubeSize, setAwOralTubeSize, awOralCuffed, setAwOralCuffed,
    awNasalTubeSize, setAwNasalTubeSize, awNasalCuffed, setAwNasalCuffed, awDltType, setAwDltType, awDltSide, setAwDltSide, awDltSize, setAwDltSize,
    awEbSize, setAwEbSize, awExpandedDevice, setAwExpandedDevice, awExpandedWasComplete, awClGrade, setAwClGrade, awVentModes, setAwVentModes,
    awVentExpanded, setAwVentExpanded, awNotes, setAwNotes, awPresentsIntubated, setAwPresentsIntubated, awNotApplicable, setAwNotApplicable,
    saveAirwaySection,
  } = useIntraopAirwaySection(caseLoaded, patchIntraopSection, tc("errorLabel"), airwayScreen === "legacy" ? chartLegacyAirwayDevice : undefined, airwayScreen === "legacy" ? removeLegacyAirwayEvents : undefined)
  useRetryLegacyAirwayEvents({ startRef, isWatching, airwayScreen, awDevices, caseStartTime, chartLegacyAirwayDevice, pendingRef: pendingLegacyAirwayEventsRef })
  // Keep structured airway entries in the suggestion context as well as the
  // legacy device list. An exchanged tube must not look like a second active
  // primary airway to the induction link.
  const airwayExchange = usePhoneAirwayExchange({
    log, active: caseLoaded && !isWatching, smart: airwayScreen === "smart",
    legacy: () => ({ airwayDevices: awDevices, lmaSize: awLmaSize, oralTubeSize: awOralTubeSize, oralCuffed: awOralCuffed, nasalTubeSize: awNasalTubeSize,
      nasalCuffed: awNasalCuffed, dltType: awDltType, dltSide: awDltSide, dltSize: awDltSize, endobronchialSize: awEbSize }),
    persist: airwayExchangePersist({
      setters: { setAwDevices, setAwLmaSize, setAwOralTubeSize, setAwOralCuffed, setAwNasalTubeSize, setAwNasalCuffed, setAwDltType, setAwDltSide, setAwDltSize, setAwEbSize, setAwTools },
      awTools, save, patchIntraopSection,
    }),
  })
  // 10.2.0: Jet ticked among the ventilation modes puts a Jet button in each column's sheet.
  useEffect(() => { jetSheet.setEnabled(awVentModes.includes("Jet")) }, [awVentModes])
  const suggestionContext = useSuggestionContext(preop, usePhoneSuggestionFacts({
    caseIbw, monitoring, labResults, bloodLossMl, startedAtIso, endedAtIso, caseTimezone, techniques, techniqueSides,
    awDevices, airwayExchange, awPresentsIntubated,
  }), isWatching)
  suggestionContextRef.current = suggestionContext

  const {
    endCaseOpen, setEndCaseOpen, startAtOpen, setStartAtOpen, startAtInput, setStartAtInput,
    startAtDay, openStartAt,
    endCaseDecisions, setEndCaseDecisions, continuedPostopItems, caseEnded, resumeSecsLeft, startCaseNow, startCaseAt, openEndCase, finaliseCase,
    resumeCase, resumeUnlimited, restoreEndedCase,
    endCaseRunningItems, afterEndItems, resolveAfterEnd, setChosenEndTs, attention,
  } = useIntraopCaseLifecycle({
    startRef, setElapsedMs, setCaseInfo, setCaseStartTime, setCaseEndTime, setCaseEndNextDay, caseTimezone, save, saveTiming, patchIntraopSection,
    cancelLabel: tc("cancelLabel"),
    activeAgents, activeGas, activeInfusions, activeFluids,
    timeline: { caseId: id ?? null, log, logRef, syncLog, removeEvent, labelOf: ev => eventLabel(ev).text, endedAtRef, resyncActiveRef, vitals: vitalQuestionContext, suggestions: suggestionContext, onEventPatch: useEventStatePatch(setTechniques, setTechniqueSides) },
    stopAgent, stopGasSettings, stopInfusion, stopFluidDirect,
    getReadinessInput: () => intraopReadinessInput({
      startRef, caseStartTime, techniques, awDevices, awVentModes, positions, vascularAccesses, monitoring, timetable, log, selectedComplications, complicationsNotes,
    }),
  })

  // 10.2.0: a death charted here sets the postop destination to Deceased and offers End case.
  usePhoneDeathPrompt(log, !isWatching && caseLoaded, () => {
    if (id) void autosaveManager.saveSection(id, "postop", { disposition: "DECEASED" }, { partial: true })
    void confirmAction(tc("sgEndCase"), tc("sgDeathEndCase"), { confirmLabel: tc("sgEndCase"), cancelLabel: tc("vitalNotNow"), labelledOnWeb: true })
      .then(yes => { if (yes) openEndCase() })
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
  useIntraopAutofillVitals(caseLoaded, autoFillVitals, autoFillBP, autoFillBg, log, logRef, startRef, save, { endedAtRef, onEndCase: openEndCase })

  const onAirwayInterventionSelected = () => {
    if (awNotApplicable) setAwNotApplicable(() => false)
  }
  const clinicalModeTyped = clinicalMode as "ADULT" | "PEDIATRIC"
  const { saveAirwayEntries, onNoAirwayInterventionSelected, airwaySmart, smartCase, smartClock, airwayLabel } = usePhoneAirwaySmart({
    airwayScreen, isWatching, airwayExchange, setAwNotApplicable, log, syncLog, removeEvent, chartAirwayEvent, preop, clinicalMode: clinicalModeTyped,
    techniques, startRef, AIRWAY_DEVICES, AIRWAY_TOOLS, clockOf: attention?.clockOf,
  })

  // Vascular access tab
  const [vascularAccesses, setVascularAccesses] = useState<VascularEntry[]>([])
  const { vascularLines, applyVascularLines, vascularEvents, vascularCase, vascularSmart } = usePhoneVascularSmart({
    vascularScreen, isWatching, caseLoaded, log, save, vascularAccesses, setVascularAccesses, saveVascularAccesses, vascularSaving,
    fieldSaveError, preop, clinicalMode: clinicalModeTyped, startRef, language, techniques, smartClock, chartVascularEvent,
  })
  const { monitoringSmart, applyMonitoring, saveMonitoringAsking } = usePhoneMonitoringSmart({
    monitoringScreen, isWatching, log, save, monitoring, setMonitoring, saveMonitoring, techniques, airwayExchange, vascularLines,
    startRef, suggestionContext, tc: tc as never, MONITORING_OPTS, fieldSaving, fieldSaveError, onReading: () => openVitals("full"),
  })
  const equipmentSmart = usePhoneEquipmentSmart({
    equipmentScreen, isWatching, monitoring, applyMonitoring, airwayExchange, equipmentPrepared, setEquipmentPrepared,
    patchIntraopSection, smartCase, saveAirwayEntries,
  })
  const techniqueSmart = usePhoneTechniqueSmart({
    techniqueScreen, isWatching, caseLoaded, log, techniques, setTechniques, techniqueSides, setTechniqueSides, saveTechniques,
    TECHNIQUE_TREE, techniqueLabel, plannedTechniques: preop?.plannedTechniques, fieldSaving, fieldSaveError,
  })

  // The events likely to come next (10.2.0), in the event selector: only ones not charted yet. What is likely is Core's (event-succession).
  const likelyEvents = useLikelyEvents({
    log,
    structured: { airway: airwayExchange.entries(), vascular: vascularLines() },
    techniques,
    child: clinicalMode === "PEDIATRIC",
    enabled: caseLoaded && !isWatching && eventsScreen === "smart",
    save,
  })

  // Technique tree navigation
  const [techPath,      setTechPath]      = useState<string[]>([])
  const [otherTechText, setOtherTechText] = useState("")

  const {
    vitOpen, setVitOpen, vitMode, vitScanBusy, editingVitalId, setEditingVitalId,
    vSys, setVSys, vDia, setVDia, vHR, setVHR, vSpO2, setVSpO2, vEtco2, setVEtco2, vTemp, setVTemp,
    vBis, setVBis, vTof, setVTof, vCvp, setVCvp, vIbp, setIbp,
    vitalFeedback, openVitals, confirmVitals, scanVitalsFromCamera, setAndAdvance,
  } = useVitalsEntry(save, syncLog, setEntryTs, entryTs, log, logRef, setLog, startRef, setTimetable, projectTimetable, roundDown5Min, id, tc("errorLabel"), etco2Unit, temperatureUnit, cvpUnit)

  useIntraopCaseLoader({
    caseId: id, onEndedLoaded: restoreEndedCase,
    monitoringOptions: MONITORING_OPTS,
    complicationItems: COMPLICATION_ITEMS,
    errorLabel: tc("errorLabel"),
    enqueueEventSave, runBatched, pendingSaveCountRef, legacyWebLogNeedsSyncRef, baseIntraopUpdatedAtRef, startRef, setCaseInfo, setTechniques,
    setPositions, setMonitoring, setPreop, setCaseMonthYear, setCaseStartTime, setCaseEndTime, setCaseEndNextDay, setCaseTimezone, setAwTools,
    setAwDevices,
    onIntraopRecord: record => {
      airwayExchange.hydrate(record)
      setTechniqueSides(parseTechniqueSides(record.techniqueSides))
      const prepared = record.equipmentPrepared
      setEquipmentPrepared(prepared && typeof prepared === "object" && !Array.isArray(prepared) ? Object.fromEntries(Object.entries(prepared).filter(([, value]) => typeof value === "boolean")) : {})
    },
    setAwLmaSize, setAwOralTubeSize, setAwOralCuffed, setAwNasalTubeSize, setAwNasalCuffed, setAwDltType, setAwDltSide, setAwDltSize, setAwEbSize,
    setAwClGrade, setAwVentModes, setAwVentExpanded, setAwNotes, setAwPresentsIntubated, setAwNotApplicable, setAdvMonOpen, setVascularAccesses,
    setPremedEveningText, setPremedMorningText, setSelectedComplications, setComplicationsNotes, hydrateFluidStatus, hydrateLabs, setPendingCount,
    setSyncState, setSyncErrorMessage, setLog, setElapsedMs, applyActiveState, endedAtRef, setTimetable, setTtColCount, setCaseLoaded,
  })
  useIntraopRuntimeEffects({
    log,
    logRef,
    startRef, endedAtRef,
    setElapsedMs, setTimetable, projectTimetable, resyncActiveRef,
  })
  // ── Computed ──────────────────────────────────────────────────────────

  const {
    lastVitals, timeStr, prevVitalFor, isGACase, vitalVisibility,
  } = useIntraopClinicalViewState(log, techniques, caseInfo, monitoring)
  const {
    chartStart, currentCol, nowSlotPercent, eventRows, chartRows, jumpVerticalTimetableToNow, tabSwipeResponder, tabMotion,
  } = useIntraopTimetableViewport({
    log,
    timetable,
    startRef, endedAtRef,
    verticalTimetableRef,
    tab,
    setTab: selectTab,
    expandedRow, tabLayouts, tabRailRef, screenWidth,
  })

  const {
    editOpen, setEditOpen, editEv, editDose, setEditDose, editTime, setEditTime, eventActions, confirmEdit, promptDelete, openRowQuickAdd,
    openSlotEvent,
  } = useIntraopEventActions({
    log,
    save,
    syncLog,
    removeEvent: deleteEvent, // a clinician's delete offers Undo (9.14.2)
    eventLabel,
    cancelLabel: tc("cancelLabel"),
    chartStart, openVitals, openDrug, openInfusion, openFluid, openAgent, openGasSettings, openLabs, setSlotTs, slotTs, setSlotOpen,
  })
  const handleChartTimetableChange = (newData: TimetableData) => applyIntraopChartChange({ start: startRef.current, timetable, next: newData, onFluidStart: fluid => setActiveFluids(prev => [...prev, fluid]), save, onChange: setTimetable })
  // ─────────────────────────────── RENDER ───────────────────────────────
  return (
    <>
      <View testID={caseLoaded ? "intraop-case-ready" : "intraop-case-loading"} style={{ flex: 1, backgroundColor: colors.background }}>
        <IntraopScreenChrome
          caseId={id}
          status={caseInfo?.status}
          finalizedAt={caseInfo?.finalizedAt}
          isWatching={isWatching}
          onTakeover={takeover}
          monitor={{
            techniquesLabel: caseInfo?.techniques?.map(techniqueLabel).join(" · ") ?? tc("anaesthesiaLabel"),
            procedure: (caseInfo?.procedureUndetermined ? plannedProcedureLabel({ procedureUndetermined: true }, language) : null) ?? caseInfo?.procedure ?? "–",
            diagnosis: caseInfo?.diagnosis,
            theatre: caseInfo?.theatre,
            timeStr,
            started: !!startRef.current,
            elapsedMs,
            onStartNow: startCaseNow,
            onStartAt: () => openStartAt(formatHHMM(new Date())),
            syncStatusStore,
            onRetrySync: retryPendingEvents,
            lastVitals,
          }}
          ended={caseEnded ? { tc, resumeSecsLeft, unlimited: resumeUnlimited, onResume: resumeCase } : undefined}
          tabBar={{ tab, onSelect: selectTab, tc, screenWidth, railRef: tabRailRef, layouts: tabLayouts }}
        >
        <IntraopRenderSurface {...{
          screenWidth, tabSwipeResponder, tabMotion, tab, undoEv, chartRows, chartStart, currentCol, attention,
          expandedRow, nowSlotPercent, timetable, eventRows, activeInfusions, activeFluids,
          activeAgent, activeAgents, activeGas, startRef, isWatching, verticalTimetableRef, undoLastEvent,
          setUndoEv, removalUndo, setExpandedRow, eventLabel, setInfActTgt, setInfActRate, setInfActTs,
          openFluidEnd, openGasSettings, tc, stopAgent, openRowQuickAdd, jumpVerticalTimetableToNow,
          openEndCase, openChartView, preop, labResults, openLabs,
          pediatricDrugProfiles: PEDIATRIC_DRUG_PROFILES,
          pediatricDoseProfiles: prospectiveGuidanceEnabled ? clinicalRulesSnapshot?.doseProfiles ?? [] : [],
          prospectiveGuidanceEnabled,
          pediatricRulesSource: clinicalRulesSnapshot?.source ?? null,
          pediatricRulesCachedAt: clinicalRulesSnapshot?.cachedAt ?? null,
          pediatricRulesLoading: clinicalRulesLoading,
          pediatricRulesError: clinicalRulesError, techPath, setTechPath, TECHNIQUE_TREE, techniques, setTechniques,
          saveTechniques, techniqueLabel, otherTechText, setOtherTechText, caseMonthYear,
          setCaseMonthYear, caseStartTime, setCaseStartTime, caseEndTime, setCaseEndTime,
          caseEndNextDay, setCaseEndNextDay, timingSaving, saveTiming, endedAtRef, caseTimezone, positions, setPositions,
          savePositions, fieldSaving, POSITIONS_LIST, monitoring, setMonitoring, saveMonitoring: saveMonitoringAsking,
          MONITORING_OPTS, advMonOpen, setAdvMonOpen, awTools, setAwTools, awClGrade,
          setAwClGrade, awDevices, setAwDevices, awLmaSize, setAwLmaSize, awOralTubeSize,
          setAwOralTubeSize, awOralCuffed, setAwOralCuffed, awNasalTubeSize, setAwNasalTubeSize,
          awNasalCuffed, setAwNasalCuffed, awDltType, setAwDltType, awDltSide, setAwDltSide,
          awDltSize, setAwDltSize, awEbSize, setAwEbSize, awVentModes, setAwVentModes,
          awNotes, setAwNotes, awPresentsIntubated, setAwPresentsIntubated,
          awNotApplicable, setAwNotApplicable, onAirwayInterventionSelected, onNoAirwayInterventionSelected, saveAirwaySection, awExpandedDevice, setAwExpandedDevice,
          awExpandedWasComplete, AIRWAY_TOOLS, AIRWAY_DEVICES, airwaySmart, awVentExpanded, setAwVentExpanded,
          vascularAccesses, setVascularAccesses, saveVascularAccesses, vascularSaving, vascularSmart, monitoringSmart, equipmentSmart, techniqueSmart,
          vascSiteColor, VASC_TREE, vascDefaultUnit, VASC_PREEXISTING_QUICK, premedEveningText,
          setPremedEveningText, premedMorningText, setPremedMorningText, savePremedication,
          openPremedPicker, log, selectedComplications, complicationsNotes, setComplicationsNotes,
          saveComplications, removeLegacyComplication, eventActions, promptDelete, prevVitalFor, ttColCount,
          caseIbw, caseTbw, caseBsa, infusionWeightBasis: INFUSION_WEIGHT_BASIS,
          urineMl, setUrineMl, bloodLossMl, setBloodLossMl,
          fluidsScreen,
          eventLogScreen,
          chartPage, caseEnded, resumeSecsLeft, resumeCase, setChartPage, setTtColCount,
          handleChartTimetableChange, setEntryTs, slotOpen, slotTs, timeStr, slotEventSearch,
          slotCompExpanded, likelyEvents: likelyEvents.likely, eventsScreen, onDismissLikely: likelyEvents.dismiss, CLINICAL_EVENT_CATS, isGACase, setSlotOpen,
          setSlotEventSearch, setSlotCompExpanded, openSlotEvent, openDrug, openAgent,
          stopGasSettings, gasOpen, gasFgf, setGasOpen, setGasFgf, gasCarrierGas,
          setGasCarrierGas, gasFio2, setGasFio2, confirmGasSettings, drugOpen, setDrugOpen,
          DRUG_CATS, SEARCH_ONLY_DRUGS, favouriteDrugs, BOLUS_SCENARIOS, drugCat, setDrugCat, drugPick,
          setDrugPick, drugDose, setDrugDose, DRUG_QUICK_DOSES, DRUG_RANGES, INF_DRUGS,
          confirmDrug, startDrugAsInfusion, DRUG_ROUTES, drugRoute, setDrugRoute,
          DRUG_LA_CONCENTRATIONS, drugConcentration, setDrugConcentration,
          drugCustomConcentration, setDrugCustomConcentration, drugFormulation, setDrugFormulation,
          drugRule, applyDrugSelection, DRUG_BASE_PROFILES,
          DRUG_ROUTE_PROFILES, DRUG_DOSE_CALCS, vitOpen, vitMode, editingVitalId, vitScanBusy,
          vitalVisibility, etco2Unit, temperatureUnit, cvpUnit, vSysRef, vDiaRef, vHRRef, vSpO2Ref,
          vEtco2Ref, vTempRef, vBisRef, vTofRef, vCvpRef,
          vSys, vDia, vHR, vSpO2, vEtco2, vTemp, vBis, vTof, vCvp, vIbp, setIbp, vitalFeedback,
          setVBis, setVTof, setVCvp, confirmVitals,
          setVitOpen, setEditingVitalId, scanVitalsFromCamera, setAndAdvance, setVSys, setVDia,
          setVHR, setVSpO2, setVEtco2, setVTemp, infOpen, setInfOpen,
          setInfDrug, setInfRate, setInfRoute, setInfConcentration,
          setInfCustomConcentration, setInfFormulation, setInfRule, SEARCH_ONLY_INFUSIONS, INFUSION_SCENARIOS,
          INFUSION_QUICK_RATES, INFUSION_ROUTES, INFUSION_LA_CONCENTRATIONS, INFUSION_RANGES,
          INFUSION_SUGGESTED_RATES, INFUSION_BASE_PROFILES, INFUSION_ROUTE_PROFILES,
          favouriteInfusions, infDrug, infRate, confirmInfusion, infRoute, infConcentration,
          infCustomConcentration, infFormulation, infRule,
          infActOpen, setInfActOpen, infActTgt, infActRate, changeRate, stopInfusion, infActTs,
          infActConcentration, setInfActConcentration, flOpen, setFlOpen, setFlFluid, setFlVol,
          flEntryMode, setFlEntryMode, flRate, setFlRate, resetFluidDraft,
          setFlConcentration, flRoute, setFlRoute, setFlRule,
          pediatricFluidProfiles: PEDIATRIC_FLUID_PROFILES,
          pediatricInfusionProfiles: PEDIATRIC_INFUSION_PROFILES,
          FLUID_LIST, flFluid, flVol, confirmFluid, FLUID_QUICK_VOLUMES,
          FLUID_CONCENTRATIONS, FLUID_DEFAULT_CONCENTRATIONS, FLUID_ROUTES, flConcentration, flEndOpen,
          setFlEndOpen, flEndTarget, flEndCustom, setFlEndCustom, flEndRate, setFlEndRate,
          changeFluidRate, confirmFluidEnd, agOpen,
          setAgOpen, setAgPick, setAgPercent, VOLATILE_AGENTS, agPick, confirmAgent,
          AGENT_QUICK_PERCENTS, agPercent, editOpen, editEv, editDose, editTime, setEditOpen,
          setEditDose, setEditTime, confirmEdit,
          startAtOpen, startAtInput, setStartAtOpen, setStartAtInput,
          startAtDay, startCaseAt, endCaseOpen, setEndCaseOpen, endCaseRunningItems, afterEndItems, resolveAfterEnd, setChosenEndTs, endCaseDecisions,
          setEndCaseDecisions, finaliseCase, premedPickOpen, premedPickPhase, PREMED_LIBRARY,
          premedPickCat, premedPickDrug, premedPickDose, premedPickRoute, setPremedPickOpen,
          setPremedPickCat, setPremedPickDrug, setPremedPickDose, setPremedPickRoute,
          addSelectedPremedication, continuedPostopItems, router, id,
        }} />
        </IntraopScreenChrome>
      </View>
      {/* Rendered here rather than threaded through IntraopRenderSurface: the
          sheet needs only the draw list and the case id, and passing it through
          that props object would add six more names to a list that is already
          the reason this screen is hard to read. */}
      <DefibrillationHost log={log} save={saveTagged} preop={preop} />
      {!isWatching ? <JetHost log={log} save={save} clockOf={attention?.clockOf ?? (iso => iso.slice(11, 16))} /> : null}
      {!isWatching ? <TourniquetHost log={log} save={save} sex={preop?.sex} clockOf={attention?.clockOf ?? (iso => iso.slice(11, 16))}
        ageDays={preopAgeDays(preop ? { ageValue: preop.ageValue, ageUnit: preop.ageUnit, ageYears: preop.age, ageApproxDays: preop.ageApproxDays } : null)} /> : null}
      <IntraopSmartSheets {...{ isWatching, vascularEvents, vascularCase, vascularLines, applyVascularLines, airwayExchange, smartCase, airwayLabel, saveAirwayEntries, AIRWAY_DEVICES }} tc={tc as never} />
      <PhoneSuggestionSheetsHost {...{ attention, isWatching, pendingSuggestion, openLabs, openGasSettings, openAgent, eventLabel, setInfActTgt, setInfActRate, setInfActOpen, save, airwayExchange, vascularAccesses, setVascularAccesses, saveVascularAccesses }}
        active={{ activeGas, activeAgents, activeInfusions }}
        sheetArgs={{ setEntryTs, drugCats: DRUG_CATS, openDrugPreset, infusions: INF_DRUGS, setInfDrug, setInfRate, setInfOpen, fluids: FLUID_LIST, log, openFluid, setFlFluid, setFlVol, setFlEntryMode, setFlRate }} />
      {labsTs ? (
        <LabsSheet
          visible={labsOpen}
          takenAt={labsTs}
          value={labResults}
          title={`${tc("trRowLabs")} · ${formatHHMM(new Date(labsTs))}`}
          onClose={() => setLabsOpen(false)}
          onChange={next => { void saveLabs(next) }}
          onEnsureCase={async () => id ?? null}
          importPanel={<IntraopEhrLabs caseId={id ?? null} value={labResults} onChange={saveLabs} />}
        />
      ) : null}
    </>
  )
}
