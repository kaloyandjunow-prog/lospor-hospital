"use client"

import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { useLocale, useTranslations } from "next-intl"
import { createPortal } from "react-dom"
import { Plus, X, ChevronDown, ChevronRight } from "lucide-react"
import { useOptionLibrary } from "@/hooks/useOptionLibrary"
import { displayClinicalCode, displayNamedOption } from "@/lib/clinical-display"
import { useIntraopDisplay } from "@/components/intraop/useIntraopDisplay"
import { FluidConflictPopover } from "@/components/intraop/FluidConflictPopover"
import { GasSettingsPopover } from "@/components/intraop/GasSettingsPopover"
import { AgentPopover } from "@/components/intraop/AgentPopover"
import { EventPickerPopover } from "@/components/intraop/EventPickerPopover"
import { VitalsPopover } from "@/components/intraop/VitalsPopover"
import { ConfirmDialog } from "@/components/intraop/ConfirmDialog"
import { AnchoredPopover } from "@/components/intraop/AnchoredPopover"
import { FluidPickerPopover } from "@/components/intraop/FluidPickerPopover"
import { DoseEditPopover } from "@/components/intraop/DoseEditPopover"
import { baseInfusionName } from "@/components/intraop/infusion-naming"
import { InfusionMenuPopover } from "@/components/intraop/InfusionMenuPopover"
import { columnForWallClock } from "@lospor/core/timetable"
import { AgentLane, GasSettingsLane } from "@/components/intraop/TimetableGasLanes"
import { ClinicalEventsLane, DrugLane } from "@/components/intraop/TimetablePointLanes"
import { FluidLane } from "@/components/intraop/TimetableFluidLane"
import { InfusionLane, type InfusionBarMove } from "@/components/intraop/TimetableInfusionLane"
import { TimetableVitalsRows } from "@/components/intraop/TimetableVitalsRows"
import { TimetableTimeHeader } from "@/components/intraop/TimetableTimeHeader"
import { useTimetableDrag } from "@/components/intraop/use-timetable-drag"
import { DosingFlyout } from "@/components/intraop/DosingFlyout"
import { createDoseSurfaces } from "@/components/intraop/dose-surfaces"
import {
  DEFAULT_INF,
  buildDrugFlyoutState,
  buildFluidFlyoutState,
} from "@/components/intraop/flyout-state"
import { RateChangeDialog } from "@/components/intraop/RateChangeDialog"
import {
  computeRowGeometry,
} from "@/components/intraop/timetable-row-geometry"
import {
  selId,
  selIdx,
  type FConflictAnchor,
  type FluidConflict,
  type PendingFluidEntry,
  type TtFP,
  type TtSel,
} from "@/components/intraop/timetable-types"
import { addMinutes, floorTo5, timeToMins, toHHMM, calcDuration } from "@/lib/timetable-time"
import { FLUID_CAT_COLOR, computeFluidRows, fluidCategory, fluidColor } from "@/lib/timetable-fluid-rows"
import {
  applyAutoFillVitalPlan,
  useWebAutoFillPreferences,
  vitalsToAutoFillLog,
} from "@/lib/intraop-autofill-vitals"
import { gridOriginMs, secondsFromGridOrigin } from "@/lib/intraop-clock"
import { POSITIONS } from "@lospor/core/catalog"
import type {
  VitalsEntry, AgentSegment, GasSettingsSegment, TimetableData, TimetableFluid,
  LogEvent as IntraopLogEvent,
} from "@/types/timetable"
import { EndCaseModal } from "@/components/intraop/EndCaseModal"
import type { WeightBasisMap } from "@/lib/infusion-calc"
import { DoseSelector } from "@/components/intraop/DoseSelector"
import { ScenarioPicker } from "@/components/intraop/ScenarioPicker"
import { HotkeysModal } from "@/components/intraop/HotkeysModal"
import { useIntraopFavourites } from "@/hooks/useIntraopFavourites"
import { BOLUS_SCENARIOS, INFUSION_SCENARIOS } from "@lospor/core"
import {
  INTRAOP_COLUMN_MINUTES,
  INTRAOP_RESUME_WINDOW_MS,
  INTRAOP_RESUME_WINDOW_SECONDS,
} from "@lospor/core/intraop-engine"
import { useDrugHandlers } from "@/hooks/useDrugHandlers"
import { useVitalsHandlers } from "@/hooks/useVitalsHandlers"
import { useClinicalEventHandlers } from "@/hooks/useClinicalEventHandlers"
import { useInfusionHandlers } from "@/hooks/useInfusionHandlers"
import { useFluidHandlers } from "@/hooks/useFluidHandlers"
import { useAgentHandlers } from "@/hooks/useAgentHandlers"
import { useGasSettingsHandlers } from "@/hooks/useGasSettingsHandlers"
import { DivChart, VITAL_ROW_DEFS } from "@/components/intraop/TimetableVitalsChart"
import {
  activeTimetableColumnForTimestamp,
  latestVitalColumn,
  planAutoFillVitalEvents,
} from "@lospor/core/intraop-vitals"
import {
  baseProfilesMap,
  concentrationsMap,
  defaultConcentrationMap,
  doseCalcMap,
  groupClinicalEvents,
  optionStyleMap,
  quickNumberMap,
  routeProfilesMap,
  routesMap,
  strictRangeMap,
  weightBasisMap,
} from "@lospor/core/option-library"
import { metadataNumber, metadataString } from "@lospor/core/option-contracts"
import {
} from "@/lib/drug-selector-surface"
import {
  applyAdultDoseProfilesToOptions,
  applyPediatricDrugProfilesToOptions,
  applyPediatricInfusionProfilesToOptions,
  visibleClinicalOptions,
  type AdultDoseProfileRule,
  type PediatricDrugProfileRule,
  type PediatricFluidProfileRule,
  type PediatricInfusionProfileRule,
} from "@lospor/core/clinical-rules"
import type { PediatricAgeUnit } from "@lospor/core/pediatric"
import { drugAdministrationAudit } from "@/lib/drug-administration-audit"
import {
  currentFluidRate,
  fluidDeliveredVolumeMl,
} from "@/lib/fluid-entry-ui"

// ── Constants ─────────────────────────────────────────────────────────────────
const COL_W     = 74
const LABEL_W   = 96
const INTERVAL  = INTRAOP_COLUMN_MINUTES
const ROW_COLS  = 60 / INTRAOP_COLUMN_MINUTES

// The selectable libraries (agents, drugs, fluids, clinical events, infusion
// configs/weight-basis, LA concentrations, bolus dose hints) used to be
// hardcoded module-level literals. They're now derived via useMemo from the
// OptionLibrary API inside the IntraopTimetable component itself — plain
// local consts, not mutated module state, so two instances of this component
// can never stomp on each other's data. calcSuggestedDose/bolusRange/
// fluidColor/fluidCategory/computeFluidRows live inside the component for
// the same reason (they read this derived data via closure). calcInfusionTotal
// and WeightBasisMap live in src/lib/infusion-calc.ts since IntraopForm.tsx
// and EndCaseModal.tsx (a separate component file) both need them too, and
// a cross-file caller can't reach this component's closures.

// ── Types ─────────────────────────────────────────────────────────────────────
// Canonical definitions live in src/types/timetable.ts (shared with the
// server-side projection in src/lib/case-events.ts) — re-exported here so
// every existing "@/components/IntraopTimetable" import site keeps working.
export type {
  VitalsEntry, TimetableDrug, TimetableFluid, AgentSegment,
  TimetableInfusion, ClinicalEvent, GasSettingsSegment, TimetableData,
} from "@/types/timetable"
export type { LogEvent as IntraopLogEvent } from "@/types/timetable"

// One declaration, not two. These were separate interfaces of the same name —
// legal, since TypeScript merges them, but the split was organic growth rather
// than meaning, and it read as an accidental duplicate.
interface Props {
  startTime: string
  startedAt?: string
  endTime?: string
  caseStarted?: boolean
  monitoring?: Record<string, boolean>
  ibw?: number | null
  tbw?: number | null
  showAgentRow?: boolean
  data: TimetableData
  onChange: (d: TimetableData) => void
  onEndCase?: () => void
  onResumeCase?: () => void
  onPostopContinued?: (items: string[]) => void
  onInfusionTotals?: (totals: { name: string; total: number; unit: string }[]) => void
  onComplicationAdded?: (labels: string[]) => void
  onLogEvent?: (event: IntraopLogEvent) => void
  onLogEventDelete?: (match: { infId?: string; fluidId?: string }) => void

  clinicalMode?: "ADULT" | "PEDIATRIC"
  pediatricAgeValue?: number | null
  pediatricAgeUnit?: PediatricAgeUnit | null
  patientHeightCm?: number | null
  patientSex?: string | null
  pediatricDrugProfiles?: readonly PediatricDrugProfileRule[]
  pediatricFluidProfiles?: readonly PediatricFluidProfileRule[]
  pediatricInfusionProfiles?: readonly PediatricInfusionProfileRule[]
  adultDoseProfiles?: readonly AdultDoseProfileRule[]
  pediatricRulesSource?: "server" | "cache" | null
  pediatricRulesCachedAt?: string | null
  pediatricRulesLoading?: boolean
  pediatricRulesError?: string | null
  clinicalPresetId?: string | null
  clinicalPresetVersion?: number | null
  clinicalPresetScope?: "PLATFORM" | "INSTITUTION" | "USER" | null
}

// ── Helpers ──────────────────────────────────────────────────────────
// Pure HH:MM time math lives in src/lib/timetable-time.ts (imported above).
// The chart’s own shapes live in ./intraop/timetable-types, so anything lifted
// out of this file can be given a real type instead of widening to unknown.

/**
 * openFP takes an element so it can measure it, but a picker only kept the rect
 * of the cell that opened it. This presents that rect as something measurable.
 */
function rectAnchor(rect: FConflictAnchor & { height?: number }): HTMLElement {
  return {
    getBoundingClientRect: () => ({
      top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
      width: rect.width, height: rect.height ?? rect.bottom - rect.top,
      x: rect.left, y: rect.top, toJSON: () => ({}),
    }),
  } as unknown as HTMLElement
}

