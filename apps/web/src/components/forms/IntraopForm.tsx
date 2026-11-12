"use client"

import { useForm, useWatch, type Resolver } from "react-hook-form"
import { useIntraopEventTimeline } from "@/hooks/useIntraopEventTimeline"
import { useIntraopEventAutofill } from "@/hooks/useIntraopEventAutofill"
import { useChartedAirwayEvents } from "./intraop-form/useChartedAirwayEvents"
import { useIntraopSubmit } from "./intraop-form/useIntraopSubmit"
import { useIntraopSuggestionContext, useApplyEventPatches } from "./intraop-form/useIntraopSuggestionContext"
import { IntraopSidebar } from "./intraop-form/IntraopSidebar"
import { IntraopEquipment } from "./intraop-form/IntraopEquipment"
import { useEquipmentSmart } from "./intraop-form/useEquipmentSmart"
import { useTechniqueSmart } from "./intraop-form/useTechniqueSmart"
import { useIntraopAutosave } from "./intraop-form/useIntraopAutosave"
import { useAirwayAbsence } from "./intraop-form/useAirwayAbsence"
import { useMonitoringSmart } from "./intraop-form/useMonitoringSmart"
import { useLiveFluidTotals } from "./intraop-form/useLiveFluidTotals"
import { usePendingChartedEvents } from "./intraop-form/usePendingChartedEvents"
import { IntraopFooter } from "./intraop-form/IntraopFooter"
import { IncompleteDialog } from "./intraop-form/IncompleteDialog"
import { useIntraopAttention } from "@/lib/use-intraop-attention"
import { useLikelyEvents, useVitalQuestionContext } from "@/lib/use-intraop-automation"
import { IntraopAttentionPanel } from "@/components/intraop/IntraopAttentionPanel"
import { AirwayExchangeDialog } from "@/components/intraop/AirwayExchangeDialog"
import { accessKindOf, replaceFailedLine, vascularLineText, type AccessKind, type VascularLine } from "@lospor/core/vascular-access-lines"
import { airwayDeviceEntriesOf, type AirwayDeviceEntry, type AirwayExchangeReason } from "@lospor/core/airway-device-entries"
import { cardEventOps } from "@lospor/core/intraop-suggestions"
import type { LogEvent as CoreLogEvent } from "@lospor/core/intraop-types"
import { serverNow } from "@/lib/intraop-clock"
import { displayClinicalCode, displayOption } from "@/lib/clinical-display"
import { CaseSaveStateContext } from "@/lib/use-case-save-state"
import { totalsProvisional } from "@lospor/core/intraop-save-state"
import type { IntraopEventOps } from "@lospor/core/intraop-timetable-edit"
import { computeLiveDrugTotals, tciPatientFrom } from "@/lib/intraop-drug-totals"
import { intraopEndCaseValuesNow } from "@/lib/intraop-submit"
import { useState, useEffect, useRef, useMemo } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { StepTabBar } from "@/components/forms/StepTabBar"
import { SectionJumpStrip } from "@/components/forms/SectionJumpStrip"
import { useLocale, useTranslations } from "next-intl"
import { IntraopTimetable, type TimetableData, type IntraopLogEvent } from "@/components/IntraopTimetable"
import type { WeightBasisMap } from "@/lib/infusion-calc"
import { buildTree as buildTechniqueTree, techniqueIsGeneral, techniqueUsesGas } from "@/components/TechniqueTree"
import { type CaseStages } from "@/components/forms/CaseSidebar"

import { IntraopPreopSummary } from "@/components/intraop/IntraopPreopSummary"
import { useEndCaseCheck } from "@/components/intraop/EndCaseReadiness"
import { useAllergyGate } from "@/components/intraop/AllergyGate"
import { useSuggestionGate } from "@/components/intraop/SuggestionGate"
import { intraopFocusTab, scrollToReadiness, useScrollToReadiness } from "@/lib/readiness-focus"
import { AIRWAY_DEVICE_REQUIRED_FIELDS, isAirwayDeviceComplete, monitoringPatchForTechniques, monthYearForDate, syncAirwayDeviceSelection, type AirwayDeviceWithProfile, airwayDeviceSummary } from "@lospor/core/intraop"
import { AIRWAY_EVENT_DEVICE, airwayRecordFields, type AirwayPatient } from "@lospor/core/airway-smart"
import { localTimeOf } from "@lospor/core/intraop-time"
import { AirwaySmart } from "@/components/intraop/AirwaySmart"
import { AirwaySmartPanel, type AirwaySmartRequest } from "@/components/intraop/AirwaySmartPanel"
import { VASCULAR_EVENT_TYPE } from "@lospor/core/vascular-smart"
import { VascularSmart } from "@/components/intraop/VascularSmart"
import { VascularSmartPanel, type VascularSmartRequest } from "@/components/intraop/VascularSmartPanel"
import { useVascularScreen } from "@/lib/use-vascular-screen"
import { useEventsScreen } from "@/lib/use-events-screen"
import { useFluidsScreen } from "@/lib/use-fluids-screen"
import { useEventLogScreen } from "@/lib/use-event-log-screen"
import { EventSelectorContext } from "@/components/intraop/event-selector-context"
import type { VitalKey } from "@/types/timetable"
import { withoutNibp } from "@lospor/core/monitoring-smart"
import { ConfirmDialog } from "@/components/intraop/ConfirmDialog"
import { IntraopLabsDialog } from "@/components/intraop/IntraopLabsDialog"
import { IntraopEhrLabs, ehrLabsWriter } from "@/components/intraop/IntraopEhrLabs"
import { useClinicalRules } from "@/hooks/useClinicalRules"
import { useOptionLibrary } from "@/hooks/useOptionLibrary"
import { SectionCard } from "@/components/forms/shared/SectionCard"
import { usePremedicationLibrary } from "@/components/intraop/use-premedication-library"
import { usePremedicationPrefill } from "@/components/intraop/use-premedication-prefill"
import { PositionSection } from "@/components/forms/sections/PositionSection"
import { MonitoringSection } from "@/components/forms/sections/MonitoringSection"
import { VascularAccessSection } from "@/components/forms/sections/VascularAccessSection"
import { PremedicationSection } from "@/components/forms/sections/PremedicationSection"
import { ComplicationsSection } from "@/components/forms/sections/ComplicationsSection"
import { DrugsFluidTotalsSection } from "@/components/forms/sections/DrugsFluidTotalsSection"
import { TimelineSection } from "@/components/forms/sections/TimelineSection"
import { AirwaySection } from "@/components/forms/sections/AirwaySection"
import { TechniqueSection } from "@/components/forms/sections/TechniqueSection"
import {
  weightBasisMap,
} from "@lospor/core/option-library"
import { resolveIdealBodyWeight } from "@lospor/core/ideal-body-weight"
import { schema, type IntraopData, type IntraopFormFields } from "./intraopSchema"

