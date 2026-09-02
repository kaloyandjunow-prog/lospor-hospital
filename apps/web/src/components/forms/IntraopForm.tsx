"use client"

import { useForm, useWatch, type Resolver } from "react-hook-form"
import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { createPortal } from "react-dom"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useLocale, useTranslations } from "next-intl"
import { IntraopTimetable, type TimetableData, type IntraopLogEvent } from "@/components/IntraopTimetable"
import { calcInfusionTotal, type WeightBasisMap } from "@/lib/infusion-calc"
import { calculateDrugTotals } from "@lospor/core/intraop-summary"
import { infusionLocalAnaestheticMg } from "@lospor/core/intraop-totals"
import { buildTree as buildTechniqueTree, techniqueIsGeneral, techniqueUsesGas } from "@/components/TechniqueTree"
import { calcABW } from "@/lib/scores"
import { getMedicationWarnings } from "@/lib/risk-derivation"
import {
  AIRWAY_DEVICE_REQUIRED_FIELDS,
  isAirwayDeviceComplete,
  requiredMonitoringFieldsForTechniques,
  syncAirwayDeviceSelection,
  type AirwayDeviceWithProfile,
} from "@lospor/core/intraop"
import { INTRAOP_COLUMN_MINUTES } from "@lospor/core/intraop-engine"
import { EquipmentSuggestions } from "@/components/EquipmentSuggestions"
import { useClinicalRules } from "@/hooks/useClinicalRules"
import { useOptionLibrary } from "@/hooks/useOptionLibrary"
import { SectionCard } from "@/components/forms/shared/SectionCard"
import type { PremDoseCfg, PremedCat } from "@/components/intraop/PremedicationPicker"
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
  mapPremedicationCategories,
  premedicationDoseMap,
  weightBasisMap,
} from "@lospor/core/option-library"
import {
  buildPediatricPremedLibrary,
  pediatricPremedDoseForRoute,
  type PediatricPremedAnnotation,
  type PediatricPremedPatient,
} from "@lospor/core/pediatric-premedication-library"
import {
  buildIntraopEndTiming,
  isValidTimeZone,
  resolvedTimeZone,
} from "@/lib/intraop-time"
import {
  evaluateIntraopReadiness,
  type ClinicalIssueCode,
} from "@lospor/core/clinical-validation"
import { resolveIdealBodyWeight } from "@lospor/core/ideal-body-weight"
import { fluidDeliveredVolumeMl } from "@/lib/fluid-entry-ui"
import { INTRAOP_ISSUE_KEYS } from "./intraop-issue-copy"

// ── Schema ────────────────────────────────────────────────────────────────────
const vitalsRowSchema = z.object({
  time:      z.string().optional(),
  systolic:  z.coerce.number().nullable().optional(),
  diastolic: z.coerce.number().nullable().optional(),
  heartRate: z.coerce.number().nullable().optional(),
  spO2:      z.coerce.number().nullable().optional(),
  etco2:     z.coerce.number().nullable().optional(),
  temp:      z.coerce.number().nullable().optional(),
  bgl:       z.coerce.number().nullable().optional(),
  note:      z.string().optional(),
})

const drugSchema = z.object({
  name:  z.string().min(1),
  dose:  z.string(),
  unit:  z.string().default("mg"),
  route: z.string().default("IV"),
  time:  z.string().optional(),
})

