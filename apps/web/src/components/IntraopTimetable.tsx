"use client"

/* eslint-disable react-hooks/refs */
import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { useLocale, useTranslations } from "next-intl"
import { createPortal } from "react-dom"
import { Plus, X, ChevronDown, ChevronRight } from "lucide-react"
import { NumberStepper } from "@/components/NumberStepper"
import { ConvertedStepper } from "@/components/ConvertedStepper"
import { useOptionLibrary } from "@/hooks/useOptionLibrary"
import { displayClinicalCode, displayGasMix, displayGasSettings, displayNamedOption } from "@/lib/clinical-display"
import { suggestedDoseFromWeights } from "@/lib/dose-calc"
import { addMinutes, floorTo5, timeToMins, toHHMM, calcDuration } from "@/lib/timetable-time"
import { FLUID_CAT_COLOR, computeFluidRows, fluidCategory, fluidColor } from "@/lib/timetable-fluid-rows"
import { POSITIONS } from "@lospor/core/catalog"
import type {
  VitalsEntry, AgentSegment, GasSettingsSegment, TimetableData,
  LogEvent as IntraopLogEvent,
} from "@/types/timetable"
import { EndCaseModal } from "@/components/intraop/EndCaseModal"
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
import { gasSettingsAtColumn } from "@lospor/core/intraop-summary"
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
  autoFillVitalKeys,
  latestVitalColumn,
  normalizeAutoFillVitalsPreferences,
  planAutoFillVitalEvents,
  type AutoFillVitalKey,
  type AutoFillVitalsPreferences,
  type PlannedAutoFilledVitalEvent,
} from "@lospor/core/intraop-vitals"
import type { LogEvent as CoreLogEvent } from "@lospor/core/intraop-types"
import {
  baseProfilesMap,
  concentrationsMap,
  doseCalcMap,
  groupClinicalEvents,
  optionStyleMap,
  quickNumberMap,
  routeProfilesMap,
  routesMap,
  strictRangeMap,
  weightBasisMap,
} from "@lospor/core/option-library"
import { metadataString } from "@lospor/core/option-contracts"

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
const DEFAULT_INF = { units:["mg/hr","mcg/kg/min","ml/hr"], min:0, max:100, step:1, color:"#64748b" }

// ── Types ─────────────────────────────────────────────────────────────────────
// Canonical definitions live in src/types/timetable.ts (shared with the
// server-side projection in src/lib/case-events.ts) — re-exported here so
// every existing "@/components/IntraopTimetable" import site keeps working.
export type {
  VitalsEntry, TimetableDrug, TimetableFluid, AgentSegment,
  TimetableInfusion, ClinicalEvent, GasSettingsSegment, TimetableData,
} from "@/types/timetable"
export type { LogEvent as IntraopLogEvent } from "@/types/timetable"

interface Props { startTime: string; startedAt?: string; endTime?: string; caseStarted?: boolean; monitoring?: Record<string, boolean>; ibw?: number | null; tbw?: number | null; showAgentRow?: boolean; data: TimetableData; onChange: (d: TimetableData) => void; onEndCase?: () => void; onResumeCase?: () => void; onPostopContinued?: (items: string[]) => void; onInfusionTotals?: (totals: { name: string; total: number; unit: string }[]) => void; onComplicationAdded?: (labels: string[]) => void; onLogEvent?: (event: IntraopLogEvent) => void; onLogEventDelete?: (match: { infId?: string; fluidId?: string }) => void }

// ── Helpers ───────────────────────────────────────────────────────────────────
// Pure HH:MM time math lives in src/lib/timetable-time.ts (imported above).

type FConflictAnchor = { top: number; bottom: number; left: number; right: number; width: number }
type FluidConflict =
  | { phase: "choose";   newName: string; newCat: string; newColor: string; newVol: string; newCol: number; existingId: string; existingName: string; anchor: FConflictAnchor }
  | { phase: "finished"; newName: string; newCat: string; newColor: string; newVol: string; newCol: number; existingId: string; anchor: FConflictAnchor }
  | { phase: "volume";   newName: string; newCat: string; newColor: string; newVol: string; newCol: number; existingId: string; volInput: string; anchor: FConflictAnchor }

type VitalLogKey = AutoFillVitalKey | "bgl"
const WEB_AUTOFILL_STORAGE_KEYS = new Set(["autoFillVitals", "autoFillBP", "autoFillBackground"])
const VITAL_LOG_KEYS: VitalLogKey[] = [...autoFillVitalKeys(true), "bgl"]
const VITAL_COPY_KEYS = autoFillVitalKeys(true)

function readWebAutoFillPreferences(): AutoFillVitalsPreferences {
  if (typeof window === "undefined") return normalizeAutoFillVitalsPreferences({})
  return normalizeAutoFillVitalsPreferences({
    enabled: localStorage.getItem("autoFillVitals") === "on",
    includeBloodPressure: localStorage.getItem("autoFillBP") === "on",
    backfillOnReopen: localStorage.getItem("autoFillBackground") === "on",
  })
}

function useWebAutoFillPreferences(): AutoFillVitalsPreferences {
  const [preferences, setPreferences] = useState(readWebAutoFillPreferences)

  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key && !WEB_AUTOFILL_STORAGE_KEYS.has(e.key)) return
      setPreferences(readWebAutoFillPreferences())
    }
    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [])

  return preferences
}

function hasAnyVitalValue(entry: VitalsEntry | undefined): boolean {
  return !!entry && VITAL_LOG_KEYS.some(key => typeof entry[key] === "number")
}

function vitalsToAutoFillLog(vitals: VitalsEntry[] | undefined, chartStart: Date): CoreLogEvent[] {
  const chartStartMs = chartStart.getTime()
  return (vitals ?? []).flatMap((entry, col) => {
    if (!hasAnyVitalValue(entry)) return []
    return [{
      id: `web-vital-${col}`,
      ts: new Date(chartStartMs + col * INTERVAL * 60_000).toISOString(),
      type: "vital",
      ...entry,
    }]
  })
}

function applyAutoFillVitalPlan(
  vitals: VitalsEntry[] | undefined,
  planned: PlannedAutoFilledVitalEvent[],
): { vitals: VitalsEntry[]; filledCols: number[] } {
  const sourceVitals = vitals ?? []
  let nextVitals = sourceVitals
  const filledCols: number[] = []

  for (const plannedEvent of planned) {
    if (nextVitals === sourceVitals) nextVitals = [...sourceVitals]
    while (nextVitals.length <= plannedEvent.col) nextVitals.push({} as VitalsEntry)

    const current = nextVitals[plannedEvent.col] ?? ({} as VitalsEntry)
    let updated = current
    for (const key of VITAL_COPY_KEYS) {
      const value = plannedEvent.event[key]
      if (typeof value !== "number" || current[key] != null) continue
      if (updated === current) updated = { ...current }
      updated[key] = value
    }

    if (updated !== current) {
      nextVitals[plannedEvent.col] = updated
      filledCols.push(plannedEvent.col)
    }
  }

  return { vitals: nextVitals, filledCols }
}

// ── Module-level types ────────────────────────────────────────────────────────
type TtSel = { type: "drug"; idx: number } | { type: "infusion"; id: string } | { type: "fluid"; id: string } | { type: "agent"; startCol: number }
type TtFPMode = "bolus" | "infusion" | "fluid"

// TtSel's `id`/`startCol`/`idx` fields each only exist on 2 of its 4 members
// — these narrow without a cast for spots that key off "is this an
// id-bearing selection" rather than one specific exact type.
function selId(s: TtSel): string | undefined { return s.type === "infusion" || s.type === "fluid" ? s.id : undefined }
function selIdx(s: TtSel): number | undefined { return s.type === "drug" ? s.idx : undefined }

type TtFP = {
  col: number; name: string; unit: string; mode: TtFPMode; dose: string; doseHint: string;
  rate: number; rateUnit: string; rateUnits: string[];
  rateMin: number; rateMax: number; rateStep: number;
  color: string; fluidScale?: "S" | "L";
  concentration?: string   // local anaesthetic solution % (e.g. "0.25%")
  customConc?: string      // user-typed custom % before appending "%"
  quickDoses?: number[]    // bolus quick-dose presets
  quickRates?: number[]    // infusion quick-rate presets
  routes?: string[]        // available routes of administration for this drug
  route?: string           // selected route
  anchor: { top: number; bottom: number; left: number; right: number; width: number };
}