// ── Component ─────────────────────────────────────────────────────────────────
export function IntraopTimetable({
  clinicalMode = "ADULT",
  pediatricAgeValue = null,
  pediatricAgeUnit = null,
  patientHeightCm = null,
  patientSex = null,
  pediatricDrugProfiles = [],
  pediatricFluidProfiles = [],
  pediatricInfusionProfiles = [],
  adultDoseProfiles = [],
  pediatricRulesSource = null,
  pediatricRulesCachedAt = null,
  pediatricRulesLoading = false,
  pediatricRulesError = null,
  clinicalPresetId = null,
  clinicalPresetVersion = null,
  clinicalPresetScope = null,
  startTime,
  startedAt,
  endTime,
  caseStarted = false,
  monitoring,
  ibw,
  tbw,
  showAgentRow = false,
  data,
  onChange,
  onEndCase,
  onResumeCase,
  onPostopContinued,
  onInfusionTotals,
  onComplicationAdded,
  onLogEvent,
  onLogEventDelete,
}: Props) {
  const t = useTranslations()
  const locale = useLocale()
  const isBg = locale.startsWith("bg")
  const isPediatric = clinicalMode === "PEDIATRIC"
  const pediatricAge = useMemo(
    () => isPediatric && pediatricAgeValue != null && pediatricAgeUnit
      ? { value: pediatricAgeValue, unit: pediatricAgeUnit }
      : null,
    [isPediatric, pediatricAgeUnit, pediatricAgeValue],
  )
  const trustedStartMs = useMemo(() => {
    if (!startedAt) return null
    const ms = Date.parse(startedAt)
    return Number.isFinite(ms) ? ms : null
  }, [startedAt])
  /** Column 0's own start — see gridOriginMs for why this is not the raw start. */
  const gridStartMs = useMemo(() => gridOriginMs(trustedStartMs), [trustedStartMs])
  const tsForCol = useCallback((col: number): string | null => {
    if (trustedStartMs === null) return null
    return new Date(trustedStartMs + col * INTERVAL * 60_000).toISOString()
  }, [trustedStartMs])
  // Derived (not mutated) from the shared library — see the comment above
  // this component for why these are plain local consts instead of the
  // module-level mutated containers this used to be.
  const { options: baseDrugLibOpts } = useOptionLibrary("INTRAOP_DRUG")
  const { options: baseFluidLibOpts } = useOptionLibrary("INTRAOP_FLUID")
  const { options: eventLibOpts } = useOptionLibrary("INTRAOP_EVENT")
  const { options: baseInfusionLibOpts } = useOptionLibrary("INTRAOP_INFUSION")
  const { options: agentLibOpts } = useOptionLibrary("INHALATIONAL_AGENT")
  // Web and mobile share one overlay so the dosing surface stays identical in
  // both apps: adult profiles first, then the pediatric band for this patient.
  const drugLibOpts = useMemo(
    () => applyPediatricDrugProfilesToOptions(
      applyAdultDoseProfilesToOptions(
        baseDrugLibOpts,
        adultDoseProfiles,
        "ADULT_DRUG_PROFILE",
      ),
      isPediatric ? pediatricDrugProfiles : [],
      isPediatric ? pediatricAge : null,
      tbw,
    ),
    [adultDoseProfiles, baseDrugLibOpts, isPediatric, pediatricAge, pediatricDrugProfiles, tbw],
  )
  const infusionLibOpts = useMemo(
    () => applyPediatricInfusionProfilesToOptions(
      applyAdultDoseProfilesToOptions(
        baseInfusionLibOpts,
        adultDoseProfiles,
        "ADULT_INFUSION_PROFILE",
      ),
      isPediatric ? pediatricInfusionProfiles : [],
      isPediatric ? pediatricAge : null,
      tbw,
    ),
    [adultDoseProfiles, baseInfusionLibOpts, isPediatric, pediatricAge, pediatricInfusionProfiles, tbw],
  )
  const fluidLibOpts = useMemo(
    () => applyAdultDoseProfilesToOptions(
      baseFluidLibOpts,
      adultDoseProfiles,
      "ADULT_FLUID_PROFILE",
    ),
    [adultDoseProfiles, baseFluidLibOpts],
  )

  // Naming lives in useIntraopDisplay so anything split out of this component
  // can be handed the same words rather than rebuilding them.
  const {
    displayDrugName,
    displayFluidName,
    displayInfusionName,
    displayAgentName,
    displayEventName,
    displayGroupName,
    displayFluidLaneLabel,
    displayScenarioName,
  } = useIntraopDisplay({
    locale,
    drugOptions: drugLibOpts,
    fluidOptions: fluidLibOpts,
    infusionOptions: infusionLibOpts,
    agentOptions: agentLibOpts,
  })

  // INFUSION_CONFIGS must keep every infusion so recorded ones still resolve;
  // this set is what the picker offers.
  const visibleInfusionNames = useMemo(
    () => new Set(visibleClinicalOptions(infusionLibOpts).map(option => option.label)),
    [infusionLibOpts],
  )

  const { QUICK_DRUGS, BOLUS_DOSES, BOLUS_CONFIGS, LA_CONCENTRATIONS, DRUG_ROUTES, QUICK_DOSES, BOLUS_ROUTE_PROFILES } = useMemo(() => {
    const byGroup = new Map<string, { cat: string; color: string; drugs: { name: string; unit: string }[] }>()
    // Only the picker hides ruleset-hidden drugs; the maps below stay complete so
    // a drug already recorded on the case keeps its units, codes and colour.
    for (const o of visibleClinicalOptions(drugLibOpts)) {
      const cat = o.group ?? "Other"
      if (!byGroup.has(cat)) byGroup.set(cat, { cat, color: o.color ?? "", drugs: [] })
      byGroup.get(cat)!.drugs.push({
        name: o.label,
        unit: metadataString(o.metadata, "unit") ?? "mg",
      })
    }
    return {
      QUICK_DRUGS: [...byGroup.values()],
      BOLUS_DOSES: doseCalcMap(drugLibOpts),
      BOLUS_CONFIGS: strictRangeMap(drugLibOpts),
      LA_CONCENTRATIONS: concentrationsMap(drugLibOpts),
      DRUG_ROUTES: routesMap(drugLibOpts),
      QUICK_DOSES: quickNumberMap(drugLibOpts),
      BOLUS_ROUTE_PROFILES: routeProfilesMap(drugLibOpts),
    }
  }, [drugLibOpts])

  const {
    QUICK_FLUIDS,
    FLUID_QUICK_VOLUMES,
    FLUID_ROUTES,
    FLUID_CONCENTRATIONS,
    FLUID_DEFAULT_CONCENTRATIONS,
    FLUID_CONFIGS,
  } = useMemo(() => {
    const byGroup = new Map<string, { cat: string; color: string; fluids: { name: string }[] }>()
    const profiles = baseProfilesMap(fluidLibOpts)
    // As with drugs above: only the picker hides ruleset-hidden fluids, while
    // the maps below stay complete so a fluid already recorded on the case
    // keeps its volumes, routes and concentrations.
    for (const o of visibleClinicalOptions(fluidLibOpts)) {
      const cat = o.group ?? "Other"
      if (!byGroup.has(cat)) byGroup.set(cat, { cat, color: o.color ?? "", fluids: [] })
      byGroup.get(cat)!.fluids.push({ name: o.label })
    }
    return {
      QUICK_FLUIDS: [...byGroup.values()],
      FLUID_QUICK_VOLUMES: quickNumberMap(fluidLibOpts),
      FLUID_ROUTES: routesMap(fluidLibOpts),
      FLUID_CONCENTRATIONS: concentrationsMap(fluidLibOpts),
      FLUID_DEFAULT_CONCENTRATIONS: defaultConcentrationMap(fluidLibOpts),
      FLUID_CONFIGS: Object.fromEntries(fluidLibOpts.map(option => {
        const profile = profiles[option.label]
        return [option.label, {
          min: profile?.min ?? 0,
          max: profile?.max ?? 2000,
          step: profile?.step ?? 50,
          unit: profile?.unit ?? "mL",
          suggestedVolume: metadataNumber(option.metadata, "suggestedVolume"),
        }]
      })),
    }
  }, [fluidLibOpts])

  const getFluidColor = useCallback((name: string) => fluidColor(name, QUICK_FLUIDS), [QUICK_FLUIDS])
  const getFluidCategory = useCallback((name: string) => fluidCategory(name, QUICK_FLUIDS), [QUICK_FLUIDS])
  const fluidRows = useMemo(() => computeFluidRows(data.fluids ?? [], QUICK_FLUIDS), [data.fluids, QUICK_FLUIDS])

  const CLINICAL_EVENT_CATS = useMemo(() => {
    return groupClinicalEvents(eventLibOpts)
  }, [eventLibOpts])

  const { INFUSION_CONFIGS, INFUSION_WEIGHT_BASIS, INFUSION_ROUTES, QUICK_RATES, INFUSION_ROUTE_PROFILES } = useMemo(() => {
    const configs: Record<string, { units: string[]; min: number; max: number; step: number; color: string; suggestedRate?: number }> = {}
    const profiles = baseProfilesMap(infusionLibOpts)
    for (const o of infusionLibOpts) {
      const profile = profiles[o.label]
      configs[o.label] = {
        units: [profile?.unit ?? "mg/hr"],
        min: profile?.min ?? 0,
        max: profile?.max ?? 100,
        step: profile?.step ?? 1,
        color: o.color ?? "#64748b",
        suggestedRate: profile?.suggestedRate,
      }
    }
    const infusionWeightBasis: WeightBasisMap = Object.fromEntries(
      Object.entries(weightBasisMap(infusionLibOpts)).map(([name, basis]) => [
        name,
        basis === "IBW" || basis === "TBW" ? basis : "none",
      ]),
    )
    return {
      INFUSION_CONFIGS: configs,
      INFUSION_WEIGHT_BASIS: infusionWeightBasis,
      INFUSION_ROUTES: routesMap(infusionLibOpts),
      QUICK_RATES: quickNumberMap(infusionLibOpts),
      INFUSION_ROUTE_PROFILES: routeProfilesMap(infusionLibOpts),
    }
  }, [infusionLibOpts])

  const { INH_AGENTS, AGENT_STYLE, AGENT_QUICK_PERCENTS } = useMemo(() => {
    return {
      INH_AGENTS: agentLibOpts.map(option => option.label),
      AGENT_STYLE: optionStyleMap(agentLibOpts),
      AGENT_QUICK_PERCENTS: quickNumberMap(agentLibOpts),
    }
  }, [agentLibOpts])

  // Every dose the chart suggests is resolved here — paediatric profile, then
  // adult profile, then the option library, then nothing. See dose-surfaces.
  const doseSurfaces = createDoseSurfaces({
    isPediatric,
    pediatricAge,
    ibw,
    tbw,
    patientHeightCm,
    patientSex,
    pediatricDrugProfiles,
    pediatricFluidProfiles,
    pediatricInfusionProfiles,
    adultDoseProfiles,
    drugOptions: drugLibOpts,
    bolusDoses: BOLUS_DOSES,
    bolusConfigs: BOLUS_CONFIGS,
    bolusRouteProfiles: BOLUS_ROUTE_PROFILES,
    infusionRouteProfiles: INFUSION_ROUTE_PROFILES,
    fluidConfigs: FLUID_CONFIGS,
    fluidQuickVolumes: FLUID_QUICK_VOLUMES,
    fluidRoutes: FLUID_ROUTES,
    fluidConcentrations: FLUID_CONCENTRATIONS,
    fluidDefaultConcentrations: FLUID_DEFAULT_CONCENTRATIONS,
    manualDoseOnlyHint: t("pediatric.manualDoseOnly"),
  })

  const [colCount, setColCount]           = useState(ROW_COLS)  // start with 1 row
  const [chartOpen, setChartOpen]         = useState(() => typeof window !== "undefined" && localStorage.getItem("vitalsExpanded") !== "false")
  // Every in-progress drag lives in one reducer; see intraop/use-timetable-drag.
  const [drag, dragActions] = useTimetableDrag()
  // Extending an infusion segment
  // Whole-bar drag
  // Rate-pill drag
  // Misc infusion UI state
  const [deleteInfPrompt, setDeleteInfPrompt] = useState<string | null>(null)
  const [hoverDiscontinue, setHoverDiscontinue] = useState<string | null>(null)
  // Right-grip (extend endCol) and left-grip (extend startCol backward)
  // Item-level selection (pill or infusion bar)
  const [sel, setSel] = useState<TtSel | null>(null)
  // Floating prompt portal
  const [fp, setFp] = useState<TtFP | null>(null)
  // Quick-pick column (header click) + live "now" tracking
  const [selectedCol, setSelectedCol] = useState<number>(0)
  const [nowOffsetPx, setNowOffsetPx] = useState<number | null>(null)
  const activeRowRef                  = useRef<HTMLDivElement>(null)
  // Dynamic column width — fills available container width in stacked mode
  const [colW, setColW] = useState(COL_W)
  const rowsContainerRef = useRef<HTMLDivElement>(null)
  const prevColRef                    = useRef<number | null>(null)
  const endedAtRef                    = useRef<Date | null>(null)
  const [resumeSecsLeft, setResumeSecsLeft] = useState(0)
  const [resumeUntilLabel, setResumeUntilLabel] = useState("")
  // In-cell drug picker
  const [drugPicker, setDrugPicker]   = useState<{ ci: number; rect: DOMRect } | null>(null)
  // Shortlist the clinician chose in settings — the same server-side list the
  // phone reads, so both devices open on the same favourites.
  const { favouriteDrugs, favouriteInfusions } = useIntraopFavourites()
  const autoFillPreferences = useWebAutoFillPreferences()
  // In-cell fluid picker
  const [fluidPicker, setFluidPicker] = useState<{ ci: number; rect: DOMRect } | null>(null)
  const [fpSearch,    setFpSearch]    = useState("")
  // In-cell infusion picker — separate row/entry point from the drug picker,
  // so starting an infusion no longer requires picking a drug then choosing
  // "Infusion" (matches mobile's separate Drug/Infusion/Fluid/Agent rows).
  const [infPicker, setInfPicker]     = useState<{ ci: number; rect: DOMRect } | null>(null)
  // Infusion context menu + rate-change dialog
  const [infMenu, setInfMenu] = useState<{ segId: string; name: string; color: string; rect: DOMRect; stopped?: boolean; fromPillCol?: number } | null>(null)
  const [rateDialog, setRateDialog] = useState<{
    segId: string; name: string; rate: number; unit: string
    units: string[]; rateMin: number; rateMax: number; rateStep: number
    color: string; rect: DOMRect; step: "rate" | "time"
    timeH: string; timeM: string
    editFromCol?: number
    concentration?: string  // local anaesthetic infusions only — editable mid-run
    baseDrugName?: string   // drug name without the concentration suffix, for LA_CONCENTRATIONS lookup
  } | null>(null)
  // Timetable layout mode
  const [layout, setLayout] = useState<"expand" | "scroll">(() =>
    typeof window !== "undefined"
      ? ((localStorage.getItem("timetableLayout") as "expand" | "scroll") ?? "expand")
      : "expand"
  )
  // End Case Modal
  const [showEndModal, setShowEndModal] = useState(false)
  // Keyboard shortcuts popup
  const [showHotkeys, setShowHotkeys] = useState(false)
  // Inline discontinue: infusion/agent two-step confirm; fluid volume prompt
  const [discConfirmId, setDiscConfirmId] = useState<string | null>(null)
  const [discFluidState, setDiscFluidState] = useState<{
    id: string
    volInput: string
    rect: DOMRect
    fullBag: boolean | null
  } | null>(null)
  const [fluidRateDialog, setFluidRateDialog] = useState<{
    id: string
    rate: string
    rect: DOMRect
  } | null>(null)
  // Dose / rate editor
  const [doseEditDrug, setDoseEditDrug] = useState<{ idx: number; dose: string; unit: string; rect: DOMRect } | null>(null)
  // Free-text drug entry was removed in 5.3.0: the option library is the
  // vocabulary, and an off-library name cannot be ATC-coded, dose-checked or
  // exported. Mobile never offered it.
  // Clinical events picker
  const [eventPicker, setEventPicker]         = useState<{ ci: number; rect: DOMRect } | null>(null)
  const [evSearch, setEvSearch]               = useState("")

  // Vitals input refs (keyed "${col}-${rowKey}") for Tab column navigation
  const vitalsInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  // Vitals slider popup
  const [vitalsPopup, setVitalsPopup] = useState<{
    col: number; key: keyof VitalsEntry
    min: number; max: number; step: number; defaultVal: number
    label: string; unit: string; color: string
    rect: DOMRect
  } | null>(null)

  // Stable refs
  const dataRef        = useRef(data)
  const rawOnChangeRef = useRef(onChange)   // raw parent callback — used only by clock auto-extend
  const layoutRef      = useRef(layout)
  const colCountRef    = useRef(colCount)
  useEffect(() => { dataRef.current = data },              [data])
  useEffect(() => { rawOnChangeRef.current = onChange },   [onChange])
  useEffect(() => { layoutRef.current = layout },          [layout])
  useEffect(() => { colCountRef.current = colCount },      [colCount])
  // Persist layout/vitals settings and listen for changes from the Settings panel
  useEffect(() => {
    localStorage.setItem("timetableLayout", layout)
    window.dispatchEvent(new StorageEvent("storage", { key: "timetableLayout", newValue: layout }))
  }, [layout])
  useEffect(() => {
    localStorage.setItem("vitalsExpanded", chartOpen ? "true" : "false")
  }, [chartOpen])
  useEffect(() => {
    const h = (e: StorageEvent) => {
      if (e.key === "timetableLayout" && (e.newValue === "expand" || e.newValue === "scroll"))
        setLayout(e.newValue)
      if (e.key === "vitalsExpanded")
        setChartOpen(e.newValue !== "false")
    }
    window.addEventListener("storage", h)
    return () => window.removeEventListener("storage", h)
  }, [])

  // Resume countdown — tick every second while active
  const resumeActive = resumeSecsLeft > 0
  useEffect(() => {
    if (!resumeActive) return
    const id = setInterval(() => {
      if (!endedAtRef.current) return
      const elapsed = Math.floor((Date.now() - endedAtRef.current.getTime()) / 1000)
      const left    = Math.max(0, INTRAOP_RESUME_WINDOW_SECONDS - elapsed)
      setResumeSecsLeft(left)
    }, 1000)
    return () => clearInterval(id)
  }, [resumeActive])
  // Reset inline-discontinue state when selection changes
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDiscConfirmId(null); setDiscFluidState(null) }, [sel])

  // Resize-aware column width: fill available width in stacked mode
  useEffect(() => {
    const el = rowsContainerRef.current
    if (!el) return
    const update = () => {
      if (layoutRef.current !== "expand") { setColW(COL_W); return }
      const w = el.getBoundingClientRect().width
      if (w > LABEL_W) setColW(Math.max(COL_W, Math.floor((w - LABEL_W) / ROW_COLS)))
    }
    const ro = new ResizeObserver(update)
    ro.observe(el); update()
    return () => ro.disconnect()
  }, [])
  // Recompute width immediately on layout-mode toggle, not just on resize.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (layout !== "expand") setColW(COL_W)
    else { const el = rowsContainerRef.current; if (el) { const w = el.getBoundingClientRect().width; if (w > LABEL_W) setColW(Math.max(COL_W, Math.floor((w - LABEL_W) / ROW_COLS))) } }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [layout])

  // Undo / redo history (refs → no extra renders)
  const histPastRef   = useRef<TimetableData[]>([])
  const histFutureRef = useRef<TimetableData[]>([])

  // All user-action changes go through here — pushes to history before calling parent
  const onChangeRef = useRef((newData: TimetableData) => {
    histPastRef.current = [...histPastRef.current.slice(-99), dataRef.current]
    histFutureRef.current = []
    rawOnChangeRef.current(newData)
  })

  // Per-action event emission alongside the existing onChange/data mutation —
  // matches mobile's POST-one-event-per-action pattern against
  // /api/cases/[id]/events, so web cases get real CaseEvent rows too instead
  // of only the legacy keyEvents JSON blob. Scoped to create/start/stop/rate
  // actions; raw bar-drag resize gestures are left on the existing local-only
  // path since they aren't a distinct clinical event.
  const onLogEventRef = useRef(onLogEvent)
  useEffect(() => { onLogEventRef.current = onLogEvent }, [onLogEvent])
  const onLogEventDeleteRef = useRef(onLogEventDelete)
  useEffect(() => { onLogEventDeleteRef.current = onLogEventDelete }, [onLogEventDelete])
  const uid = useCallback((): string => {
    return typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, "0")).join("")
  }, [])
  const emitLogEvent = useCallback((partial: Omit<IntraopLogEvent, "id" | "ts"> & { ts?: string }) => {
    // Callers may pin the event to a specific column time (vitals) — the
    // default "now" only applies when no ts is provided.
    onLogEventRef.current?.({ id: uid(), ts: new Date().toISOString(), ...partial })
  }, [uid])

  const flyoutPreset = { id: clinicalPresetId, version: clinicalPresetVersion, scope: clinicalPresetScope }

  function openFP(col: number, name: string, unit: string, anchorEl: Element, mode: "bolus" | "infusion") {
    const r = anchorEl.getBoundingClientRect()
    const next = buildDrugFlyoutState({
      col,
      name,
      unit,
      mode,
      anchor: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width },
      surfaces: doseSurfaces,
      isPediatric,
      ibw,
      tbw,
      infusionConfigs: INFUSION_CONFIGS,
      infusionRoutes: INFUSION_ROUTES,
      drugRoutes: DRUG_ROUTES,
      quickDoses: QUICK_DOSES,
      quickRates: QUICK_RATES,
      preset: flyoutPreset,
    })
    // Null means a rule hides this drug for this patient: the tap does nothing.
    if (next) setFp(next)
  }

  function openFluidFP(col: number, name: string, category: string, rect: DOMRect) {
    setFp(buildFluidFlyoutState({
      col,
      name,
      category,
      anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width },
      surfaces: doseSurfaces,
      clinicalMode,
      ibw,
      tbw,
      fluidColor: getFluidColor,
      preset: flyoutPreset,
    }))
  }

  function fpCommitBolus() {
    if (!fp) return
    // Ruleset rounding is applied by the shared resolver to the autofill.
    // Preserve a clinician's subsequent manual entry exactly as entered.
    const dose = fp.dose
    // Coded identity (drugId/atcCode/inn) comes from the matching catalog
    // row when the library has it — currently empty, so these are
    // undefined today, but the field flows all the way through to the
    // chart/cache/export once the drug library is populated.
    const lib = drugLibOpts.find(o => o.label === fp.name)
    const administrationAudit = drugAdministrationAudit(fp)
    onChange({
      ...data,
      drugs: [...data.drugs, {
        colIdx: fp.col,
        name: fp.name,
        dose,
        unit: fp.unit,
        drugId: lib?.drugId ?? undefined,
        atcCode: lib?.atcCode ?? undefined,
        inn: lib?.inn ?? undefined,
        route: fp.route,
        ...administrationAudit,
      }],
    })
    emitLogEvent({
      type: "drug",
      name: fp.name,
      dose,
      unit: fp.unit,
      drugRoute: fp.route,
      drugId: lib?.drugId ?? undefined,
      atcCode: lib?.atcCode ?? undefined,
      inn: lib?.inn ?? undefined,
      ...administrationAudit,
    })
    setFp(null)
  }
  function fluidActionTimestamp(col: number): string {
    const currentTimestamp = new Date().toISOString()
    return nowCol != null && col === nowCol
      ? currentTimestamp
      : tsForCol(col) ?? currentTimestamp
  }

  function createFluidEntry(pending: PendingFluidEntry, col: number): TimetableFluid {
    return {
      id: `${pending.name}-${col}-${uid()}`,
      name: pending.name,
      category: pending.category,
      color: pending.color,
      startCol: col,
      endCol: col,
      startTs: fluidActionTimestamp(col),
      fluidEntryMode: pending.fluidEntryMode,
      volume: pending.volume,
      ...(pending.bagVolumeMl != null ? { bagVolumeMl: pending.bagVolumeMl } : {}),
      ...(pending.rate != null ? { rate: pending.rate, unit: pending.unit ?? "mL/h" } : {}),
      ...(pending.concentration ? { concentration: pending.concentration } : {}),
      clinicalRuleKey: pending.clinicalRuleKey,
      clinicalRuleVersion: pending.clinicalRuleVersion,
      clinicalRuleSourceIds: pending.clinicalRuleSourceIds,
      clinicalPresetId: pending.clinicalPresetId,
      clinicalPresetVersion: pending.clinicalPresetVersion,
      clinicalPresetScope: pending.clinicalPresetScope,
    }
  }

  function emitFluidStart(fluid: TimetableFluid) {
    emitLogEvent({
      type: "fluid_start",
      ts: fluid.startTs,
      fluidId: fluid.id,
      name: fluid.name,
      category: fluid.category,
      color: fluid.color,
      volume: fluid.volume,
      fluidEntryMode: fluid.fluidEntryMode,
      bagVolumeMl: fluid.bagVolumeMl,
      rate: fluid.rate == null ? undefined : String(fluid.rate),
      unit: fluid.unit,
      concentration: fluid.concentration,
      clinicalRuleKey: fluid.clinicalRuleKey,
      clinicalRuleVersion: fluid.clinicalRuleVersion,
      clinicalRuleSourceIds: fluid.clinicalRuleSourceIds,
      clinicalPresetId: fluid.clinicalPresetId,
      clinicalPresetVersion: fluid.clinicalPresetVersion,
      clinicalPresetScope: fluid.clinicalPresetScope,
    })
  }

  function addFluidDirect(
    pending: PendingFluidEntry,
    col: number,
    updateExisting: (fluids: TimetableFluid[]) => TimetableFluid[] = fluids => fluids,
  ) {
    const fluid = createFluidEntry(pending, col)
    const d = dataRef.current
    onChangeRef.current({
      ...d,
      fluids: [...updateExisting(d.fluids ?? []), fluid],
    })
    emitFluidStart(fluid)
  }

  function checkFluidConflict(pending: PendingFluidEntry, col: number, anchor: FConflictAnchor): boolean {
    const cat = pending.category
    const existing = (dataRef.current.fluids ?? []).find(f =>
      (f.category ?? getFluidCategory(f.name)) === cat && f.startCol <= col && f.endCol >= col
    )
    if (!existing) return false
    setFluidConflict({
      phase: "choose",
      pending,
      newCol: col,
      existingId: existing.id,
      existingName: existing.name,
      anchor,
    })
    return true
  }
  function fpCommitFluid() {
    if (!fp) return
    if (fp.fluidProfileConflict) return
    const fluidEntryMode = fp.fluidEntryMode ?? "VOLUME"
    const parsedRate = Number(fp.fluidRate)
    if (fluidEntryMode === "RATE" && (!Number.isFinite(parsedRate) || parsedRate <= 0)) return
    const category = getFluidCategory(fp.name)
    const pending: PendingFluidEntry = {
      name: fp.name,
      category,
      color: FLUID_CAT_COLOR[category] ?? getFluidColor(fp.name),
      fluidEntryMode,
      volume: fluidEntryMode === "VOLUME" ? fp.dose : "0",
      ...(fluidEntryMode === "VOLUME"
        ? { bagVolumeMl: Number(fp.dose) || 0 }
        : { rate: parsedRate, unit: "mL/h" as const }),
      ...(fp.concentration ? { concentration: fp.concentration } : {}),
      clinicalRuleKey: fp.clinicalRuleKey,
      clinicalRuleVersion: fp.clinicalRuleVersion,
      clinicalRuleSourceIds: fp.clinicalRuleSourceIds,
      clinicalPresetId: fp.clinicalPresetId,
      clinicalPresetVersion: fp.clinicalPresetVersion,
      clinicalPresetScope: fp.clinicalPresetScope,
    }
    const anchor = fp.anchor
    const conflict = checkFluidConflict(pending, fp.col, anchor)
    setFp(null)
    if (!conflict) addFluidDirect(pending, fp.col)
  }
  function fpCommitInfusion() {
    if (!fp) return
    const cfg  = INFUSION_CONFIGS[fp.name] ?? DEFAULT_INF
    const conc = fp.concentration ? ` ${fp.concentration}` : ""
    const displayName = fp.name + conc
    const id   = `${fp.name}-${fp.col}-${uid()}`
    const lib = infusionLibOpts.find(o => o.label === fp.name)
    const ruleAudit = {
      clinicalRuleKey: fp.clinicalRuleKey,
      clinicalRuleVersion: fp.clinicalRuleVersion,
      clinicalRuleSourceIds: fp.clinicalRuleSourceIds,
      clinicalPresetId: fp.clinicalPresetId,
      clinicalPresetVersion: fp.clinicalPresetVersion,
      clinicalPresetScope: fp.clinicalPresetScope,
    }
    onChange({ ...data, infusions: [...(data.infusions??[]), { id, name:displayName, rate:fp.rate, unit:fp.rateUnit, startCol:fp.col, endCol:fp.col, color:cfg.color, concentration: fp.concentration, formulation: fp.formulation, route: fp.route, drugId: lib?.drugId ?? undefined, atcCode: lib?.atcCode ?? undefined, inn: lib?.inn ?? undefined, ...ruleAudit }] })
    emitLogEvent({ type: "infusion_start", infId: id, name: displayName, rate: String(fp.rate), unit: fp.rateUnit, color: cfg.color, concentration: fp.concentration, formulation: fp.formulation, drugRoute: fp.route, drugId: lib?.drugId ?? undefined, atcCode: lib?.atcCode ?? undefined, inn: lib?.inn ?? undefined, ...ruleAudit })
    setFp(null)
  }

  // ── Vitals ──────────────────────────────────────────────────────────────────
  const { setVital: setVitalCell, lastVitalBefore } = useVitalsHandlers(dataRef, rawOnChangeRef)

  // Vitals persist as `vital` events (one per 5-minute column; the event
  // carries the whole column and the server projection replaces the column,
  // so a later event for the same column wins — the mobile contract). Cell
  // edits and auto-fill mark the column dirty; after a short settle each
  // dirty column is emitted through the same hardened event path drugs use.
  const dirtyVitalColsRef = useRef<Set<number>>(new Set())
  const vitalsEmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushVitalEvents = useCallback(() => {
    vitalsEmitTimerRef.current = null
    const cols = [...dirtyVitalColsRef.current].sort((a, b) => a - b)
    dirtyVitalColsRef.current.clear()
    for (const col of cols) {
      const ts = tsForCol(col)
      if (!ts) continue
      const entry = dataRef.current.vitals[col] ?? {}
      // STABLE id per column — the same scheme mobile's webTimetableToLog and
      // the server bridge use. Re-editing a cell then SUPERSEDES the existing
      // CaseEvent row (addEvent's content-compare + version bump) instead of
      // stacking a second active event at the same timestamp with a random id,
      // which made the projected value nondeterministic.
      onLogEventRef.current?.({ id: `web-vital-${col}`, ts, type: "vital", ...entry })
    }
  }, [tsForCol])

  const markVitalColDirty = useCallback((col: number) => {
    if (!onLogEventRef.current) return // no event sink wired (read-only usage)
    dirtyVitalColsRef.current.add(col)
    if (vitalsEmitTimerRef.current) clearTimeout(vitalsEmitTimerRef.current)
    vitalsEmitTimerRef.current = setTimeout(flushVitalEvents, 1200)
  }, [flushVitalEvents])

  // Stable ref so the clock-tick and backfill effects can mark columns dirty
  // without adding churn to their dependency arrays.
  const markVitalColDirtyRef = useRef(markVitalColDirty)
  useEffect(() => { markVitalColDirtyRef.current = markVitalColDirty }, [markVitalColDirty])

  // Navigating away mid-settle must not lose the pending column emissions.
  useEffect(() => () => {
    if (vitalsEmitTimerRef.current) {
      clearTimeout(vitalsEmitTimerRef.current)
      flushVitalEvents()
    }
  }, [flushVitalEvents])

  const setVital = useCallback((col: number, key: keyof VitalsEntry, raw: string) => {
    setVitalCell(col, key, raw)
    markVitalColDirty(col)
  }, [setVitalCell, markVitalColDirty])

  // Keyboard navigation on selected items
  useEffect(() => {
    if (!sel) return
    function handle(e: KeyboardEvent) {
      if (!sel) return
      const d  = dataRef.current
      const oc = onChangeRef.current
      if (e.key === "Escape") { setSel(null); return }

      const col = sel.type === "drug"     ? d.drugs[sel.idx]?.colIdx
                : sel.type === "fluid"    ? (d.fluids??[]).find(f=>f.id===selId(sel))?.startCol
                : (d.infusions??[]).find(i=>i.id===selId(sel))?.startCol
      if (col == null) return

      // Tab: cycle drug→fluid→next col drug
      if (e.key === "Tab") {
        e.preventDefault()
        // Build ordered list for cycling
        const items: TtSel[] = []
        for (let c = 0; c < colCount; c++) {
          d.drugs.forEach((x,i)     => { if (x.colIdx===c)     items.push({type:"drug",idx:i}) })
          ;(d.infusions??[]).forEach(x => { if (x.startCol===c) items.push({type:"infusion",id:x.id}) })
          ;(d.fluids??[]).forEach(x  => { if (x.startCol===c)  items.push({type:"fluid",id:x.id}) })
          ;(d.agents??[]).forEach(x  => { if (x.startCol===c)  items.push({type:"agent",startCol:x.startCol}) })
        }
        const ci = items.findIndex(it =>
          it.type===sel.type && ((it.type==="infusion"||it.type==="fluid") ? selId(it)===selId(sel) : selIdx(it)===selIdx(sel))
        )
        setSel(items[(ci+1)%items.length] ?? null)
        return
      }

      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault()
        if (sel.type==="drug")     { oc({...d,drugs:d.drugs.filter((_,i)=>i!==sel.idx)}); setSel(null) }
        if (sel.type==="fluid")    { oc({...d,fluids:(d.fluids??[]).filter(f=>f.id!==sel.id)}); setSel(null) }
        if (sel.type==="infusion") { oc({...d,infusions:(d.infusions??[]).filter(x=>x.id!==sel.id)}); setSel(null) }
        if (sel.type==="agent") {
          const a = d.agents.find(a => a.startCol===sel.startCol)
          if (a) { oc({...d, agents:d.agents.filter(x=>x.startCol!==a.startCol)}); setSel(null) }
        }
        return
      }

      if (e.key === "ArrowRight") {
        e.preventDefault()
        if (sel.type==="agent") {
          const a = d.agents.find(a => a.startCol===sel.startCol)
          if (a && a.endCol+1 < colCount) oc({...d, agents:d.agents.map(x=>x.startCol===a.startCol?{...x,endCol:x.endCol+1}:x)})
          return
        }
        if (col+1 >= colCount) return
        if (sel.type==="drug") {
          const last = d.drugs[sel.idx]
          const newDrugs = [...d.drugs, {...last, colIdx:col+1}]
          oc({...d, drugs:newDrugs, infusions:(d.infusions??[]).map(i=>i.startCol<=col&&i.endCol===col?{...i,endCol:col+1}:i)})
          emitLogEvent({
            ts: tsForCol(col + 1) ?? undefined,
            type: "drug",
            name: last.name,
            dose: last.dose,
            unit: last.unit,
            drugRoute: last.route,
            drugId: last.drugId,
            atcCode: last.atcCode,
            inn: last.inn,
            concentration: last.concentration,
            concentrationValue: last.concentrationValue,
            concentrationUnit: last.concentrationUnit,
            formulation: last.formulation,
            calculationBasis: last.calculationBasis,
            calculationWeightKg: last.calculationWeightKg,
            calculationMethod: last.calculationMethod,
            clinicalRuleKey: last.clinicalRuleKey,
            clinicalRuleVersion: last.clinicalRuleVersion,
            clinicalRuleSourceIds: last.clinicalRuleSourceIds,
            clinicalPresetId: last.clinicalPresetId,
            clinicalPresetVersion: last.clinicalPresetVersion,
            clinicalPresetScope: last.clinicalPresetScope,
          })
          setSel({type:"drug", idx:newDrugs.length-1})
        }
        if (sel.type==="infusion") {
          oc({...d, infusions:(d.infusions??[]).map(i=>i.id===sel.id?{...i,endCol:i.endCol+1}:i)})
        }
        if (sel.type==="fluid") {
          const fl = (d.fluids??[]).find(f=>f.id===sel.id)
          if (fl && fl.endCol+1 < colCount) oc({...d, fluids:(d.fluids??[]).map(f=>f.id===sel.id?{...f,endCol:f.endCol+1}:f)})
        }
        return
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault()
        if (sel.type==="agent") {
          const a = d.agents.find(a => a.startCol===sel.startCol)
          if (a && a.endCol > a.startCol) oc({...d, agents:d.agents.map(x=>x.startCol===a.startCol?{...x,endCol:x.endCol-1}:x)})
          return
        }
        if (sel.type==="drug") {
          const idx = sel.idx
          oc({...d, drugs:d.drugs.filter((_,i)=>i!==idx)}); setSel(null)
        }
        if (sel.type==="infusion") {
          const inf = (d.infusions??[]).find(i=>i.id===sel.id)
          if (inf && inf.endCol > inf.startCol) oc({...d, infusions:(d.infusions??[]).map(i=>i.id===sel.id?{...i,endCol:i.endCol-1}:i)})
        }
        if (sel.type==="fluid") {
          const fl = (d.fluids??[]).find(f=>f.id===sel.id)
          if (fl && fl.endCol > fl.startCol) oc({...d, fluids:(d.fluids??[]).map(f=>f.id===sel.id?{...f,endCol:f.endCol-1}:f)})
        }
        return
      }
    }
    window.addEventListener("keydown", handle)
    return () => window.removeEventListener("keydown", handle)
  }, [sel, colCount, emitLogEvent, tsForCol])

  // Close vitals popup on Enter; arrow keys adjust slider value
  useEffect(() => {
    if (!vitalsPopup) return
    const popup = vitalsPopup
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Enter") {
        e.preventDefault(); e.stopPropagation()
        const cur = dataRef.current.vitals[popup.col]?.[popup.key]
        if (cur === undefined) setVital(popup.col, popup.key, String(popup.defaultVal))
        setVitalsPopup(null)
        return
      }
      if (e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "ArrowDown") {
        e.preventDefault(); e.stopPropagation()
        const cur = dataRef.current.vitals[popup.col]?.[popup.key] ?? popup.defaultVal
        const delta = (e.key === "ArrowRight" || e.key === "ArrowUp") ? popup.step : -popup.step
        const next  = Math.min(popup.max, Math.max(popup.min, cur + delta))
        setVital(popup.col, popup.key, String(next))
      }
    }
    window.addEventListener("keydown", handleKey, true) // capture phase — beats input handlers
    return () => window.removeEventListener("keydown", handleKey, true)
  }, [vitalsPopup, setVital])

  // Undo / redo
  useEffect(() => {
    function handleUndoRedo(e: KeyboardEvent) {
      if (!e.ctrlKey) return
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault()
        const prev = histPastRef.current.pop()
        if (prev) { histFutureRef.current.push(dataRef.current); rawOnChangeRef.current(prev) }
      }
      if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
        e.preventDefault()
        const next = histFutureRef.current.pop()
        if (next) { histPastRef.current.push(dataRef.current); rawOnChangeRef.current(next) }
      }
    }
    window.addEventListener("keydown", handleUndoRedo)
    return () => window.removeEventListener("keydown", handleUndoRedo)
  }, [])

  // Freeze and clear the live clock as soon as case ends
  const endTimeRef = useRef(endTime)
  useEffect(() => { endTimeRef.current = endTime }, [endTime])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (endTime) setNowOffsetPx(null) }, [endTime])

  // On mount: expand colCount to cover all loaded data + the end time so a
  // resumed/ended case shows the full timetable rather than just the first hour.
  // Skip this for brand-new cases with no data (caseStarted=false, no endTime,
  // no bars) — let the live clock grow the table naturally instead.
  useEffect(() => {
    if (!caseStarted && !endTime) return
    const startMins = timeToMins(floorTo5(startTime || "08:00"))

    const dataMax = Math.max(
      0,
      ...(data.agents         ?? []).map(a => a.endCol),
      ...(data.infusions      ?? []).map(i => i.endCol),
      ...(data.fluids         ?? []).map(f => f.endCol),
      ...(data.drugs          ?? []).map(d => d.colIdx),
      ...(data.clinicalEvents ?? []).map(e => e.colIdx),
      data.vitals && data.vitals.length > 0 ? data.vitals.length - 1 : 0,
    )

    const endMax = endTime ? (() => {
      const endMins  = timeToMins(endTime)
      const diffMins = endMins >= startMins ? endMins - startMins : (1440 - startMins) + endMins
      return Math.max(0, Math.floor(diffMins / INTERVAL))
    })() : 0

    const needed = Math.max(dataMax, endMax) + 1
    if (needed > ROW_COLS) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setColCount(Math.ceil(needed / ROW_COLS) * ROW_COLS)
    }
  }, [caseStarted, data, endTime, startTime])

  // ── Mount-time backfill: fill any gap from last vitals col to current col ──
  useEffect(() => {
    if (!caseStarted) return
    if (!autoFillPreferences.enabled || !autoFillPreferences.backfillOnReopen) return

    const d = dataRef.current

    // Case hasn't started (start time is in the future) — nothing to backfill.
    // Without this guard a future start time read as ~23 h elapsed would fill
    // hours of fabricated observations forward and persist them as events.
    if (gridStartMs === null) return
    const now = new Date()
    // Column 0's own start, so back-filled vitals align with the visible grid.
    const chartStart = new Date(gridStartMs)
    const log = vitalsToAutoFillLog(d.vitals, chartStart)
    const lastDataCol = latestVitalColumn(log, chartStart)
    if (lastDataCol === null) return
    const currentCol = activeTimetableColumnForTimestamp(chartStart, now.getTime())
    if (currentCol === null) return
    if (currentCol <= lastDataCol) return

    const planned = planAutoFillVitalEvents({
      log,
      chartStart,
      fromCol: lastDataCol + 1,
      toCol: currentCol,
      preferences: autoFillPreferences,
    })
    const { vitals: newVitals, filledCols } = applyAutoFillVitalPlan(d.vitals, planned)
    if (!filledCols.length) return
    filledCols.forEach(col => markVitalColDirtyRef.current(col))
    rawOnChangeRef.current({ ...d, vitals: newVitals })
  }, [caseStarted, rawOnChangeRef, gridStartMs, autoFillPreferences])

  // ── Live clock: advance selectedCol + pixel offset every 10 s ──────────────
  useEffect(() => {
    if (!caseStarted) return          // case not started — don't run clock
    function tick() {
      if (endTimeRef.current) return  // case ended — stop the clock
      const now = new Date()
      // Measured from the grid origin (column 0's own start), so the marker lands
      // on the wall clock instead of sitting up to 4:59 to the left of it.
      const diffSecs = secondsFromGridOrigin(gridStartMs, now)
      // Start time is in the future — the case hasn't begun. Park the clock:
      // no now-marker, no table growth, no auto-extend of live bars.
      if (diffSecs === null || diffSecs < 0) { setNowOffsetPx(null); prevColRef.current = null; return }
      {
        const px  = diffSecs / (INTERVAL * 60) * COL_W
        // Size off the true elapsed column, not the clamped one: clamping to
        // colCount-1 made the grow-check below always true, so the table crept
        // outward one row per tick instead of sizing to the clock in one go.
        const trueCol = Math.floor(diffSecs / (INTERVAL * 60))
        if (trueCol + 1 >= colCountRef.current)
          setColCount(layoutRef.current === "scroll" ? trueCol + 2 : Math.ceil((trueCol + 2) / ROW_COLS) * ROW_COLS)
        const col = Math.min(trueCol, colCountRef.current - 1)
        setNowOffsetPx(Math.min(px, colCountRef.current * COL_W))
        setSelectedCol(col)

        // Auto-extend live bars to current column (any bar behind current that isn't stopped)
        const d   = dataRef.current
        const oc  = rawOnChangeRef.current   // bypass history — auto-extend is not undoable
        const prevCol = prevColRef.current

        const needsExtend =
          (d.infusions ?? []).some(i => i.endCol < col && !i.stopped) ||
          (d.fluids    ?? []).some(f => f.endCol < col && !f.stopped) ||
          (d.agents    ?? []).some(a => a.endCol < col && !a.stopped) ||
          (d.gasSettings ?? []).some(g => g.endCol < col && !g.stopped)

        let newVitals = d.vitals
        if (prevCol !== null && trueCol > prevCol && autoFillPreferences.enabled) {
          // Must be the same origin trueCol was derived from, or back-filled
          // vitals land in a different column than the one on screen.
          const chartStartMs = gridStartMs
          if (chartStartMs !== null) {
            const chartStart = new Date(chartStartMs)
            const planned = planAutoFillVitalEvents({
              log: vitalsToAutoFillLog(d.vitals, chartStart),
              chartStart,
              fromCol: prevCol + 1,
              toCol: trueCol,
              preferences: autoFillPreferences,
            })
            const applied = applyAutoFillVitalPlan(d.vitals, planned)
            if (applied.filledCols.length) {
              newVitals = applied.vitals
              applied.filledCols.forEach(filledCol => markVitalColDirtyRef.current(filledCol))
            }
          }
        }

        if (needsExtend || newVitals !== d.vitals) {
          oc({
            ...d,
            vitals:    newVitals,
            infusions: (d.infusions ?? []).map(i => i.endCol < col && !i.stopped ? { ...i, endCol: col } : i),
            fluids:    (d.fluids    ?? []).map(f => f.endCol < col && !f.stopped ? { ...f, endCol: col } : f),
            agents:    (d.agents   ?? []).map(a => a.endCol < col && !a.stopped ? { ...a, endCol: col } : a),
            gasSettings: (d.gasSettings ?? []).map(g => g.endCol < col && !g.stopped ? { ...g, endCol: col } : g),
          })
        }
        prevColRef.current = trueCol
      }
    }
    tick()
    const id = setInterval(tick, 10_000)
    return () => clearInterval(id)
  }, [gridStartMs, caseStarted, autoFillPreferences])

  const nowCol    = nowOffsetPx !== null ? Math.min(Math.floor(nowOffsetPx / COL_W), colCount - 1) : null

  // Column index of the case end time (handles midnight crossing)
  const endCol = endTime ? (() => {
    const startMins = timeToMins(floorTo5(startTime || "08:00"))
    const endMins   = timeToMins(endTime)
    const diffMins  = endMins >= startMins ? endMins - startMins : (1440 - startMins) + endMins
    return Math.max(0, Math.floor(diffMins / INTERVAL))
  })() : null

  // ── Auto-scroll active row into view when column advances ────────────────────
  useEffect(() => {
    if (!caseStarted) return          // don't auto-scroll until the case has started
    activeRowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [nowCol, caseStarted])
  const [fluidConflict, setFluidConflict]   = useState<FluidConflict | null>(null)
  // Drag-to-extend state: startCol of segment being extended

  const roundedStart = floorTo5(startTime || "08:00")
  const times  = Array.from({ length: colCount }, (_, i) => addMinutes(roundedStart, i * INTERVAL))

  // Show only rows whose monitor is active; fall back to all rows if no monitoring passed
  const activeRows = monitoring
    ? VITAL_ROW_DEFS.filter(row => row.monitors.some(m => monitoring[m]))
    : VITAL_ROW_DEFS

  // Find segment that covers column ci (strict range check)
  function segmentAt(ci: number): AgentSegment | null {
    return agents.find(a => ci >= a.startCol && ci <= a.endCol) ?? null
  }
  function gasSegmentAt(ci: number): GasSettingsSegment | null {
    return (data.gasSettings ?? []).find(g => ci >= g.startCol && ci <= g.endCol) ?? null
  }

  // ── Clinical Events ───────────────────────────────────────────────────────────
  const { addClinicalEvent, removeClinicalEvent } = useClinicalEventHandlers(dataRef, onChangeRef, emitLogEvent, onComplicationAdded)

  // ── Drugs ───────────────────────────────────────────────────────────────────
  const { removeDrug } = useDrugHandlers(data, onChange)

  // ── Infusions ────────────────────────────────────────────────────────────────
  const { removeInfusion, extendInfusion, extendInfusionLeft, restoreInfusion, applyInfRateChange } =
    useInfusionHandlers(data, onChange, dataRef, onChangeRef, onLogEventDeleteRef, emitLogEvent, nowCol)

  /**
   * Land a whole-bar drag. Rate changes travel with the bar, since they are
   * recorded against columns rather than against the infusion's own start.
   *
   * Dragging off the left-hand edge is an intent to delete, not a move to a
   * negative time — it asks first, because a whole infusion is being removed.
   */
  function moveInfusionBar(move: InfusionBarMove, toCol: number) {
    const delta = toCol - move.fromCol
    const newStart = move.origStart + delta
    if (newStart < 0) {
      setDeleteInfPrompt(move.id)
      return
    }
    onChangeRef.current({
      ...dataRef.current,
      infusions: (dataRef.current.infusions ?? []).map(i => i.id === move.id
        ? {
            ...i,
            startCol: newStart,
            endCol: move.origEnd + delta,
            rateChanges: (i.rateChanges ?? []).map(rc => ({ ...rc, col: rc.col + delta })),
          }
        : i),
    })
  }

  // ── Fluids ──────────────────────────────────────────────────────────────────
  const { removeFluid, extendFluid, resumeFluid, continueFluid } =
    useFluidHandlers(data, onChange, dataRef, onChangeRef, onLogEventDeleteRef, emitLogEvent, nowCol)

  function applyFluidRateChange(id: string, rate: number) {
    if (!Number.isFinite(rate) || rate <= 0) return
    const d = dataRef.current
    const fluid = (d.fluids ?? []).find(item => item.id === id)
    if (!fluid || fluid.fluidEntryMode !== "RATE") return
    const ts = new Date().toISOString()
    const col = Math.max(fluid.startCol, nowCol ?? fluid.endCol)
    onChangeRef.current({
      ...d,
      fluids: (d.fluids ?? []).map(item => item.id === id ? {
        ...item,
        endCol: Math.max(item.endCol, col),
        rateChanges: [...(item.rateChanges ?? []), { col, ts, rate, unit: "mL/h" }],
      } : item),
    })
    emitLogEvent({
      type: "fluid_rate",
      ts,
      fluidId: fluid.id,
      name: fluid.name,
      rate: String(rate),
      unit: "mL/h",
      color: fluid.color,
      clinicalRuleKey: fluid.clinicalRuleKey,
      clinicalRuleVersion: fluid.clinicalRuleVersion,
      clinicalRuleSourceIds: fluid.clinicalRuleSourceIds,
      clinicalPresetId: fluid.clinicalPresetId,
      clinicalPresetVersion: fluid.clinicalPresetVersion,
      clinicalPresetScope: fluid.clinicalPresetScope,
    })
  }

  function finalizedFluid(
    fluid: TimetableFluid,
    administeredVolumeMl: number,
    endTs: string,
    endCol: number,
  ): TimetableFluid {
    const actualVolumeMl = Math.max(0, Math.round(administeredVolumeMl))
    return {
      ...fluid,
      endCol: Math.max(fluid.startCol, endCol),
      endTs,
      stopped: true,
      administeredVolumeMl: actualVolumeMl,
      volume: String(actualVolumeMl),
    }
  }

  function emitFluidEnd(fluid: TimetableFluid, administeredVolumeMl: number, endTs: string) {
    const actualVolumeMl = Math.max(0, Math.round(administeredVolumeMl))
    emitLogEvent({
      type: "fluid_end",
      ts: endTs,
      fluidId: fluid.id,
      name: fluid.name,
      category: fluid.category,
      color: fluid.color,
      fluidEntryMode: fluid.fluidEntryMode,
      administeredVolumeMl: actualVolumeMl,
      volume: String(actualVolumeMl),
      clinicalRuleKey: fluid.clinicalRuleKey,
      clinicalRuleVersion: fluid.clinicalRuleVersion,
      clinicalRuleSourceIds: fluid.clinicalRuleSourceIds,
      clinicalPresetId: fluid.clinicalPresetId,
      clinicalPresetVersion: fluid.clinicalPresetVersion,
      clinicalPresetScope: fluid.clinicalPresetScope,
    })
  }

  // ── Fluid conflict resolution ────────────────────────────────────────────────
  // The popover in ./intraop/FluidConflictPopover only renders and reports which
  // button was pressed; every change to the chart happens here, where the data
  // lives.

  function fluidConflictRunInParallel() {
    if (!fluidConflict) return
    addFluidDirect(fluidConflict.pending, fluidConflict.newCol)
    setFluidConflict(null)
  }

  function fluidConflictStopExisting() {
    const existing = (dataRef.current.fluids ?? []).find(fluid => fluid.id === fluidConflict?.existingId)
    // A rate line's delivered volume can be computed, so offer it rather than
    // asking a question the chart can already answer.
    if (existing?.fluidEntryMode === "RATE") {
      const endTs = fluidActionTimestamp(fluidConflict!.newCol)
      setFluidConflict(fc => fc ? {
        ...fc,
        phase: "volume",
        volInput: String(fluidDeliveredVolumeMl(existing, endTs)),
      } as FluidConflict : null)
      return
    }
    setFluidConflict(fc => fc ? { ...fc, phase: "finished" } as FluidConflict : null)
  }

  function finishExistingFluidAndStart(actualVolumeMl: number) {
    if (!fluidConflict) return
    const d = dataRef.current
    const existing = (d.fluids ?? []).find(fluid => fluid.id === fluidConflict.existingId)
    if (!existing) return
    const endTs = fluidActionTimestamp(fluidConflict.newCol)
    const endCol = Math.max(existing.startCol, fluidConflict.newCol - 1)
    const nextFluid = createFluidEntry(fluidConflict.pending, fluidConflict.newCol)
    onChangeRef.current({
      ...d,
      fluids: [
        ...(d.fluids ?? []).map(fluid => fluid.id === existing.id
          ? finalizedFluid(fluid, actualVolumeMl, endTs, endCol)
          : fluid),
        nextFluid,
      ],
    })
    emitFluidEnd(existing, actualVolumeMl, endTs)
    emitFluidStart(nextFluid)
    setFluidConflict(null)
  }

  function fluidConflictFinishedAnswer(fullyInfused: boolean) {
    if (!fluidConflict) return
    if (fullyInfused) {
      const existing = (dataRef.current.fluids ?? []).find(fluid => fluid.id === fluidConflict.existingId)
      const fullVolume = Number(existing?.bagVolumeMl ?? existing?.volume) || 0
      finishExistingFluidAndStart(fullVolume)
      return
    }
    setFluidConflict(fc => fc ? { ...fc, phase: "volume", volInput: "" } as FluidConflict : null)
  }

  function fluidConflictConfirmVolume() {
    if (!fluidConflict || fluidConflict.phase !== "volume") return
    finishExistingFluidAndStart(Number(fluidConflict.volInput) || 0)
  }

  function stopFluid(id: string, administeredVolumeMl: number) {
    const d = dataRef.current
    const fluid = (d.fluids ?? []).find(item => item.id === id)
    if (!fluid) return
    const endTs = new Date().toISOString()
    const endCol = Math.max(fluid.startCol, nowCol ?? fluid.endCol)
    onChangeRef.current({
      ...d,
      fluids: (d.fluids ?? []).map(item => item.id === id
        ? finalizedFluid(item, administeredVolumeMl, endTs, endCol)
        : item),
    })
    emitFluidEnd(fluid, administeredVolumeMl, endTs)
  }

  // ── Agents ──────────────────────────────────────────────────────────────────
  const {
    agents, agentPicker, agentPickerRect, pickerN2o, setPickerN2o, pickerPercent, setPickerPercent,
    pendingAgentName, setPendingAgentName,
    startAgent, updateAgentExtras, openPickerForSeg, openPickerEmpty, closeAgentPicker,
    removeSegment, extendSegment, resumeSegment, continueAgent,
  } = useAgentHandlers(data, onChange, dataRef, onChangeRef, emitLogEvent, nowCol)

  // ── Gas settings (FGF / carrier gas / FiO2) ──────────────────────────────────
  const {
    gasSettings, gasPicker, gasPickerRect, pickerFgf, setPickerFgf, pickerCarrierGas, setPickerCarrierGas, pickerFio2, setPickerFio2,
    openPickerForSeg: openGasPickerForSeg, openPickerEmpty: openGasPickerEmpty, closeGasPicker,
    startGas, applyGasChange, stopGas,
  } = useGasSettingsHandlers(data, onChange, dataRef, onChangeRef, emitLogEvent, tsForCol)

  function handleEndCaseConfirm(result: {
    continuedItems: string[]
    infusionTotals: { name: string; total: number; unit: string }[]
    discontinuedAgentCols: number[]
    discontinuedInfusionIds: string[]
    finalizedFluidWithAmounts: { id: string; amount: number; category: string; endTs: string }[]
    discontinuedGasIds: string[]
  }) {
    const col = nowCol ?? 0
    // One combined read + one combined write avoids stale-closure overwrites when
    // multiple item types (agent + infusion + fluid) are discontinued together.
    const d = dataRef.current
    const discontinuedAgentSet = new Set(result.discontinuedAgentCols)
    const discontinuedInfSet   = new Set(result.discontinuedInfusionIds)
    const discontinuedGasSet   = new Set(result.discontinuedGasIds)
    const endedFluidById = new Map(
      result.finalizedFluidWithAmounts.map(fluid => [fluid.id, fluid]),
    )
    onChangeRef.current({
      ...d,
      agents: d.agents.map(a =>
        discontinuedAgentSet.has(a.startCol)
          ? { ...a, endCol: col, stopped: true as const }
          : a
      ),
      infusions: (d.infusions ?? []).map(i =>
        discontinuedInfSet.has(i.id)
          ? { ...i, endCol: col, stopped: true as const }
          : i
      ),
      // Stamp actual volume infused so the summary reads the correct amount (not bag size).
      fluids: (d.fluids ?? []).map(fluid => {
        const ended = endedFluidById.get(fluid.id)
        return ended
          ? finalizedFluid(fluid, ended.amount, ended.endTs, col)
          : fluid
      }),
      gasSettings: (d.gasSettings ?? []).map(g =>
        discontinuedGasSet.has(g.id)
          ? { ...g, endCol: col, stopped: true as const }
          : g
      ),
    })
    for (const ended of result.finalizedFluidWithAmounts) {
      const fluid = (d.fluids ?? []).find(item => item.id === ended.id)
      if (fluid) emitFluidEnd(fluid, ended.amount, ended.endTs)
    }
    const endedAt = new Date()
    endedAtRef.current = endedAt
    const resumeUntil = new Date(endedAt.getTime() + INTRAOP_RESUME_WINDOW_MS)
    setResumeUntilLabel(`${String(resumeUntil.getHours()).padStart(2,"0")}:${String(resumeUntil.getMinutes()).padStart(2,"0")}`)
    setResumeSecsLeft(INTRAOP_RESUME_WINDOW_SECONDS)
    onEndCase?.()
    if (result.continuedItems.length > 0) onPostopContinued?.(result.continuedItems)
    if (result.infusionTotals.length > 0) onInfusionTotals?.(result.infusionTotals)
    setShowEndModal(false)
  }

  // ── Extend drag-and-drop ─────────────────────────────────────────────────────
  function onGripDragStart(e: React.DragEvent, startCol: number) {
    e.dataTransfer.setData("extend-agent", String(startCol))
    e.dataTransfer.effectAllowed = "move"
    dragActions.agentExtendStart(startCol)
  }
  function onAgentCellDragOver(e: React.DragEvent, col: number) {
    if (drag.extendingAgent === null) return
    e.preventDefault()
    e.stopPropagation()
    // Retracting past the start would give the segment a negative length, so
    // the hover clamps to the column it began in.
    dragActions.agentExtendHover(Math.max(col, drag.extendingAgent))
  }
  function onAgentCellDrop(e: React.DragEvent, col: number) {
    if (drag.extendingAgent === null) return
    e.preventDefault()
    const startCol = parseInt(e.dataTransfer.getData("extend-agent"))
    if (isNaN(startCol)) return
    extendSegment(startCol, Math.max(col, startCol))
    dragActions.agentExtendEnd()
  }
  function onAgentDragEnd() { dragActions.agentExtendEnd() }

  // ── Drug/fluid drag ──────────────────────────────────────────────────────────
  function onDrugDragOver(e: React.DragEvent, col: number)  { if (e.dataTransfer.types.includes("ext-inf") || e.dataTransfer.types.includes("ext-fluid") || e.dataTransfer.types.includes("extend-agent")) return; e.preventDefault(); dragActions.dropTargetOver(col) }
  function onDrugDrop(e: React.DragEvent, col: number) {
    e.preventDefault(); dragActions.dropTargetOver(null)
    const type = e.dataTransfer.getData("item-type")
    if (type === "move-drug") {
      const idx = parseInt(e.dataTransfer.getData("item-idx"))
      if (!isNaN(idx)) onChange({ ...data, drugs: data.drugs.map((d, i) => i === idx ? { ...d, colIdx: col } : d) })
      return
    }
    if (type !== "drug") return
    openFP(col, e.dataTransfer.getData("item-name"), e.dataTransfer.getData("item-unit"), e.currentTarget, "bolus")
  }
  function onFluidDrop(e: React.DragEvent, col: number) {
    e.preventDefault(); dragActions.fluidDropTargetOver(null)
    const type = e.dataTransfer.getData("item-type")
    if (type === "move-fluid") {
      const id = e.dataTransfer.getData("item-id")
      if (id) {
        const fl = (data.fluids ?? []).find(f => f.id === id)
        if (fl) {
          const span = fl.endCol - fl.startCol
          onChange({ ...data, fluids: (data.fluids ?? []).map(f => f.id === id ? { ...f, startCol: col, endCol: col + span } : f) })
        }
      }
      return
    }
    if (type !== "fluid") return
    const name = e.dataTransfer.getData("item-name")
    const anchor = (e.currentTarget as HTMLElement).getBoundingClientRect()
    openFluidFP(col, name, getFluidCategory(name), anchor)
  }

  const [showEndPrompt, setShowEndPrompt] = useState(false)

  // ── Shared styles ─────────────────────────────────────────────────────────────
  const cellCls     = "w-full text-center text-sm font-mono bg-white/60 dark:bg-transparent outline-none focus:bg-blue-50 dark:focus:bg-blue-900/30 rounded transition-colors py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-slate-700 dark:text-[#d0d0d0]"
  const rowLabelCls = "text-xs font-semibold text-slate-400 dark:text-[#888] uppercase tracking-wide text-right pr-2 leading-none select-none"

  // ── Per-row renderer ──────────────────────────────────────────────────────────
  function renderRow(rowIdx: number, overrideColStart?: number, overrideColEnd?: number) {
    // Geometry and bar-edge rules live in ./intraop/timetable-row-geometry, where
    // the now-marker and post-case boundary can be checked at their edges.
    const {
      colStart,
      colEnd,
      columns: rowCols,
      isActiveRow,
      width: rowW,
      nowPx: rowNowPx,
      endOverlayLeft: rowEndOverlayLeft,
    } = computeRowGeometry({
      rowIdx,
      rowCols: ROW_COLS,
      colCount,
      colW,
      labelW: LABEL_W,
      nowCol,
      nowOffsetPx,
      baseColW: COL_W,
      endCol,
      caseEnded: !!endTime,
      overrideColStart,
      overrideColEnd,
    })


    return (
      <div key={rowIdx} ref={isActiveRow ? activeRowRef : undefined}
        className="rounded-lg border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1c1c1c] overflow-hidden">
        {/* Row label bar */}
        <div className="flex items-center justify-between px-3 py-1 bg-slate-50 dark:bg-[#1a1a1a] border-b border-slate-100 dark:border-[#2a2a2a]">
          <span className="text-[9px] font-mono font-semibold text-slate-400 dark:text-[#666]">
            {times[colStart]}{" - "}{addMinutes(times[Math.min(colEnd - 1, times.length - 1)], INTERVAL)}
          </span>
          {isActiveRow && (endTime
            ? <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400"><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />CASE ENDED</span>
            : <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-orange-500 dark:text-orange-400"><span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping opacity-75" />LIVE</span>
          )}
        </div>
        <div style={{ width: rowW, position: "relative" }}>

          {/* Now-line (only active row, hidden after case end) */}
          {rowNowPx !== null && (
            <div style={{ position:"absolute", left: LABEL_W + rowNowPx - 1, top:0, bottom:0, width:2, zIndex:6, pointerEvents:"none" }}
              className="bg-orange-400/50 dark:bg-orange-500/40" />
          )}

          {/* Emerald end-line — vertical marker at the case end boundary */}
          {rowEndOverlayLeft !== null && rowEndOverlayLeft > 0 && (
            <div style={{ position:"absolute", left: LABEL_W + rowEndOverlayLeft - 1, top:0, bottom:0, width:2, zIndex:7, pointerEvents:"none" }}
              className="bg-emerald-400/80 dark:bg-emerald-500/60" />
          )}

          {/* Post-case overlay — blocks interaction and shows "Case Finished" */}
          {rowEndOverlayLeft !== null && (
            <div
              style={{ position:"absolute", left: LABEL_W + rowEndOverlayLeft, top:0, right:0, bottom:0, zIndex:20 }}
              className="bg-slate-50/80 dark:bg-[#0d0d0d]/80 flex items-center justify-center"
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              onDoubleClick={e => e.stopPropagation()}>
              {/* Only show badge when there's enough horizontal space */}
              {(rowEndOverlayLeft === 0 || colEnd - Math.max(endCol ?? 0, colStart) > 2) && (
                <div className="flex flex-col items-center gap-1 select-none pointer-events-none">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 border-2 border-emerald-300 dark:border-emerald-700 flex items-center justify-center shadow-sm">
                    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-[9px] font-bold tracking-widest uppercase text-emerald-700 dark:text-emerald-300">{t("intraop.timetable.caseFinished")}</span>
                </div>
              )}
            </div>
          )}

          {/* Chart */}
          {chartOpen && (
            <DivChart vitals={data.vitals} colStart={colStart} rowColCount={rowCols.length} activeRows={activeRows} />
          )}

          <TimetableVitalsRows
            rows={activeRows}
            vitals={data.vitals}
            rowCols={rowCols}
            colCount={colCount}
            colW={colW}
            labelWidth={LABEL_W}
            rowLabelClass={rowLabelCls}
            cellClass={cellCls}
            emptyLabel={t("intraop.timetable.selectMonitoringToPopulate")}
            isFirstRow={rowIdx === 0}
            inputRefs={vitalsInputRefs}
            setVital={setVital}
            lastVitalBefore={lastVitalBefore}
            onOpenStepper={setVitalsPopup}
          />

          <TimetableTimeHeader
            label={t("intraop.timetable.time")}
            labelWidth={LABEL_W}
            rowCols={rowCols}
            colW={colW}
            times={times}
            selectedCol={selectedCol}
            onSelectCol={setSelectedCol}
            endCol={endCol}
            nowCol={nowCol}
            isActiveRow={isActiveRow}
            caseEnded={!!endTime}
          />

          {showAgentRow && (
            <AgentLane
              label={t("intraop.timetable.inhAgent")}
              labelWidth={LABEL_W}
              rowLabelClass={rowLabelCls}
              rowCols={rowCols}
              colStart={colStart}
              colEnd={colEnd}
              colW={colW}
              nowCol={nowCol}
              sel={sel}
              setSel={setSel}
              discConfirmId={discConfirmId}
              setDiscConfirmId={setDiscConfirmId}
              agents={agents}
              segmentAt={segmentAt}
              agentStyle={AGENT_STYLE}
              displayAgentName={displayAgentName}
              drag={drag}
              onCellDragOver={onAgentCellDragOver}
              onCellDrop={onAgentCellDrop}
              onGripDragStart={onGripDragStart}
              onDragEnd={onAgentDragEnd}
              openPickerForSeg={openPickerForSeg}
              openPickerEmpty={openPickerEmpty}
              resumeSegment={resumeSegment}
              extendSegment={extendSegment}
              removeSegment={removeSegment}
              continueAgent={continueAgent}
            />
          )}

          {/* Gas settings shares the agent row's gating (GA technique selected)
              but starts empty until it is tapped. */}
          {showAgentRow && (
            <GasSettingsLane
              labelWidth={LABEL_W}
              rowLabelClass={rowLabelCls}
              rowCols={rowCols}
              colStart={colStart}
              colEnd={colEnd}
              colW={colW}
              nowCol={nowCol}
              sel={sel}
              setSel={setSel}
              discConfirmId={discConfirmId}
              setDiscConfirmId={setDiscConfirmId}
              locale={locale}
              gasSegmentAt={gasSegmentAt}
              openPickerForSeg={openGasPickerForSeg}
              openPickerEmpty={openGasPickerEmpty}
              stopGas={stopGas}
            />
          )}

          <ClinicalEventsLane
            label={t("intraop.timetable.events")}
            labelWidth={LABEL_W}
            rowLabelClass={rowLabelCls}
            rowCols={rowCols}
            colW={colW}
            events={data.clinicalEvents ?? []}
            displayEventName={label => displayNamedOption("INTRAOP_EVENT", eventLibOpts, label, locale)}
            onOpenPicker={(ci, rect) => { setEventPicker({ ci, rect }); setEvSearch("") }}
            onRemove={removeClinicalEvent}
          />

          <DrugLane
            label={t("intraop.timetable.drugs")}
            labelWidth={LABEL_W}
            rowLabelClass={rowLabelCls}
            rowCols={rowCols}
            colW={colW}
            drugs={data.drugs}
            displayDrugName={displayDrugName}
            sel={sel}
            drag={drag}
            onDragOver={onDrugDragOver}
            onDragLeave={() => dragActions.dropTargetOver(null)}
            onDrop={onDrugDrop}
            onOpenPicker={(ci, rect) => setDrugPicker({ ci, rect })}
            onEditDose={(idx, dose, unit, rect) => setDoseEditDrug({ idx, dose, unit, rect })}
            onRemove={removeDrug}
          />

          {/* One lane per infusion name; a drug restarted later keeps its lane
              rather than opening a second one. */}
          {[...new Set((data.infusions ?? []).map(i => i.name))].map(drugName => {
            const segs = (data.infusions ?? []).filter(i => i.name === drugName)
            return (
              <InfusionLane
                key={drugName}
                drugName={drugName}
                color={segs[0]?.color ?? "#64748b"}
                segments={segs}
                labelWidth={LABEL_W}
                rowCols={rowCols}
                colStart={colStart}
                colEnd={colEnd}
                colW={colW}
                nowCol={nowCol}
                sel={sel}
                setSel={setSel}
                clearSel={() => setSel(null)}
                displayInfusionName={displayInfusionName}
                discConfirmId={discConfirmId}
                setDiscConfirmId={setDiscConfirmId}
                hoverDiscontinue={hoverDiscontinue}
                drag={drag}
                dragActions={dragActions}
                extendInfusion={extendInfusion}
                extendInfusionLeft={extendInfusionLeft}
                applyInfRateChange={applyInfRateChange}
                onMoveBar={moveInfusionBar}
                onOpenMenu={setInfMenu}
              />
            )
          })}

          {/* One lane per fluid line: a case can run several bags of the same
              fluid at once, and stacking them would read as one line at twice
              the rate. */}
          {fluidRows.map(({ label, segs, color }) => (
            <FluidLane
              key={label}
              label={displayFluidLaneLabel(label)}
              color={color}
              segments={segs}
              labelWidth={LABEL_W}
              rowCols={rowCols}
              colStart={colStart}
              colEnd={colEnd}
              colW={colW}
              sel={sel}
              setSel={setSel}
              displayFluidName={displayFluidName}
              drag={drag}
              dragActions={dragActions}
              extendFluid={extendFluid}
              resumeFluid={resumeFluid}
              continueFluid={continueFluid}
              removeFluid={removeFluid}
              onChangeRate={setFluidRateDialog}
              onDiscontinue={setDiscFluidState}
            />
          ))}

          {/* Infusion drop zone — always-visible entry point, separate from
              the Drug row, so starting an infusion never goes through a
              drug-then-bolus/infusion choice. */}
          <div className="flex min-h-[40px] border-t border-slate-200 dark:border-[#2e2e2e] bg-blue-50/20 dark:bg-blue-950/5">
            <div style={{ width: LABEL_W, minWidth: LABEL_W }} className={rowLabelCls + " py-1.5 flex items-center justify-end opacity-50"}>{t("intraop.timetable.infusions")}</div>
            {rowCols.map(ci => (
              <div key={ci} style={{ width: colW, minWidth: colW }}
                className="border-l border-slate-100 dark:border-[#2a2a2a] flex items-center justify-center">
                <button type="button" tabIndex={-1} data-testid="add-infusion"
                  onClick={e => { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setInfPicker({ ci, rect }) }}
                  className="flex items-center justify-center gap-0.5 text-[10px] font-semibold rounded border border-dashed border-blue-300 dark:border-blue-700 text-blue-400 dark:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-1 py-1 transition-colors w-[72px]">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Fluid drop zone */}
          <div className="flex min-h-[40px] border-t border-slate-200 dark:border-[#2e2e2e] bg-cyan-50/20 dark:bg-cyan-950/5">
            <div style={{ width: LABEL_W, minWidth: LABEL_W }} className={rowLabelCls + " py-1.5 flex items-center justify-end opacity-50"}>{t("intraop.timetable.fluids")}</div>
            {rowCols.map(ci => (
              <div key={ci} style={{ width: colW, minWidth: colW }}
                onDragOver={e => { if (e.dataTransfer.types.includes("ext-inf") || e.dataTransfer.types.includes("ext-fluid") || e.dataTransfer.types.includes("extend-agent")) return; e.preventDefault(); dragActions.fluidDropTargetOver(ci) }}
                onDragLeave={() => dragActions.fluidDropTargetOver(null)}
                onDrop={e => onFluidDrop(e, ci)}
                className={`border-l border-slate-100 dark:border-[#2a2a2a] flex items-center justify-center transition-colors ${drag.fluidDragOver===ci ? "bg-cyan-100 dark:bg-cyan-900/20" : ""}`}>
                <button type="button" tabIndex={-1}
                  onClick={e => { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setFluidPicker({ ci, rect }); setFpSearch("") }}
                  className="flex items-center justify-center gap-0.5 text-[10px] font-semibold rounded border border-dashed border-cyan-300 dark:border-cyan-700 text-cyan-400 dark:text-cyan-500 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 px-1 py-1 transition-colors w-[72px]">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

        </div>
      </div>
    )
  }

  return (
    <>
    <div className="space-y-3">
      {/* Chart toggle + layout toggle on same row */}
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => setChartOpen(o => !o)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors select-none ${
            chartOpen
              ? "bg-slate-700 dark:bg-[#3a3a3a] border-slate-600 dark:border-[#555] text-white dark:text-slate-100"
              : "bg-white dark:bg-[#2a2a2a] border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-[#999] hover:border-slate-300"}`}>
          {chartOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {chartOpen ? "Hide chart" : "Show chart"}
          {chartOpen && (
            <span className="flex items-center gap-2 ml-1 text-[10px] font-normal opacity-70">
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-[2px] bg-red-400 rounded" />BP</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-[2px] bg-green-500 rounded" />HR</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-[2px] bg-cyan-500 rounded" />SpO2</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-[2px] bg-amber-500 rounded" />EtCO2</span>
            </span>
          )}
        </button>
        <button type="button" onClick={() => setShowHotkeys(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors select-none bg-white dark:bg-[#2a2a2a] border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-[#999] hover:border-slate-300 dark:hover:border-[#555]">
          ⌨ Shortcuts
        </button>
      </div>

      <div className="flex gap-3 items-start">
        {/* ── Timetable rows */}
        <div ref={rowsContainerRef} className="flex-1 min-w-0 space-y-2" onClick={() => { setSel(null); setDiscConfirmId(null) }}>
          {layout === "expand"
            ? Array.from({ length: Math.ceil(colCount / ROW_COLS) }, (_, ri) => renderRow(ri))
            : (
              <div className="overflow-x-auto" onWheel={e => e.stopPropagation()}>
                <div style={{ minWidth: LABEL_W + colCount * colW }}>
                  {renderRow(0, 0, colCount)}
                </div>
              </div>
            )
          }

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => setColCount(n => n + ROW_COLS)}
              className="text-xs font-medium text-slate-500 dark:text-[#999] hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] active:bg-slate-200 dark:active:bg-[#333] active:text-slate-900 dark:active:text-white border border-slate-200 dark:border-[#3a3a3a] hover:border-slate-400 dark:hover:border-[#555] rounded-full px-3 py-1 transition-all cursor-pointer select-none">
              + 1 hr
            </button>
            <button type="button"
              onClick={() => setColCount(n => Math.max(ROW_COLS, n - ROW_COLS))}
              disabled={colCount <= ROW_COLS}
              className="text-xs font-medium text-slate-500 dark:text-[#999] hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] active:bg-slate-200 dark:active:bg-[#333] active:text-slate-900 dark:active:text-white disabled:opacity-30 disabled:cursor-not-allowed border border-slate-200 dark:border-[#3a3a3a] hover:border-slate-400 dark:hover:border-[#555] rounded-full px-3 py-1 transition-all cursor-pointer select-none">
              - 1 hr
            </button>
            <span className="text-xs text-slate-400 dark:text-[#666]">
              Total: <span className={`font-semibold ${endTime ? "text-slate-600 dark:text-[#aaa]" : "text-amber-500 dark:text-amber-400"}`}>
                {endTime ? calcDuration(roundedStart, endTime, colCount) : "Ongoing"}
              </span>
              {endTime && <span className="ml-1 text-[10px] text-slate-300 dark:text-[#555]">({roundedStart} {"->"} {toHHMM(endTime)})</span>}
            </span>
            <div className="ml-auto relative">
              {endTime ? (
                <div className="flex items-center gap-2">
                  {resumeSecsLeft > 0 && onResumeCase && (
                    <>
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 whitespace-nowrap">
                        Resumable until {resumeUntilLabel}
                      </span>
                      <button type="button" onClick={onResumeCase}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full border-2 border-amber-500 text-amber-600 dark:text-amber-400 hover:bg-amber-500 hover:text-white dark:hover:bg-amber-600 transition-colors">
                        Resume Case
                      </button>
                    </>
                  )}
                  <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700">
                    Case ended
                  </span>
                </div>
              ) : (
                <>
                  <button type="button"
                    onClick={() => setShowEndPrompt(v => !v)}
                    className="text-xs font-semibold px-4 py-1.5 rounded-full border-2 border-red-400 text-red-500 hover:bg-red-500 hover:text-white dark:border-red-500 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white transition-colors">
                    End Case
                  </button>
                  {showEndPrompt && (
                    <div className="absolute bottom-full right-0 mb-2 z-50 bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-xl p-3 space-y-2 min-w-[160px]">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t("intraop.timetable.endCaseEllipsis")}</p>
                      <button type="button"
                        onClick={() => { setShowEndPrompt(false); setShowEndModal(true) }}
                        className="w-full text-left text-sm font-medium px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors">
                        End now
                      </button>
                      <button type="button"
                        onClick={() => setShowEndPrompt(false)}
                        className="w-full text-left text-sm text-slate-500 dark:text-slate-400 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-[#333] transition-colors">
                        Write manually
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
    {fluidPicker && (
      <FluidPickerPopover
        anchor={fluidPicker.rect}
        search={fpSearch}
        searchPlaceholder={t("intraop.timetable.searchFluid")}
        categories={QUICK_FLUIDS.map(category => ({
          cat: category.cat,
          displayCat: displayGroupName(category.cat),
          color: category.color,
          fluids: category.fluids.map(fluid => ({
            name: fluid.name,
            displayName: displayFluidName(fluid.name),
          })),
        }))}
        onSearchChange={setFpSearch}
        onPick={(fluid, category) => {
          const { ci, rect } = fluidPicker
          setFluidPicker(null)
          openFluidFP(ci, fluid.name, category.cat, rect)
        }}
        onDismiss={() => setFluidPicker(null)}
      />
    )}
    {/* ── Event picker popover ───────────────────────────────────────────────── */}
    {eventPicker && (
      <EventPickerPopover
        anchor={eventPicker.rect}
        search={evSearch}
        categories={CLINICAL_EVENT_CATS.map(category => ({
          cat: category.cat,
          color: category.color,
          displayCat: displayGroupName(category.cat),
          isComplication: category.isComplication ?? false,
          events: category.events.map(event => ({
            label: event.label,
            color: event.color,
            displayLabel: displayEventName(event),
          })),
        }))}
        positions={POSITIONS.map(position => ({
          value: position.v,
          label: position.label,
          displayLabel: displayClinicalCode("option:POSITION", position.v, locale, { label: position.label }),
        }))}
        recordedLabels={new Set((data.clinicalEvents ?? []).filter(e => e.colIdx === eventPicker.ci).map(e => e.label))}
        labels={{
          logClinicalEvent: t("intraop.timetable.logClinicalEvent"),
          searchEvents: t("intraop.timetable.searchEvents"),
          positionChange: t("intraop.timetable.positionChange"),
        }}
        onSearchChange={setEvSearch}
        onToggleEvent={(event, category, recorded) => {
          const ci = eventPicker.ci
          setEventPicker(null)
          if (recorded) removeClinicalEvent(ci, event.label)
          else addClinicalEvent(ci, event.label, event.color, category.isComplication)
        }}
        onPositionChange={position => {
          setEventPicker(null)
          emitLogEvent({ type: "position_change", name: position.label })
        }}
        onDismiss={() => setEventPicker(null)}
      />
    )}
    {/* -- Drug picker portal -- */}
    {drugPicker && (
      <AnchoredPopover
        anchor={drugPicker.rect}
        width={260}
        flipBelowSpace={320}
        onDismiss={() => setDrugPicker(null)}
      >
        {/* Same menu as mobile's DrugSheet: favourites, the eight clinical
            scenarios, then browse the full library. */}
        <ScenarioPicker
          scenarios={BOLUS_SCENARIOS}
          favourites={favouriteDrugs}
          browse={QUICK_DRUGS.map(c => ({ cat: c.cat, color: c.color, items: c.drugs }))}
          displayItem={displayDrugName}
          displayScenario={displayScenarioName}
          displayCategory={displayGroupName}
          onPick={(name, unit) => {
            const { ci, rect } = drugPicker
            setDrugPicker(null)
            openFP(ci, name, unit ?? "mg", rectAnchor(rect), "bolus")
          }}
          labels={{
            favourites: t("intraop.timetable.favourites"),
            browseAll: t("intraop.timetable.browseAllDrugs"),
            search: t("intraop.timetable.searchDrug"),
            empty: t("intraop.timetable.noDrugsFound"),
            favouritesHint: t("intraop.timetable.favouritesHint"),
          }}
        />
      </AnchoredPopover>
    )}
    {infPicker && (
      <AnchoredPopover
        anchor={infPicker.rect}
        width={220}
        flipBelowSpace={320}
        onDismiss={() => setInfPicker(null)}
      >
        {/* Same menu as mobile's InfusionSheet. */}
        <ScenarioPicker
          scenarios={INFUSION_SCENARIOS}
          favourites={favouriteInfusions}
          browse={[{
            cat: "All infusions",
            color: "border-blue-200 text-blue-700 dark:border-blue-800 dark:text-blue-300",
            items: Object.keys(INFUSION_CONFIGS)
              .filter(name => visibleInfusionNames.has(name))
              .sort()
              .map(name => ({ name, unit: INFUSION_CONFIGS[name]?.units[0] })),
          }]}
          displayItem={displayInfusionName}
          displayScenario={displayScenarioName}
          displayCategory={displayGroupName}
          onPick={(name, unit) => {
            const { ci, rect } = infPicker
            setInfPicker(null)
            openFP(ci, name, unit ?? INFUSION_CONFIGS[name]?.units[0] ?? "mg/h", rectAnchor(rect), "infusion")
          }}
          labels={{
            favourites: t("intraop.timetable.favourites"),
            browseAll: t("intraop.timetable.browseAllInfusions"),
            search: t("intraop.timetable.searchInfusion"),
            empty: t("intraop.timetable.noInfusionsFound"),
            favouritesHint: t("intraop.timetable.favouritesHint"),
          }}
        />
      </AnchoredPopover>
    )}
    {/* ── Fluid conflict popover ─────────────────────────────────────────────── */}
    {fluidConflict && (
      <FluidConflictPopover
        conflict={fluidConflict}
        existingEntryMode={(data.fluids ?? []).find(fluid => fluid.id === fluidConflict.existingId)?.fluidEntryMode}
        labels={{
          wasItFinished: t("intraop.timetable.wasItFinished"),
          howMuchInfused: t("intraop.timetable.howMuchInfused"),
        }}
        onDismiss={() => setFluidConflict(null)}
        onRunInParallel={fluidConflictRunInParallel}
        onStopExisting={fluidConflictStopExisting}
        onFinishedAnswer={fluidConflictFinishedAnswer}
        onVolumeInput={value => setFluidConflict(fc => fc && fc.phase === "volume" ? { ...fc, volInput: value } : fc)}
        onConfirmVolume={fluidConflictConfirmVolume}
      />
    )}
    {/* ── Agent popover ──────────────────────────────────────────────────────── */}
    {agentPicker !== null && agentPickerRect && (() => {
      const editing = agents.find(a => a.startCol === agentPicker) ?? null
      return (
        <AgentPopover
          anchor={agentPickerRect}
          editingName={editing?.name ?? null}
          pendingName={pendingAgentName}
          percent={pickerPercent}
          nitrousPercent={pickerN2o}
          agentNames={INH_AGENTS}
          quickPercentsFor={agent => AGENT_QUICK_PERCENTS[agent] ?? []}
          textClassFor={agent => AGENT_STYLE[agent]?.text ?? ""}
          displayAgentName={displayAgentName}
          labels={{
            startAgentHere: t("intraop.timetable.startAgentHere"),
            optional: t("intraop.timetable.optional"),
          }}
          onSelectAgent={agent => {
            setPendingAgentName(agent)
            setPickerPercent(AGENT_QUICK_PERCENTS[agent]?.[0] ?? null)
          }}
          onPercentChange={setPickerPercent}
          onNitrousChange={setPickerN2o}
          onStart={agent => startAgent(agentPicker, agent)}
          onApply={() => editing && updateAgentExtras(editing.startCol)}
          onDismiss={closeAgentPicker}
        />
      )
    })()}
    {gasPicker !== null && gasPickerRect && (() => {
      const editing = gasSettings.find(g => gasPicker >= g.startCol && gasPicker <= g.endCol) ?? null
      return (
        <GasSettingsPopover
          anchor={gasPickerRect}
          isEditing={!!editing}
          fgf={pickerFgf}
          carrierGas={pickerCarrierGas}
          fio2={pickerFio2}
          carrierGasLabel={(value, fallback) => displayClinicalCode("carrierGas", value ?? "o2", locale, { label: fallback })}
          onFgfChange={setPickerFgf}
          onCarrierGasChange={setPickerCarrierGas}
          onFio2Change={setPickerFio2}
          onDismiss={closeGasPicker}
          onApply={() => editing ? applyGasChange(editing.id) : startGas(gasPicker)}
        />
      )
    })()}
    {/* ── Floating prompt portal ─────────────────────────────────────────────── */}
    <DosingFlyout
      fp={fp}
      setFp={setFp}
      doseSurfaces={doseSurfaces}
      times={times}
      isPediatric={isPediatric}
      isBg={isBg}
      ibw={ibw}
      tbw={tbw}
      displayDrugName={displayDrugName}
      displayInfusionName={displayInfusionName}
      displayFluidName={displayFluidName}
      getFluidCategory={getFluidCategory}
      fpCommitBolus={fpCommitBolus}
      fpCommitInfusion={fpCommitInfusion}
      fpCommitFluid={fpCommitFluid}
      clinicalMode={clinicalMode}
      laConcentrations={LA_CONCENTRATIONS}
      infusionWeightBasis={INFUSION_WEIGHT_BASIS}
      pediatricRulesSource={pediatricRulesSource}
      pediatricRulesCachedAt={pediatricRulesCachedAt}
      pediatricRulesLoading={pediatricRulesLoading}
      pediatricRulesError={pediatricRulesError}
    />
    {doseEditDrug && (
      <DoseEditPopover
        anchor={doseEditDrug.rect}
        dose={doseEditDrug.dose}
        unit={doseEditDrug.unit}
        units={["mg", "mcg", "g", "ml", "IU"]}
        title={t("intraop.timetable.changeDose")}
        onDoseChange={dose => setDoseEditDrug(prev => prev ? { ...prev, dose } : null)}
        onUnitChange={unit => setDoseEditDrug(prev => prev ? { ...prev, unit } : null)}
        onApply={() => {
          const next = [...data.drugs]
          next[doseEditDrug.idx] = { ...next[doseEditDrug.idx], dose: doseEditDrug.dose, unit: doseEditDrug.unit }
          onChange({ ...data, drugs: next })
          setDoseEditDrug(null)
        }}
        onDismiss={() => setDoseEditDrug(null)}
      />
    )}
    {/* Infusion context menu */}
    {infMenu && (
      <InfusionMenuPopover
        anchor={infMenu.rect}
        name={displayInfusionName(infMenu.name)}
        color={infMenu.color}
        stopped={!!infMenu.stopped}
        onChangeRate={() => {
          const seg = (data.infusions ?? []).find(i => i.id === infMenu.segId)
          if (!seg) { setInfMenu(null); return }
          const baseDrugName = baseInfusionName(seg.name, seg.concentration)
          const cfg = INFUSION_CONFIGS[baseDrugName] ?? DEFAULT_INF
          const pillCol = infMenu.fromPillCol
          // Editing from a rate-change pill edits that change, not the original.
          const cur = pillCol != null && pillCol !== seg.startCol
            ? (seg.rateChanges ?? []).find(rc => rc.col === pillCol)
              ?? { rate: seg.rate, unit: seg.unit, concentration: seg.concentration }
            : { rate: seg.rate, unit: seg.unit, concentration: seg.concentration }
          setRateDialog({
            segId: seg.id, name: baseDrugName, rate: Number(cur.rate) || 0, unit: cur.unit,
            units: cfg.units, rateMin: cfg.min, rateMax: cfg.max, rateStep: cfg.step,
            color: infMenu.color, rect: infMenu.rect, step: "rate", timeH: "", timeM: "",
            editFromCol: pillCol, concentration: cur.concentration, baseDrugName,
          })
          setInfMenu(null)
        }}
        onDiscontinue={() => {
          setHoverDiscontinue(null)
          extendInfusion(infMenu.segId, nowCol ?? 0, true)
          setInfMenu(null)
        }}
        onRestore={() => { restoreInfusion(infMenu.segId); setInfMenu(null) }}
        onDiscontinueHover={hovering => setHoverDiscontinue(hovering ? infMenu.segId : null)}
        onDismiss={() => setInfMenu(null)}
      />
    )}
    {rateDialog && (
      <RateChangeDialog
        state={rateDialog}
        displayName={displayInfusionName(rateDialog.name)}
        concentrations={LA_CONCENTRATIONS[rateDialog.baseDrugName ?? rateDialog.name]}
        weightBasis={(() => {
          const basis = INFUSION_WEIGHT_BASIS[rateDialog.name]
          if (!basis || !rateDialog.unit?.includes("/kg/")) return null
          return { basis, weightKg: basis === "TBW" ? tbw ?? null : ibw ?? null }
        })()}
        hours={Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))}
        minutes={Array.from(
          { length: 60 / INTRAOP_COLUMN_MINUTES },
          (_, i) => String(i * INTRAOP_COLUMN_MINUTES).padStart(2, "0"),
        )}
        labels={{
          setNewRatePrompt: t("intraop.timetable.setNewRatePrompt"),
          pickRateChangeTime: t("intraop.timetable.pickRateChangeTime"),
          concentration: t("intraop.timetable.concentration"),
        }}
        onPatch={patch => setRateDialog(d => d ? { ...d, ...patch } : d)}
        onApply={() => {
          const col = rateDialog.editFromCol !== undefined ? rateDialog.editFromCol : nowCol ?? 0
          applyInfRateChange(rateDialog.segId, rateDialog.editFromCol ?? null, col, rateDialog.rate, rateDialog.unit, rateDialog.concentration)
          setRateDialog(null)
        }}
        onConfirmTime={() => {
          const changeCol = columnForWallClock({
            time: `${rateDialog.timeH}:${rateDialog.timeM}`,
            caseStart: startTime,
            intervalMinutes: INTERVAL,
            columnCount: colCount,
          })
          applyInfRateChange(rateDialog.segId, null, changeCol, rateDialog.rate, rateDialog.unit, rateDialog.concentration)
          setRateDialog(null)
        }}
        onDismiss={() => setRateDialog(null)}
      />
    )}
    {vitalsPopup && (
      <VitalsPopover
        anchor={vitalsPopup.rect}
        label={vitalsPopup.label}
        unit={vitalsPopup.unit}
        color={vitalsPopup.color}
        converts={vitalsPopup.key === "etco2" ? "etco2" : vitalsPopup.key === "temp" ? "temperature" : null}
        value={data.vitals[vitalsPopup.col]?.[vitalsPopup.key]}
        fallbackValue={vitalsPopup.defaultVal}
        min={vitalsPopup.min}
        max={vitalsPopup.max}
        step={vitalsPopup.step}
        onChange={v => setVital(vitalsPopup.col, vitalsPopup.key, v !== undefined ? String(v) : "")}
        onCommit={() => {
          // Never touched: keep what was on screen. Dismissing is how "same as
          // the last reading" is entered without retyping it.
          if (data.vitals[vitalsPopup.col]?.[vitalsPopup.key] === undefined) {
            setVital(vitalsPopup.col, vitalsPopup.key, String(vitalsPopup.defaultVal))
          }
          setVitalsPopup(null)
        }}
      />
    )}
    {/* Dragging an infusion bar off the left edge deletes it — easy to do by accident. */}
    {deleteInfPrompt && (
      <ConfirmDialog
        title={t("intraop.timetable.deleteInfusionConfirm")}
        detail={t("intraop.timetable.barDraggedOffTimeline")}
        cancelLabel="Cancel"
        confirmLabel="Delete"
        onCancel={() => setDeleteInfPrompt(null)}
        onConfirm={() => { removeInfusion(deleteInfPrompt); setDeleteInfPrompt(null) }}
      />
    )}
    {showEndModal && (
      <EndCaseModal
        agents={agents.filter(a => !a.stopped)}
        infusions={(data.infusions ?? []).filter(i => !i.stopped && true)}
        fluids={(data.fluids ?? []).filter(f => !f.stopped)}
        gasSettings={gasSettings.filter(g => !g.stopped)}
        weightBasis={INFUSION_WEIGHT_BASIS}
        onDismiss={() => setShowEndModal(false)}
        onConfirm={handleEndCaseConfirm}
      />
    )}
    {showHotkeys && <HotkeysModal onClose={() => setShowHotkeys(false)} />}
    {fluidRateDialog && (() => {
      const fluid = (data.fluids ?? []).find(item => item.id === fluidRateDialog.id)
      if (!fluid) return null
      const rect = fluidRateDialog.rect
      const width = Math.min(240, window.innerWidth - 16)
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
      const showAbove = window.innerHeight - rect.bottom < 240
      const top = showAbove ? rect.top - 4 : rect.bottom + 6
      return createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setFluidRateDialog(null)} />
          <div
            className="fixed z-[9999] space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-[#3a3a3a] dark:bg-[#1e1e1e]"
            style={{ left, top, width, transform: showAbove ? "translateY(-100%)" : undefined }}
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">
                {displayFluidName(fluid.name)} · rate
              </p>
              <button type="button" onClick={() => setFluidRateDialog(null)} className="text-slate-300 hover:text-red-400">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <DoseSelector
              accent="cyan"
              value={fluidRateDialog.rate}
              onValueChange={rate => setFluidRateDialog(current => current ? { ...current, rate } : current)}
              valuePlaceholder="Rate"
              min={1}
              max={200}
              step={1}
              unitSuffix="mL/h"
              confirmLabel="Change rate"
              confirmDisabled={!fluidRateDialog.rate || Number(fluidRateDialog.rate) <= 0}
              onConfirm={() => {
                applyFluidRateChange(fluidRateDialog.id, Number(fluidRateDialog.rate))
                setFluidRateDialog(null)
              }}
            />
          </div>
        </>,
        document.body,
      )
    })()}
    {discFluidState && (() => {
      const fluid = (data.fluids ?? []).find(f => f.id === discFluidState.id)
      if (!fluid) return null
      const isRate = fluid.fluidEntryMode === "RATE"
      const bagVol = Number(fluid.bagVolumeMl ?? fluid.volume) || 500
      const curAmt = Number(discFluidState.volInput) || 0
      const rect = discFluidState.rect
      return createPortal(
        <div className="fixed z-50 bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-xl p-3 space-y-2"
          style={{ top: rect.bottom + 6, left: Math.min(rect.right - 200, window.innerWidth - 210), width: 200 }}
          onClick={e => e.stopPropagation()}>
          <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-2">
            {displayFluidName(fluid.name)}{isRate
              ? ` · ${currentFluidRate(fluid) ?? fluid.rate ?? ""} mL/h`
              : bagVol ? ` · ${bagVol} mL bag` : ""}
          </p>
          {isRate ? (
            <div className="space-y-1.5">
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Calculated delivered volume. Replace it with the pump total if needed.
              </p>
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  type="number"
                  min={0}
                  step={1}
                  aria-label="Actual delivered fluid volume"
                  value={discFluidState.volInput}
                  onChange={event => setDiscFluidState(state => state ? { ...state, volInput: event.target.value } : state)}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-xs outline-none focus:border-cyan-400 dark:border-[#3a3a3a] dark:bg-[#2a2a2a]"
                />
                <span className="text-[10px] font-semibold text-slate-400">mL</span>
              </div>
            </div>
          ) : (
            <>
              <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-100 mb-2">{t("intraop.timetable.wasFullBagInfused")}</p>
              <div className="flex gap-2 mb-2">
                <button type="button"
                  onClick={() => setDiscFluidState(s => s ? { ...s, fullBag: true, volInput: String(bagVol) } : s)}
                  className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg border-2 transition-colors ${discFluidState.fullBag === true ? "bg-teal-500 border-teal-500 text-white" : "border-teal-300 dark:border-teal-700 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20"}`}>
                  ✓ Yes · full bag
                </button>
                <button type="button"
                  onClick={() => setDiscFluidState(s => s ? { ...s, fullBag: false, volInput: "0" } : s)}
                  className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg border-2 transition-colors ${discFluidState.fullBag === false ? "bg-amber-500 border-amber-500 text-white" : "border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"}`}>
                  No · partial
                </button>
              </div>
            </>
          )}
          {!isRate && discFluidState.fullBag === false && (
            <div className="space-y-1.5 mb-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">{t("intraop.timetable.amountLabel")}</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={bagVol}
                    step={1}
                    aria-label="Partial bag volume"
                    value={discFluidState.volInput}
                    onChange={event => setDiscFluidState(state => state ? { ...state, volInput: event.target.value } : state)}
                    className="w-16 rounded border border-slate-200 bg-white px-1 py-0.5 text-right text-[11px] font-semibold outline-none focus:border-cyan-400 dark:border-[#3a3a3a] dark:bg-[#2a2a2a]"
                  />
                  <span className="text-[10px] text-slate-400">mL</span>
                </div>
              </div>
              <input type="range" min={0} max={bagVol} step={50}
                value={curAmt}
                onChange={e => setDiscFluidState(s => s ? { ...s, volInput: e.target.value } : s)}
                className="w-full accent-teal-500 cursor-pointer" />
            </div>
          )}
          <div className="flex gap-1.5 justify-end pt-1">
            <button type="button" onClick={() => setDiscFluidState(null)}
              className="text-[10px] text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-[#2a2a2a]">
              Cancel
            </button>
            <button type="button"
              disabled={!isRate && discFluidState.fullBag === null}
              onClick={() => {
                stopFluid(discFluidState.id, curAmt)
                setSel(null)
                setDiscFluidState(null)
              }}
              className="text-[10px] font-bold bg-red-500 text-white px-2.5 py-1 rounded-lg hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed">
              Confirm Discontinue
            </button>
          </div>
        </div>,
        document.body
      )
    })()}
    </>
  )
}