const schema = z.object({
  monthYear:      z.string().optional(),
  startTime:      z.string().optional(),
  endTime:        z.string().optional(),
  endTimeNextDay: z.boolean().default(false),
  startedAt:      z.string().nullable().optional(),
  endedAt:        z.string().nullable().optional(),
  timezone:       z.string().nullable().optional(),

  positions: z.array(z.string()).catch([]).default([]),

  techniques:      z.array(z.string()).catch([]).default([]),
  airwayDevices:   z.array(z.string()).catch([]).default([]),
  tubeSize:        z.coerce.number().nullable().optional(),
  cuffed:          z.boolean().optional(),
  lmaSize:         z.coerce.number().nullable().optional(),
  oralTubeSize:    z.coerce.number().nullable().optional(),
  oralCuffed:      z.boolean().optional(),
  nasalTubeSize:   z.coerce.number().nullable().optional(),
  nasalCuffed:     z.boolean().optional(),
  peepCmH2O:       z.coerce.number().nullable().optional(),
  ventilationModes:z.array(z.string()).catch([]).default([]),
  airwayTools:     z.array(z.string()).catch([]).default([]),
  airwayNotes:     z.string().optional(),
  cormackLehane:   z.enum(["I","IIa","IIb","III","IV"]).optional(),
  dltType:         z.string().optional(),
  dltSide:         z.string().optional(),
  dltSize:         z.coerce.number().nullable().optional(),
  endobronchialSize: z.coerce.number().nullable().optional(),

  volatileAgent:   z.enum(["SEVOFLURANE","DESFLURANE","ISOFLURANE"]).optional(),
  plexusBlock:      z.enum(["AXILLARY","INTERSCALENE","SUPRACLAVICULAR","INFRACLAVICULAR","FEMORAL","SCIATIC","POPLITEAL","TAP","ERECTOR_SPINAE"]).optional(),
  cvkSite:          z.enum(["INTERNAL_JUGULAR","EXTERNAL_JUGULAR","SUBCLAVIAN","FEMORAL"]).optional(),
  arterialLineSite: z.enum(["RADIAL","DORSALIS_PEDIS","FEMORAL","BRACHIAL"]).optional(),

  ecg: z.boolean().default(true), spO2Monitor: z.boolean().default(true),
  nbpMonitor: z.boolean().default(true),
  etco2Monitor: z.boolean().default(false), tempMonitor: z.boolean().default(false),
  invasiveBP: z.boolean().default(false), cvpMonitor: z.boolean().default(false),
  paCatheter: z.boolean().default(false), tee: z.boolean().default(false),
  bis: z.boolean().default(false), entropyMonitor: z.boolean().default(false),
  nirsMonitor: z.boolean().default(false), evokedPotentials: z.boolean().default(false),
  tofMonitor: z.boolean().default(false),
  bglMonitor: z.boolean().default(false), bloodGasMonitor: z.boolean().default(false),
  urinaryCatheter: z.boolean().default(false), stomachTube: z.boolean().default(false),
  neuroMonitor: z.boolean().default(false),
  vascularAccesses: z.array(z.object({ site: z.string(), siteLabel: z.string(), sizeUnit: z.string(), size: z.string(), depthCm: z.string() }).passthrough()).catch([]).default([]),

  premedicationEvening: z.string().optional(),
  premedicationMorning: z.string().optional(),

  drugsAdministered: z.array(drugSchema).default([]),
  vitals:            z.array(vitalsRowSchema).default([]),

  crystalloidsMl:    z.coerce.number().nullable().optional(),
  colloidsMl:        z.coerce.number().nullable().optional(),
  bloodMl:           z.coerce.number().nullable().optional(),
  urineMl:           z.coerce.number().nullable().optional(),
  // nullable, not merely optional — the same reason ageYears is. Blood loss is
  // clinician-entered, and "not recorded" must stay distinct from a recorded
  // 0 mL, so an explicit clear has to survive as null into the patch rather
  // than becoming undefined (dropped, stored value kept) or 0 (a measurement
  // nobody made).
  bloodLossMl:       z.coerce.number().min(0).max(20000).nullable().optional(),

  complications: z.string().optional(),
})

// IntraopFormFields is the exact shape useForm<T>() is parameterized with —
// every field react-hook-form actually registers/validates. IntraopData adds
// timetableData on top for onSubmit/onAutoSave payloads only: the timetable
// is its own separate component state (see `timetable`/`setTimetable` below),
// attached via spread at the call sites, never a registered RHF field. Mixing
// the two into one type previously broke RHF's resolver/Control generics.
export type IntraopFormFields = z.infer<typeof schema>
export type IntraopData = IntraopFormFields & { timetableData?: TimetableData }

// Position, airway management, and monitoring option lists now live in the
// OptionLibrary table (POSITION / AIRWAY_MANAGEMENT / MONITORING categories)
// and are fetched via useOptionLibrary inside IntraopForm below.

import type { PreopSummary } from "@/components/forms/preop-summary"