// ── Component ─────────────────────────────────────────────────────────────────
export function IntraopTimetable({ startTime, startedAt, endTime, caseStarted = false, monitoring, ibw, tbw, showAgentRow = false, data, onChange, onEndCase, onResumeCase, onPostopContinued, onInfusionTotals, onComplicationAdded, onLogEvent, onLogEventDelete }: Props) {
  const t = useTranslations()
  const locale = useLocale()
  const trustedStartMs = useMemo(() => {
    if (!startedAt) return null
    const ms = Date.parse(startedAt)
    return Number.isFinite(ms) ? ms : null
  }, [startedAt])
  // Derived (not mutated) from the shared library — see the comment above
  // this component for why these are plain local consts instead of the
  // module-level mutated containers this used to be.
  const { options: drugLibOpts } = useOptionLibrary("INTRAOP_DRUG")
  const { options: fluidLibOpts } = useOptionLibrary("INTRAOP_FLUID")
  const { options: eventLibOpts } = useOptionLibrary("INTRAOP_EVENT")
  const { options: infusionLibOpts } = useOptionLibrary("INTRAOP_INFUSION")
  const { options: agentLibOpts } = useOptionLibrary("INHALATIONAL_AGENT")

  const displayDrugName = useCallback(
    (name: string) => displayNamedOption("INTRAOP_DRUG", drugLibOpts, name, locale),
    [drugLibOpts, locale],
  )
  const displayFluidName = useCallback(
    (name: string) => displayNamedOption("INTRAOP_FLUID", fluidLibOpts, name, locale),
    [fluidLibOpts, locale],
  )
  const displayInfusionName = useCallback(
    (name: string) => displayNamedOption("INTRAOP_INFUSION", infusionLibOpts, name, locale),
    [infusionLibOpts, locale],
  )
  const displayAgentName = useCallback(
    (name: string) => displayNamedOption("INHALATIONAL_AGENT", agentLibOpts, name, locale),
    [agentLibOpts, locale],
  )
  const displayEventName = useCallback(
    (event: { code: string; label: string; labelBg: string | null }) => displayClinicalCode(
      "option:INTRAOP_EVENT",
      event.code,
      locale,
      { label: event.label, labelBg: event.labelBg },
    ),
    [locale],
  )
  const displayGroupName = useCallback(
    (group: string) => displayClinicalCode("optionGroup", group, locale),
    [locale],
  )
  const displayFluidLaneLabel = useCallback((label: string) => {
    const match = label.match(/^(.*) (\d+)$/)
    return match ? `${displayGroupName(match[1])} ${match[2]}` : displayGroupName(label)
  }, [displayGroupName])
  const displayScenarioName = useCallback(
    (group: { key: string; label: string }) => displayClinicalCode(
      "scenarioGroup",
      group.key,
      locale,
      { label: group.label },
    ),
    [locale],
  )

  const { QUICK_DRUGS, BOLUS_DOSES, BOLUS_CONFIGS, LA_CONCENTRATIONS, DRUG_ROUTES, QUICK_DOSES, BOLUS_ROUTE_PROFILES } = useMemo(() => {
    const byGroup = new Map<string, { cat: string; color: string; drugs: { name: string; unit: string }[] }>()
    for (const o of drugLibOpts) {
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

  const { QUICK_FLUIDS, FLUID_QUICK_VOLUMES, FLUID_ROUTES } = useMemo(() => {
    const byGroup = new Map<string, { cat: string; color: string; fluids: { name: string }[] }>()
    for (const o of fluidLibOpts) {
      const cat = o.group ?? "Other"
      if (!byGroup.has(cat)) byGroup.set(cat, { cat, color: o.color ?? "", fluids: [] })
      byGroup.get(cat)!.fluids.push({ name: o.label })
    }
    return {
      QUICK_FLUIDS: [...byGroup.values()],
      FLUID_QUICK_VOLUMES: quickNumberMap(fluidLibOpts),
      FLUID_ROUTES: routesMap(fluidLibOpts),
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
    return {
      INFUSION_CONFIGS: configs,
      INFUSION_WEIGHT_BASIS: weightBasisMap(infusionLibOpts),
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

  // Thin wrapper over the shared pure dosing logic (src/lib/dose-calc.ts).
  // Per-route override (Ketamine IV/IM/IN/PO, Lidocaine IV) takes priority;
  // IBW basis is capped at the patient's actual weight inside the helper.
  function calcSuggestedDose(name: string, ibw: number | null, tbw: number | null, route?: string): { dose: string; hint: string } {
    return suggestedDoseFromWeights(BOLUS_DOSES[name], route, ibw, tbw)
  }

  function bolusRange(name: string, unit: string) {
    if (BOLUS_CONFIGS[name]) return BOLUS_CONFIGS[name]
    if (unit === "mcg") return { min:0, max:2000, step:10 }
    if (unit === "g")   return { min:0, max:10,   step:0.5 }
    if (unit === "ml")  return { min:0, max:100,  step:1 }
    if (unit === "IU")  return { min:0, max:200,  step:5 }
    return { min:0, max:500, step:5 }
  }

  // Resolve the effective per-route surface for a drug/infusion, merging the
  // route's profile (if any) over the flat fields. Returns undefined when the
  // drug has no routeModes so callers fall back to their flat lookups.
  function bolusRouteSurface(name: string, route?: string) {
    return route ? BOLUS_ROUTE_PROFILES[name]?.[route] : undefined
  }
  function infusionRouteSurface(name: string, route?: string) {
    return route ? INFUSION_ROUTE_PROFILES[name]?.[route] : undefined
  }

  const [colCount, setColCount]           = useState(ROW_COLS)  // start with 1 row
  const [chartOpen, setChartOpen]         = useState(() => typeof window !== "undefined" && localStorage.getItem("vitalsExpanded") !== "false")
  const [dragOver, setDragOver]           = useState<number | null>(null)
  // Extending an infusion segment
  // Whole-bar drag
  const [movingInf, setMovingInf]         = useState<{ id: string; origStart: number; origEnd: number; fromCol: number } | null>(null)
  const [movingInfCol, setMovingInfCol]   = useState<number | null>(null)
  // Rate-pill drag
  const [movingRatePill, setMovingRatePill]       = useState<{ infId: string; fromCol: number; rate: number; unit: string } | null>(null)
  const [, setMovingRatePillCol] = useState<number | null>(null)
  // Misc infusion UI state
  const [deleteInfPrompt, setDeleteInfPrompt] = useState<string | null>(null)
  const [hoverDiscontinue, setHoverDiscontinue] = useState<string | null>(null)
  // Right-grip (extend endCol) and left-grip (extend startCol backward)
  const [extendingInf, setExtendingInf]         = useState<string | null>(null)
  const [extInfHover, setExtInfHover]           = useState<number | null>(null)
  const [extendingInfLeft, setExtendingInfLeft] = useState<string | null>(null)
  const [extInfLeftHover, setExtInfLeftHover]   = useState<number | null>(null)
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
  const [discFluidState, setDiscFluidState] = useState<{ id: string; volInput: string; rect: DOMRect; fullBag: boolean | null } | null>(null)
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
  function uid(): string {
    return typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, "0")).join("")
  }
  function emitLogEvent(partial: Omit<IntraopLogEvent, "id" | "ts"> & { ts?: string }) {
    // Callers may pin the event to a specific column time (vitals) — the
    // default "now" only applies when no ts is provided.
    onLogEventRef.current?.({ id: uid(), ts: new Date().toISOString(), ...partial })
  }

  function openFP(col: number, name: string, unit: string, anchorEl: Element, mode: "bolus" | "infusion") {
    const r    = anchorEl.getBoundingClientRect()
    const cfg  = INFUSION_CONFIGS[name]
    const routes = mode === "infusion" ? (INFUSION_ROUTES[name] ?? ["IV"]) : (DRUG_ROUTES[name] ?? ["IV"])
    const route0 = routes[0]
    const sugg = calcSuggestedDose(name, ibw ?? null, tbw ?? null, route0)
    // Per-route surfaces let route-varying drugs (Lidocaine etc.) open on the
    // first route's correct unit/range/concentration instead of flat defaults.
    const isurf = mode === "infusion" ? infusionRouteSurface(name, route0) : undefined
    const bsurf = mode === "bolus" ? bolusRouteSurface(name, route0) : undefined
    setFp({ col, name,
      unit: bsurf?.unit ?? unit,
      mode,
      dose: sugg.dose, doseHint: sugg.hint,
      rate: isurf?.suggestedRate ?? cfg?.suggestedRate ?? isurf?.min ?? cfg?.min ?? 0,
      rateUnit: isurf?.unit ?? cfg?.units[0] ?? "mg/hr",
      rateUnits: isurf ? [isurf.unit] : cfg?.units ?? DEFAULT_INF.units,
      rateMin: isurf?.min ?? cfg?.min ?? DEFAULT_INF.min, rateMax: isurf?.max ?? cfg?.max ?? DEFAULT_INF.max, rateStep: isurf?.step ?? cfg?.step ?? DEFAULT_INF.step,
      color: cfg?.color ?? DEFAULT_INF.color,
      concentration: isurf?.suggestedConcentration,
      quickDoses: bsurf?.quickValues ?? QUICK_DOSES[name], quickRates: isurf?.quickValues ?? QUICK_RATES[name],
      routes, route: route0,
      anchor: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width },
    })
  }
  function fpCommitBolus() {
    if (!fp) return
    const cfg    = BOLUS_DOSES[fp.name]
    const active = fp.route ? cfg?.byRoute?.[fp.route] : undefined
    const rt     = active?.roundTo ?? cfg?.roundTo ?? 1
    const rawDose = Number(fp.dose)
    const dose = rt > 1 && fp.dose !== "" && !isNaN(rawDose)
      ? String(Math.round(rawDose / rt) * rt)
      : fp.dose
    // Coded identity (drugId/atcCode/inn) comes from the matching catalog
    // row when the library has it — currently empty, so these are
    // undefined today, but the field flows all the way through to the
    // chart/cache/export once the drug library is populated.
    const lib = drugLibOpts.find(o => o.label === fp.name)
    onChange({ ...data, drugs: [...data.drugs, { colIdx: fp.col, name: fp.name, dose, unit: fp.unit, drugId: lib?.drugId ?? undefined, atcCode: lib?.atcCode ?? undefined, inn: lib?.inn ?? undefined, route: fp.route }] })
    emitLogEvent({ type: "drug", name: fp.name, dose, unit: fp.unit, drugRoute: fp.route, drugId: lib?.drugId ?? undefined, atcCode: lib?.atcCode ?? undefined, inn: lib?.inn ?? undefined })
    setFp(null)
  }
  function addFluidDirect(name: string, cat: string, vol: string, col: number) {
    const color = FLUID_CAT_COLOR[cat] ?? getFluidColor(name)
    const id = `${name}-${col}-${uid()}`
    const d = dataRef.current
    onChangeRef.current({ ...d, fluids: [...(d.fluids ?? []), { id, name, category: cat, volume: vol, color, startCol: col, endCol: col }] })
    emitLogEvent({ type: "fluid_start", fluidId: id, name, category: cat, volume: vol, color })
  }
  function checkFluidConflict(name: string, vol: string, col: number, anchor: FConflictAnchor): boolean {
    const cat = getFluidCategory(name)
    const existing = (dataRef.current.fluids ?? []).find(f =>
      (f.category ?? getFluidCategory(f.name)) === cat && f.startCol <= col && f.endCol >= col
    )
    if (!existing) return false
    setFluidConflict({ phase: "choose", newName: name, newCat: cat, newColor: FLUID_CAT_COLOR[cat] ?? getFluidColor(name), newVol: vol, newCol: col, existingId: existing.id, existingName: existing.name, anchor })
    return true
  }
  function fpCommitFluid() {
    if (!fp) return
    const anchor = fp.anchor
    const conflict = checkFluidConflict(fp.name, fp.dose, fp.col, anchor)
    setFp(null)
    if (!conflict) addFluidDirect(fp.name, getFluidCategory(fp.name), fp.dose, fp.col)
  }
  function fpCommitInfusion() {
    if (!fp) return
    const cfg  = INFUSION_CONFIGS[fp.name] ?? DEFAULT_INF
    const conc = fp.concentration ? ` ${fp.concentration}` : ""
    const displayName = fp.name + conc
    const id   = `${fp.name}-${fp.col}-${uid()}`
    const lib = infusionLibOpts.find(o => o.label === fp.name)
    onChange({ ...data, infusions: [...(data.infusions??[]), { id, name:displayName, rate:fp.rate, unit:fp.rateUnit, startCol:fp.col, endCol:fp.col, color:cfg.color, concentration: fp.concentration, route: fp.route, drugId: lib?.drugId ?? undefined, atcCode: lib?.atcCode ?? undefined, inn: lib?.inn ?? undefined }] })
    emitLogEvent({ type: "infusion_start", infId: id, name: displayName, rate: String(fp.rate), unit: fp.rateUnit, color: cfg.color, drugRoute: fp.route, drugId: lib?.drugId ?? undefined, atcCode: lib?.atcCode ?? undefined, inn: lib?.inn ?? undefined })
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

  const tsForCol = useCallback((col: number): string | null => {
    if (trustedStartMs === null) return null
    return new Date(trustedStartMs + col * INTERVAL * 60_000).toISOString()
  }, [trustedStartMs])

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
  }, [tsForCol, dataRef])

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
  }, [sel, colCount])

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
    if (trustedStartMs === null) return
    const now = new Date()
    const chartStart = new Date(trustedStartMs)
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
  }, [caseStarted, rawOnChangeRef, trustedStartMs, autoFillPreferences])

  // ── Live clock: advance selectedCol + pixel offset every 10 s ──────────────
  useEffect(() => {
    if (!caseStarted) return          // case not started — don't run clock
    function tick() {
      if (endTimeRef.current) return  // case ended — stop the clock
      const now = new Date()
      const diffSecs = trustedStartMs === null
        ? null
        : Math.floor((now.getTime() - trustedStartMs) / 1000)
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
          const chartStartMs = trustedStartMs
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
  }, [trustedStartMs, caseStarted, autoFillPreferences])

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
  const [fluidDragOver, setFluidDragOver]   = useState<number | null>(null)
  const [extendingFluid, setExtendingFluid] = useState<string | null>(null)
  const [extFluidHover, setExtFluidHover]   = useState<number | null>(null)
  const [fluidConflict, setFluidConflict]   = useState<FluidConflict | null>(null)
  // Drag-to-extend state: startCol of segment being extended
  const [extendingAgent, setExtendingAgent]   = useState<number | null>(null)
  const [extendHoverCol, setExtendHoverCol]   = useState<number | null>(null)

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

  // ── Fluids ──────────────────────────────────────────────────────────────────
  const { removeFluid, extendFluid, resumeFluid, continueFluid } =
    useFluidHandlers(data, onChange, dataRef, onChangeRef, onLogEventDeleteRef, emitLogEvent, nowCol)

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
    discontinuedFluidWithAmounts: { id: string; amount: number; category: string }[]
    discontinuedGasIds: string[]
  }) {
    const col = nowCol ?? 0
    // One combined read + one combined write avoids stale-closure overwrites when
    // multiple item types (agent + infusion + fluid) are discontinued together.
    const d = dataRef.current
    const discontinuedAgentSet = new Set(result.discontinuedAgentCols)
    const discontinuedInfSet   = new Set(result.discontinuedInfusionIds)
    const discontinuedGasSet   = new Set(result.discontinuedGasIds)
    const amtById: Record<string, number> = Object.fromEntries(
      result.discontinuedFluidWithAmounts.map(f => [f.id, f.amount])
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
      fluids: (d.fluids ?? []).map(f =>
        Object.prototype.hasOwnProperty.call(amtById, f.id)
          ? { ...f, endCol: Math.max(col, f.startCol), stopped: true as const, volume: String(amtById[f.id]) }
          : f
      ),
      gasSettings: (d.gasSettings ?? []).map(g =>
        discontinuedGasSet.has(g.id)
          ? { ...g, endCol: col, stopped: true as const }
          : g
      ),
    })
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
    setExtendingAgent(startCol)
  }
  function onAgentCellDragOver(e: React.DragEvent, col: number) {
    if (extendingAgent === null) return
    e.preventDefault()
    e.stopPropagation()
    if (col >= extendingAgent) setExtendHoverCol(col)
    else setExtendHoverCol(extendingAgent) // retract to minimum = startCol
  }
  function onAgentCellDrop(e: React.DragEvent, col: number) {
    if (extendingAgent === null) return
    e.preventDefault()
    const startCol = parseInt(e.dataTransfer.getData("extend-agent"))
    if (isNaN(startCol)) return
    extendSegment(startCol, Math.max(col, startCol))
    setExtendingAgent(null); setExtendHoverCol(null)
  }
  function onAgentDragEnd() { setExtendingAgent(null); setExtendHoverCol(null) }

  // ── Drug/fluid drag ──────────────────────────────────────────────────────────
  function onDrugDragOver(e: React.DragEvent, col: number)  { if (e.dataTransfer.types.includes("ext-inf") || e.dataTransfer.types.includes("ext-fluid") || e.dataTransfer.types.includes("extend-agent")) return; e.preventDefault(); setDragOver(col) }
  function onDrugDrop(e: React.DragEvent, col: number) {
    e.preventDefault(); setDragOver(null)
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
    e.preventDefault(); setFluidDragOver(null)
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
    const conflict = checkFluidConflict(name, "", col, anchor)
    if (!conflict) addFluidDirect(name, getFluidCategory(name), "", col)
  }

  const [showEndPrompt, setShowEndPrompt] = useState(false)

  // ── Shared styles ─────────────────────────────────────────────────────────────
  const cellCls     = "w-full text-center text-sm font-mono bg-white/60 dark:bg-transparent outline-none focus:bg-blue-50 dark:focus:bg-blue-900/30 rounded transition-colors py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-slate-700 dark:text-[#d0d0d0]"
  const rowLabelCls = "text-xs font-semibold text-slate-400 dark:text-[#888] uppercase tracking-wide text-right pr-2 leading-none select-none"

  // ── Per-row renderer ──────────────────────────────────────────────────────────
  function renderRow(rowIdx: number, overrideColStart?: number, overrideColEnd?: number) {
    const colStart    = overrideColStart ?? rowIdx * ROW_COLS
    const colEnd      = overrideColEnd   ?? Math.min(colStart + ROW_COLS, colCount)
    const rowCols     = Array.from({ length: colEnd - colStart }, (_, i) => colStart + i)
    const isActiveRow = overrideColStart !== undefined
      ? nowCol !== null
      : nowCol !== null ? rowIdx === Math.floor(nowCol / ROW_COLS) : rowIdx === Math.ceil(colCount / ROW_COLS) - 1
    const rowW        = LABEL_W + rowCols.length * colW
    // Scale nowOffsetPx (stored in COL_W units) to dynamic colW units for display
    // Stop the live line once the case has ended (endTime is set)
    const rowNowPx = isActiveRow && nowOffsetPx !== null && !endTime ? (nowOffsetPx - colStart * COL_W) * colW / COL_W : null

    // Post-case overlay: pixel offset of the end boundary within this row
    // null  = entire row is pre-end (no overlay)
    // 0     = entire row is post-end (overlay covers everything)
    const rowEndOverlayLeft = endCol === null ? null
      : endCol < colStart ? 0                             // whole row is post-end
      : endCol < colEnd   ? (endCol - colStart + 1) * colW // partial — from boundary right
      : null                                              // whole row is pre-end

    // ── bar continuation helpers ──────────────────────────────────────────────
    function barContinues(endCol: number) { return endCol >= colEnd }
    function barEntries(startCol: number) { return startCol < colStart }

    // ── per-bar edge classes & grip visibility ────────────────────────────────
    // isVisualStart = this cell is the first visible cell of the bar (actual start OR first in row)
    function leftCls(isVisualStart: boolean) {
      return isVisualStart ? "left-1 border-l rounded-l-full" : "left-0"
    }
    function rightCls(endCol: number, isActualEnd: boolean) {
      return (isActualEnd && !barContinues(endCol)) ? "right-3 border-r rounded-r-sm" : "right-0 border-r-0"
    }
    function showGrip(endCol: number, isActualEnd: boolean, isDragPreview: boolean) {
      return isActualEnd && !barContinues(endCol) && !isDragPreview
    }

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

          {/* Vital rows */}
          {activeRows.length === 0 && rowIdx === 0 && (
            <div className="flex items-center border-b border-slate-50 dark:border-[#222] py-2">
              <div style={{ width: LABEL_W, minWidth: LABEL_W }} className={rowLabelCls + " py-2"} />
              <span className="text-[10px] text-slate-300 dark:text-[#555] italic px-3">{t("intraop.timetable.selectMonitoringToPopulate")}</span>
            </div>
          )}
          {activeRows.map((row, ri) => (
            <div key={row.key} className={`flex items-center border-b border-slate-50 dark:border-[#222] ${ri % 2 === 1 ? "bg-slate-50/40 dark:bg-[#1a1a1a]/60" : ""}`}>
              <div style={{ width: LABEL_W, minWidth: LABEL_W, position: "sticky", left: 0, zIndex: 2, backgroundColor: "inherit", borderLeft: `3px solid ${row.color}` }}
                className="flex flex-col items-end justify-center pr-2 py-1.5 gap-0 select-none bg-white dark:bg-[#1c1c1c]">
                <span className="text-xs font-semibold uppercase tracking-wide leading-tight" style={{ color: row.color }}>{row.label}</span>
                <span className="text-[10px] text-slate-300 dark:text-[#555] leading-tight">({row.unit})</span>
              </div>
              {rowCols.map(ci => (
                <div key={ci} style={{ width: colW, minWidth: colW, borderLeft: `1px solid ${row.color}20` }} className="px-1 py-1.5">
                  <input type="number" tabIndex={-1} min={row.min} max={row.max} placeholder="."
                    value={data.vitals[ci]?.[row.key] ?? ""}
                    onChange={e => setVital(ci, row.key, e.target.value)}
                    ref={el => { const k = `${ci}-${row.key}`; if (el) vitalsInputRefs.current.set(k, el); else vitalsInputRefs.current.delete(k) }}
                    onDoubleClick={e => { e.stopPropagation(); setVitalsPopup({ col: ci, key: row.key, min: row.min, max: row.max, step: row.step, defaultVal: lastVitalBefore(ci, row.key) ?? row.defaultVal, label: row.label, unit: row.unit, color: row.color, rect: e.currentTarget.getBoundingClientRect() }) }}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        setVitalsPopup({ col: ci, key: row.key, min: row.min, max: row.max, step: row.step, defaultVal: lastVitalBefore(ci, row.key) ?? row.defaultVal, label: row.label, unit: row.unit, color: row.color, rect: e.currentTarget.getBoundingClientRect() })
                        return
                      }
                      if (e.key !== "Tab") return
                      e.preventDefault()
                      const ri = activeRows.findIndex(r => r.key === row.key)
                      if (ri < activeRows.length - 1) {
                        vitalsInputRefs.current.get(`${ci}-${activeRows[ri + 1].key}`)?.focus()
                      } else {
                        const nextCi = ci + 1
                        if (nextCi < colCount) vitalsInputRefs.current.get(`${nextCi}-${activeRows[0].key}`)?.focus()
                      }
                    }}
                    className={cellCls} />
                </div>
              ))}
            </div>
          ))}

          {/* Time header */}
          <div className="flex border-b border-slate-100 dark:border-[#2a2a2a] bg-slate-50 dark:bg-[#1a1a1a]">
            <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="text-[10px] text-slate-300 dark:text-[#555] px-2 py-1.5 text-right">{t("intraop.timetable.time")}</div>
            {rowCols.map(ci => {
              const isPostEnd = endCol !== null && ci > endCol
              return (
              <div key={ci} style={{ width: colW, minWidth: colW }}
                onClick={() => { if (!isPostEnd) setSelectedCol(ci) }}
                className={`relative text-xs font-mono font-semibold text-center py-2 border-l border-slate-100 dark:border-[#2a2a2a] transition-colors select-none ${
                  isPostEnd
                    ? "text-slate-300 dark:text-[#444] bg-slate-50 dark:bg-[#111] cursor-default"
                    : selectedCol === ci
                      ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 cursor-pointer"
                      : "text-slate-500 dark:text-[#888] hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 cursor-pointer"
                }`}>
                {times[ci]}
                {isActiveRow && nowCol === ci && !endTime && (
                  <span className="absolute top-0.5 right-0.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
                  </span>
                )}
                {!isPostEnd && selectedCol === ci && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400" />}
              </div>
              )
            })}
          </div>

          {/* Agent row */}
          {showAgentRow && (() => {
            return (
              <div className="flex items-stretch border-b border-slate-200 dark:border-[#2e2e2e] bg-slate-50/60 dark:bg-[#1a1a1a]/60 relative" style={{ minHeight: 32 }}>
                <div style={{ width: LABEL_W, minWidth: LABEL_W }} className={rowLabelCls + " flex items-center justify-end py-2"}>{t("intraop.timetable.inhAgent")}</div>
                {rowCols.map(ci => {
                  const committedSeg = segmentAt(ci)
                  const draggingSeg = (() => {
                    if (extendingAgent === null || extendHoverCol === null) return null
                    const s = agents.find(a => a.startCol === extendingAgent)
                    if (!s) return null
                    return (ci > s.endCol && ci <= extendHoverCol) ? s : null
                  })()
                  const seg           = committedSeg ?? draggingSeg
                  const isDragPreview = !committedSeg && !!draggingSeg
                  const style2        = seg ? (AGENT_STYLE[seg.name] ?? AGENT_STYLE["Sevoflurane"]) : null
                  const isStart       = seg?.startCol === ci
                  const effectiveEnd  = seg && extendingAgent === seg.startCol && extendHoverCol !== null ? extendHoverCol : (seg?.endCol ?? -1)
                  const isEnd         = seg !== null && ci === effectiveEnd
                  const isRowCont     = !isStart && seg != null && ci === colStart && barEntries(seg.startCol)
                  const isRowExit     = seg != null && barContinues(seg.endCol) && ci === colEnd - 1
                  const visStart      = Math.max(seg?.startCol ?? 0, colStart)
                  const visEnd        = Math.min(effectiveEnd, colEnd - 1)

                  return (
                    <div key={ci} style={{ width: colW, minWidth: colW }}
                      data-agent-cell
                      className="group relative border-l border-slate-100 dark:border-[#2a2a2a] flex items-center"
                      onDragOver={e => onAgentCellDragOver(e, ci)}
                      onDrop={e => onAgentCellDrop(e, ci)}
                      onClick={e => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        if (seg && isStart) openPickerForSeg(ci, seg, rect)
                        else if (!seg) openPickerEmpty(ci, rect)
                      }}>
                      {!seg && <span className="w-full text-center text-[10px] text-slate-300 dark:text-[#444] select-none pointer-events-none">choose</span>}
                      {seg && style2 && (() => {
                        const isAgentSel = sel?.type === "agent" && sel.startCol === seg.startCol
                        const label = (isStart || isRowCont) ? [displayAgentName(seg.name), seg.n2o != null ? `+ N2O ${seg.n2o}%` : null].filter(Boolean).join(" ") : null
                        return (
                          <>
                            <div
                              onClick={e => { e.stopPropagation(); const rect = (e.currentTarget as HTMLElement).closest("[data-agent-cell]")?.getBoundingClientRect() ?? (e.currentTarget as HTMLElement).getBoundingClientRect(); setSel({ type:"agent", startCol: seg.startCol }); if (isStart) openPickerForSeg(ci, seg, rect) }}
                              onDoubleClick={e => { e.stopPropagation(); if (seg.stopped) resumeSegment(seg.startCol) }}
                              title={seg.stopped ? "Double-click to resume" : undefined}
                              className={`absolute inset-y-1 border-y cursor-pointer transition-all ${style2.bar} ${leftCls(isStart || isRowCont)} ${rightCls(seg.endCol, isEnd)} ${isDragPreview ? "opacity-60" : ""} ${isAgentSel ? "brightness-125 ring-1 ring-inset ring-white/40" : ""} ${seg.stopped ? "opacity-60 border-dashed" : ""}`}
                            />
                            {label && (
                              <span className={`absolute top-1/2 -translate-y-1/2 z-10 pointer-events-none select-none text-xs font-bold whitespace-nowrap flex items-center justify-center ${style2.text}`}
                                style={{ left: 0, width: (visEnd - visStart + 1) * colW }}>
                                {label}
                              </span>
                            )}
                          </>
                        )
                      })()}
                      {showGrip(seg?.endCol ?? -1, isEnd, isDragPreview) && style2 && seg && !seg.stopped && (
                        <div draggable onDragStart={e => { e.stopPropagation(); onGripDragStart(e, seg.startCol) }} onDragEnd={onAgentDragEnd}
                          className={`absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10 ${style2.grip} opacity-70 hover:opacity-100 rounded-r-sm`}>
                          <span className="text-white text-[8px] font-bold select-none">|</span>
                        </div>
                      )}
                      {isEnd && !isRowExit && sel?.type === "agent" && sel.startCol === seg?.startCol && seg && !seg.stopped && !isDragPreview && (
                        <div className="absolute z-30 flex items-center gap-1" style={{ top: 2, right: 14 }}>
                          {discConfirmId === `agent-${seg.startCol}` ? (
                            <>
                              <button type="button"
                                onClick={e => { e.stopPropagation(); extendSegment(seg.startCol, nowCol ?? seg.endCol, true); setSel(null); setDiscConfirmId(null) }}
                                className="text-[8px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full hover:bg-red-600 border border-white/40 whitespace-nowrap">
                                ✓ Confirm
                              </button>
                              <button type="button"
                                onClick={e => { e.stopPropagation(); setDiscConfirmId(null) }}
                                className="text-[8px] text-white/70 hover:text-white px-1 whitespace-nowrap">
                                ✕
                              </button>
                            </>
                          ) : (
                            <button type="button"
                              onClick={e => { e.stopPropagation(); setDiscConfirmId(`agent-${seg.startCol}`) }}
                              className="text-[8px] font-semibold bg-black/30 text-white px-1.5 py-0.5 rounded-full border border-white/30 hover:bg-red-500/80 whitespace-nowrap">
                              ✕ Disc
                            </button>
                          )}
                        </div>
                      )}
                      {isStart && seg && (
                        <button type="button" onClick={e => { e.stopPropagation(); removeSegment(seg.startCol) }}
                          className="absolute top-0.5 right-3 z-10 opacity-0 hover:opacity-100 [@media(hover:none)]:opacity-100 text-slate-400 hover:text-red-500 transition-opacity">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      )}
                      {!seg && !isDragPreview && (() => {
                        const stoppedAgent = agents.find(a => a.stopped && a.endCol < ci)
                        return stoppedAgent ? (
                          <button type="button"
                            onClick={e => { e.stopPropagation(); continueAgent(stoppedAgent, ci) }}
                            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer">
                            <span className="text-[9px] font-bold text-emerald-500 dark:text-emerald-400 bg-white/80 dark:bg-black/40 px-1.5 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700 whitespace-nowrap">
                              Continue?
                            </span>
                          </button>
                        ) : null
                      })()}
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* Gas settings row — FGF / carrier gas / FiO2. Visible whenever the
              agent row is (same gating: GA technique selected), but starts
              empty/unstarted until manually tapped. */}
          {showAgentRow && (
            <div className="flex items-stretch border-b border-slate-200 dark:border-[#2e2e2e] bg-slate-50/40 dark:bg-[#1a1a1a]/40 relative" style={{ minHeight: 32 }}>
              <div style={{ width: LABEL_W, minWidth: LABEL_W }} className={rowLabelCls + " flex items-center justify-end py-2"}>Gas Settings</div>
              {rowCols.map(ci => {
                const seg     = gasSegmentAt(ci)
                const isStart = seg?.startCol === ci
                const isEnd   = seg !== null && ci === seg.endCol
                const isRowCont = !isStart && seg != null && ci === colStart && seg.startCol < colStart
                const isRowExit = seg != null && barContinues(seg.endCol) && ci === colEnd - 1 && !isEnd
                const settings = seg ? gasSettingsAtColumn(seg, ci) : null
                const isChange = settings?.changeCol === ci
                const showSettingsLabel = Boolean(settings && (isStart || isRowCont || isChange))
                return (
                  <div key={ci} style={{ width: colW, minWidth: colW }}
                    className="group relative border-l border-slate-100 dark:border-[#2a2a2a] flex items-center cursor-pointer"
                    onClick={e => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      if (seg) openGasPickerForSeg(ci, seg, rect)
                      else if (!seg) openGasPickerEmpty(ci, rect)
                    }}>
                    {!seg && <span className="w-full text-center text-[10px] text-slate-300 dark:text-[#444] select-none pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">tap to start</span>}
                    {seg && (
                      <div className={`absolute inset-y-1 border-y bg-indigo-200/50 dark:bg-indigo-500/20 border-indigo-400 dark:border-indigo-500 ${leftCls(isStart || isRowCont)} ${rightCls(seg.endCol, isEnd && !isRowExit)} ${seg.stopped ? "opacity-50 border-dashed" : ""}`} />
                    )}
                    {showSettingsLabel && settings && (
                      <span
                        title={displayGasSettings(settings, locale)}
                        className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-10 pointer-events-none select-none flex flex-col items-center justify-center text-[9px] font-bold leading-tight whitespace-nowrap text-indigo-700 dark:text-indigo-300 overflow-hidden px-0.5"
                      >
                        <span>FGF {settings.fgf} L/min</span>
                        <span className="text-[8px]">{displayGasMix(settings, locale)}</span>
                      </span>
                    )}
                    {isEnd && seg && !seg.stopped && (
                      <div className="absolute z-30 flex items-center gap-1" style={{ top: 2, right: 2 }}>
                        {discConfirmId === `gas-${seg.startCol}` ? (
                          <>
                            <button type="button"
                              onClick={e => { e.stopPropagation(); stopGas(seg.id, nowCol); setDiscConfirmId(null) }}
                              className="text-[8px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full hover:bg-red-600 border border-white/40 whitespace-nowrap">
                              ✓ Confirm
                            </button>
                            <button type="button"
                              onClick={e => { e.stopPropagation(); setDiscConfirmId(null) }}
                              className="text-[8px] text-white/70 hover:text-white px-1 whitespace-nowrap">
                              ✕
                            </button>
                          </>
                        ) : (
                          <button type="button"
                            onClick={e => { e.stopPropagation(); setDiscConfirmId(`gas-${seg.startCol}`) }}
                            className="text-[8px] font-semibold bg-black/30 text-white px-1.5 py-0.5 rounded-full border border-white/30 hover:bg-red-500/80 whitespace-nowrap">
                            ✕ Disc
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Clinical Events row */}
          {(() => {
            const colEvents = rowCols.map(ci => (data.clinicalEvents ?? []).filter(e => e.colIdx === ci))
            return (
              <div className="flex items-stretch border-b border-slate-100 dark:border-[#2a2a2a] bg-slate-50/20 dark:bg-[#181818]/40" style={{ minHeight: 34 }}>
                <div style={{ width: LABEL_W, minWidth: LABEL_W }} className={rowLabelCls + " flex items-center justify-end py-1.5"}>{t("intraop.timetable.events")}</div>
                {rowCols.map((ci, lIdx) => {
                  const evs = colEvents[lIdx]
                  return (
                    <div key={ci} style={{ width: colW, minWidth: colW }}
                      className="group border-l border-slate-100 dark:border-[#2a2a2a] relative flex flex-col items-center justify-start py-0.5 px-0.5 cursor-pointer hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10 transition-colors"
                      onClick={e => { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setEventPicker({ ci, rect }); setEvSearch("") }}>
                      {evs.length === 0 && (
                        <Plus className="h-2.5 w-2.5 opacity-0 group-hover:opacity-30 transition-opacity text-slate-400 dark:text-[#666] mt-1.5" />
                      )}
                      <div className="flex flex-col items-start gap-0.5 w-full">
                        {evs.slice(0, 5).map(ev => (
                          <div key={ev.label} title={displayNamedOption("INTRAOP_EVENT", eventLibOpts, ev.label, locale)}
                            onClick={e => { e.stopPropagation(); removeClinicalEvent(ci, ev.label) }}
                            className="flex items-center rounded-full px-1 py-px cursor-pointer hover:opacity-60 transition-opacity select-none w-full min-w-0"
                            style={{ backgroundColor: ev.color + "20", color: ev.color, border: `1px solid ${ev.color}40` }}>
                            <span className="text-[8px] font-bold truncate leading-tight">{displayNamedOption("INTRAOP_EVENT", eventLibOpts, ev.label, locale)}</span>
                          </div>
                        ))}
                        {evs.length > 5 && (
                          <span className="text-[8px] text-slate-400 dark:text-[#666] font-medium px-0.5">+{evs.length - 5}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* Drug row */}
          <div className="flex min-h-[64px] border-t border-slate-100 dark:border-[#2a2a2a]">
            <div style={{ width: LABEL_W, minWidth: LABEL_W }} className={rowLabelCls + " py-3 flex items-start justify-end"}>{t("intraop.timetable.drugs")}</div>
            {rowCols.map(ci => {
              const colDrugs = data.drugs.filter(d => d.colIdx === ci)
              return (
                <div key={ci} style={{ width: colW, minWidth: colW }}
                  onDragOver={e => onDrugDragOver(e, ci)}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => onDrugDrop(e, ci)}
                  className={`border-l border-slate-100 dark:border-[#2a2a2a] px-1 py-1 space-y-0.5 transition-colors ${dragOver === ci ? "bg-violet-50 dark:bg-violet-900/20" : ""}`}>
                  {colDrugs.map(d => {
                    const gi = data.drugs.findIndex(g => g === d)
                    return (
                      <div key={gi} draggable
                        title={`${displayDrugName(d.name)}${d.dose ? " — " + d.dose + " " + d.unit : ""}`}
                        onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData("item-type","move-drug"); e.dataTransfer.setData("item-idx", String(gi)); e.dataTransfer.effectAllowed="move" }}
                        onClick={e => { e.stopPropagation(); const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setDrugPicker({ ci, rect }) }}
                        onDoubleClick={e => { e.stopPropagation(); setDoseEditDrug({ idx: gi, dose: d.dose, unit: d.unit, rect: e.currentTarget.getBoundingClientRect() }) }}
                        className={`flex items-start gap-1 rounded px-2 py-1 group cursor-grab active:cursor-grabbing transition-colors ${sel?.type === "drug" && sel.idx === gi ? "bg-violet-400 dark:bg-violet-600 ring-2 ring-violet-500 dark:ring-violet-400" : "bg-violet-100 dark:bg-violet-900/40 hover:bg-violet-200 dark:hover:bg-violet-800/40"}`}>
                        <span className="text-[10px] font-semibold text-violet-800 dark:text-violet-300 leading-tight truncate flex-1">
                          {displayDrugName(d.name)}{d.dose && <><br /><span className="font-normal font-mono text-[9px] opacity-90">{d.dose} {d.unit}</span></>}
                        </span>
                        <button type="button" tabIndex={-1} onClick={e => { e.stopPropagation(); removeDrug(gi) }}
                          className="opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity text-violet-400 hover:text-violet-700 shrink-0 mt-0.5">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    )
                  })}
                  <button type="button" tabIndex={-1}
                    onClick={e => { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setDrugPicker({ ci, rect }) }}
                    className="w-full mt-1 flex items-center justify-center gap-0.5 text-[10px] font-semibold rounded border border-dashed border-violet-300 dark:border-violet-700 text-violet-400 dark:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 py-1 transition-colors">
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
          </div>

          {/* Infusion rows */}
          {[...new Set((data.infusions ?? []).map(i => i.name))].map(drugName => {
            const segs  = (data.infusions ?? []).filter(i => i.name === drugName)
            const color = segs[0]?.color ?? "#64748b"
            const isBusyMovingBar  = movingInf !== null && segs.some(s => s.id === movingInf.id)
            const isBusyMovingPill = movingRatePill !== null && segs.some(s => s.id === movingRatePill.infId)
            return (
              <div key={drugName} className="flex items-stretch border-t border-slate-100 dark:border-[#2a2a2a] relative" style={{ minHeight: 52 }}>
                <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="flex flex-col items-end justify-end pr-2 pb-1.5 gap-0 select-none shrink-0">
                  <span className="text-xs font-semibold uppercase tracking-wide leading-tight" style={{ color }}>{drugName}</span>
                  <span className="text-[10px] text-slate-300 dark:text-[#555] leading-tight">infusion</span>
                </div>
                {rowCols.map(ci => {
                  const seg = segs.find(s => ci >= s.startCol && ci <= s.endCol)
                  // Right-grip extension preview (cells beyond seg.endCol but within extInfHover)
                  const rightPreviewSeg = !seg && extendingInf
                    ? segs.find(s => s.id === extendingInf && ci > s.endCol && extInfHover !== null && ci <= extInfHover) ?? null : null
                  // Left-grip extension preview (cells before seg.startCol down to extInfLeftHover)
                  const leftPreviewSeg = !seg && extendingInfLeft
                    ? segs.find(s => s.id === extendingInfLeft && extInfLeftHover !== null && ci >= extInfLeftHover && ci < s.startCol) ?? null : null
                  // Bar-move preview position
                  const previewStart = isBusyMovingBar && movingInfCol !== null ? movingInf!.origStart + (movingInfCol - movingInf!.fromCol) : null
                  const previewEnd   = previewStart !== null ? previewStart + (movingInf!.origEnd - movingInf!.origStart) : null
                  const isPreview    = !seg && !rightPreviewSeg && !leftPreviewSeg && previewStart !== null && previewEnd !== null && ci >= previewStart && ci <= previewEnd
                  // Effective end follows right-grip hover
                  const effectiveEnd  = seg && extendingInf === seg.id && extInfHover !== null ? Math.max(extInfHover, seg.startCol) : (seg?.endCol ?? -1)
                  const isActualStart = seg?.startCol === ci
                  const isActualEnd   = seg !== null && ci === effectiveEnd
                  const isRowCont     = !isActualStart && seg != null && ci === colStart
                  const isRowExit     = seg != null && barContinues(effectiveEnd) && ci === colEnd - 1 && !isActualEnd
                  return (
                    <div key={ci} style={{ width: colW, minWidth: colW }}
                      className="relative border-l border-slate-100 dark:border-[#2a2a2a]"
                      onDragOver={e => {
                        if (extendingInf) { e.preventDefault(); e.stopPropagation(); const s = segs.find(s => s.id === extendingInf); if (s) setExtInfHover(Math.max(ci, s.startCol)) }
                        else if (extendingInfLeft) { e.preventDefault(); e.stopPropagation(); const s = segs.find(s => s.id === extendingInfLeft); if (s && ci <= s.endCol) setExtInfLeftHover(Math.max(0, ci)) }
                        else if (isBusyMovingBar) { e.preventDefault(); setMovingInfCol(ci) }
                        else if (isBusyMovingPill) { e.preventDefault(); setMovingRatePillCol(ci) }
                      }}
                      onDrop={e => {
                        if (extendingInf) { e.preventDefault(); const s = segs.find(s => s.id === extendingInf); if (s) extendInfusion(extendingInf, Math.max(ci, s.startCol)); setExtendingInf(null); setExtInfHover(null) }
                        else if (extendingInfLeft) { e.preventDefault(); extendInfusionLeft(extendingInfLeft, Math.max(0, extInfLeftHover ?? ci)); setExtendingInfLeft(null); setExtInfLeftHover(null) }
                        else if (isBusyMovingBar) {
                          e.preventDefault()
                          const delta = ci - movingInf!.fromCol
                          const newStart = movingInf!.origStart + delta
                          if (newStart < 0) { setDeleteInfPrompt(movingInf!.id) }
                          else { onChangeRef.current({ ...dataRef.current, infusions: (dataRef.current.infusions ?? []).map(i => i.id === movingInf!.id ? { ...i, startCol: newStart, endCol: movingInf!.origEnd + delta, rateChanges: (i.rateChanges ?? []).map(rc => ({ ...rc, col: rc.col + delta })) } : i) }) }
                          setMovingInf(null); setMovingInfCol(null)
                        } else if (isBusyMovingPill) {
                          e.preventDefault()
                          // Only copy if target cell has an infusion; fromCol=null keeps original pill
                          if (seg) applyInfRateChange(movingRatePill!.infId, null, ci, movingRatePill!.rate, movingRatePill!.unit)
                          setMovingRatePill(null); setMovingRatePillCol(null)
                        }
                      }}>

                      {/* Rate segment bar — matches infusion bar geometry (same left/right insets + rounded corners) */}
                      {seg && !seg.stopped && (() => {
                        const sortedChanges = (seg.rateChanges ?? []).slice().sort((a, b) => a.col - b.col)
                        const prevChange = sortedChanges.filter(rc => rc.col <= ci).pop()
                        const curRate    = prevChange?.rate ?? seg.rate
                        const curUnit    = prevChange?.unit ?? seg.unit
                        const isSegStart = ci === seg.startCol || sortedChanges.some(rc => rc.col === ci)
                        const isRateChangeCol = sortedChanges.some(rc => rc.col === ci)
                        const isSel = sel?.type === "infusion" && sel.id === seg.id
                        // Use same left/right geometry as infusion bar for seamless visual alignment
                        const leftStyle  = (isActualStart || isRowCont) ? "left-1"  : "left-0"
                        const rightStyle = (isActualEnd && !isRowExit)  ? "right-3" : "right-0"
                        const tlRadius   = (isActualStart || isRowCont) ? "rounded-tl-full" : ""
                        const trRadius   = (isActualEnd && !isRowExit)  ? "rounded-tr-sm"  : ""
                        return (
                          <div
                            className={`absolute top-0 z-20 flex items-center cursor-pointer select-none hover:opacity-90 transition-opacity overflow-hidden ${leftStyle} ${rightStyle} ${tlRadius} ${trRadius}`}
                            style={{ height: 21, backgroundColor: color + (isSel ? "50" : "2e") }}
                            onClick={e => { e.stopPropagation(); setInfMenu({ segId: seg.id, name: seg.name, color, rect: e.currentTarget.getBoundingClientRect(), stopped: false, fromPillCol: ci }) }}
                          >
                            {/* Draggable rate-change boundary — styled as a subtle divider */}
                            {isRateChangeCol && (
                              <div
                                draggable
                                className="absolute left-0 top-1 bottom-1 w-[2px] cursor-col-resize z-30 rounded-full opacity-70 hover:opacity-100"
                                style={{ backgroundColor: color }}
                                onDragStart={e => { e.stopPropagation(); const rc = sortedChanges.find(r => r.col === ci)!; setMovingRatePill({ infId: seg.id, fromCol: ci, rate: Number(rc.rate) || 0, unit: rc.unit }) }}
                                onDragEnd={() => { setMovingRatePill(null); setMovingRatePillCol(null) }}
                                onClick={e => e.stopPropagation()}
                              />
                            )}
                            {/* Rate label at start of each segment */}
                            {isSegStart && (
                              <span className="text-[8px] font-bold whitespace-nowrap truncate leading-none" style={{ color, paddingLeft: isRateChangeCol ? 10 : 5 }}>
                                {curRate} {curUnit}
                              </span>
                            )}
                          </div>
                        )
                      })()}

                      {/* Infusion bar — lower portion of cell */}
                      {seg && (
                        <>
                          <div
                            draggable={!seg.stopped}
                            onDragStart={!seg.stopped ? e => { e.stopPropagation(); setMovingInf({ id: seg.id, origStart: seg.startCol, origEnd: seg.endCol, fromCol: ci }) } : undefined}
                            onDragEnd={() => { setMovingInf(null); setMovingInfCol(null) }}
                            onClick={e => { e.stopPropagation(); setSel(s => s?.type==="infusion"&&s.id===seg.id ? null : { type:"infusion", id:seg.id }) }}
                            title={!seg.stopped ? "Click to select · Double-click for options · Drag to move" : undefined}
                            className={`absolute left-0 right-0 border-y ${!seg.stopped ? "cursor-grab active:cursor-grabbing" : ""} ${leftCls(isActualStart || isRowCont)} ${rightCls(seg.endCol, isActualEnd && !isRowExit)} ${seg.stopped ? "opacity-50 border-dashed" : hoverDiscontinue === seg.id ? "opacity-50" : ""}`}
                            style={{
                              top: 22, bottom: 4,
                              backgroundColor: sel?.type==="infusion"&&sel.id===seg.id ? color+"99":color+"44",
                              borderColor: sel?.type==="infusion"&&sel.id===seg.id ? color : color+"88",
                              borderStyle: seg.stopped || hoverDiscontinue === seg.id ? "dashed" : "solid",
                              boxShadow: sel?.type==="infusion"&&sel.id===seg.id ? `0 0 0 1.5px ${color}` : undefined,
                            }}>
                            {/* Drug name — centred over visible span */}
                            {(isActualStart || isRowCont) && (() => {
                              const visStart = Math.max(seg.startCol, colStart)
                              const visEnd   = Math.min(seg.endCol, colEnd - 1)
                              return (
                                <span className="absolute top-1/2 -translate-y-1/2 text-[10px] font-bold whitespace-nowrap pointer-events-none select-none text-center block"
                                  style={{ color, left: 0, width: (visEnd - visStart + 1) * colW }}>
                                  {displayInfusionName(seg.name)}
                                </span>
                              )
                            })()}
                          </div>
                          {/* Left grip — shown only when selected */}
                          {isActualStart && sel?.type==="infusion" && sel.id===seg.id && !seg.stopped && (
                            <div draggable
                              onDragStart={e => { e.stopPropagation(); setExtendingInfLeft(seg.id) }}
                              onDragEnd={() => { setExtendingInfLeft(null); setExtInfLeftHover(null) }}
                              className="absolute left-0 z-20 flex items-center justify-center cursor-col-resize rounded-l-sm"
                              style={{ top: 22, bottom: 4, width: 10, backgroundColor: color }}>
                              <span className="text-white text-[8px] font-bold select-none">|</span>
                            </div>
                          )}
                          {/* Right grip — shown only when selected */}
                          {isActualEnd && sel?.type==="infusion" && sel.id===seg.id && !seg.stopped && !isRowExit && (
                            <div draggable
                              onDragStart={e => { e.stopPropagation(); setExtendingInf(seg.id) }}
                              onDragEnd={() => { setExtendingInf(null); setExtInfHover(null) }}
                              className="absolute right-0 z-20 flex items-center justify-center cursor-col-resize rounded-r-sm"
                              style={{ top: 22, bottom: 4, width: 10, backgroundColor: color }}>
                              <span className="text-white text-[8px] font-bold select-none">|</span>
                            </div>
                          )}
                          {/* Inline discontinue button */}
                          {isActualEnd && !isRowExit && sel?.type==="infusion" && sel.id===seg.id && !seg.stopped && (
                            <div className="absolute z-30 flex items-center gap-1" style={{ top: 24, right: 14 }}>
                              {discConfirmId === seg.id ? (
                                <>
                                  <button type="button"
                                    onClick={e => { e.stopPropagation(); extendInfusion(seg.id, nowCol ?? seg.endCol, true); setSel(null); setDiscConfirmId(null) }}
                                    className="text-[8px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full hover:bg-red-600 border border-white/40 whitespace-nowrap">
                                    ✓ Confirm
                                  </button>
                                  <button type="button"
                                    onClick={e => { e.stopPropagation(); setDiscConfirmId(null) }}
                                    className="text-[8px] text-white/60 hover:text-white px-1 whitespace-nowrap">
                                    ✕
                                  </button>
                                </>
                              ) : (
                                <button type="button"
                                  onClick={e => { e.stopPropagation(); setDiscConfirmId(seg.id) }}
                                  className="text-[8px] font-semibold bg-black/30 text-white px-1.5 py-0.5 rounded-full border border-white/30 hover:bg-red-500/80 whitespace-nowrap">
                                  ✕ Disc
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {/* Ghost bar — whole-bar move */}
                      {isPreview && (
                        <div className="absolute left-0 right-0 border border-dashed opacity-25"
                          style={{ top: 22, bottom: 4, backgroundColor: color + "33", borderColor: color,
                            borderRadius: ci === previewStart ? "6px 0 0 6px" : ci === previewEnd ? "0 6px 6px 0" : 0 }} />
                      )}
                      {/* Ghost bar — right-grip extension preview */}
                      {rightPreviewSeg && (
                        <>
                          <div className="absolute left-0 right-0 opacity-40 border-y"
                            style={{ top: 22, bottom: 4, backgroundColor: color + "33", borderColor: color + "88",
                              borderRight: ci === extInfHover ? `1px solid ${color}88` : undefined,
                              borderRadius: ci === extInfHover ? "0 6px 6px 0" : 0 }} />
                          {/* Grip handle at hover position */}
                          {ci === extInfHover && sel?.type==="infusion" && sel.id===rightPreviewSeg.id && (
                            <div className="absolute right-0 z-20 flex items-center justify-center rounded-r-sm"
                              style={{ top: 22, bottom: 4, width: 10, backgroundColor: color, opacity: 0.7 }}>
                              <span className="text-white text-[8px] font-bold select-none">|</span>
                            </div>
                          )}
                        </>
                      )}
                      {/* Ghost bar — left-grip extension preview */}
                      {leftPreviewSeg && (
                        <>
                          <div className="absolute left-0 right-0 opacity-40 border-y"
                            style={{ top: 22, bottom: 4, backgroundColor: color + "33", borderColor: color + "88",
                              borderLeft: extInfLeftHover !== null && ci === extInfLeftHover ? `1px solid ${color}88` : undefined,
                              borderRadius: extInfLeftHover !== null && ci === extInfLeftHover ? "6px 0 0 6px" : 0 }} />
                          {/* Grip handle at hover position */}
                          {extInfLeftHover !== null && ci === extInfLeftHover && sel?.type==="infusion" && sel.id===leftPreviewSeg.id && (
                            <div className="absolute left-0 z-20 flex items-center justify-center rounded-l-sm"
                              style={{ top: 22, bottom: 4, width: 10, backgroundColor: color, opacity: 0.7 }}>
                              <span className="text-white text-[8px] font-bold select-none">|</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* Fluid rows */}
          {fluidRows.map(({ label, segs, color }) => {
            return (
              <div key={label} className="flex min-h-[64px] border-t border-slate-100 dark:border-[#2a2a2a] relative">
                <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="flex flex-col items-end justify-center pr-2 py-2 gap-0 select-none shrink-0">
                  <span className="text-xs font-semibold uppercase tracking-wide leading-tight" style={{ color }}>{displayFluidLaneLabel(label)}</span>
                  <span className="text-[10px] text-slate-300 dark:text-[#555] leading-tight">fluid</span>
                </div>
                {rowCols.map(ci => {
                  const committedSeg  = segs.find(s => ci >= s.startCol && ci <= s.endCol)
                  const previewSeg    = !committedSeg && extendingFluid && extFluidHover !== null ? segs.find(s => s.id === extendingFluid && ci > s.endCol && ci <= extFluidHover) ?? null : null
                  const seg           = committedSeg ?? previewSeg
                  const isDragPreview = !committedSeg && !!previewSeg
                  const isActualStart = seg?.startCol === ci
                  const isRowCont     = !isActualStart && seg != null && ci === colStart
                  const effectiveEnd  = seg && extendingFluid === seg.id && extFluidHover !== null ? Math.max(extFluidHover, seg.startCol) : (seg?.endCol ?? -1)
                  const isActualEnd   = seg !== null && ci === effectiveEnd
                  const isRowExit     = seg != null && barContinues(seg.endCol) && ci === colEnd - 1 && !isActualEnd
                  const isSel         = seg && sel?.type==="fluid" && sel.id===seg.id
                  const stoppedSeg    = !seg
                    ? segs.find(s => s.stopped && s.endCol < ci) ?? null : null
                  return (
                    <div key={ci} style={{ width: colW, minWidth: colW }}
                      className="group relative border-l border-slate-100 dark:border-[#2a2a2a] flex items-center"
                      onDragOver={e => { if (!extendingFluid || e.dataTransfer.types.includes("extend-agent")) return; e.preventDefault(); e.stopPropagation(); const s = segs.find(s => s.id===extendingFluid); if (s) setExtFluidHover(Math.max(ci, s.startCol)) }}
                      onDrop={e => { if (!extendingFluid) return; e.preventDefault(); const s = segs.find(s => s.id===extendingFluid); if (s) extendFluid(extendingFluid, Math.max(ci, s.startCol)); setExtendingFluid(null); setExtFluidHover(null) }}>
                      {seg && (
                        <>
                          <div onClick={e => { e.stopPropagation(); if (isActualStart || isRowCont) setSel({ type:"fluid", id:seg.id }) }}
                            onDoubleClick={e => { e.stopPropagation(); if (seg.stopped) resumeFluid(seg.id) }}
                            title={seg.stopped ? "Double-click to resume" : undefined}
                            className={`absolute inset-y-1 border-y cursor-pointer ${leftCls(isActualStart || isRowCont)} ${rightCls(seg.endCol, isActualEnd && !isRowExit)} ${isDragPreview ? "opacity-50" : ""} ${seg.stopped ? "opacity-60 border-dashed" : ""}`}
                            style={{ backgroundColor: isSel ? color+"88":color+"33", borderColor: isSel ? color:color+"88", boxShadow: isSel ? `0 0 0 1.5px ${color}` : undefined }}
                          />
                          {(isActualStart || isRowCont) && (() => {
                            const visStart = Math.max(seg.startCol, colStart)
                            const visEnd   = Math.min(effectiveEnd, colEnd - 1)
                            const visW     = (visEnd - visStart + 1) * colW
                            return (
                              <span className="absolute top-1/2 -translate-y-1/2 z-10 pointer-events-none select-none text-[10px] font-bold whitespace-nowrap flex items-center justify-center"
                                style={{ color, left: 0, width: visW }}>
                                {displayFluidName(seg.name)}{seg.volume ? ` * ${seg.volume} ml` : ""}
                              </span>
                            )
                          })()}
                        </>
                      )}
                      {showGrip(seg?.endCol ?? -1, isActualEnd, isDragPreview) && !isRowExit && seg && !seg.stopped && (
                        <div draggable onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData("ext-fluid", seg.id); setExtendingFluid(seg.id) }} onDragEnd={() => { setExtendingFluid(null); setExtFluidHover(null) }}
                          className="absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10 opacity-70 hover:opacity-100 rounded-r-sm" style={{ backgroundColor: color }}>
                          <span className="text-white text-[8px] font-bold select-none">|</span>
                        </div>
                      )}
                      {/* Inline fluid discontinue button — always at last cell, visible on hover or when selected */}
                      {isActualEnd && !isRowExit && seg && !seg.stopped && !isDragPreview && (
                        <div className={`absolute z-30 flex items-center justify-center transition-opacity ${isSel ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                          style={{ top: 4, right: 14, bottom: 4 }}>
                          <button type="button"
                            onClick={e => { e.stopPropagation(); setDiscFluidState({ id: seg.id, volInput: "0", rect: e.currentTarget.getBoundingClientRect(), fullBag: null }) }}
                            className="text-[8px] font-semibold bg-black/30 text-white px-1.5 py-0.5 rounded-full border border-white/30 hover:bg-red-500/80 whitespace-nowrap">
                            ✕ Disc
                          </button>
                        </div>
                      )}
                      {(isActualStart || isRowCont) && seg && (
                        <button type="button" onClick={e => { e.stopPropagation(); removeFluid(seg.id) }}
                          className="absolute top-0.5 right-4 z-10 opacity-0 hover:opacity-100 [@media(hover:none)]:opacity-100 text-slate-400 hover:text-red-500 transition-opacity">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      )}
                      {stoppedSeg && (
                        <button type="button"
                          onClick={e => { e.stopPropagation(); continueFluid(stoppedSeg, ci) }}
                          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer">
                          <span className="text-[9px] font-bold text-emerald-500 dark:text-emerald-400 bg-white/80 dark:bg-black/40 px-1.5 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700 whitespace-nowrap">
                            Continue?
                          </span>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* Infusion drop zone — always-visible entry point, separate from
              the Drug row, so starting an infusion never goes through a
              drug-then-bolus/infusion choice. */}
          <div className="flex min-h-[40px] border-t border-slate-200 dark:border-[#2e2e2e] bg-blue-50/20 dark:bg-blue-950/5">
            <div style={{ width: LABEL_W, minWidth: LABEL_W }} className={rowLabelCls + " py-1.5 flex items-center justify-end opacity-50"}>{t("intraop.timetable.infusions")}</div>
            {rowCols.map(ci => (
              <div key={ci} style={{ width: colW, minWidth: colW }}
                className="border-l border-slate-100 dark:border-[#2a2a2a] flex items-center justify-center">
                <button type="button" tabIndex={-1}
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
                onDragOver={e => { if (e.dataTransfer.types.includes("ext-inf") || e.dataTransfer.types.includes("ext-fluid") || e.dataTransfer.types.includes("extend-agent")) return; e.preventDefault(); setFluidDragOver(ci) }}
                onDragLeave={() => setFluidDragOver(null)}
                onDrop={e => onFluidDrop(e, ci)}
                className={`border-l border-slate-100 dark:border-[#2a2a2a] flex items-center justify-center transition-colors ${fluidDragOver===ci ? "bg-cyan-100 dark:bg-cyan-900/20" : ""}`}>
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
    {/* -- Fluid picker portal -- */}
    {fluidPicker && typeof document !== "undefined" && createPortal(
      (() => {
        const POP_W = 240
        const r = fluidPicker.rect
        const spaceBelow = window.innerHeight - r.bottom
        const showAbove  = spaceBelow < 300
        const left = Math.max(8, Math.min(r.left, window.innerWidth - POP_W - 8))
        const top  = showAbove ? r.top - 4 : r.bottom + 4
        const filtered = fpSearch.trim()
          ? QUICK_FLUIDS.map(c => ({ ...c, fluids: c.fluids.filter(f => `${f.name} ${displayFluidName(f.name)}`.toLowerCase().includes(fpSearch.toLowerCase())) })).filter(c => c.fluids.length > 0)
          : QUICK_FLUIDS
        return (
          <>
            <div className="fixed inset-0 z-[9990]" onClick={() => setFluidPicker(null)} />
            <div style={{ position:"fixed", left, top, width: POP_W, zIndex:9991, transform: showAbove ? "translateY(-100%)" : undefined }}
              className="bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="p-2 border-b border-slate-100 dark:border-[#2a2a2a]">
                <input autoFocus type="text" placeholder={t("intraop.timetable.searchFluid")} value={fpSearch}
                  onChange={e => setFpSearch(e.target.value)}
                  onKeyDown={e => e.key === "Escape" && setFluidPicker(null)}
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-800 dark:text-slate-200 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                />
              </div>
              <div className="max-h-56 overflow-y-auto p-2 space-y-2">
                {filtered.map(cat => (
                  <div key={cat.cat}>
                    <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#666] mb-1">{displayGroupName(cat.cat)}</p>
                    <div className="flex flex-wrap gap-1">
                      {cat.fluids.map(fluid => (
                        <button key={fluid.name} type="button"
                          onClick={() => {
                            const { ci, rect } = fluidPicker!
                            setFluidPicker(null)
                            // Always open the dose selector, pre-filled — mirroring mobile's
                            // selectFluid. Web used to add the fluid immediately whenever the
                            // library supplied a quick volume, which is why the slider and
                            // quick pills never appeared for the common fluids: they all have
                            // one. Volume is a clinical value; it gets confirmed, not assumed.
                            const routes = FLUID_ROUTES[fluid.name] ?? ["IV"]
                            setFp({ col: ci, name: fluid.name, unit: "ml", mode: "fluid",
                              dose: String(FLUID_QUICK_VOLUMES[fluid.name]?.[0] ?? 500),
                              doseHint: "", fluidScale: "L",
                              rate: 0, rateUnit: "ml", rateUnits: ["ml"], rateMin: 0, rateMax: 2000, rateStep: 50,
                              color: "#06b6d4",
                              quickDoses: FLUID_QUICK_VOLUMES[fluid.name], routes, route: routes[0],
                              anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width },
                            })
                          }}
                          className={`text-xs font-medium px-2 py-1 rounded border cursor-pointer hover:opacity-80 transition-opacity ${cat.color}`}>
                          {displayFluidName(fluid.name)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {filtered.length === 0 && <p className="text-xs text-slate-400 dark:text-[#666] text-center py-4">No fluids found</p>}
              </div>
            </div>
          </>
        )
      })()
    ,
      document.body
    )}
    {/* ── Event picker portal ─────────────────────────────────────────────── */}
    {eventPicker && typeof document !== "undefined" && createPortal(
      (() => {
        const POP_W = 300
        const r = eventPicker.rect
        const spaceBelow = window.innerHeight - r.bottom
        const showAbove  = spaceBelow < 340
        const left = Math.max(8, Math.min(r.left, window.innerWidth - POP_W - 8))
        const top  = showAbove ? r.top - 4 : r.bottom + 4
        const q = evSearch.toLowerCase().trim()
        const filtered = q
          ? CLINICAL_EVENT_CATS.map(c => ({ ...c, events: c.events.filter(event => `${event.label} ${displayEventName(event)}`.toLowerCase().includes(q)) })).filter(c => c.events.length > 0)
          : CLINICAL_EVENT_CATS
        const localizedPositions = POSITIONS.map(position => ({
          ...position,
          displayLabel: displayClinicalCode("option:POSITION", position.v, locale, { label: position.label }),
        }))
        const positionOpts = q
          ? localizedPositions.filter(position => `${position.label} ${position.displayLabel}`.toLowerCase().includes(q))
          : localizedPositions
        return (
          <>
            <div className="fixed inset-0 z-[9990]" onClick={() => setEventPicker(null)} />
            <div style={{ position:"fixed", left, top, width:POP_W, zIndex:9991, transform: showAbove ? "translateY(-100%)" : undefined }}
              className="bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="p-2 border-b border-slate-100 dark:border-[#2a2a2a]">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-[#666] px-1 mb-1.5">{t("intraop.timetable.logClinicalEvent")}</p>
                <input autoFocus type="text" placeholder={t("intraop.timetable.searchEvents")} value={evSearch}
                  onChange={e => setEvSearch(e.target.value)}
                  onKeyDown={e => e.key === "Escape" && setEventPicker(null)}
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-800 dark:text-slate-200 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
              </div>
              <div className="max-h-72 overflow-y-auto p-2 space-y-2.5">
                {/* Position changes — time-anchored position_change events feeding
                    the printed record's Position lane. Same emit pattern as
                    clinical events (ts = now); no other cockpit behavior changes. */}
                {positionOpts.length > 0 && (
                  <div>
                    <p className="text-[8px] font-bold uppercase tracking-wider mb-1 text-slate-500 dark:text-slate-400">{t("intraop.timetable.positionChange")}</p>
                    <div className="flex flex-wrap gap-1">
                      {positionOpts.map(pos => (
                        <button key={pos.v} type="button"
                          onClick={() => {
                            setEventPicker(null)
                            emitLogEvent({ type: "position_change", name: pos.label })
                          }}
                          className="text-xs font-medium px-2 py-0.5 rounded-full border border-slate-300 dark:border-[#4a4a4a] bg-slate-100 dark:bg-[#2a2a2a] text-slate-600 dark:text-slate-300 cursor-pointer transition-all hover:opacity-80">
                          {pos.displayLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {filtered.map(cat => {
                  const colEvLabels = new Set((data.clinicalEvents ?? []).filter(e => e.colIdx === eventPicker!.ci).map(e => e.label))
                  return (
                    <div key={cat.cat}>
                      <p className="text-[8px] font-bold uppercase tracking-wider mb-1" style={{ color: cat.color }}>{displayGroupName(cat.cat)}</p>
                      <div className="flex flex-wrap gap-1">
                        {cat.events.map(ev => {
                          const already = colEvLabels.has(ev.label)
                          return (
                            <button key={ev.label} type="button"
                              onClick={() => {
                                const ci = eventPicker!.ci
                                setEventPicker(null)
                                if (already) removeClinicalEvent(ci, ev.label)
                                else addClinicalEvent(ci, ev.label, ev.color, cat.isComplication ?? false)
                              }}
                              className="text-xs font-medium px-2 py-0.5 rounded-full border cursor-pointer transition-all hover:opacity-80"
                              style={{
                                backgroundColor: already ? ev.color : ev.color + "18",
                                borderColor: ev.color + "88",
                                color: already ? "white" : ev.color,
                              }}>
                              {already && <span className="mr-0.5">✓</span>}{displayEventName(ev)}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                {filtered.length === 0 && <p className="text-xs text-slate-400 dark:text-[#666] text-center py-4">No events found</p>}
              </div>
            </div>
          </>
        )
      })(),
      document.body
    )}
    {/* -- Drug picker portal -- */}
    {drugPicker && typeof document !== "undefined" && createPortal(
      (() => {
        const POP_W = 260
        const spaceBelow = window.innerHeight - drugPicker.rect.bottom
        const showAbove  = spaceBelow < 320
        const left = Math.max(8, Math.min(drugPicker.rect.left, window.innerWidth - POP_W - 8))
        const top  = showAbove ? drugPicker.rect.top - 4 : drugPicker.rect.bottom + 4
        const allCats = QUICK_DRUGS
        return (
          <>
            <div className="fixed inset-0 z-[9990]" onClick={() => setDrugPicker(null)} />
            <div style={{ position:"fixed", left, top, width:POP_W, zIndex:9991, transform: showAbove ? "translateY(-100%)" : undefined }}
              className="bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}>
              {/* Same menu as mobile's DrugSheet: favourites, the eight clinical
                  scenarios, then browse the full library. */}
              <ScenarioPicker
                scenarios={BOLUS_SCENARIOS}
                favourites={favouriteDrugs}
                browse={allCats.map(c => ({ cat: c.cat, color: c.color, items: c.drugs }))}
                displayItem={displayDrugName}
                displayScenario={displayScenarioName}
                displayCategory={displayGroupName}
                onPick={(name, unit) => {
                  const { ci, rect } = drugPicker!
                  setDrugPicker(null)
                  const anchor = { getBoundingClientRect: () => ({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) }) } as unknown as HTMLElement
                  openFP(ci, name, unit ?? "mg", anchor, "bolus")
                }}
                labels={{
                  favourites: t("intraop.timetable.favourites"),
                  browseAll: t("intraop.timetable.browseAllDrugs"),
                  search: t("intraop.timetable.searchDrug"),
                  empty: t("intraop.timetable.noDrugsFound"),
                  favouritesHint: t("intraop.timetable.favouritesHint"),
                }}
              />
            </div>
          </>
        )
      })()
    ,
      document.body
    )}
    {/* -- Infusion picker portal -- */}
    {infPicker && typeof document !== "undefined" && createPortal(
      (() => {
        const POP_W = 220
        const spaceBelow = window.innerHeight - infPicker.rect.bottom
        const showAbove  = spaceBelow < 320
        const left = Math.max(8, Math.min(infPicker.rect.left, window.innerWidth - POP_W - 8))
        const top  = showAbove ? infPicker.rect.top - 4 : infPicker.rect.bottom + 4
        const names = Object.keys(INFUSION_CONFIGS).sort()
        return (
          <>
            <div className="fixed inset-0 z-[9990]" onClick={() => setInfPicker(null)} />
            <div style={{ position:"fixed", left, top, width:POP_W, zIndex:9991, transform: showAbove ? "translateY(-100%)" : undefined }}
              className="bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}>
              {/* Same menu as mobile's InfusionSheet. */}
              <ScenarioPicker
                scenarios={INFUSION_SCENARIOS}
                favourites={favouriteInfusions}
                browse={[{
                  cat: "All infusions",
                  color: "border-blue-200 text-blue-700 dark:border-blue-800 dark:text-blue-300",
                  items: names.map(name => ({ name, unit: INFUSION_CONFIGS[name]?.units[0] })),
                }]}
                displayItem={displayInfusionName}
                displayScenario={displayScenarioName}
                displayCategory={displayGroupName}
                onPick={(name, unit) => {
                  const { ci, rect } = infPicker!
                  setInfPicker(null)
                  const anchor = { getBoundingClientRect: () => ({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) }) } as unknown as HTMLElement
                  openFP(ci, name, unit ?? INFUSION_CONFIGS[name]?.units[0] ?? "mg/h", anchor, "infusion")
                }}
                labels={{
                  favourites: t("intraop.timetable.favourites"),
                  browseAll: t("intraop.timetable.browseAllInfusions"),
                  search: t("intraop.timetable.searchInfusion"),
                  empty: t("intraop.timetable.noInfusionsFound"),
                  favouritesHint: t("intraop.timetable.favouritesHint"),
                }}
              />
            </div>
          </>
        )
      })()
    ,
      document.body
    )}
    {/* ── Fluid conflict portal ──────────────────────────────────────────────── */}
    {fluidConflict && typeof document !== "undefined" && createPortal(
      (() => {
        const POP_W = 230
        const a = fluidConflict.anchor
        const spaceBelow = window.innerHeight - a.bottom
        const showAbove  = spaceBelow < 240
        const left = Math.max(8, Math.min(a.left, window.innerWidth - POP_W - 8))
        const top  = showAbove ? a.top - 4 : a.bottom + 4

        function doParallel() {
          addFluidDirect(fluidConflict!.newName, fluidConflict!.newCat, fluidConflict!.newVol, fluidConflict!.newCol)
          setFluidConflict(null)
        }
        function doStop() {
          setFluidConflict(fc => fc ? { ...fc, phase: "finished" } as FluidConflict : null)
        }
        function doFinished(finished: boolean) {
          if (!fluidConflict) return
          const d = dataRef.current
          const oc = onChangeRef.current
          const col = fluidConflict.newCol
          const eid = fluidConflict.existingId
          if (finished) {
            // Keep existing volume, trim endCol if it overlaps
            oc({ ...d, fluids: (d.fluids ?? []).map(f => f.id === eid && f.endCol >= col ? { ...f, endCol: col - 1 } : f) })
            addFluidDirect(fluidConflict.newName, fluidConflict.newCat, fluidConflict.newVol, col)
            setFluidConflict(null)
          } else {
            setFluidConflict(fc => fc ? { ...fc, phase: "volume", volInput: "" } as FluidConflict : null)
          }
        }
        function doConfirmVolume() {
          if (!fluidConflict || fluidConflict.phase !== "volume") return
          const d = dataRef.current
          const oc = onChangeRef.current
          const col = fluidConflict.newCol
          const eid = fluidConflict.existingId
          oc({ ...d, fluids: (d.fluids ?? []).map(f => f.id === eid ? { ...f, endCol: Math.min(f.endCol, col - 1), volume: fluidConflict.volInput } : f) })
          addFluidDirect(fluidConflict.newName, fluidConflict.newCat, fluidConflict.newVol, col)
          setFluidConflict(null)
        }

        return (
          <>
            <div className="fixed inset-0 z-[9994]" onClick={() => setFluidConflict(null)} />
            <div
              style={{ position: "fixed", left, top, width: POP_W, zIndex: 9995, transform: showAbove ? "translateY(-100%)" : undefined }}
              className="bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl p-3 space-y-2.5"
              onClick={e => e.stopPropagation()}>

              {fluidConflict.phase === "choose" && (
                <>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{fluidConflict.newCat} conflict</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-semibold" style={{ color: fluidConflict.newColor }}>{fluidConflict.existingName}</span> is already running.
                  </p>
                  <div className="space-y-1">
                    <button type="button" onClick={doStop}
                      className="w-full text-xs font-semibold bg-slate-700 hover:bg-slate-600 dark:bg-[#2a2a2a] dark:hover:bg-[#383838] dark:border dark:border-[#4a4a4a] text-white rounded-lg py-1.5">
                      Stop {fluidConflict.existingName}
                    </button>
                    <button type="button" onClick={doParallel}
                      className="w-full text-xs font-semibold border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] rounded-lg py-1.5">
                      Run in parallel
                    </button>
                  </div>
                </>
              )}

              {fluidConflict.phase === "finished" && (
                <>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{t("intraop.timetable.wasItFinished")}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Did the full volume of {fluidConflict.newCat.toLowerCase()} get infused?</p>
                  <div className="space-y-1">
                    <button type="button" onClick={() => doFinished(true)}
                      className="w-full text-xs font-semibold bg-slate-700 hover:bg-slate-600 dark:bg-[#2a2a2a] dark:hover:bg-[#383838] dark:border dark:border-[#4a4a4a] text-white rounded-lg py-1.5">
                      Yes, fully infused
                    </button>
                    <button type="button" onClick={() => doFinished(false)}
                      className="w-full text-xs font-semibold border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] rounded-lg py-1.5">
                      No, stopped early
                    </button>
                  </div>
                </>
              )}

              {fluidConflict.phase === "volume" && (
                <>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{t("intraop.timetable.howMuchInfused")}</p>
                  <div className="flex items-center gap-2">
                    <input autoFocus type="number" min={0} placeholder="0"
                      value={fluidConflict.volInput}
                      onChange={e => setFluidConflict(fc => fc && fc.phase === "volume" ? { ...fc, volInput: e.target.value } : fc)}
                      onKeyDown={e => { if (e.key === "Enter") doConfirmVolume() }}
                      className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                    />
                    <span className="text-xs font-semibold text-slate-400">ml</span>
                  </div>
                  <button type="button" onClick={doConfirmVolume}
                    className="w-full text-xs font-semibold bg-slate-700 hover:bg-slate-600 dark:bg-[#2a2a2a] dark:hover:bg-[#383838] dark:border dark:border-[#4a4a4a] text-white rounded-lg py-1.5">
                    Confirm
                  </button>
                </>
              )}
            </div>
          </>
        )
      })(),
      document.body
    )}
    {/* ── Agent picker portal ────────────────────────────────────────────────── */}
    {agentPicker !== null && agentPickerRect && typeof document !== "undefined" && createPortal(
      (() => {
        const pickerSeg = agents.find(a => a.startCol === agentPicker) ?? null
        const POP_W = 190
        const spaceBelow = window.innerHeight - agentPickerRect.bottom
        const showAbove = spaceBelow < 240
        const left = Math.max(8, Math.min(agentPickerRect.left, window.innerWidth - POP_W - 8))
        const top  = showAbove ? agentPickerRect.top - 4 : agentPickerRect.bottom + 4
        return (
          <>
            <div className="fixed inset-0 z-[9998]" onClick={closeAgentPicker} />
            <div
              style={{ position:"fixed", left, top, width: POP_W, zIndex: 9999, transform: showAbove ? "translateY(-100%)" : undefined }}
              className="bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl p-3 space-y-2"
              onClick={e => e.stopPropagation()}>

              {!pickerSeg && <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">{t("intraop.timetable.startAgentHere")}</p>}
              {pickerSeg  && <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">Edit: {displayAgentName(pickerSeg.name)}</p>}

              {!pickerSeg && (
                <div className="space-y-0.5">
                  {INH_AGENTS.map(agent => (
                    <button key={agent} type="button"
                      // Select, don't start. Mobile's AgentSheet sets the agent and its
                      // default Fi% then waits for confirmation; web used to commit the
                      // segment on the first click, so the concentration was never actually
                      // chosen by anyone.
                      onClick={() => {
                        setPendingAgentName(agent)
                        setPickerPercent(AGENT_QUICK_PERCENTS[agent]?.[0] ?? null)
                      }}
                      className={`w-full text-left text-xs font-semibold px-2 py-1.5 rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-[#333] ${AGENT_STYLE[agent]?.text ?? ""}`}>
                      {displayAgentName(agent)}
                    </button>
                  ))}
                </div>
              )}

              {/* Fi(agent)% — agents always dose in %, no unit/route rows */}
              {(pickerSeg || pendingAgentName) && (() => {
                const agentName = pickerSeg?.name ?? pendingAgentName!
                const quick = AGENT_QUICK_PERCENTS[agentName] ?? [0.5, 1, 1.5, 2, 3]
                return (
                  <div className="border-t border-slate-100 dark:border-[#333] pt-2">
                    <p className="text-[9px] text-slate-500 font-semibold uppercase tracking-wide mb-1.5">Fi{agentName}</p>
                    <DoseSelector
                      accent="purple"
                      quickValues={quick}
                      value={String(pickerPercent ?? quick[0])}
                      onValueChange={v => setPickerPercent(parseFloat(v) || 0)}
                      min={0} max={10} step={0.1} unitSuffix="%"
                      confirmLabel={!pickerSeg ? `Start ${agentName}` : undefined}
                      onConfirm={!pickerSeg ? () => startAgent(agentPicker, agentName) : undefined}
                    />
                  </div>
                )
              })()}

              <div className="border-t border-slate-100 dark:border-[#333] pt-2 space-y-2">
                <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">{t("intraop.timetable.optional")}</p>
                <button type="button"
                  onClick={() => setPickerN2o(pickerN2o !== null ? null : 40)}
                  className={`w-full text-xs font-semibold px-2 py-1 rounded-lg border transition-colors ${
                    pickerN2o !== null
                      ? "bg-yellow-400 border-yellow-400 text-white"
                      : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-yellow-400 hover:text-yellow-600"
                  }`}>
                  + N2O
                </button>
                {pickerN2o !== null && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-slate-500 font-semibold">FiN2O</span>
                      <span className="text-xs font-bold text-yellow-600 dark:text-yellow-400">{pickerN2o}%</span>
                    </div>
                    <input type="range" min={10} max={70} step={5}
                      value={pickerN2o}
                      onChange={e => setPickerN2o(parseInt(e.target.value))}
                      className="w-full h-1.5 accent-yellow-500" />
                  </div>
                )}
              </div>

              {pickerSeg && (
                <button type="button"
                  onClick={() => updateAgentExtras(pickerSeg.startCol)}
                  className="w-full text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-1.5 transition-colors">
                  Apply
                </button>
              )}
            </div>
          </>
        )
      })(),
      document.body
    )}
    {gasPicker !== null && gasPickerRect && typeof document !== "undefined" && createPortal(
      (() => {
        const pickerSeg = gasSettings.find(g => gasPicker >= g.startCol && gasPicker <= g.endCol) ?? null
        const POP_W = 210
        const spaceBelow = window.innerHeight - gasPickerRect.bottom
        const showAbove = spaceBelow < 280
        const left = Math.max(8, Math.min(gasPickerRect.left, window.innerWidth - POP_W - 8))
        const top  = showAbove ? gasPickerRect.top - 4 : gasPickerRect.bottom + 4
        return (
          <>
            <div className="fixed inset-0 z-[9998]" onClick={closeGasPicker} />
            <div
              style={{ position:"fixed", left, top, width: POP_W, zIndex: 9999, transform: showAbove ? "translateY(-100%)" : undefined }}
              className="bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl p-3 space-y-2.5"
              onClick={e => e.stopPropagation()}>
              <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">{pickerSeg ? "Edit gas settings" : "Start gas settings"}</p>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-semibold">FGF</span>
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{pickerFgf} L/min</span>
                </div>
                <input type="range" min={0} max={10} step={0.5}
                  value={pickerFgf} onChange={e => setPickerFgf(parseFloat(e.target.value))}
                  className="w-full h-1.5 accent-indigo-500" />
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 font-semibold">Carrier gas</span>
                <div className="flex gap-1">
                  {[{ v: null, label: "O2 only" }, { v: "air", label: "+ Air" }, { v: "n2o", label: "+ N2O" }].map(opt => (
                    <button key={opt.label} type="button"
                      onClick={() => { setPickerCarrierGas(opt.v); if (opt.v == null) setPickerFio2(100) }}
                      className={`flex-1 text-[10px] font-semibold px-1.5 py-1 rounded-lg border transition-colors ${
                        pickerCarrierGas === opt.v ? "bg-indigo-500 border-indigo-500 text-white" : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400"
                      }`}>{displayClinicalCode("carrierGas", opt.v ?? "o2", locale, { label: opt.label })}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-semibold">FiO2</span>
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{pickerCarrierGas == null ? 100 : pickerFio2}%</span>
                </div>
                <input type="range" min={21} max={100} step={1}
                  value={pickerCarrierGas == null ? 100 : pickerFio2} onChange={e => setPickerFio2(parseFloat(e.target.value))}
                  disabled={pickerCarrierGas == null}
                  className="w-full h-1.5 accent-indigo-500 disabled:opacity-50" />
              </div>

              <button type="button"
                onClick={() => pickerSeg ? applyGasChange(pickerSeg.id) : startGas(gasPicker)}
                className="w-full text-xs font-semibold bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg py-1.5 transition-colors">
                {pickerSeg ? "Apply" : "Start"}
              </button>
            </div>
          </>
        )
      })(),
      document.body
    )}
    {/* ── Floating prompt portal ─────────────────────────────────────────────── */}
    {fp && typeof document !== "undefined" && createPortal(
      <>
        {/* Backdrop to close */}
        <div className="fixed inset-0 z-[9998]" onClick={() => setFp(null)} />
        {/* Popup */}
        {(() => {
          const POP_W = 220
          const spaceBelow = window.innerHeight - fp.anchor.bottom
          const showAbove  = spaceBelow < 260
          const left = Math.max(8, Math.min(fp.anchor.left + fp.anchor.width / 2 - POP_W / 2, window.innerWidth - POP_W - 8))
          const top  = showAbove ? fp.anchor.top - 4 : fp.anchor.bottom + 6
          const bsurf = bolusRouteSurface(fp.name, fp.route)
          const br   = bsurf ? { min: bsurf.min, max: bsurf.max, step: bsurf.step } : bolusRange(fp.name, fp.unit)
          return (
            <div
              style={{ position:"fixed", left, top, width:POP_W, zIndex:9999, transform: showAbove ? "translateY(-100%)" : undefined }}
              className="bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl p-3 space-y-2"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{fp.mode === "bolus" ? displayDrugName(fp.name) : fp.mode === "infusion" ? displayInfusionName(fp.name) : displayFluidName(fp.name)}</span>
                <button type="button" onClick={() => setFp(null)} className="text-slate-300 hover:text-red-400 shrink-0 transition-colors"><X className="h-3.5 w-3.5" /></button>
              </div>
              <p className="text-[9px] text-slate-400 dark:text-slate-500">
                at <span className="font-semibold text-blue-500 dark:text-blue-400">{times[fp.col]}</span>
              </p>

              {fp.mode === "fluid" && (
                <DoseSelector
                  accent="cyan"
                  quickValues={fp.quickDoses}
                  value={fp.dose} onValueChange={dose => setFp(f => f ? {...f, dose} : f)}
                  min={0} max={2000} step={50} unitSuffix="ml"
                  routes={fp.routes} route={fp.route} onRouteChange={r => setFp(f => f ? {...f, route: r} : f)}
                  confirmLabel="Add fluid" onConfirm={fpCommitFluid}
                />
              )}

              {fp.mode === "bolus" && (() => {
                // Concentration options for the current route: from the route
                // surface (Lidocaine PD/IT/perineural) when present, else the
                // flat LA list.
                const conc = bsurf ? (bsurf.mode?.includes("concentration") ? bsurf.concentrationOptions : undefined) : LA_CONCENTRATIONS[fp.name]
                const isLA = !!conc?.length
                const laSelected = isLA && !!fp.concentration
                const quick = bsurf?.quickValues ?? fp.quickDoses
                return (
                  <DoseSelector
                    accent="violet"
                    hint={fp.doseHint}
                    quickValues={!isLA ? quick : undefined}
                    concentrationOptions={isLA ? conc : undefined}
                    concentration={fp.concentration}
                    onConcentrationChange={c => setFp(f => f ? {...f, concentration: c, customConc: "", unit: c ? "ml" : f.unit} : f)}
                    customConcentration={fp.customConc}
                    onCustomConcentrationChange={v => setFp(f => f ? {...f, customConc: v} : f)}
                    value={fp.dose} onValueChange={dose => setFp(f => f ? {...f, dose, unit: laSelected ? "ml" : f.unit} : f)}
                    valuePlaceholder="Dose"
                    min={laSelected ? 0 : br.min} max={laSelected ? 30 : br.max} step={laSelected ? 1 : br.step}
                    units={!laSelected ? ["mg","mcg","ml","g","IU"] : undefined}
                    unit={fp.unit} onUnitChange={u => setFp(f => f ? {...f, unit: u} : f)}
                    unitSuffix={laSelected ? "ml" : undefined}
                    routes={fp.routes} route={fp.route} onRouteChange={r => setFp(f => {
                      if (!f) return f
                      const sugg = calcSuggestedDose(f.name, ibw ?? null, tbw ?? null, r)
                      const surf = bolusRouteSurface(f.name, r)
                      return { ...f, route: r, dose: sugg.dose, doseHint: sugg.hint, unit: surf?.unit ?? f.unit, quickDoses: surf?.quickValues ?? f.quickDoses, concentration: undefined, customConc: "" }
                    })}
                    confirmLabel="Administer" onConfirm={fpCommitBolus}
                  />
                )
              })()}

              {fp.mode === "infusion" && (
                (() => {
                  const isurf = infusionRouteSurface(fp.name, fp.route)
                  const conc = isurf ? (isurf.mode?.includes("concentration") ? isurf.concentrationOptions : undefined) : LA_CONCENTRATIONS[fp.name]
                  const isLA = !!conc?.length
                  const basis = INFUSION_WEIGHT_BASIS[fp.name]
                  const isPerKg = fp.rateUnit?.includes("/kg/")
                  const wt = basis === "TBW" ? tbw : ibw
                  const extraHint = isPerKg && basis
                    ? `⚖ Total will use ${basis}${wt ? ` ${Math.round(wt * 10) / 10} kg` : " — enter patient weight in preop"}`
                    : undefined
                  return (
                    <DoseSelector
                      accent="blue"
                      concentrationOptions={isLA ? conc : undefined}
                      concentration={fp.concentration}
                      onConcentrationChange={c => setFp(f => f ? {...f, concentration: c, customConc: ""} : f)}
                      customConcentration={fp.customConc}
                      onCustomConcentrationChange={v => setFp(f => f ? {...f, customConc: v} : f)}
                      quickValues={fp.quickRates}
                      value={String(fp.rate)} onValueChange={v => setFp(f => f ? {...f, rate: parseFloat(v) || f.rateMin} : f)}
                      valuePlaceholder="Rate"
                      min={fp.rateMin} max={fp.rateMax} step={fp.rateStep}
                      units={!isLA ? fp.rateUnits : undefined}
                      unit={fp.rateUnit} onUnitChange={u => setFp(f => f ? {...f, rateUnit: u} : f)}
                      unitSuffix={fp.rateUnit}
                      extraHint={extraHint}
                      routes={fp.routes} route={fp.route} onRouteChange={r => setFp(f => {
                        if (!f) return f
                        const surf = infusionRouteSurface(f.name, r)
                        if (!surf) return { ...f, route: r }
                        return { ...f, route: r,
                          rateUnit: surf.unit, rateUnits: [surf.unit],
                          rateMin: surf.min, rateMax: surf.max, rateStep: surf.step,
                          rate: surf.suggestedRate ?? surf.min,
                          quickRates: surf.quickValues ?? f.quickRates,
                          concentration: surf.suggestedConcentration, customConc: "" }
                      })}
                      confirmLabel="Start Infusion" onConfirm={fpCommitInfusion}
                    />
                  )
                })()
              )}
            </div>
          )
        })()}
      </>,
      document.body
    )}
    {doseEditDrug && createPortal(
      <div className="fixed inset-0 z-50" onClick={() => setDoseEditDrug(null)}>
        <div className="absolute bg-white dark:bg-[#2a2a2a] rounded-xl shadow-2xl p-3 space-y-2 w-52 border border-slate-200 dark:border-[#3a3a3a]"
          style={{ top: Math.min(doseEditDrug.rect.bottom + 4, window.innerHeight - 160), left: Math.min(doseEditDrug.rect.left, window.innerWidth - 220) }}
          onClick={e => e.stopPropagation()}>
          <p className="text-[10px] font-semibold text-violet-500 uppercase tracking-wide">{t("intraop.timetable.changeDose")}</p>
          <div className="flex items-center gap-1.5">
            <input type="number" value={doseEditDrug.dose}
              onChange={e => setDoseEditDrug(prev => prev ? { ...prev, dose: e.target.value } : null)}
              autoFocus
              className="flex-1 text-sm border border-slate-200 dark:border-[#3a3a3a] rounded-lg px-2 py-1 bg-white dark:bg-[#1e1e1e] focus:outline-none focus:ring-1 focus:ring-violet-400 [appearance:textfield]"
              placeholder="0" />
            <select value={doseEditDrug.unit}
              onChange={e => setDoseEditDrug(prev => prev ? { ...prev, unit: e.target.value } : null)}
              className="text-xs border border-slate-200 dark:border-[#3a3a3a] rounded-lg px-1 py-1 bg-white dark:bg-[#1e1e1e] focus:outline-none">
              {["mg","mcg","g","ml","IU"].map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
          <button type="button"
            onClick={() => {
              const next = [...data.drugs]
              next[doseEditDrug.idx] = { ...next[doseEditDrug.idx], dose: doseEditDrug.dose, unit: doseEditDrug.unit }
              onChange({ ...data, drugs: next })
              setDoseEditDrug(null)
            }}
            className="w-full text-xs font-semibold bg-violet-500 hover:bg-violet-600 text-white rounded-lg py-1.5 transition-colors">
            Apply
          </button>
        </div>
      </div>,
      document.body
    )}
    {/* Infusion context menu */}
    {infMenu && createPortal(
      <div className="fixed inset-0 z-50" onClick={() => setInfMenu(null)}>
        <div className="absolute bg-white dark:bg-[#2a2a2a] rounded-xl shadow-xl border border-slate-200 dark:border-[#3a3a3a] overflow-hidden min-w-[160px]"
          style={{ top: Math.min(infMenu.rect.bottom + 4, window.innerHeight - 120), left: Math.min(infMenu.rect.left, window.innerWidth - 180) }}
          onClick={e => e.stopPropagation()}>
          <p className="text-[9px] font-bold uppercase tracking-wider px-3 pt-2.5 pb-1 flex items-center gap-1.5" style={{ color: infMenu.color }}>
            {displayInfusionName(infMenu.name)}
            {infMenu.stopped && <span className="text-[8px] font-normal text-slate-400 normal-case tracking-normal">discontinued</span>}
          </p>
          {infMenu.stopped ? (
            <button type="button"
              onClick={() => { restoreInfusion(infMenu.segId); setInfMenu(null) }}
              className="w-full text-left text-sm font-medium px-4 py-2.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors text-emerald-600 dark:text-emerald-400">
              Restore infusion
            </button>
          ) : (
            <>
              <button type="button"
                onClick={() => {
                  const seg = (data.infusions ?? []).find(i => i.id === infMenu.segId)
                  if (!seg) { setInfMenu(null); return }
                  // seg.name carries a " 1%"-style concentration suffix for LA infusions
                  // (kept for display backward-compat) — strip it to look up the base
                  // drug's config/concentration options.
                  const baseDrugName = seg.concentration && seg.name.endsWith(seg.concentration)
                    ? seg.name.slice(0, -(seg.concentration.length + 1)) : seg.name
                  const cfg = INFUSION_CONFIGS[baseDrugName] ?? DEFAULT_INF
                  const pillCol = infMenu.fromPillCol
                  const cur = pillCol != null ? (
                    pillCol === seg.startCol ? { rate: seg.rate, unit: seg.unit, concentration: seg.concentration }
                    : (seg.rateChanges ?? []).find(rc => rc.col === pillCol) ?? { rate: seg.rate, unit: seg.unit, concentration: seg.concentration }
                  ) : { rate: seg.rate, unit: seg.unit, concentration: seg.concentration }
                  setRateDialog({ segId: seg.id, name: baseDrugName, rate: Number(cur.rate) || 0, unit: cur.unit, units: cfg.units, rateMin: cfg.min, rateMax: cfg.max, rateStep: cfg.step, color: infMenu.color, rect: infMenu.rect, step: "rate", timeH: "", timeM: "", editFromCol: pillCol, concentration: cur.concentration, baseDrugName })
                  setInfMenu(null)
                }}
                className="w-full text-left text-sm font-medium px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-[#333] transition-colors text-slate-700 dark:text-slate-200">
                Change rate
              </button>
              <button type="button"
                onMouseEnter={() => setHoverDiscontinue(infMenu.segId)}
                onMouseLeave={() => setHoverDiscontinue(null)}
                onClick={() => { setHoverDiscontinue(null); extendInfusion(infMenu.segId, nowCol ?? 0, true); setInfMenu(null) }}
                className="w-full text-left text-sm font-medium px-4 py-2.5 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-600 dark:text-red-400 border-t border-slate-100 dark:border-[#3a3a3a]">
                Discontinue
              </button>
            </>
          )}
        </div>
      </div>,
      document.body
    )}
    {/* Rate change dialog */}
    {rateDialog && createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setRateDialog(null)}>
        <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl p-5 w-72 space-y-4 border border-slate-200 dark:border-[#3a3a3a]"
          onClick={e => e.stopPropagation()}>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: rateDialog.color }}>{displayInfusionName(rateDialog.name)}{rateDialog.concentration ? ` ${rateDialog.concentration}` : ""} — Change rate</p>
            {rateDialog.step === "rate" && <p className="text-[10px] text-slate-400">{t("intraop.timetable.setNewRatePrompt")}</p>}
            {rateDialog.step === "time" && <p className="text-[10px] text-slate-400">{t("intraop.timetable.pickRateChangeTime")}</p>}
            {(() => {
              const basis = INFUSION_WEIGHT_BASIS[rateDialog.name]
              const isPerKg = rateDialog.unit?.includes("/kg/")
              if (!isPerKg || !basis) return null
              const wt = basis === "TBW" ? tbw : ibw
              return (
                <p className="text-[9px] text-amber-500 dark:text-amber-400 mt-1">
                  ⚖ Drug totals calculated using {basis}{wt ? ` ${Math.round(wt * 10) / 10} kg` : " — enter patient weight in preop"}
                </p>
              )
            })()}
          </div>

          {rateDialog.step === "rate" && (
            <>
              {LA_CONCENTRATIONS[rateDialog.baseDrugName ?? rateDialog.name] && (
                <div className="space-y-1.5 pb-1 border-b border-slate-100 dark:border-[#2a2a2a]">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{t("intraop.timetable.concentration")}</p>
                  <div className="flex flex-wrap gap-1">
                    {LA_CONCENTRATIONS[rateDialog.baseDrugName ?? rateDialog.name].map(c => (
                      <button key={c} type="button"
                        onClick={() => setRateDialog(d => d ? { ...d, concentration: d.concentration === c ? undefined : c } : d)}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all ${
                          rateDialog.concentration === c
                            ? "bg-sky-500 border-sky-500 text-white"
                            : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-sky-400 dark:hover:border-sky-600"
                        }`}>{c}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input type="number" value={rateDialog.rate} autoFocus
                    min={rateDialog.rateMin} max={rateDialog.rateMax} step={rateDialog.rateStep}
                    onChange={e => setRateDialog(d => d ? { ...d, rate: parseFloat(e.target.value) || d.rateMin } : d)}
                    className="flex-1 text-lg font-semibold text-center border border-slate-200 dark:border-[#3a3a3a] rounded-lg px-2 py-1.5 bg-white dark:bg-[#2a2a2a] focus:outline-none focus:ring-1 focus:ring-blue-400 [appearance:textfield]" />
                  <select value={rateDialog.unit}
                    onChange={e => setRateDialog(d => d ? { ...d, unit: e.target.value } : d)}
                    className="text-xs border border-slate-200 dark:border-[#3a3a3a] rounded-lg px-2 py-1.5 bg-white dark:bg-[#2a2a2a] focus:outline-none">
                    {rateDialog.units.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <input type="range" min={rateDialog.rateMin} max={rateDialog.rateMax} step={rateDialog.rateStep}
                  value={rateDialog.rate}
                  onChange={e => setRateDialog(d => d ? { ...d, rate: parseFloat(e.target.value) } : d)}
                  className="w-full accent-blue-500" />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>{rateDialog.rateMin}</span><span>{rateDialog.rateMax} {rateDialog.unit}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => {
                    const col = rateDialog.editFromCol !== undefined ? rateDialog.editFromCol : nowCol ?? 0
                    applyInfRateChange(rateDialog.segId, rateDialog.editFromCol ?? null, col, rateDialog.rate, rateDialog.unit, rateDialog.concentration)
                    setRateDialog(null)
                  }}
                  className="flex-1 text-sm font-semibold bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-2 transition-colors">
                  {rateDialog.editFromCol !== undefined ? "Apply" : "Start now"}
                </button>
                {rateDialog.editFromCol === undefined && (
                  <button type="button"
                    onClick={() => setRateDialog(d => d ? { ...d, step: "time" } : d)}
                    className="flex-1 text-sm font-semibold border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] rounded-lg py-2 transition-colors">
                    Pick time
                  </button>
                )}
              </div>
            </>
          )}

          {rateDialog.step === "time" && (() => {
            const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))
            const mins = Array.from(
              { length: 60 / INTRAOP_COLUMN_MINUTES },
              (_, index) => String(index * INTRAOP_COLUMN_MINUTES).padStart(2, "0"),
            )
            const selCls = "flex h-10 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 flex-1"
            return (
              <>
                <div className="flex items-center gap-2">
                  <select className={selCls} value={rateDialog.timeH}
                    onChange={e => setRateDialog(d => d ? { ...d, timeH: e.target.value } : d)}>
                    <option value="">HH</option>
                    {hours.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <span className="font-bold text-slate-400">:</span>
                  <select className={selCls} value={rateDialog.timeM}
                    onChange={e => setRateDialog(d => d ? { ...d, timeM: e.target.value } : d)}>
                    <option value="">MM</option>
                    {mins.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setRateDialog(d => d ? { ...d, step: "rate" } : d)}
                    className="text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-500 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors">
                    Back
                  </button>
                  <button type="button"
                    disabled={!rateDialog.timeH || !rateDialog.timeM}
                    onClick={() => {
                      const startMins = timeToMins(floorTo5(startTime || "08:00"))
                      const changeMins = timeToMins(`${rateDialog.timeH}:${rateDialog.timeM}`)
                      const diff = (changeMins - startMins + 1440) % 1440
                      const changeCol = Math.min(Math.floor(diff / INTERVAL), colCount - 1)
                      applyInfRateChange(rateDialog.segId, null, changeCol, rateDialog.rate, rateDialog.unit, rateDialog.concentration)
                      setRateDialog(null)
                    }}
                    className="flex-1 text-sm font-semibold bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white rounded-lg py-2 transition-colors">
                    Confirm
                  </button>
                </div>
              </>
            )
          })()}
        </div>
      </div>,
      document.body
    )}
    {/* Vitals slider popup */}
    {vitalsPopup && createPortal(
      (() => {
        const currentCellVal = data.vitals[vitalsPopup.col]?.[vitalsPopup.key]
        function commitAndClose() {
          // If cell was never touched, persist the displayed value (prev column's value or hardcoded default)
          if (currentCellVal === undefined) {
            setVital(vitalsPopup!.col, vitalsPopup!.key, String(vitalsPopup!.defaultVal))
          }
          setVitalsPopup(null)
        }
        return (
          <div className="fixed inset-0 z-50" onClick={commitAndClose}>
            <div className="absolute bg-white dark:bg-[#2a2a2a] rounded-xl shadow-2xl p-4 w-64 border border-slate-200 dark:border-[#3a3a3a] space-y-3"
              style={{ top: Math.min(vitalsPopup.rect.bottom + 6, window.innerHeight - 220), left: Math.max(4, Math.min(vitalsPopup.rect.left - 80, window.innerWidth - 280)) }}
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: vitalsPopup.color }} />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{vitalsPopup.label}</span>
                <span className="text-xs text-slate-400 ml-auto">{vitalsPopup.unit}</span>
              </div>
              {vitalsPopup.key === "etco2" || vitalsPopup.key === "temp" ? (
                <ConvertedStepper
                  measurement={vitalsPopup.key === "etco2" ? "etco2" : "temperature"}
                  canonicalValue={currentCellVal ?? vitalsPopup.defaultVal}
                  onCanonicalChange={v => setVital(vitalsPopup.col, vitalsPopup.key, v !== undefined ? String(v) : "")}
                  canonicalMin={vitalsPopup.min} canonicalMax={vitalsPopup.max} canonicalStep={vitalsPopup.step}
                  showSlider
                />
              ) : (
                <NumberStepper
                  value={currentCellVal ?? vitalsPopup.defaultVal}
                  onChange={v => setVital(vitalsPopup.col, vitalsPopup.key, v !== undefined ? String(v) : "")}
                  min={vitalsPopup.min}
                  max={vitalsPopup.max}
                  step={vitalsPopup.step}
                  unit={vitalsPopup.unit}
                  showSlider
                />
              )}
              <button type="button" onClick={commitAndClose}
                className="w-full text-sm font-semibold bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-1.5 transition-colors">
                Done
              </button>
            </div>
          </div>
        )
      })(),
      document.body
    )}
    {/* Delete infusion prompt (dragged bar off the left edge) */}
    {deleteInfPrompt && createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl p-6 w-72 space-y-4 border border-slate-200 dark:border-[#3a3a3a]">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("intraop.timetable.deleteInfusionConfirm")}</p>
          <p className="text-xs text-slate-400">{t("intraop.timetable.barDraggedOffTimeline")}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setDeleteInfPrompt(null)}
              className="flex-1 text-sm px-4 py-2 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-500 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors">
              Cancel
            </button>
            <button type="button"
              onClick={() => { removeInfusion(deleteInfPrompt); setDeleteInfPrompt(null) }}
              className="flex-1 text-sm font-semibold bg-red-500 hover:bg-red-600 text-white rounded-lg py-2 transition-colors">
              Delete
            </button>
          </div>
        </div>
      </div>,
      document.body
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
    {discFluidState && (() => {
      const fluid = (data.fluids ?? []).find(f => f.id === discFluidState.id)
      if (!fluid) return null
      const bagVol = parseInt(fluid.volume) || 500
      const curAmt = parseInt(discFluidState.volInput) || 0
      const rect = discFluidState.rect
      return createPortal(
        <div className="fixed z-50 bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-xl p-3 space-y-2"
          style={{ top: rect.bottom + 6, left: Math.min(rect.right - 200, window.innerWidth - 210), width: 200 }}
          onClick={e => e.stopPropagation()}>
          <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-2">
            {displayFluidName(fluid.name)}{fluid.volume ? ` — ${fluid.volume} mL bag` : ""}
          </p>
          <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-100 mb-2">{t("intraop.timetable.wasFullBagInfused")}</p>
          <div className="flex gap-2 mb-2">
            <button type="button"
              onClick={() => setDiscFluidState(s => s ? { ...s, fullBag: true, volInput: String(bagVol) } : s)}
              className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg border-2 transition-colors ${discFluidState.fullBag === true ? "bg-teal-500 border-teal-500 text-white" : "border-teal-300 dark:border-teal-700 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20"}`}>
              ✓ Yes — full bag
            </button>
            <button type="button"
              onClick={() => setDiscFluidState(s => s ? { ...s, fullBag: false, volInput: "0" } : s)}
              className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg border-2 transition-colors ${discFluidState.fullBag === false ? "bg-amber-500 border-amber-500 text-white" : "border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"}`}>
              No — partial
            </button>
          </div>
          {discFluidState.fullBag === false && (
            <div className="space-y-1.5 mb-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">{t("intraop.timetable.amountLabel")}</span>
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">{curAmt} mL</span>
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
              disabled={discFluidState.fullBag === null}
              onClick={() => {
                const d = dataRef.current
                onChangeRef.current({
                  ...d,
                  fluids: (d.fluids ?? []).map(f =>
                    f.id === discFluidState.id
                      ? { ...f, endCol: Math.max(nowCol ?? f.endCol, f.startCol), stopped: true as const, volume: discFluidState.volInput }
                      : f
                  ),
                })
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