export type { IntraopFormFields, IntraopData } from "./intraopSchema"

// Position, airway management, and monitoring option lists now live in the
// OptionLibrary table (POSITION / AIRWAY_MANAGEMENT / MONITORING categories)
// and are fetched via useOptionLibrary inside IntraopForm below.

import type { PreopSummary } from "@/components/forms/preop-summary"


export function IntraopForm({ defaultValues, defaultTimetable, preop, onSubmit, onBack, onAutoSave, onSaveNow, onPostopContinued, onDeath, layoutMode = "tabs", caseStarted: caseStartedProp = false, eventLog, onEventOps, readOnly = false, autoEnded: autoEndedProp = false, caseId = null, aiOptIn = false, focus = null, stages }: {
  /** Where the case is, for the case panel (sidebar layout). */
  stages?: CaseStages
  /**
   * The saved case, once autosave has created one.
   *
   * Needed by the intraoperative lab scan: the server reads AI consent from the
   * stored case and ignores anything the client claims, because a photographed
   * report carries the patient's name and no redaction is possible on an image.
   */
  caseId?: string | null
  aiOptIn?: boolean
  defaultValues?: Partial<IntraopData>
  defaultTimetable?: TimetableData
  preop?: PreopSummary | null
  onSubmit: (data: IntraopData) => void
  onBack: () => void
  onAutoSave?: (data: IntraopData) => void; onSaveNow?: (data: IntraopData) => Promise<unknown> // hospital: saves at once (labs from the hospital system)
  onPostopContinued?: (items: string[]) => void
  /** A death charted in theatre (10.2.0): the postop destination becomes Deceased. */
  onDeath?: () => void
  /** "sidebar": one scrolling page beside the case panel (10.0.0). */
  layoutMode?: "tabs" | "scroll" | "sidebar"
  caseStarted?: boolean
  eventLog?: IntraopLogEvent[]
  /** Writes timeline edits as event operations (the log is the only source). */
  onEventOps?: (ops: IntraopEventOps) => void | Promise<void>
  /** Another screen holds the case: nothing here may write (9.12.1). */
  readOnly?: boolean
  /** Ended automatically after 48 hours; applies while that saved end stands (9.12.1). */
  autoEnded?: boolean
  /** A part of the record to open on arrival, from a readiness "Go to" (1.5.0). */
  focus?: string | null
}) {
  const t = useTranslations()
  const locale = useLocale()
  const { register, handleSubmit, control, watch, setValue, getValues, formState } = useForm<IntraopFormFields>({
    // zodResolver's inferred generic doesn't exactly match z.infer<typeof
    // schema> for a schema this size (lots of .optional()/.default() fields)
    // — a known zod-v4/react-hook-form resolver-typing friction point, not
    // something this cast is hiding a real mismatch behind.
    resolver: zodResolver(schema) as Resolver<IntraopFormFields>,
    defaultValues: {
      monthYear: monthYearForDate(new Date()),
      drugsAdministered: [], vitals: [], positions: [], techniques: [],
      airwayDevices: [], ventilationModes: [], airwayTools: [],
      presentsIntubated: false, airwayNotApplicable: false, labResults: [],
      nbpMonitor: true, spO2Monitor: true, ecg: true,
      ...defaultValues,
    },
  })

  const { options: positionOptions } = useOptionLibrary("POSITION")
  const { options: techniqueLibOpts } = useOptionLibrary("TECHNIQUE")
  const techniqueTree = useMemo(() => buildTechniqueTree(techniqueLibOpts, locale), [locale, techniqueLibOpts])
  const { options: monitoringOptions } = useOptionLibrary("MONITORING")
  const { options: airwayOptions } = useOptionLibrary("AIRWAY_MANAGEMENT")
  const { options: infusionLibOpts } = useOptionLibrary("INTRAOP_INFUSION")
  const infusionWeightBasis = useMemo<WeightBasisMap>(
    () => weightBasisMap(infusionLibOpts),
    [infusionLibOpts],
  )
  const airwayDeviceOptions = useMemo(() => airwayOptions.filter(o => o.group === "Device"), [airwayOptions])
  const airwayToolOptions = useMemo(() => airwayOptions.filter(o => o.group === "Instrument"), [airwayOptions])
  // The premedication picker's drugs and doses, rebuilt for a child from its
  // weight and age (shared with the preop order: use-premedication-library).
  const clinicalMode = preop?.clinicalMode === "PEDIATRIC" ? "PEDIATRIC" : "ADULT"
  const isPediatric = clinicalMode === "PEDIATRIC"
  const { premedCategories, premedDoses, premedAnnotations, premedDoseForRoute } = usePremedicationLibrary(preop)

  const EMPTY_TIMETABLE = useMemo<TimetableData>(() => ({ vitals: [], drugs: [], fluids: [], agents: [], infusions: [], gasSettings: [], clinicalEvents: [] }), [])
  const safeTimetable = (defaultTimetable && !Array.isArray(defaultTimetable) && "vitals" in defaultTimetable)
    ? defaultTimetable : EMPTY_TIMETABLE
  const [vitalFocusRequest, setVitalFocusRequest] = useState<{ key: VitalKey; nonce: number } | null>(null)
  // While the reasons for a changed end are open, the floating questions step aside (10.1.0).
  const [endCorrectionOpen, setEndCorrectionOpen] = useState(false)
  // The chart is the projection of the event log; edits become events (1.4.9).
  const [timelineStartedAt, timelineEndedAt, timelineStartTime, timelineZone] = useWatch({ control, name: ["startedAt", "endedAt", "startTime", "timezone"] })
  const { timetable, log: timelineLog, chartStartMs, startedAt: chartStartedAt, onTimetableChange, removeEvent, addEvents } = useIntraopEventTimeline({
    eventLog, startedAt: timelineStartedAt, startTime: timelineStartTime, timezone: timelineZone, endedAt: timelineEndedAt, onEventOps, readOnly, legacyTimetable: safeTimetable,
  })
  const { airwayScreen, atomicAirwayEventPendingRef, atomicVascularEventPendingRef, chartAirwayEvent, chartVascularEvent, legacyAirwayPatch, chartLegacyAirwayDevice, removeLegacyAirwayEvents } = useChartedAirwayEvents({ onEventOps, timelineLog, getValues, chartStartedAt, readOnly, t })
  useIntraopEventAutofill({ log: timelineLog, chartStartMs, endedAt: timelineEndedAt, addEvents, disabled: readOnly })

  const {
    snapshot: clinicalRulesSnapshot,
    loading: clinicalRulesLoading,
    error: clinicalRulesError,
    prospectiveGuidanceEnabled,
  } = useClinicalRules(clinicalMode)
  const ibwResolution = resolveIdealBodyWeight({
    clinicalMode,
    heightCm: preop?.heightCm,
    sex: preop?.sex,
    age: isPediatric && preop?.ageValue != null && preop.ageUnit
      ? { value: preop.ageValue, unit: preop.ageUnit }
      : null,
  })
  // Rounded to 0.1 kg as the PWA and the printed record use it, so the three
  // cannot total the same infusion a few decimals apart (9.12.3).
  const calcIbw = ibwResolution.available ? ibwResolution.roundedKg : null
  const calcTbw = preop?.weightKg ?? null
  const { suggestionContext, watchedTechniques: watchedTechniquesForSuggestions } = useIntraopSuggestionContext({ control, preop, readOnly, idealWeightKg: calcIbw, startedAt: chartStartedAt, endedAt: timelineEndedAt, timeZone: timelineZone })
  const attention = useIntraopAttention({ caseId, log: timelineLog, endedAt: timelineEndedAt, timeZone: timelineZone, locale, onEventOps: useApplyEventPatches(setValue, onEventOps), readOnly, vitals: useVitalQuestionContext(preop, readOnly), suggestions: suggestionContext })

  // Arithmetic, not interface — see @/lib/intraop-drug-totals.
  const liveDrugTotals = useMemo(
    () => computeLiveDrugTotals(timetable, calcIbw, calcTbw, infusionWeightBasis, preop?.heightCm ?? null, tciPatientFrom(preop ?? {})),
    [calcIbw, calcTbw, infusionWeightBasis, preop, timetable])

  const liveFluidTotals = useLiveFluidTotals(timetable, preop)

  // Smart monitoring defaults — fire once when technique first selected
  const techniques = useMemo(() => (watchedTechniquesForSuggestions ?? []) as string[], [watchedTechniquesForSuggestions])

  useEffect(() => {
    if (!techniques.length) return
    const patch = monitoringPatchForTechniques(techniques, getValues() as Record<string, unknown>)
    for (const [field, value] of Object.entries(patch)) {
      setValue(field as keyof IntraopFormFields, value)
    }
  }, [getValues, setValue, techniques])

  const { ventilationModes: _wVM } = useIntraopAutosave({ control, getValues, onAutoSave, atomicAirwayEventPendingRef, atomicVascularEventPendingRef })
  const watchedLabResults = useWatch({ control, name: "labResults" })
  // Which draw the dialog is editing. null takenAt with open true is the
  // read-across view of every draw.
  const [labsDialog, setLabsDialog] = useState<{ open: boolean; takenAt: string | null }>(
    { open: false, takenAt: null },
  )
  // Watch airway sub-option fields for auto-collapse logic
  const _wLmaSize       = useWatch({ control, name: "lmaSize" })
  const _wOralTubeSize  = useWatch({ control, name: "oralTubeSize" })
  const _wOralCuffed    = useWatch({ control, name: "oralCuffed" })
  const _wNasalTubeSize = useWatch({ control, name: "nasalTubeSize" })
  const _wNasalCuffed   = useWatch({ control, name: "nasalCuffed" })
  const _wDltType  = useWatch({ control, name: "dltType" })
  const _wDltSide  = useWatch({ control, name: "dltSide" })
  const _wDltSize  = useWatch({ control, name: "dltSize" })
  const _wEbSize   = useWatch({ control, name: "endobronchialSize" })
  // The premedication starts from what the preop visit ordered (1.7.0).
  usePremedicationPrefill({
    ordered: preop?.premedicationOrders,
    readOnly,
    getValue: field => getValues(field),
    setValue: (field, value) => setValue(field, value, { shouldDirty: true }),
  })

  const { presentsIntubated, airwayNA, setPresentsIntubated, setAirwayNA, clearAirwayNotApplicable } = useAirwayAbsence({ control, setValue, getValues, onEventOps, timelineLog, t })
  // The Legacy Monitoring section is one grouped list now; the setter stays for templates that expect it.
  const [, setAdvancedMonOpen] = useState(false)
  const [airwayExpandedDevice, setAirwayExpandedDevice] = useState<string | null>(null)
  const [activeTab,            setActiveTab]            = useState(() => intraopFocusTab(focus) ?? "overview")
  useScrollToReadiness(focus)
  const [airwayOverride,       setAirwayOverride]       = useState(false)
  const monDefaultsApplied      = useRef(false)
  const deviceWasCompleteOnOpen = useRef(false)
  const timelineSectionRef = useRef<HTMLDivElement>(null)
  function expandAirwayDevice(v: string) {
    const vals = getValues()
    const devs: string[] = vals.airwayDevices ?? []
    // Reopening an already-added device is a re-edit: clear its sub-fields so
    // the panel opens with everything deselected and the user re-picks from
    // scratch, identical to first-time entry (the normal
    // incomplete→complete→auto-collapse flow then runs again). Previously we
    // kept the old values and set deviceWasCompleteOnOpen to suppress the
    // auto-collapse, but that flag was never reset, so after a re-edit the
    // panel could never collapse again and the device was impossible to edit.
    if (devs.includes(v)) {
      for (const field of AIRWAY_DEVICE_REQUIRED_FIELDS[v as AirwayDeviceWithProfile] ?? []) {
        setValue(field as Parameters<typeof setValue>[0], undefined)
      }
    }
    deviceWasCompleteOnOpen.current = false
    setAirwayExpandedDevice(v)
  }

  // Keep airwayDevices in sync with the currently-open device's own completeness:
  // add it the moment it becomes complete (this is also the gate that gets it to the
  // DB in the first place), and drop it again if an edit blanks a required field back
  // out — a device should never sit confirmed-but-empty. Auto-collapses on completion.
  useEffect(() => {
    if (!airwayExpandedDevice) return
    const vals = getValues()
    const devs: string[] = vals.airwayDevices ?? []
    const complete = isAirwayDeviceComplete(airwayExpandedDevice, vals)
    const nextDevices = syncAirwayDeviceSelection(devs, airwayExpandedDevice, complete)
    if (nextDevices !== devs) {
      setValue("airwayDevices", nextDevices)
      if (complete && !devs.includes(airwayExpandedDevice)) chartLegacyAirwayDevice(airwayExpandedDevice, devs, legacyAirwayPatch([...devs, airwayExpandedDevice]))
    }
    if (complete && !deviceWasCompleteOnOpen.current) setAirwayExpandedDevice(null)
  }, [_wDltSide, _wDltSize, _wDltType, _wEbSize, _wLmaSize, _wNasalCuffed, _wNasalTubeSize, _wOralCuffed, _wOralTubeSize, airwayExpandedDevice, chartLegacyAirwayDevice, getValues, legacyAirwayPatch, setValue])

  const watchedStartTime = useWatch({ control, name: "startTime" })
  const watchedEndTime = useWatch({ control, name: "endTime" })
  const watchedNbpMonitor = useWatch({ control, name: "nbpMonitor" })
  const watchedInvasiveBP = useWatch({ control, name: "invasiveBP" })
  const watchedEcg = useWatch({ control, name: "ecg" })
  const watchedSpO2Monitor = useWatch({ control, name: "spO2Monitor" })
  const watchedEtco2Monitor = useWatch({ control, name: "etco2Monitor" })
  const watchedTempMonitor = useWatch({ control, name: "tempMonitor" })
  const startTime  = watchedStartTime || "08:00"
  const showAirway   = techniqueIsGeneral(techniques)
  const showGases    = techniqueUsesGas(techniques)

  const monitoring = {
    nbpMonitor:    !!watchedNbpMonitor,
    invasiveBP:    !!watchedInvasiveBP,
    ecg:           !!watchedEcg,
    spO2Monitor:   !!watchedSpO2Monitor,
    etco2Monitor:  !!watchedEtco2Monitor,
    tempMonitor:   !!watchedTempMonitor,
  }

  // A dose that clashes with a recorded allergy is acknowledged before it is added (1.5.0).
  const allergyGate = useAllergyGate({ preop, locale: locale === "bg" ? "bg" : "en", ready: chartStartMs !== null })
  // 10.2.0: the MH-history warning, the local anaesthetic maximum and the latex banner.
  const suggestionGate = useSuggestionGate({ context: suggestionContext, log: timelineLog, locale, now: () => serverNow().toISOString(), ready: chartStartMs !== null })
  // The phone app's End case check, on web (1.5.0): blockers stop the end.
  const endCheck = useEndCaseCheck({
    record: () => ({ ...getValues(), timetableData: timetable, keyEvents: eventLog ?? [] }) as Record<string, unknown>,
    locale: locale === "bg" ? "bg" : "en",
    onGo: area => { setActiveTab(intraopFocusTab(area) ?? "overview"); scrollToReadiness(area) },
  })


  const { handleContinue, doSubmit, handleManualSave, handleSubmitWithTimetable, manualSaved, timeErrors, setTimeErrors, incompleteItems, setIncompleteItems, canContinueIncomplete } = useIntraopSubmit({
    getValues, timetable, eventLog, startTime, presentsIntubated, airwayNA, onSubmit, onAutoSave, setActiveTab, timelineSectionRef, t,
  })

  const intraopSidebar = layoutMode === "sidebar" ? (
    <IntraopSidebar t={t} locale={locale} stages={stages} preop={preop} isPediatric={isPediatric} startTime={watchedStartTime} endTime={watchedEndTime} techniques={techniques} techniqueTree={techniqueTree} />
  ) : null


  // ── Suggestions (10.2.0): failed lines and the embedded airway picker ──────
  const [airwayDialog, setAirwayDialog] = useState<{ reason: AirwayExchangeReason | null; at: string; eventId?: string; eventLabel?: string; complication?: CoreLogEvent } | null>(null)
  const suggestionForm = {
    linesOf: (kind: AccessKind) => ((getValues("vascularAccesses") ?? []) as VascularLine[])
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => accessKindOf(line.site) === kind)
      .map(({ line, index }) => ({ id: String(index), label: vascularLineText(line, { failed: "", time: () => "" }), failed: line.failed === true })),
    markLineFailed: (id: string, failedAt: string) => {
      setValue("vascularAccesses", replaceFailedLine((getValues("vascularAccesses") ?? []) as VascularLine[], Number(id), failedAt) as IntraopFormFields["vascularAccesses"], { shouldDirty: true })
    },
    openAirway: (_rect: DOMRect, complication: CoreLogEvent) => setAirwayDialog({ reason: "reintubation", at: serverNow().toISOString(), complication }),
  }
  // E6: Reintubation or Airway exchange charted on this screen opens the picker
  // (Airway exchange asks why first); an event whose device is already on the list does not.
  const airwayEntriesLinked = (event: CoreLogEvent) => {
    const entries = airwayDeviceEntriesOf(getValues() as Record<string, unknown>)
    return entries.some(entry => entry.sourceEventId === event.id) || Array.isArray(event.intraopPatch?.airwayDeviceEntries)
      || (!event.sourceEventId && entries.filter(entry => entry.insertedAt === event.ts).length === 1)
  }
  usePendingChartedEvents({
    log: timelineLog, readOnly, canOpen: !airwayDialog,
    matches: event => event.label === "Reintubation" || event.label === "Airway exchange",
    isLinked: airwayEntriesLinked,
    onOpen: fresh => setAirwayDialog({ reason: fresh.label === "Reintubation" ? "reintubation" : null, at: fresh.ts, eventId: fresh.id, eventLabel: fresh.label }),
  })
  function saveAirwayExchange(next: AirwayDeviceEntry[]) {
    const dialog = airwayDialog
    setAirwayDialog(null)
    if (!dialog) return
    const patch = airwayRecordFields(next, (getValues("airwayTools") ?? []) as string[])
    const hasAtomicEvent = !!onEventOps && (!!dialog.complication || (!!dialog.eventId && !!dialog.eventLabel))
    if (hasAtomicEvent) atomicAirwayEventPendingRef.current = true
    setValue("airwayDeviceEntries", next as unknown as IntraopFormFields["airwayDeviceEntries"], { shouldDirty: true })
    for (const [field, value] of Object.entries(patch)) {
      if (field === "airwayDeviceEntries") continue
      setValue(field as keyof IntraopFormFields, (value ?? undefined) as never, { shouldDirty: true })
    }
    if (dialog.complication && onEventOps) {
      void onEventOps(cardEventOps(dialog.complication, "Reintubation", "reintubate", dialog.at, serverNow(), { intraopPatch: patch }))
    } else if (dialog.eventId && dialog.eventLabel) {
      chartAirwayEvent({ id: dialog.eventId, label: dialog.eventLabel, ts: dialog.at, intraopPatch: patch })
    }
  }

  // ── Smart selection (10.2.0) ────────────────────────────────────────────────
  // The Airway tab that opens on what is in place. What it offers and how it saves
  // is Core's (airway-smart); this only hands it the case and writes the result.
  useWatch({ control, name: ["airwayDeviceEntries", "airwayDevices", "airwayTools"] })
  const [smartRequest, setSmartRequest] = useState<AirwaySmartRequest | null>(null)
  const smartPatient: AirwayPatient = {
    clinicalMode: preop?.clinicalMode ?? "ADULT",
    ageYears: preop?.ageYears ?? null,
    age: preop?.ageValue != null && preop.ageUnit ? { value: preop.ageValue, unit: preop.ageUnit } : null,
    weightKg: preop?.weightKg ?? null, heightCm: preop?.heightCm ?? null, sex: preop?.sex ?? null,
  }
  const airwayName = (code: string) => displayClinicalCode("option:AIRWAY_MANAGEMENT", code, locale)
  const smartTimeOf = (iso: string) => (timelineZone ? localTimeOf(new Date(iso), timelineZone) : null) ?? iso.slice(11, 16)
  function applyAirwayEntries(next: AirwayDeviceEntry[]) {
    setValue("airwayDeviceEntries", next as unknown as IntraopFormFields["airwayDeviceEntries"], { shouldDirty: true })
    if (next.length > 0) setValue("airwayNotApplicable", false, { shouldDirty: true })
    for (const [field, value] of Object.entries(airwayRecordFields(next, (getValues("airwayTools") ?? []) as string[]))) {
      if (field === "airwayDeviceEntries") continue
      setValue(field as keyof IntraopFormFields, (value ?? undefined) as never, { shouldDirty: true })
    }
  }
  function removeSmartAirwayEntry(entry: AirwayDeviceEntry, next: AirwayDeviceEntry[]) {
    applyAirwayEntries(next)
    if (entry.sourceEventId && onEventOps) void onEventOps({ add: [], update: [], remove: [entry.sourceEventId] })
  }
  const smartProps = {
    patient: smartPatient, startedAt: chartStartedAt ?? null, now: () => serverNow().toISOString(), timeZone: timelineZone ?? null,
    difficultAirway: preop?.mallampati === "III" || preop?.mallampati === "IV", deviceLabel: airwayName, toolLabel: airwayName,
    availableDevices: airwayDeviceOptions.map(option => option.value), availableTools: airwayToolOptions.map(option => option.value),
  }
  // Intubated, LMA in and DLT placed charted on the timeline open the same panel, with that time already set.
  usePendingChartedEvents({
    log: timelineLog, readOnly, canOpen: airwayScreen === "smart",
    matches: event => event.label != null && !!AIRWAY_EVENT_DEVICE[event.label],
    isLinked: airwayEntriesLinked,
    onOpen: fresh => { if (fresh.label) setSmartRequest({ device: AIRWAY_EVENT_DEVICE[fresh.label]!, at: fresh.ts, source: "timeline", eventId: fresh.id, eventLabel: fresh.label }) },
  })
  const smartNode = airwayScreen === "smart" ? (
    <AirwaySmart {...smartProps} entries={airwayDeviceEntriesOf(getValues() as Record<string, unknown>)} onChange={applyAirwayEntries} onRemove={removeSmartAirwayEntry} onEvent={chartAirwayEvent}
      onAtomicSave={(next, event) => {
        atomicAirwayEventPendingRef.current = true
        applyAirwayEntries(next)
        chartAirwayEvent(event)
      }}
      techniques={techniques}
      describe={entry => airwayDeviceSummary(entry.device, entry.details, { device: airwayName, attribute: code => displayClinicalCode("clinicalAttribute", code, locale) }) ?? airwayName(entry.device)}
      timeOf={smartTimeOf} />
  ) : undefined

  // ── Smart selection for vascular access (10.2.0) ────────────────────────────
  // The Vascular access tab that opens on what is in place. What it offers and how it saves is Core's
  // (vascular-smart); this hands it the case and writes the result into the same list the legacy tab keeps.
  const vascularScreen = useVascularScreen()
  useWatch({ control, name: ["vascularAccesses"] })
  const [vascularRequest, setVascularRequest] = useState<VascularSmartRequest | null>(null)
  const vascularLines = () => ((getValues("vascularAccesses") ?? []) as unknown as VascularLine[])
  function applyVascularLines(next: VascularLine[], event?: { id?: string; label: string; ts: string; intraopPatch?: Record<string, unknown> }) {
    if (event) atomicVascularEventPendingRef.current = true
    setValue("vascularAccesses", next as unknown as IntraopFormFields["vascularAccesses"], { shouldDirty: true })
  }
  const vascularProps = {
    patient: { clinicalMode: preop?.clinicalMode ?? "ADULT", ageYears: preop?.ageYears ?? null },
    startedAt: chartStartedAt ?? null, now: () => serverNow().toISOString(), timeZone: timelineZone ?? null,
    siteLabel: (code: string) => displayClinicalCode("option:VASCULAR_ACCESS", code, locale),
  }
  // IV line in, Art line in, CVC in and PICC charted on the timeline open the same panel, with that time already set.
  usePendingChartedEvents({
    log: timelineLog, readOnly, canOpen: vascularScreen === "smart",
    matches: event => event.label != null && !!VASCULAR_EVENT_TYPE[event.label],
    isLinked: event => {
      const lines = vascularLines()
      return lines.some(line => line.sourceEventId === event.id) || Array.isArray(event.intraopPatch?.vascularAccesses)
        || (!event.sourceEventId && lines.filter(line => line.insertedAt === event.ts).length === 1)
    },
    onOpen: fresh => { if (fresh.label) setVascularRequest({ ...VASCULAR_EVENT_TYPE[fresh.label]!, at: fresh.ts, source: "timeline", eventId: fresh.id, eventLabel: fresh.label }) },
  })
  const vascularNode = vascularScreen === "smart" ? (
    <VascularSmart {...vascularProps} lines={vascularLines()} onChange={applyVascularLines} onEvent={chartVascularEvent}
      onAtomicSave={(next, event) => { applyVascularLines(next, event); chartVascularEvent(event) }} techniques={techniques} timeOf={smartTimeOf} />
  ) : undefined

  const { monitoringNode, applyMonitoring, setMonitoringFields, nibpOffPrompt, setNibpOffPrompt } = useMonitoringSmart({ control, setValue, getValues, monitoringOptions, timelineLog, techniques, vascularLines, chartStartedAt, suggestionContext, onEventOps, readOnly, setVitalFocusRequest })

  // ── Smart selection for equipment (10.2.0) ──────────────────────────────────
  // Calculated suggestions compare with the canonical Airway/monitoring record;
  // preparation markers are persisted separately and never imply clinical use.
  const equipmentSmart = useEquipmentSmart({ control, setValue, getValues, readOnly, smartProps, applyAirwayEntries, chartAirwayEvent, atomicAirwayEventPendingRef })

  // ── Smart selection for technique (10.2.0) ──────────────────────────────────
  // Search, the preop plan, the usual ones and the side of a block. The saved data is the list of technique codes with
  // the side beside it; finding and sides are Core's (technique-smart).
  const { techniqueNode, onTimetableChangeWithTci } = useTechniqueSmart({ control, setValue, timetable, onTimetableChange, techniques, timelineLog, readOnly, techniqueTree, plannedTechniques: preop?.plannedTechniques })

  // ── The event selector (10.2.0) ─────────────────────────────────────────────
  // The new list or the Legacy buttons, and the events likely to come next (only ones not charted yet). What is likely
  // is Core's (event-succession); the timetable's picker reads it from here.
  const eventsScreen = useEventsScreen()
  const fluidsScreen = useFluidsScreen()
  const eventLogScreen = useEventLogScreen()
  const likelyEvents = useLikelyEvents({
    log: timelineLog,
    structured: { airway: airwayDeviceEntriesOf(getValues() as Record<string, unknown>), vascular: (getValues("vascularAccesses") ?? []) as unknown as ReadonlyArray<Record<string, unknown>> },
    techniques,
    child: isPediatric,
    enabled: !readOnly && eventsScreen === "smart",
    onEventOps,
  })
  const eventSelector = { screen: eventsScreen, likely: likelyEvents.likely, dismiss: likelyEvents.dismiss }

  return (
    <EventSelectorContext.Provider value={eventSelector}>
    <form onSubmit={handleSubmit(handleSubmitWithTimetable)} className="flex flex-col gap-0">
      {nibpOffPrompt && <ConfirmDialog title={t("intraop.monitoringSmart.nibpOffTitle")} cancelLabel={t("intraop.monitoringSmart.nibpOffKeep")} confirmLabel={t("intraop.monitoringSmart.nibpOffYes")}
        onCancel={() => setNibpOffPrompt(null)} onConfirm={() => { setMonitoringFields(withoutNibp(nibpOffPrompt)); setNibpOffPrompt(null) }} />}

      {/* Dual-mode layout — tabs or scroll, sharing the same section content */}
      {(() => {
        const tabOverview = (<>

      {/* Timing is the first clinical surface: every time-dependent shortcut
          must have a documented start before it can write an event. */}
      <div ref={timelineSectionRef} data-tour="intraop-timing" data-readiness="times position">
      <TimelineSection
        t={t} control={control} watch={watch} setValue={setValue} getValues={getValues}
        onAutoSave={onAutoSave}
        timeErrors={timeErrors} setTimeErrors={setTimeErrors}
        monDefaultsAppliedRef={monDefaultsApplied}
        setAdvancedMonOpen={setAdvancedMonOpen} setAirwayExpandedDevice={setAirwayExpandedDevice}
        onEndCorrectionOpen={setEndCorrectionOpen}
      />
      </div>

      {preop ? <IntraopPreopSummary preop={preop} ibw={calcIbw} isPediatric={isPediatric} surgeryStart={timelineStartedAt} timezone={timelineZone} /> : null}
      <IntraopEquipment preop={preop} isPediatric={isPediatric} smart={equipmentSmart} />

      {/* Positions (multi-select) */}
      <PositionSection t={t} control={control} watch={watch} positionOptions={positionOptions} />

        </>)
        const tabAnaesthesia = (<>

      {/* Monitoring */}
      <div data-tour="intraop-monitoring" data-readiness="monitoring">
      <MonitoringSection t={t} watch={watch} setValue={setValue} monitoringOptions={monitoringOptions} smart={monitoringNode} onChange={applyMonitoring} />
      </div>{/* /intraop-monitoring */}

      {/* Anaesthesia technique */}
      <div data-tour="intraop-technique" data-readiness="technique airway vascular_access">
      <TechniqueSection t={t} control={control} techniques={techniques} techniqueTree={techniqueTree}
        presentsIntubated={presentsIntubated} setPresentsIntubated={setPresentsIntubated} smart={techniqueNode} />

      <AirwaySection
        control={control} watch={watch} setValue={setValue} register={register}
        airwayToolOptions={airwayToolOptions} airwayDeviceOptions={airwayDeviceOptions}
        presentsIntubated={presentsIntubated} showAirway={showAirway} techniquesLength={techniques.length}
        airwayOverride={airwayOverride} setAirwayOverride={setAirwayOverride}
        airwayNA={airwayNA} setAirwayNA={setAirwayNA}
        onAirwayInterventionSelected={clearAirwayNotApplicable}
        onAirwayDeviceConfirmed={chartLegacyAirwayDevice}
        onAirwayDeviceRemoved={removeLegacyAirwayEvents}
        airwayExpandedDevice={airwayExpandedDevice} setAirwayExpandedDevice={setAirwayExpandedDevice}
        expandAirwayDevice={expandAirwayDevice}
        smart={smartNode}
      />

      {/* Volatile agent & gas settings are now a timetable lane (see IntraopTimetable's
          Gas Settings row, gated by the same showAgentRow prop below) — removed from
          here so settings are tracked over time instead of set once statically. */}

      {/* Vascular access */}
      <VascularAccessSection control={control} watch={watch} smart={vascularNode} />

      {/* Premedication */}
      <PremedicationSection t={t} control={control} watch={watch} premedCategories={premedCategories} premedDoses={premedDoses}
        premedAnnotations={premedAnnotations} premedDoseForRoute={premedDoseForRoute}
        prospectiveGuidanceEnabled={prospectiveGuidanceEnabled} ordered={preop?.premedicationOrders} />
      </div>{/* /intraop-technique */}

        </>)
        const tabChart = (<>

      {/* Intraoperative timetable */}
      <div data-tour="intraop-timetable" data-readiness="vitals medications fluids events">{endCheck.panel}{suggestionGate.banner}{allergyGate.modal}{suggestionGate.modal}
      <SectionCard title={t("intraop.vitalsSection")}>
        <IntraopLabsDialog
          open={labsDialog.open}
          takenAt={labsDialog.takenAt}
          value={(watchedLabResults ?? []) as never}
          onChange={rows => setValue("labResults", rows as never, { shouldDirty: true })}
          onClose={() => setLabsDialog({ open: false, takenAt: null })}
          caseId={caseId ?? null}
          aiOptIn={aiOptIn}
          importPanel={<IntraopEhrLabs caseId={caseId ?? null} value={watchedLabResults ?? []} onChange={ehrLabsWriter(rows => setValue("labResults", rows as never, { shouldDirty: true }), getValues, onSaveNow)} />}
        />
        <CaseSaveStateContext.Provider value={attention.saveState}>
        {!endCorrectionOpen && <IntraopAttentionPanel entries={attention.entries} onAnswer={attention.canAnswer ? attention.answer : undefined} onOpen={attention.canAnswer ? attention.open : undefined} refused={attention.refused} onDismissRefused={attention.saveState.dismissRefused} />}
        {vascularRequest && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onClick={() => setVascularRequest(null)}>
            <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-[#161616] p-2" onClick={event => event.stopPropagation()}>
              <VascularSmartPanel {...vascularProps} request={vascularRequest} lines={vascularLines()}
              onSave={(next, event) => { setVascularRequest(null); applyVascularLines(next, event); if (event) chartVascularEvent(event) }} onClose={() => setVascularRequest(null)} />
            </div>
          </div>
        )}
        {smartRequest && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onClick={() => setSmartRequest(null)}>
            <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-[#161616] p-2" onClick={event => event.stopPropagation()}>
              <AirwaySmartPanel {...smartProps} request={smartRequest} entries={airwayDeviceEntriesOf(getValues() as Record<string, unknown>)}
              onSave={(next, event) => {
                setSmartRequest(null)
                if (event) {
                  atomicAirwayEventPendingRef.current = true
                }
                applyAirwayEntries(next)
                if (event) chartAirwayEvent(event)
              }} onClose={() => setSmartRequest(null)} />
            </div>
          </div>
        )}
        {airwayDialog && (
          <AirwayExchangeDialog
            entries={airwayDeviceEntriesOf(getValues() as Record<string, unknown>)}
            deviceOptions={airwayDeviceOptions.map(option => ({ value: option.value, label: displayOption("AIRWAY_MANAGEMENT", option, locale) }))}
            deviceLabel={code => displayClinicalCode("option:AIRWAY_MANAGEMENT", code, locale)}
            reason={airwayDialog.reason}
            at={airwayDialog.at}
            onSave={saveAirwayExchange}
            onCancel={() => setAirwayDialog(null)}
          />
        )}
        <IntraopTimetable
          focusVitalRequest={vitalFocusRequest}
          techniques={watchedTechniquesForSuggestions as string[] | undefined}
          labResults={(watchedLabResults ?? []) as never}
          onOpenLabDraw={takenAt => setLabsDialog({ open: true, takenAt })}
          onOpenAllLabs={() => setLabsDialog({ open: true, takenAt: null })}
          clinicalMode={preop?.clinicalMode ?? "ADULT"}
          prospectiveGuidanceEnabled={prospectiveGuidanceEnabled}
          pediatricAgeValue={preop?.ageValue ?? preop?.ageYears ?? null}
          pediatricAgeUnit={preop?.ageUnit ?? (preop?.ageYears != null ? "YEARS" : null)}
          patientHeightCm={preop?.heightCm ?? null}
          patientSex={preop?.sex ?? null}
          pediatricDrugProfiles={clinicalRulesSnapshot?.pediatricDrugProfiles ?? []}
          pediatricFluidProfiles={clinicalRulesSnapshot?.pediatricFluidProfiles ?? []}
          pediatricInfusionProfiles={clinicalRulesSnapshot?.pediatricInfusionProfiles ?? []}
          adultDoseProfiles={clinicalRulesSnapshot?.adultDoseProfiles ?? []}
          pediatricRulesSource={clinicalRulesSnapshot?.source ?? null}
          pediatricRulesCachedAt={clinicalRulesSnapshot?.cachedAt ?? null}
          pediatricRulesLoading={clinicalRulesLoading}
          pediatricRulesError={clinicalRulesError}
          clinicalPresetId={clinicalRulesSnapshot?.preset?.id ?? null}
          clinicalPresetVersion={clinicalRulesSnapshot?.preset?.version ?? null}
          clinicalPresetScope={clinicalRulesSnapshot?.preset?.scope ?? null}
          startTime={watchedStartTime || "08:00"}
          startedAt={chartStartedAt ?? undefined}
          endTime={watchedEndTime || undefined}
          endedAt={timelineEndedAt ?? null} attention={attention} suggestionForm={readOnly ? undefined : suggestionForm} beforeEndCase={endCheck.before}
          autoEnded={autoEndedProp && !!timelineEndedAt && timelineEndedAt === defaultValues?.endedAt}
          caseStarted={caseStartedProp || !!watchedStartTime}
          monitoring={monitoring}
          showAgentRow={showGases}
          showJetRow={(_wVM ?? []).includes("Jet")}
          ibw={calcIbw}
          tbw={preop?.weightKg ?? null}
          data={timetable}
          onChange={allergyGate.guard(timetable, suggestionGate.guard(timetable, onTimetableChangeWithTci))}
          onEndCase={() => {
            const end = intraopEndCaseValuesNow(getValues("timezone"), getValues("startTime"))
            setValue("endTime", end.endTime)
            if (end.endedAt && end.timezone) { setValue("endedAt", end.endedAt); setValue("timezone", end.timezone) }
            if (end.endTimeNextDay) setValue("endTimeNextDay", true)
          }}
          onResumeCase={() => { setValue("endTime", ""); setValue("endTimeNextDay", false); setValue("endedAt", null) }}
          onPostopContinued={items => onPostopContinued?.(items)}
          onDeath={onDeath}
        />
        </CaseSaveStateContext.Provider>
      </SectionCard>

      {/* Drugs and Fluid Balance Totals */}
      <DrugsFluidTotalsSection t={t} control={control} watch={watch} liveDrugTotals={liveDrugTotals} liveFluidTotals={liveFluidTotals} provisional={totalsProvisional(timetable, attention.saveState)} screen={fluidsScreen} />
      </div>{/* /intraop-timetable */}

        </>)
        const tabFinish = (<>

      {/* Complications */}
      <ComplicationsSection t={t} control={control} watch={watch} eventLog={eventLog} labResults={(watchedLabResults ?? []) as never} onDeleteEvent={onEventOps ? removeEvent : undefined} eventLogScreen={eventLogScreen} />

        </>)
        if (layoutMode === "sidebar") return (
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-x-6">
            {intraopSidebar}
            <div className="mt-6 min-w-0 space-y-6">
              <div id="intraop-sec-overview" className="scroll-mt-24 space-y-6">{tabOverview}</div>
              <div id="intraop-sec-anaesthesia" className="scroll-mt-24 space-y-6">{tabAnaesthesia}</div>
              <div id="intraop-sec-chart" className="scroll-mt-24 space-y-6">{tabChart}</div>
              <div id="intraop-sec-finish" className="scroll-mt-24 space-y-6">{tabFinish}</div>
            </div>
          </div>
        )
        if (layoutMode === "scroll") return (
          <div className="space-y-6 mt-6">
            {/* The same strip of jump links as the other steps' scrolling pages (10.0.0). */}
            <SectionJumpStrip
              sections={(["overview", "anaesthesia", "chart", "finish"] as const).map(id => ({ id, label: t(`intraop.tabs.${id}`) }))}
              anchorPrefix="intraop-sec-"
              testId="intraop-scroll-strip"
            />
            <div id="intraop-sec-overview" className="scroll-mt-28 space-y-6">{tabOverview}</div>
            <div id="intraop-sec-anaesthesia" className="scroll-mt-28 space-y-6">{tabAnaesthesia}</div>
            <div id="intraop-sec-chart" className="scroll-mt-28 space-y-6">{tabChart}</div>
            <div id="intraop-sec-finish" className="scroll-mt-28 space-y-6">{tabFinish}</div>
          </div>
        )
        return (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-0">
            {/* The same bar as preop and postop (10.0.0). */}
            <StepTabBar
              tabs={(["overview", "anaesthesia", "chart", "finish"] as const).map(value => ({ value, label: t(`intraop.tabs.${value}`) }))}
              active={activeTab as "overview" | "anaesthesia" | "chart" | "finish"}
              onSelect={setActiveTab}
              label={t("case.steps.intraop")}
              testId="intraop-tabs"
            />
            <TabsContent value="overview"    className="space-y-6 p-0 mt-6">{tabOverview}</TabsContent>
            <TabsContent value="anaesthesia" className="space-y-6 p-0 mt-6">{tabAnaesthesia}</TabsContent>
            <TabsContent value="chart"       className="space-y-6 p-0 mt-6">{tabChart}</TabsContent>
            <TabsContent value="finish"      className="space-y-6 p-0 mt-6">{tabFinish}</TabsContent>
          </Tabs>
        )
      })()}

      <IntraopFooter t={t} onBack={onBack} onSave={handleManualSave} onContinue={handleContinue} showSave={!!watchedEndTime && formState.isDirty} saved={manualSaved} />
      <IncompleteDialog items={incompleteItems} canContinue={canContinueIncomplete} t={t} onClose={() => setIncompleteItems(null)} onContinue={() => { setIncompleteItems(null); doSubmit() }} />
    </form>
    </EventSelectorContext.Provider>
  )
}