export function IntraopForm({ defaultValues, defaultTimetable, preop, onSubmit, onBack, onAutoSave, onPostopContinued, layoutMode = "tabs", caseStarted: caseStartedProp = false, eventLog, onDeleteEvent, onLogEvent, onLogEventDelete }: {
  defaultValues?: Partial<IntraopData>
  defaultTimetable?: TimetableData
  preop?: PreopSummary | null
  onSubmit: (data: IntraopData) => void
  onBack: () => void
  onAutoSave?: (data: IntraopData) => void
  onPostopContinued?: (items: string[]) => void
  layoutMode?: "tabs" | "scroll"
  caseStarted?: boolean
  eventLog?: IntraopLogEvent[]
  onDeleteEvent?: (id: string) => void
  onLogEvent?: (event: IntraopLogEvent) => void
  onLogEventDelete?: (match: { infId?: string; fluidId?: string }) => void
}) {
  const t = useTranslations()
  const localizeIssue = (code: ClinicalIssueCode) => {
    const messageKey = INTRAOP_ISSUE_KEYS[code]
    return messageKey ? t(messageKey) : code
  }
  const locale = useLocale()
  const { register, handleSubmit, control, watch, setValue, getValues, formState } = useForm<IntraopFormFields>({
    // zodResolver's inferred generic doesn't exactly match z.infer<typeof
    // schema> for a schema this size (lots of .optional()/.default() fields)
    // — a known zod-v4/react-hook-form resolver-typing friction point, not
    // something this cast is hiding a real mismatch behind.
    resolver: zodResolver(schema) as Resolver<IntraopFormFields>,
    defaultValues: {
      monthYear: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` })(),
      drugsAdministered: [], vitals: [], positions: [], techniques: [],
      airwayDevices: [], ventilationModes: [], airwayTools: [],
      nbpMonitor: true, spO2Monitor: true, ecg: true,
      ...defaultValues,
    },
  })

  const { options: positionOptions } = useOptionLibrary("POSITION")
  const { options: techniqueLibOpts } = useOptionLibrary("TECHNIQUE")
  const techniqueTree = useMemo(() => buildTechniqueTree(techniqueLibOpts, locale), [locale, techniqueLibOpts])
  const { options: monitoringOptions } = useOptionLibrary("MONITORING")
  const { options: airwayOptions } = useOptionLibrary("AIRWAY_MANAGEMENT")
  const { options: premedOptions } = useOptionLibrary("PREMED_DRUG")
  const { options: infusionLibOpts } = useOptionLibrary("INTRAOP_INFUSION")
  const infusionWeightBasis = useMemo<WeightBasisMap>(
    () => Object.fromEntries(
      Object.entries(weightBasisMap(infusionLibOpts)).map(([name, basis]) => [
        name,
        basis === "IBW" || basis === "TBW" ? basis : "none",
      ]),
    ),
    [infusionLibOpts],
  )
  const airwayDeviceOptions = useMemo(() => airwayOptions.filter(o => o.group === "Device"), [airwayOptions])
  const airwayToolOptions = useMemo(() => airwayOptions.filter(o => o.group === "Instrument"), [airwayOptions])
  // Premedication for a child is rebuilt from the child's weight and age, drug
  // by drug. Without this the picker offered a 12 kg two-year-old the adult
  // library unchanged — a gram of paracetamol — because PremDoseCfg carries a
  // fixed amount with no weight term. The rebuild lives in @lospor/core so this
  // and the mobile sheet cannot drift apart on a dose.
  // Declared here rather than beside the IBW block below, because the premedication
  // rebuild needs them and `const` does not hoist.
  const clinicalMode = preop?.clinicalMode === "PEDIATRIC" ? "PEDIATRIC" : "ADULT"
  const isPediatric = clinicalMode === "PEDIATRIC"

  const premedPatient = useMemo<PediatricPremedPatient>(() => ({
    weightKg: preop?.weightKg ?? null,
    heightCm: preop?.heightCm ?? null,
    sex: preop?.sex ?? null,
    age: isPediatric && preop?.ageValue != null && preop.ageUnit
      ? { value: preop.ageValue, unit: preop.ageUnit }
      : null,
  }), [isPediatric, preop])

  const premedPediatric = useMemo(
    () => isPediatric
      ? buildPediatricPremedLibrary(mapPremedicationCategories(premedOptions), premedPatient)
      : null,
    [isPediatric, premedOptions, premedPatient],
  )

  const premedCategories = useMemo<PremedCat[]>(() => {
    if (premedPediatric) {
      return premedPediatric.map(category => ({
        cat: category.category,
        drugs: category.drugs.map(drug => drug.name),
      }))
    }
    const byGroup = new Map<string, string[]>()
    for (const o of premedOptions) {
      const group = o.group ?? "Other"
      if (!byGroup.has(group)) byGroup.set(group, [])
      byGroup.get(group)!.push(o.label)
    }
    return Array.from(byGroup, ([cat, drugs]) => ({ cat, drugs }))
  }, [premedOptions, premedPediatric])

  const premedDoses = useMemo<Record<string, PremDoseCfg>>(() => {
    if (!premedPediatric) return premedicationDoseMap(premedOptions)
    const map: Record<string, PremDoseCfg> = {}
    for (const category of premedPediatric) {
      for (const { name, pediatric: _annotation, ...cfg } of category.drugs) map[name] = cfg
    }
    return map
  }, [premedOptions, premedPediatric])

  /** Provenance and withheld reasons, keyed by drug, empty outside paediatric mode. */
  const premedAnnotations = useMemo<Record<string, PediatricPremedAnnotation>>(() => {
    if (!premedPediatric) return {}
    const map: Record<string, PediatricPremedAnnotation> = {}
    for (const category of premedPediatric) {
      for (const drug of category.drugs) {
        if (drug.pediatric) map[drug.name] = drug.pediatric
      }
    }
    return map
  }, [premedPediatric])

  // Oral midazolam is 0.5 mg/kg and intravenous is 0.05; leaving the previous
  // number in place across a route change is a tenfold error waiting to happen.
  const premedDoseForRoute = useCallback((drugName: string, route: string): number | null => {
    if (!premedPediatric) return null
    const cfg = premedDoses[drugName]
    if (!cfg) return null
    const next = pediatricPremedDoseForRoute({ name: drugName, ...cfg }, route, premedPatient)
    return next.status === "calculated" ? next.dose : null
  }, [premedDoses, premedPatient, premedPediatric])

  const EMPTY_TIMETABLE = useMemo<TimetableData>(() => ({ vitals: [], drugs: [], fluids: [], agents: [], infusions: [], gasSettings: [], clinicalEvents: [] }), [])
  const safeTimetable = (defaultTimetable && !Array.isArray(defaultTimetable) && "vitals" in defaultTimetable)
    ? defaultTimetable : EMPTY_TIMETABLE
  const [timetable, setTimetable] = useState<TimetableData>(safeTimetable)
  const [timetableDirty, setTimetableDirty] = useState(false)
  const [manualSaved, setManualSaved] = useState(false)

  function handleDeleteEventWithTimetable(evId: string) {
    const ev = eventLog?.find(e => e.id === evId)
    if (ev?.type === "fluid_start" && ev.fluidId) {
      setTimetable(prev => ({ ...prev, fluids: (prev.fluids ?? []).filter(f => f.id !== ev.fluidId) }))
    } else if (ev?.type === "infusion_start" && ev.infId) {
      setTimetable(prev => ({ ...prev, infusions: (prev.infusions ?? []).filter(i => i.id !== ev.infId) }))
    }
    onDeleteEvent?.(evId)
  }

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
  const calcIbw = ibwResolution.available ? ibwResolution.kilograms : null
  const calcTbw = preop?.weightKg ?? null

  const liveDrugTotals = useMemo(() => {
    // Bolus totals come from Core, not a local aggregation. The inline version
    // this replaced rounded to two decimals while Core rounds to three, so the
    // same case could show different totals on the web form and at the bedside.
    const bolusList = calculateDrugTotals({ drugs: timetable.drugs }).map(row => ({
      ...row,
      mgTotal: null as number | null,
    }))

    const infusionList = (timetable.infusions ?? []).map(inf => {
      const { amount, unit, weightUsed, weightBasis } = calcInfusionTotal(inf, calcIbw, calcTbw, infusionWeightBasis)
      return {
        name: inf.name,
        total: amount,
        unit,
        mgTotal: infusionLocalAnaestheticMg(inf.name, amount, unit),
        weightUsed,
        weightBasis,
      }
    })

    // If any infusion used a weight-adjusted calculation, build a footnote
    const weightedEntries = infusionList.filter(r => r.weightUsed != null)
    const weightNote = weightedEntries.length > 0 ? (() => {
      const ibwUsed = weightedEntries.some(r => r.weightBasis === "IBW") ? calcIbw : null
      const tbwUsed = weightedEntries.some(r => r.weightBasis === "TBW") ? calcTbw : null
      const parts: string[] = []
      if (ibwUsed) parts.push(`IBW ${Math.round(ibwUsed * 10) / 10} kg`)
      if (tbwUsed) parts.push(`TBW ${Math.round((tbwUsed ?? 0) * 10) / 10} kg`)
      return parts.length ? `† Weight-adjusted totals use ${parts.join(" / ")}` : null
    })() : null

    return { bolusList, infusionList, weightNote }
  }, [calcIbw, calcTbw, infusionWeightBasis, timetable.drugs, timetable.infusions])

  // Auto-calculate fluid totals from the one canonical delivered-volume path.
  // Running rate entries advance against the real clock; bag entries retain
  // their selected size until a full/partial actual amount is confirmed.
  useEffect(() => {
    function updateFluidTotals() {
      const asOf = new Date()
      let crystalloids = 0, colloids = 0, blood = 0
      for (const fluid of timetable.fluids ?? []) {
        const volume = fluidDeliveredVolumeMl(fluid, asOf)
        if (!volume) continue
        const category = fluid.category ?? ""
        if (category === "Crystalloids") crystalloids += volume
        else if (category === "Colloids") colloids += volume
        else if (category === "Blood products") blood += volume
      }
      setValue("crystalloidsMl", crystalloids || undefined)
      setValue("colloidsMl",     colloids     || undefined)
      setValue("bloodMl",        blood        || undefined)
    }

    updateFluidTotals()
    const hasRunningRate = (timetable.fluids ?? []).some(
      fluid => fluid.fluidEntryMode === "RATE" && !fluid.stopped,
    )
    if (!hasRunningRate) return
    const timer = window.setInterval(updateFluidTotals, 30_000)
    return () => window.clearInterval(timer)
  }, [setValue, timetable.fluids])

  // Smart monitoring defaults — fire once when technique first selected
  const watchedTechniques = useWatch({ control, name: "techniques" })
  const techniques = useMemo(() => watchedTechniques ?? [], [watchedTechniques])

  useEffect(() => {
    const techs = techniques
    if (!techs.length) return

    const setMissing = (field: keyof IntraopFormFields) => {
      if (!getValues(field)) setValue(field, true)
    }
    for (const field of requiredMonitoringFieldsForTechniques(techs, {
      emergency: preop?.emergencySurgery ?? false,
    })) {
      setMissing(field as keyof IntraopFormFields)
    }
  }, [getValues, preop?.emergencySurgery, setValue, techniques])

  // Debounced auto-save — skip on initial mount so loading a case never overwrites DB with form defaults
  const mountedRef   = useRef(false)
  // Keep a ref to the latest save function so the unmount effect can call it
  const pendingSaveRef = useRef<(() => void) | null>(null)

  const allValues = useWatch({ control })
  // Watch array fields explicitly so their changes always trigger auto-save
  const _wAD = useWatch({ control, name: "airwayDevices" })
  const _wVM = useWatch({ control, name: "ventilationModes" })
  const _wAT = useWatch({ control, name: "airwayTools" })
  const _wPS = useWatch({ control, name: "positions" })
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
  const allValuesKey = JSON.stringify(allValues)
  const airwayDevicesKey = JSON.stringify(_wAD)
  const ventilationModesKey = JSON.stringify(_wVM)
  const airwayToolsKey = JSON.stringify(_wAT)
  const positionsKey = JSON.stringify(_wPS)

  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return }
    if (!onAutoSave) return
    const payload = { ...getValues() }
    const save = () => onAutoSave(payload)
    pendingSaveRef.current = save                    // always keep latest snapshot
    const timer = setTimeout(save, 1000)             // reduced from 2 s → 1 s
    return () => clearTimeout(timer)
  }, [airwayDevicesKey, airwayToolsKey, allValuesKey, getValues, onAutoSave, positionsKey, ventilationModesKey])

  // Fire pending save immediately when user navigates away (component unmounts)
  useEffect(() => {
    return () => {
      if (pendingSaveRef.current) pendingSaveRef.current()
    }
  }, [])
  const [presentsIntubated,    setPresentsIntubated]    = useState(false)
  const [airwayNA,             setAirwayNA]             = useState(false)
  const [timeErrors,           setTimeErrors]           = useState<{ startTime?: boolean; endTime?: boolean }>({})
  const [incompleteItems,      setIncompleteItems]      = useState<string[] | null>(null)
  const [canContinueIncomplete, setCanContinueIncomplete] = useState(true)
  const [advancedMonOpen,      setAdvancedMonOpen]      = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("defaultMonitoring") === "advanced"
  )
  const [airwayExpandedDevice, setAirwayExpandedDevice] = useState<string | null>(null)
  const [activeTab,            setActiveTab]            = useState("overview")
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
    }
    if (complete && !deviceWasCompleteOnOpen.current) setAirwayExpandedDevice(null)
  }, [_wDltSide, _wDltSize, _wDltType, _wEbSize, _wLmaSize, _wNasalCuffed, _wNasalTubeSize, _wOralCuffed, _wOralTubeSize, airwayExpandedDevice, getValues, setValue])


  const watchedStartTime = useWatch({ control, name: "startTime" })
  const watchedStartedAt = useWatch({ control, name: "startedAt" })
  const watchedEndTime = useWatch({ control, name: "endTime" })
  const watchedNbpMonitor = useWatch({ control, name: "nbpMonitor" })
  const watchedInvasiveBP = useWatch({ control, name: "invasiveBP" })
  const watchedEcg = useWatch({ control, name: "ecg" })
  const watchedSpO2Monitor = useWatch({ control, name: "spO2Monitor" })
  const watchedEtco2Monitor = useWatch({ control, name: "etco2Monitor" })
  const watchedTempMonitor = useWatch({ control, name: "tempMonitor" })
  const watchedBglMonitor = useWatch({ control, name: "bglMonitor" })
  const startTime  = watchedStartTime || "08:00"
  const showAirway   = techniqueIsGeneral(techniques)
  const showGases    = techniqueUsesGas(techniques)
  const medicationWarnings = useMemo(() => getMedicationWarnings(preop?.currentMedications ?? []), [preop?.currentMedications])

  const monitoring = {
    nbpMonitor:    !!watchedNbpMonitor,
    invasiveBP:    !!watchedInvasiveBP,
    ecg:           !!watchedEcg,
    spO2Monitor:   !!watchedSpO2Monitor,
    etco2Monitor:  !!watchedEtco2Monitor,
    tempMonitor:   !!watchedTempMonitor,
    bglMonitor:    !!watchedBglMonitor,
  }

  function addMinutes(hhmm: string, minutes: number): string {
    const [h, m] = (hhmm || "00:00").split(":").map(Number)
    const total  = (h * 60 + m + minutes + 1440) % 1440
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
  }

  function handleContinue() {
    const vals = getValues()

    const readiness = evaluateIntraopReadiness({
      ...vals,
      airwayDevices: presentsIntubated || airwayNA
        ? ["DOCUMENTED_WITHOUT_NEW_DEVICE"]
        : vals.airwayDevices,
      timetableData: timetable,
      keyEvents: eventLog,
    } as Record<string, unknown>)
    const blockerCodes = new Set(readiness.blockers.map(issue => issue.code))
    const errs = {
      startTime: blockerCodes.has("missing_start_time") || blockerCodes.has("invalid_intraop_times"),
      endTime: blockerCodes.has("missing_end_time") || blockerCodes.has("invalid_intraop_times"),
    }
    setTimeErrors(errs)

    if (readiness.blockers.length > 0) {
      setCanContinueIncomplete(false)
      setIncompleteItems(readiness.blockers.map(issue => localizeIssue(issue.code)))
      if (errs.startTime || errs.endTime) {
        setActiveTab("overview")
        setTimeout(() => timelineSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50)
      }
      return
    }

    if (readiness.warnings.length > 0) {
      setCanContinueIncomplete(true)
      setIncompleteItems(readiness.warnings.map(issue => localizeIssue(issue.code)))
      return
    }

    doSubmit()
  }

  function doSubmit() {
    // Bypass react-hook-form's Zod resolver — handleContinue already validates
    // the mandatory fields (startTime, endTime). Calling handleSubmit() here
    // causes Zod to reject fields it can't parse (e.g. null-vs-undefined
    // mismatches on Json array fields), which silently blocks navigation.
    handleSubmitWithTimetable(getValues() as IntraopData)
  }

  function handleManualSave() {
    if (!onAutoSave) return
    onAutoSave({ ...getValues() })
    setTimetableDirty(false)
    setManualSaved(true)
    setTimeout(() => setManualSaved(false), 2000)
  }

  function handleSubmitWithTimetable(formData: IntraopData) {
    const vitals = (timetable.vitals ?? [])
      .map((v, i) => ({ ...v, time: addMinutes(startTime, i * INTRAOP_COLUMN_MINUTES) }))
      .filter(v => Object.values(v).some(x => x != null && x !== v.time))

    const infusionEntries = (timetable.infusions ?? []).map(inf => ({
      name:  inf.name,
      dose:  String(inf.rate),
      unit:  inf.unit,
      route: "Infusion",
      time:  addMinutes(startTime, inf.startCol * INTRAOP_COLUMN_MINUTES),
    }))
    const bolusDrugs = (timetable.drugs ?? []).map(d => ({
      name:  d.name,
      dose:  d.dose,
      unit:  d.unit,
      route: "IV",
      time:  addMinutes(startTime, d.colIdx * INTRAOP_COLUMN_MINUTES),
    }))

    onSubmit({ ...formData, vitals, drugsAdministered: [...bolusDrugs, ...infusionEntries], timetableData: timetable })
  }

  return (
    <form onSubmit={handleSubmit(handleSubmitWithTimetable)} className="flex flex-col gap-0">

      {/* Dual-mode layout — tabs or scroll, sharing the same section content */}
      {(() => {
        const tabOverview = (<>

      {/* Preop summary */}
      {preop && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">{t("intraop.preopSummary")}</p>
          {preop.diagnosis && (
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 leading-snug">{preop.diagnosis}</p>
          )}
          {preop.plannedProcedure && (
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">{preop.plannedProcedure}</p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {preop.asaScore && (
              <span className="font-bold text-amber-800 dark:text-amber-300">
                ASA {preop.asaScore}{preop.emergencySurgery ? "E" : ""}
              </span>
            )}
            {preop.emergencySurgery && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white">{t("intraop.emergencyBadge")}</span>
            )}
            {preop.bmi != null && <span className="text-slate-600 dark:text-slate-300">BMI {preop.bmi}</span>}
            {calcIbw != null && (() => {
              const ibw = Math.round(calcIbw * 10) / 10
              const abw = !isPediatric && preop.weightKg ? calcABW(ibw, preop.weightKg) : null
              return <>
                <span className="text-slate-600 dark:text-slate-300">IBW {ibw} kg</span>
                {abw != null && <span className="text-slate-600 dark:text-slate-300">ABW {abw} kg</span>}
              </>
            })()}
            {(preop.bpSystolic || preop.heartRate || preop.spO2) && (
              <span className="text-slate-600 dark:text-slate-300">
                {preop.bpSystolic && preop.bpDiastolic ? `BP ${preop.bpSystolic}/${preop.bpDiastolic}` : ""}
                {preop.heartRate ? ` · HR ${preop.heartRate}` : ""}
                {preop.spO2 ? ` · SpO₂ ${preop.spO2}%` : ""}
              </span>
            )}
            {preop.mallampati && <span className="text-slate-600 dark:text-slate-300">Mallampati {preop.mallampati}</span>}
            {preop.difficultAirwayHistory && <span className="font-semibold text-orange-700 dark:text-orange-400">{t("intraop.difficultAirwayHistory")}</span>}
          </div>
          {preop.allergies && preop.allergyDetails && preop.allergyDetails.length > 0 && (
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">
              {t("intraop.allergiesPrefix")} {preop.allergyDetails.map(a => a.label).join(", ")}
            </p>
          )}
          {Array.isArray(preop.comorbidities) && preop.comorbidities.length > 0 && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {preop.comorbidities.slice(0, 4).map(c => c.label).join(" · ")}
              {preop.comorbidities.length > 4 ? ` +${preop.comorbidities.length - 4} more` : ""}
            </p>
          )}
          {Array.isArray(preop.labResults) && preop.labResults.filter(l => l.value).length > 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {preop.labResults.filter(l => l.value).map(l => `${l.test} ${l.value}${l.unit ? " "+l.unit : ""}`).join(" · ")}
            </p>
          )}
          {medicationWarnings.length > 0 && (
            <div className="pt-1 space-y-0.5">
              {medicationWarnings.map(w => (
                <p key={w.key} className="text-sm font-semibold text-orange-700 dark:text-orange-400">⚠ {w.label}</p>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Equipment suggestions */}
      {preop && isPediatric ? (
        <EquipmentSuggestions
          clinicalMode="PEDIATRIC"
          ageValue={preop.ageValue}
          ageUnit={preop.ageUnit}
          ageYears={preop.ageYears}
          weightKg={preop.weightKg}
          heightCm={preop.heightCm}
          sex={preop.sex}
          bmi={preop.bmi}
          mallampati={preop.mallampati}
          neckMobility={preop.neckMobility}
          mouthOpeningCm={preop.mouthOpeningCm}
          cormackLehane={preop.cormackLehane}
        />
      ) : preop && (preop.weightKg || preop.heightCm || preop.ageYears) ? (
        <EquipmentSuggestions
          clinicalMode="ADULT"
          ageYears={preop.ageYears}
          weightKg={preop.weightKg}
          heightCm={preop.heightCm}
          sex={preop.sex}
          bmi={preop.bmi}
          mallampati={preop.mallampati}
          neckMobility={preop.neckMobility}
          mouthOpeningCm={preop.mouthOpeningCm}
          cormackLehane={preop.cormackLehane}
        />
      ) : null}

      {/* Timeline */}
      <div ref={timelineSectionRef} data-tour="intraop-timing">
      <TimelineSection
        t={t} control={control} watch={watch} setValue={setValue} getValues={getValues}
        onAutoSave={onAutoSave}
        timeErrors={timeErrors} setTimeErrors={setTimeErrors}
        monDefaultsAppliedRef={monDefaultsApplied}
        setAdvancedMonOpen={setAdvancedMonOpen} setAirwayExpandedDevice={setAirwayExpandedDevice}
      />
      </div>

      {/* Positions (multi-select) */}
      <PositionSection t={t} control={control} watch={watch} positionOptions={positionOptions} />

        </>)
        const tabAnaesthesia = (<>

      {/* Monitoring */}
      <div data-tour="intraop-monitoring">
      <MonitoringSection t={t} watch={watch} setValue={setValue} monitoringOptions={monitoringOptions}
        advancedMonOpen={advancedMonOpen} setAdvancedMonOpen={setAdvancedMonOpen} />
      </div>{/* /intraop-monitoring */}

      {/* Anaesthesia technique */}
      <div data-tour="intraop-technique">
      <TechniqueSection t={t} control={control} techniques={techniques} techniqueTree={techniqueTree}
        presentsIntubated={presentsIntubated} setPresentsIntubated={setPresentsIntubated} />

      <AirwaySection
        control={control} watch={watch} setValue={setValue} register={register}
        airwayToolOptions={airwayToolOptions} airwayDeviceOptions={airwayDeviceOptions}
        presentsIntubated={presentsIntubated} showAirway={showAirway} techniquesLength={techniques.length}
        airwayOverride={airwayOverride} setAirwayOverride={setAirwayOverride}
        airwayNA={airwayNA} setAirwayNA={setAirwayNA}
        airwayExpandedDevice={airwayExpandedDevice} setAirwayExpandedDevice={setAirwayExpandedDevice}
        expandAirwayDevice={expandAirwayDevice}
      />

      {/* Volatile agent & gas settings are now a timetable lane (see IntraopTimetable's
          Gas Settings row, gated by the same showAgentRow prop below) — removed from
          here so settings are tracked over time instead of set once statically. */}

      {/* Vascular access */}
      <VascularAccessSection control={control} watch={watch} />

      {/* Premedication */}
      <PremedicationSection t={t} control={control} watch={watch} premedCategories={premedCategories} premedDoses={premedDoses}
        premedAnnotations={premedAnnotations} premedDoseForRoute={premedDoseForRoute}
        prospectiveGuidanceEnabled={prospectiveGuidanceEnabled} />
      </div>{/* /intraop-technique */}

        </>)
        const tabChart = (<>

      {/* Intraoperative timetable */}
      <div data-tour="intraop-timetable">
      <SectionCard title={t("intraop.vitalsSection")}>
        <IntraopTimetable
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
          startedAt={watchedStartedAt || undefined}
          endTime={watchedEndTime || undefined}
          caseStarted={caseStartedProp || !!watchedStartTime}
          monitoring={monitoring}
          showAgentRow={showGases}
          ibw={calcIbw}
          tbw={preop?.weightKg ?? null}
          data={timetable}
          onChange={newData => { setTimetable(newData); setTimetableDirty(true) }}
          onLogEvent={onLogEvent}
          onLogEventDelete={onLogEventDelete}
          onEndCase={() => {
            const now = new Date()
            const savedZone = getValues("timezone")
            const zone = isValidTimeZone(savedZone) ? savedZone : resolvedTimeZone()
            const timing = zone ? buildIntraopEndTiming(now, zone) : null
            const hh = String(now.getHours()).padStart(2, "0")
            const mm = String(now.getMinutes()).padStart(2, "0")
            setValue("endTime", timing?.endTime ?? `${hh}:${mm}`)
            if (timing) {
              setValue("endedAt", timing.endedAt)
              setValue("timezone", timing.timezone)
            }
            // Auto-advance end date if case crossed midnight
            const st = getValues("startTime") || "00:00"
            const [sh, sm] = st.split(":").map(Number)
            if (now.getHours() * 60 + now.getMinutes() < sh * 60 + sm) setValue("endTimeNextDay", true)
          }}
          onResumeCase={() => {
            setValue("endTime", "")
            setValue("endTimeNextDay", false)
            setValue("endedAt", null)
          }}
          onPostopContinued={items => onPostopContinued?.(items)}
          onComplicationAdded={labels => {
            const cur = getValues("complications") || ""
            const existing = cur.split(";").map((s: string) => s.trim()).filter(Boolean)
            const newItems = labels.filter((l: string) => !existing.includes(l))
            if (newItems.length === 0) return
            setValue("complications", [...existing, ...newItems].join("; "))
          }}
        />
      </SectionCard>

      {/* Drugs and Fluid Balance Totals */}
      <DrugsFluidTotalsSection t={t} control={control} watch={watch} liveDrugTotals={liveDrugTotals} />
      </div>{/* /intraop-timetable */}

        </>)
        const tabFinish = (<>

      {/* Complications */}
      <ComplicationsSection t={t} control={control} watch={watch} eventLog={eventLog} onDeleteEvent={onDeleteEvent ? handleDeleteEventWithTimetable : undefined} />

        </>)
        if (layoutMode === "scroll") return (
          <div className="space-y-6 mt-6">
            {tabOverview}
            {tabAnaesthesia}
            {tabChart}
            {tabFinish}
          </div>
        )
        return (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-0">
            <TabsList variant="line" className="sticky top-0 z-20 w-full bg-white dark:bg-[#111] border-b border-slate-200 dark:border-[#2a2a2a] rounded-none px-4 mb-0 h-11 justify-start gap-1">
              <TabsTrigger value="overview"    className="text-xs font-semibold px-3">{t("intraop.tabs.overview")}</TabsTrigger>
              <TabsTrigger value="anaesthesia" className="text-xs font-semibold px-3">{t("intraop.tabs.anaesthesia")}</TabsTrigger>
              <TabsTrigger value="chart"       className="text-xs font-semibold px-3">{t("intraop.tabs.chart")}</TabsTrigger>
              <TabsTrigger value="finish"      className="text-xs font-semibold px-3">{t("intraop.tabs.finish")}</TabsTrigger>
            </TabsList>
            <TabsContent value="overview"    className="space-y-6 p-0 mt-6">{tabOverview}</TabsContent>
            <TabsContent value="anaesthesia" className="space-y-6 p-0 mt-6">{tabAnaesthesia}</TabsContent>
            <TabsContent value="chart"       className="space-y-6 p-0 mt-6">{tabChart}</TabsContent>
            <TabsContent value="finish"      className="space-y-6 p-0 mt-6">{tabFinish}</TabsContent>
          </Tabs>
        )
      })()}

      {/* Sticky footer — always visible across all tabs */}
      <div className="sticky bottom-0 z-20 bg-white dark:bg-[#111] border-t border-slate-200 dark:border-[#2a2a2a] px-4 py-3 flex justify-between items-center gap-3 mt-0">
        <Button type="button" variant="outline" size="lg" className="gap-2" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" /> {t("common.back")}
        </Button>
        <div className="flex items-center gap-3">
          {!!watchedEndTime && (formState.isDirty || timetableDirty) && (
            <Button type="button" size="lg"
              className={`gap-2 transition-colors ${manualSaved ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-600 hover:bg-slate-700"}`}
              onClick={handleManualSave}>
              {manualSaved ? t("intraop.saved") : t("intraop.saveChanges")}
            </Button>
          )}
          <Button type="button" size="lg" className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={handleContinue} data-tour="intraop-submit">
            {t("intraop.continuePostop")} <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Incomplete-sections warning modal */}
      {incompleteItems && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setIncompleteItems(null)}>
          <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4"
            onClick={e => e.stopPropagation()}>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                {canContinueIncomplete ? t("intraop.incompleteTitle") : t("intraop.requiredMissingTitle")}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {canContinueIncomplete
                  ? t("intraop.incompleteDescription")
                  : t("intraop.requiredMissingDescription")}
              </p>
            </div>
            <ul className="space-y-1">
              {incompleteItems.map(item => (
                <li key={item} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            {canContinueIncomplete && (
              <p className="text-xs text-slate-400">{t("intraop.incompleteOptional")}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button type="button"
                onClick={() => setIncompleteItems(null)}
                className="flex-1 text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors">
                {t("intraop.goBack")}
              </button>
              {canContinueIncomplete && (
                <button type="button"
                  onClick={() => { setIncompleteItems(null); doSubmit() }}
                  className="flex-1 text-sm font-semibold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                  {t("intraop.continueAnyway")}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </form>
  )
}
