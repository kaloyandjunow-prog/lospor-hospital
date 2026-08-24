"use client"

import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { useForm, Controller, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations, useLocale } from "next-intl"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { calcBMI, calcABW, calcApfel, calcRCRI, calcStopBang } from "@/lib/scores"
import { RiskScoreCards } from "@/components/forms/RiskScoreCards"
import { getBodySystem, suggestASAFromTags, SYSTEM_COLORS, SYSTEM_ORDER, type BodySystem } from "@/lib/icd-categories"
import { suggestRcriIschemicHeart, suggestRcriCHF, suggestRcriCVD, suggestRcriInsulinDM, suggestRcriCreatinine, suggestStopBangBP } from "@/lib/risk-derivation"
import { ChevronRight, Lightbulb, X } from "lucide-react"
import { ClinicalYesNo } from "@/components/ClinicalYesNo"
import { AirwayFeatures } from "@/components/forms/sections/AirwayFeatures"
import { TagInput, type Tag } from "@/components/TagInput"
import { NumberStepper } from "@/components/NumberStepper"
import { ConvertedStepper } from "@/components/ConvertedStepper"
import { AIAdvisor } from "@/components/AIAdvisor"
import { LabResults, type LabResult } from "@/components/LabResults"
import GuardedTextarea from "@/components/GuardedTextarea"
import { useOptionLibrary, useRange } from "@/hooks/useOptionLibrary"
import { displayOption, resolveDisplayOption } from "@/lib/clinical-display"
import { schema, type PreopData } from "@/components/forms/preopSchema"
import {
  ClinicalModeAgeFields,
  PediatricRiskAndCalculators,
  PediatricVitalReferenceNote,
} from "@/components/forms/PediatricPreopSections"
import { validateClinicalModeAge } from "@lospor/core/pediatric"
import { resolveIdealBodyWeight } from "@lospor/core/ideal-body-weight"
import { metadataString } from "@lospor/core/option-contracts"

export type { PreopData } from "@/components/forms/preopSchema"

type Icd10SearchItem = { code: string; description: string; descriptionBg?: string }
type ProcedureSearchItem = { code: string; group?: string; description: string; domain: string }
type DrugSearchItem = { name: string; inn?: string; strength?: string; atcCode?: string }

// ── Schema ────────────────────────────────────────────────────────────────────
// .passthrough() (not just listing every field) so renderSuggestion can carry
// through whatever extra coded fields a given picker attaches (code/system/
// labelEn/labelBg for ICD-10, inn/atcCode for drugs) without the zod-validated
// submit path silently stripping them — autosave already preserves them since
// it reads getValues() directly and never goes through this schema, but the
// final-submit path does, so this schema must declare (or pass through) the
// same shape or submit silently regresses data autosave already has.
function ComorbiditiesBySystem({
  tags,
  onRemove,
}: {
  tags: Tag[]
  onRemove: (label: string) => void
}) {
  if (tags.length === 0) return null

  const grouped: Partial<Record<BodySystem, Tag[]>> = {}
  for (const tag of tags) {
    const code   = tag.sub ?? ""
    const system = getBodySystem(code)
    if (!grouped[system]) grouped[system] = []
    grouped[system]!.push(tag)
  }

  return (
    <div className="space-y-3 pt-3 border-t border-slate-100">
      {SYSTEM_ORDER.filter(s => grouped[s]).map(system => (
        <div key={system}>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{system}</p>
          <div className="flex flex-wrap gap-1.5">
            {grouped[system]!.map(tag => (
              <span
                key={tag.label}
                className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${SYSTEM_COLORS[system]}`}
              >
                <span>{tag.label}</span>
                <button type="button" onClick={() => onRemove(tag.label)} className="ml-0.5 opacity-60 hover:opacity-100">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function SectionCard({ title, children, action, error }: { title: string; children: React.ReactNode; action?: React.ReactNode; error?: boolean }) {
  return (
    <Card className={error ? "border-red-500 dark:border-red-500" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base text-slate-700">{title}</CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}


// Non-boolean fields whose input is a single tap (pill/select grids) — these
// autosave near-instantly; boolean toggles are detected by value type instead.
const DISCRETE_PREOP_FIELDS = new Set<string>([
  "sex", "asaScore", "mallampati", "cormackLehane", "neckMobility", "bloodType", "rhFactor",
  "clinicalMode", "ageUnit",
])

// ── Component ─────────────────────────────────────────────────────────────────
/**
 * Shown under a field whose value the server declined to store.
 *
 * `role="status"` rather than `role="alert"`: it is worth announcing, but it
 * must not interrupt someone mid-entry. Nothing here can block the form.
 */
function RejectionNote({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p className="text-red-500 text-xs mt-1" role="status">{msg}</p>
}

export function PreopForm({ defaultValues, onSubmit, onAutoSave, layoutMode = "scroll", caseId, rejectedFields }: {
  defaultValues?: Partial<PreopData>
  onSubmit: (data: PreopData) => void
  onNameChange?: (name: string) => void
  onIdChange?: (id: string) => void
  onAutoSave?: (data: PreopData) => void | Promise<void>
  layoutMode?: "tabs" | "scroll"
  caseId?: string | null
  /** Values the server refused, keyed by field, shown beside the field itself. */
  rejectedFields?: Map<string, string>
}) {
  const t      = useTranslations()
  const locale = useLocale()


  const { options: bloodGroupOptions }   = useOptionLibrary("BLOOD_GROUP")
  const { options: neckMobilityOptions } = useOptionLibrary("NECK_MOBILITY")
  const { options: mallampatiOptions }   = useOptionLibrary("MALLAMPATI")
  const { options: upperLipBiteOptions } = useOptionLibrary("UPPER_LIP_BITE")
  const { options: cormackLehaneOptions }= useOptionLibrary("CORMACK_LEHANE")
  const heightRange      = useRange("HEIGHT_RANGE")
  const weightRange      = useRange("WEIGHT_RANGE")
  const bpSystolicRange  = useRange("BP_SYSTOLIC_RANGE")
  const bpDiastolicRange = useRange("BP_DIASTOLIC_RANGE")
  const heartRateRange   = useRange("HEART_RATE_RANGE")
  const spo2Range        = useRange("SPO2_RANGE")
  const temperatureRange = useRange("TEMPERATURE_RANGE")
  const respiratoryRange = useRange("RESPIRATORY_RATE_RANGE")
  const mouthOpeningRange= useRange("MOUTH_OPENING_RANGE")
  const thyromentalRange = useRange("THYROMENTAL_RANGE")
  const { register, handleSubmit, control, watch, setValue, getValues } = useForm<PreopData>({
    // Same zod-v4/react-hook-form resolver-typing friction as IntraopForm.tsx
    // (a large schema with many .optional()/.default() fields doesn't
    // exactly match zodResolver's inferred generic).
    resolver: zodResolver(schema) as Resolver<PreopData>,
    defaultValues: {
      clinicalMode: "ADULT",
      // Vital signs start unset. They used to be pre-filled with random values
      // inside normal adult ranges, which meant that entering an age was enough
      // to save a blood pressure, pulse, saturation and temperature that nobody
      // had measured -- indistinguishable, in the stored record, from readings
      // that were. An unrecorded observation must stay unrecorded.
      comorbidities: [], diagnoses: [], procedures: [], currentMedications: [], allergyDetails: [],
      pediatricFasting: [],
      ...Object.fromEntries(Object.entries(defaultValues ?? {}).filter(([, v]) => v !== undefined && v !== null)),
    },
  })

  // ── Batched watch subscriptions (5 groups instead of 19 individual) ──────────
  const [height, weight, sex, ageYearsVal, smoking, highRiskSurgery, emergencySurgery,
         allergies, familyAnesthesiaProblems, difficultAirwayHistory, comorbidities, bloodType, rhFactor,
         clinicalMode, ageValue, ageUnit] =
    watch(["heightCm", "weightKg", "sex", "ageYears", "smoking", "highRiskSurgery", "emergencySurgery",
           "allergies", "familyAnesthesiaProblems", "difficultAirwayHistory", "comorbidities", "bloodType", "rhFactor",
           "clinicalMode", "ageValue", "ageUnit"])
  const isPediatric = clinicalMode === "PEDIATRIC"
  const [currentMedications, labResults] = watch(["currentMedications", "labResults"])

  const [rcriIschemicHeart, rcriCHF, rcriCVD, rcriInsulinDM, rcriCreatinine] =
    watch(["rcriIschemicHeart", "rcriCHF", "rcriCVD", "rcriInsulinDM", "rcriCreatinine"])

  const [apfelPONVHistory, apfelPostopOpioids, stopbangSnoring, stopbangTired, stopbangObserved, stopbangBP, stopbangNeck] =
    watch(["apfelPONVHistory", "apfelPostopOpioids", "stopbangSnoring", "stopbangTired", "stopbangObserved", "stopbangBP", "stopbangNeck"])

  useEffect(() => {
    if (!allergies && (getValues("allergyDetails")?.length ?? 0) > 0) {
      setValue("allergyDetails", [], { shouldDirty: true })
    }
    if (!familyAnesthesiaProblems && getValues("familyAnesthesiaDetails")) {
      setValue("familyAnesthesiaDetails", "", { shouldDirty: true })
    }
    if (!difficultAirwayHistory && getValues("difficultAirwayNotes")) {
      setValue("difficultAirwayNotes", "", { shouldDirty: true })
    }
  }, [allergies, familyAnesthesiaProblems, difficultAirwayHistory, getValues, setValue])

  // ── Memoised score + BMI calculations ────────────────────────────────────────
  const bmi  = useMemo(() => height && weight ? calcBMI(Number(height), Number(weight)) : null,
    [height, weight])
  // Resolve IBW from the same versioned method used by equipment and drug
  // calculations: Devine for adults and McLaren/CDC for pediatric patients.
  const ibwResolution = useMemo(() => resolveIdealBodyWeight({
    clinicalMode: isPediatric ? "PEDIATRIC" : "ADULT",
    heightCm: height == null ? null : Number(height),
    sex,
    age: isPediatric && ageValue != null && ageUnit
      ? { value: Number(ageValue), unit: ageUnit }
      : null,
  }), [ageUnit, ageValue, height, isPediatric, sex])
  const ibw = ibwResolution.available ? ibwResolution.roundedKg : null
  const abw = useMemo(() => !isPediatric && ibw != null && weight ? calcABW(ibw, Number(weight)) : null, [ibw, isPediatric, weight])
  const asaSuggestion = useMemo(() => suggestASAFromTags(comorbidities ?? [], isPediatric ? null : bmi), [comorbidities, bmi, isPediatric])

  // Suggestions only — never silently auto-checked, same rule as ASA above.
  const rcriSuggested = useMemo(() => ({
    rcriIschemicHeart: suggestRcriIschemicHeart(comorbidities ?? []),
    rcriCHF:            suggestRcriCHF(comorbidities ?? []),
    rcriCVD:            suggestRcriCVD(comorbidities ?? []),
    rcriInsulinDM:      suggestRcriInsulinDM(comorbidities ?? [], currentMedications ?? []),
    rcriCreatinine:     suggestRcriCreatinine(labResults ?? []),
  }), [comorbidities, currentMedications, labResults])
  const stopBangBPSuggested = useMemo(() => suggestStopBangBP(comorbidities ?? [], currentMedications ?? []), [comorbidities, currentMedications])

  const apfelScore = useMemo(() => calcApfel({
    female:         sex === "FEMALE",
    nonSmoker:      !smoking,
    ponvHistory:    apfelPONVHistory  ?? false,
    opioidsPlanned: apfelPostopOpioids ?? false,
  }), [sex, smoking, apfelPONVHistory, apfelPostopOpioids])

  const stopBangScore = useMemo(() => calcStopBang({
    snoring:      stopbangSnoring  ?? false,
    tired:        stopbangTired    ?? false,
    observed:     stopbangObserved ?? false,
    highBP:       stopbangBP       ?? false,
    bmi:          bmi ?? 0,
    ageOver50:    (ageYearsVal ?? 0) > 50,
    neckOver40cm: stopbangNeck    ?? false,
    male:         sex === "MALE",
  }), [stopbangSnoring, stopbangTired, stopbangObserved, stopbangBP, bmi, ageYearsVal, stopbangNeck, sex])

  // How much of each score was actually asked.
  //
  // The calculators treat an unasked criterion as absent -- deliberately, and
  // documented: a question nobody put to the patient must not count toward a
  // score. But the card showed only the number and a colour band, so "RCRI 1 —
  // low" read identically whether five criteria had been answered "no" or never
  // asked at all. The score stays as it is; what it was computed from is now
  // visible beside it.
  const answered = (values: Array<boolean | null | undefined>) =>
    values.filter(value => value != null).length
  const rcriAnswered = useMemo(() => answered([
    rcriIschemicHeart, rcriCHF, rcriCVD, rcriInsulinDM, rcriCreatinine,
  ]), [rcriIschemicHeart, rcriCHF, rcriCVD, rcriInsulinDM, rcriCreatinine])
  const apfelAnswered = useMemo(() => answered([
    smoking, apfelPONVHistory, apfelPostopOpioids,
  ]), [smoking, apfelPONVHistory, apfelPostopOpioids])
  const stopBangAnswered = useMemo(() => answered([
    stopbangSnoring, stopbangTired, stopbangObserved, stopbangBP, stopbangNeck,
  ]), [stopbangSnoring, stopbangTired, stopbangObserved, stopbangBP, stopbangNeck])

  const rcriScore = useMemo(() => calcRCRI({
    highRiskSurgery:          highRiskSurgery   ?? false,
    ischaemicHeartDisease:    rcriIschemicHeart ?? false,
    congestiveHeartFailure:   rcriCHF           ?? false,
    cerebrovascularDisease:   rcriCVD           ?? false,
    insulinDependentDiabetes: rcriInsulinDM     ?? false,
    creatinineHigh:           rcriCreatinine    ?? false,
  }), [highRiskSurgery, rcriIschemicHeart, rcriCHF, rcriCVD, rcriInsulinDM, rcriCreatinine])

  // "Unable to obtain" — persisted form fields (bpUnobtainable etc.), not local-only
  // state, so the flag survives a reload instead of silently resetting to unchecked.
  const UTO_FIELD = {
    bp: "bpUnobtainable", heartRate: "heartRateUnobtainable", spO2: "spO2Unobtainable",
    temperature: "temperatureUnobtainable", respiratoryRate: "respiratoryRateUnobtainable",
  } as const satisfies Record<string, keyof PreopData>
  const [bpUTOVal, heartRateUTOVal, spO2UTOVal, temperatureUTOVal, respiratoryRateUTOVal] =
    watch(["bpUnobtainable", "heartRateUnobtainable", "spO2Unobtainable", "temperatureUnobtainable", "respiratoryRateUnobtainable"])
  const vitalsUTO = useMemo(() => {
    const s = new Set<string>()
    if (bpUTOVal) s.add("bp")
    if (heartRateUTOVal) s.add("heartRate")
    if (spO2UTOVal) s.add("spO2")
    if (temperatureUTOVal) s.add("temperature")
    if (respiratoryRateUTOVal) s.add("respiratoryRate")
    return s
  }, [bpUTOVal, heartRateUTOVal, spO2UTOVal, temperatureUTOVal, respiratoryRateUTOVal])
  function toggleUTO(field: keyof typeof UTO_FIELD, clearFn: () => void) {
    const next = !vitalsUTO.has(field)
    setValue(UTO_FIELD[field], next)
    if (next) clearFn()
  }

  // ── Debounced auto-save — subscription callback instead of JSON.stringify ────
  const autosaveTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveInFlightRef   = useRef<Promise<void> | null>(null)

  useEffect(() => {
    if (!onAutoSave) return
    // eslint-disable-next-line react-hooks/incompatible-library
    const subscription = watch((values, { name }) => {
      const { sex, ageYears, ageValue: preciseAge, diagnoses } = values
      const hasData = sex || ageYears != null || preciseAge != null || (diagnoses?.length ?? 0) > 0
      if (!hasData) return
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
      // Discrete taps (pills/toggles/checkboxes) feel instant: the change is
      // atomic, so save right after the tap. Typing keeps the longer pause so
      // we don't save half-typed numbers/text.
      const changedValue = name ? (values as Record<string, unknown>)[name] : undefined
      const isDiscreteTap = typeof changedValue === "boolean" || (!!name && DISCRETE_PREOP_FIELDS.has(name))
      autosaveTimerRef.current = setTimeout(() => {
        autosaveTimerRef.current = null
        const p = Promise.resolve(onAutoSave(getValues()) ?? undefined)
        saveInFlightRef.current = p.finally(() => { saveInFlightRef.current = null }) as Promise<void>
      }, isDiscreteTap ? 150 : 1500)
    })
    return () => { subscription.unsubscribe(); if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current) }
  }, [getValues, onAutoSave, watch])

  // Flush any pending or in-flight autosave immediately; used by AIAdvisor before
  // calling the consent-checked endpoint so aiOptIn is persisted before the DB read.
  const flushSave = useCallback((): Promise<void> => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
      const p = Promise.resolve(onAutoSave?.(getValues()) ?? undefined)
      saveInFlightRef.current = p.finally(() => { saveInFlightRef.current = null }) as Promise<void>
      return saveInFlightRef.current
    }
    return saveInFlightRef.current ?? Promise.resolve()
  }, [getValues, onAutoSave])
  const airwayUTO = !!watch("airwayUnobtainable")
  const [activeTab, setActiveTab] = useState<"patient" | "case" | "history" | "exam" | "risk">("patient")

  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set())
  const refMap = useRef<Record<string, HTMLDivElement | null>>({})

  function fe(key: string) {
    // A server-refused value gets the same ring as a missing required one —
    // both mean "this field needs you", and one visual language is enough.
    return fieldErrors.has(key) || rejectedFields?.has(key)
      ? "ring-2 ring-red-500 dark:ring-red-500 rounded-lg"
      : ""
  }

  /**
   * The message under a field whose value the server would not store.
   *
   * States the accepted range, so it can be acted on without guessing, and
   * stays until the value is corrected — an alert that only appears in a header
   * is missed by anyone who types and immediately navigates away.
   */
  function rejectionOf(key: string): string | undefined {
    return rejectedFields?.get(key)
  }

  function validate(data: PreopData): string[] {
    const errs: string[] = []
    if (data.clinicalMode === "PEDIATRIC") {
      if (data.ageValue == null || !data.ageUnit) {
        errs.push("ageValue")
      } else if (!validateClinicalModeAge("PEDIATRIC", {
        value: data.ageValue,
        unit: data.ageUnit,
      }).valid) {
        errs.push("ageValue")
      }
    } else if (data.ageYears == null || !validateClinicalModeAge("ADULT", {
      value: data.ageYears,
      unit: "YEARS",
    }).valid) {
      errs.push("ageYears")
    }
    // UNKNOWN is a truthy string, so `!data.sex` would let it through. It means
    // "nobody recorded this yet" and must block submission exactly like a blank.
    if (!data.sex || data.sex === "UNKNOWN") errs.push("sex")
    if (!data.heightCm)             errs.push("heightCm")
    if (!data.weightKg)             errs.push("weightKg")
    if (!data.diagnoses?.length)    errs.push("diagnoses")
    if (!data.procedures?.length)   errs.push("procedures")
    if (!vitalsUTO.has("bp") && (!data.bpSystolic || !data.bpDiastolic)) errs.push("bp")
    if (!vitalsUTO.has("heartRate") && !data.heartRate)                  errs.push("heartRate")
    if (!vitalsUTO.has("respiratoryRate") && !data.respiratoryRate)      errs.push("respiratoryRate")
    if (!airwayUTO && !data.mallampati)  errs.push("airway")
    if (!data.asaScore)                  errs.push("asaScore")
    return errs
  }

  const TABS = [
    { value: "patient", label: "Patient"   },
    { value: "case",    label: "Case"      },
    { value: "history", label: "History"   },
    { value: "exam",    label: "Exam"      },
    { value: "risk",    label: "Risk & ASA"},
  ] as const

  function hasTabError(tab: string): boolean {
    if (fieldErrors.size === 0) return false
    switch (tab) {
      case "patient": return fieldErrors.has("ageYears") || fieldErrors.has("ageValue") || fieldErrors.has("sex") || fieldErrors.has("heightCm") || fieldErrors.has("weightKg")
      case "case":    return fieldErrors.has("diagnoses") || fieldErrors.has("procedures")
      case "exam":    return fieldErrors.has("bp") || fieldErrors.has("heartRate") || fieldErrors.has("respiratoryRate") || fieldErrors.has("airway")
      case "risk":    return fieldErrors.has("asaScore")
      default: return false
    }
  }

  function handleValidatedSubmit(data: PreopData) {
    const errs = validate(data)
    if (errs.length > 0) {
      const errSet = new Set(errs)
      setFieldErrors(errSet)
      if (layoutMode === "tabs") {
        const firstErr = errs[0]
        const tab: "patient" | "case" | "exam" | "risk" =
          firstErr === "ageYears"  || firstErr === "ageValue" || firstErr === "sex" ? "patient" :
          firstErr === "diagnoses" || firstErr === "procedures" ? "case" :
          firstErr === "bp" || firstErr === "heartRate" || firstErr === "respiratoryRate" || firstErr === "airway" ? "exam" :
          "risk"
        setActiveTab(tab)
      } else {
        const sectionOrder = ["ageYears","sex","diagnoses","procedures","bp","heartRate","respiratoryRate","airway","asaScore"]
        const firstErr = sectionOrder.find(e => errSet.has(e))
        if (firstErr) {
          const sectionKey =
            firstErr === "patientName" || firstErr === "patientId" ? "patient" :
            firstErr === "ageYears"   || firstErr === "ageValue" || firstErr === "sex" ? "demographics" :
            firstErr === "diagnoses"  || firstErr === "procedures" ? "case" :
            firstErr === "bp" || firstErr === "heartRate" || firstErr === "respiratoryRate" ? "vitals" :
            firstErr === "airway" ? "airway" : "asa"
          setTimeout(() => refMap.current[sectionKey]?.scrollIntoView({ behavior: "smooth", block: "center" }), 0)
        }
      }
      return
    }
    setFieldErrors(new Set())
    onSubmit(isPediatric
      ? {
          ...data,
          aiOptIn: false,
          rcriScore: undefined,
          apfelScore: undefined,
          stopBangScore: undefined,
        }
      : { ...data, rcriScore, apfelScore, stopBangScore },
    )
  }

  return (
    <form onSubmit={handleSubmit(handleValidatedSubmit, () => handleValidatedSubmit(getValues() as PreopData))} className="space-y-6">

      {/* Tab bar — tabs mode only */}
      {layoutMode === "tabs" && (
        <div className="sticky top-0 z-20 bg-white dark:bg-[#111] border-b border-slate-200 dark:border-[#2a2a2a] flex items-center h-11 -mx-0">
          {TABS.map(tab => (
            <button key={tab.value} type="button"
              onClick={() => setActiveTab(tab.value)}
              className={`relative h-full px-4 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === tab.value
                  ? "border-slate-900 dark:border-slate-100 text-slate-900 dark:text-slate-100"
                  : "border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
              }`}>
              {tab.label}
              {hasTabError(tab.value) && <span className="absolute top-2 right-0.5 w-1.5 h-1.5 rounded-full bg-red-500" />}
            </button>
          ))}
        </div>
      )}

      {/* ── Patient tab ─────────────────────────────────────────── */}
      <div className={layoutMode === "tabs" && activeTab !== "patient" ? "hidden" : ""}>
      {/* Demographics */}
      <div ref={el => { refMap.current.demographics = el }} data-tour="preop-demographics">
      <SectionCard title={t("preop.demographicsSection")} error={fieldErrors.has("ageYears") || fieldErrors.has("ageValue") || fieldErrors.has("sex") || fieldErrors.has("heightCm") || fieldErrors.has("weightKg")}>
        <div className="space-y-4">
          <ClinicalModeAgeFields control={control} setValue={setValue} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.height")} <span className="text-red-500">*</span></Label>
            <Controller name="heightCm" control={control} render={({ field }) => (
              <div className={fe("heightCm")}><ConvertedStepper measurement="height" canonicalValue={field.value} onCanonicalChange={field.onChange} canonicalMin={isPediatric ? 20 : heightRange.min} canonicalMax={heightRange.max} canonicalStep={isPediatric ? 0.1 : heightRange.step} showSlider /></div>
            )} />
            <RejectionNote msg={rejectionOf("heightCm")} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.weight")} <span className="text-red-500">*</span></Label>
            <Controller name="weightKg" control={control} render={({ field }) => (
              <div className={fe("weightKg")}><ConvertedStepper measurement="weight" canonicalValue={field.value} onCanonicalChange={field.onChange} canonicalMin={isPediatric ? 0.1 : weightRange.min} canonicalMax={weightRange.max} canonicalStep={isPediatric ? 0.1 : weightRange.step} showSlider /></div>
            )} />
            <RejectionNote msg={rejectionOf("weightKg")} />
          </div>
          </div>
        </div>

        {(bmi || ibw) && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {bmi && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 font-medium">{t("preop.bmi")}</span>
                <Badge variant={isPediatric ? "outline" : bmi >= 40 ? "destructive" : bmi >= 30 ? "secondary" : "default"}>{bmi} kg/m²</Badge>
              </div>
            )}
            {ibw != null && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 font-medium">{t("preop.ibw")}</span>
                <Badge variant="outline">{ibw} kg</Badge>
              </div>
            )}
            {abw && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 font-medium">{t("preop.abw")}</span>
                <Badge variant="outline" className="border-amber-300 text-amber-700">{abw} kg</Badge>
              </div>
            )}
            {ibw != null && (
              <span className="text-xs text-slate-400">
                {isPediatric ? "McLaren · CDC 2000" : t("preop.devineFormula")}
              </span>
            )}
          </div>
        )}

        {/* Sex */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.sex")} <span className="text-red-500">*</span></Label>
          <Controller name="sex" control={control} render={({ field }) => (
            <div className={`flex gap-3 ${fe("sex")}`}>
              {[
                { value: "MALE",   label: t("preop.male"),   icon: "♂" },
                { value: "FEMALE", label: t("preop.female"), icon: "♀" },
                { value: "OTHER",  label: t("preop.other"),  icon: "⚥" },
              ].map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => field.onChange(opt.value)}
                  className={`flex-1 rounded-xl border-2 py-2.5 text-sm font-semibold transition-all ${
                    field.value === opt.value
                      ? "border-blue-500 bg-blue-500 text-white dark:bg-slate-600 dark:border-slate-300 dark:text-white"
                      : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555]"
                  }`}>
                  <span className="text-lg block">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          )} />
        </div>
        {(fieldErrors.has("ageYears") || fieldErrors.has("sex") || fieldErrors.has("heightCm") || fieldErrors.has("weightKg")) && (
          <p className="text-red-500 text-xs">{t("preop.requiredDemographics")}</p>
        )}
        <div className="space-y-1">
          <Label>{t("preop.bloodType")}</Label>
          <div className="grid grid-cols-4 gap-2">
            {bloodGroupOptions.map(opt => {
              const bloodTypeValue = metadataString(opt.metadata, "bloodType")
              const rhFactorValue = metadataString(opt.metadata, "rhFactor")
              const optionBloodType = bloodTypeValue === "A" || bloodTypeValue === "B"
                || bloodTypeValue === "AB" || bloodTypeValue === "O"
                ? bloodTypeValue
                : undefined
              const optionRhFactor = rhFactorValue === "POSITIVE" || rhFactorValue === "NEGATIVE"
                ? rhFactorValue
                : undefined
              if (!optionBloodType || !optionRhFactor) return null
              const selected = bloodType === optionBloodType && rhFactor === optionRhFactor
              return (
                <button key={opt.value} type="button"
                  onClick={() => {
                    if (selected) { setValue("bloodType", undefined); setValue("rhFactor", undefined); return }
                    setValue("bloodType", optionBloodType)
                    setValue("rhFactor", optionRhFactor)
                  }}
                  className={`rounded-xl border-2 py-2 font-bold text-sm transition-all ${
                    selected
                      ? "bg-blue-500 border-blue-500 text-white dark:bg-slate-600 dark:border-slate-300 dark:text-white scale-105"
                      : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555]"
                  }`}>{displayOption("BLOOD_GROUP", opt, locale)}</button>
              )
            })}
          </div>
        </div>
      </SectionCard>
      </div>
      </div>

      {/* ── Case tab ─────────────────────────────────────────────── */}
      <div className={layoutMode === "tabs" && activeTab !== "case" ? "hidden" : ""}>
      {/* Case details */}
      <div ref={el => { refMap.current.case = el }} data-tour="preop-diagnosis">
      <SectionCard title={t("preop.caseSection")} error={fieldErrors.has("diagnoses") || fieldErrors.has("procedures")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1 sm:col-span-2">
            <Label>{t("preop.diagnosis")} <span className="text-red-500">*</span></Label>
            <Controller name="diagnoses" control={control} render={({ field }) => (
              <div className={fe("diagnoses")}>
                <TagInput
                  value={(field.value ?? []) as Tag[]}
                  onChange={field.onChange}
                  searchUrl={`/api/search/icd10?locale=${locale}`}
                  renderSuggestion={(item: Icd10SearchItem) => ({
                    label: locale === "bg" ? (item.descriptionBg || item.description) : item.description,
                    sub: item.code,
                    code: item.code,
                    system: "ICD-10",
                    labelEn: item.description,
                    labelBg: item.descriptionBg,
                  })}
                  allowFreeText={false}
                  minSearchLength={2}
                  placeholder={t("preop.diagnosisPlaceholder")}
                />
              </div>
            )} />
            {fieldErrors.has("diagnoses") && <p className="text-red-500 text-xs">At least one diagnosis is required.</p>}
            <RejectionNote msg={rejectionOf("diagnoses")} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>{t("preop.procedure")} <span className="text-red-500">*</span></Label>
            <Controller name="procedures" control={control} render={({ field }) => (
              <div className={fe("procedures")}>
                <TagInput
                  value={(field.value ?? []) as Tag[]}
                  onChange={field.onChange}
                  searchUrl="/api/search/procedures"
                  renderSuggestion={(item: ProcedureSearchItem) => ({
                    label: item.group || item.description,
                    sub: `${item.code} · ${item.domain}`,
                  })}
                  placeholder={t("preop.procedurePlaceholder")}
                />
              </div>
            )} />
            {fieldErrors.has("procedures") && <p className="text-red-500 text-xs">{t("preop.procedureRequired")}</p>}
            <RejectionNote msg={rejectionOf("procedures")} />
          </div>
          <div className="space-y-1 col-span-full">
            <Label>{t("preop.teamNotes")} <span className="font-normal text-slate-400">({t("common.optional")})</span></Label>
            <GuardedTextarea
              {...register("teamNotes")}
              maxLength={500}
              rows={2}
              placeholder={t("preop.teamNotesPlaceholder")}
            />
            <RejectionNote msg={rejectionOf("teamNotes")} />
          </div>
        </div>
        <div className="flex flex-wrap gap-3 pt-1">
          <div className="flex items-center gap-2">
            <Controller name="highRiskSurgery" control={control} render={({ field }) => (
              <Checkbox id="highRiskSurgery" checked={!!field.value} onCheckedChange={field.onChange} />
            )} />
            <Label htmlFor="highRiskSurgery" className="font-normal cursor-pointer">{t("preop.highRiskSurgery")}</Label>
          </div>
          <Controller name="elective" control={control} render={({ field }) => (
            <button type="button"
              onClick={() => { field.onChange(!field.value); if (!field.value) setValue("emergencySurgery", false) }}
              className={`px-4 py-1.5 rounded-full border-2 text-sm font-semibold transition-all ${
                field.value
                  ? "bg-green-600 border-green-600 text-white scale-105 shadow"
                  : "border-green-300 text-green-600 hover:border-green-400"
              }`}>
              {t("preop.elective")}
            </button>
          )} />
          <Controller name="emergencySurgery" control={control} render={({ field }) => (
            <button type="button"
              onClick={() => { field.onChange(!field.value); if (!field.value) setValue("elective", false) }}
              className={`px-4 py-1.5 rounded-full border-2 text-sm font-semibold transition-all ${
                field.value
                  ? "bg-red-600 border-red-600 text-white scale-105 shadow"
                  : "border-red-300 text-red-500 hover:border-red-400"
              }`}>
              {t("preop.emergencySurgery")}
            </button>
          )} />
        </div>
      </SectionCard>
      </div>
      </div>

      {/* ── History tab ──────────────────────────────────────────── */}
      <div className={layoutMode === "tabs" && activeTab !== "history" ? "hidden" : "space-y-6"}>
      {/* Medical History */}
      <SectionCard title={t("preop.historySection")}>
        <p className="text-sm text-slate-500">{t("preop.historyDesc")}</p>
        <Controller name="comorbidities" control={control} render={({ field }) => (
          <>
            <TagInput
              value={(field.value ?? []) as Tag[]}
              onChange={field.onChange}
              searchUrl={`/api/search/icd10?locale=${locale}`}
              renderSuggestion={(item: Icd10SearchItem) => ({
                label: locale === "bg" ? (item.descriptionBg || item.description) : item.description,
                sub: item.code,
                code: item.code,
                system: "ICD-10",
                labelEn: item.description,
                labelBg: item.descriptionBg,
              })}
              allowFreeText={false}
              minSearchLength={2}
              placeholder={t("preop.historyPlaceholder")}
            />
            <ComorbiditiesBySystem
              tags={(field.value ?? []) as Tag[]}
              onRemove={label => field.onChange((field.value as Tag[]).filter(tg => tg.label !== label))}
            />
          </>
        )} />
        <RejectionNote msg={rejectionOf("comorbidities")} />
      </SectionCard>

      {/* Medications */}
      <SectionCard title={t("preop.medicationsSection")}>
        <Controller name="currentMedications" control={control} render={({ field }) => (
          <TagInput
            value={(field.value ?? []) as Tag[]}
            onChange={field.onChange}
            searchUrl="/api/search/drugs"
            renderSuggestion={(item: DrugSearchItem) => ({
              label: item.inn ? `${item.inn}${item.strength ? ` ${item.strength}` : ""}` : item.name,
              sub: item.name !== item.inn ? item.name : undefined,
              inn: item.inn ?? undefined,
              atcCode: item.atcCode ?? undefined,
            })}
            placeholder={t("preop.medicationsPlaceholder")}
          />
        )} />
        <RejectionNote msg={rejectionOf("currentMedications")} />
      </SectionCard>

      {/* Anamnesis, habits & risk factor checkboxes */}
      <SectionCard title={t("preop.historyCardTitle")}>
        <div className="space-y-3">
          {/* Allergies */}
          <div className="flex items-center gap-2">
            <Controller name="allergies" control={control} render={({ field }) => (
              <ClinicalYesNo id="allergies" value={field.value ?? null} tone="danger" onChange={(answer) => {
                field.onChange(answer)
                // Cleared on "no" and on "not asked" alike: either way the
                // recorded allergens no longer have a question behind them.
                if (answer !== true) setValue("allergyDetails", [], { shouldDirty: true })
              }} />
            )} />
            <Label htmlFor="allergies" className="font-normal cursor-pointer">{t("preop.allergies")}</Label>
          </div>
          {allergies && (
            <>
              <Controller name="allergyDetails" control={control} render={({ field }) => (
                <TagInput
                  value={(field.value ?? []) as Tag[]}
                  onChange={field.onChange}
                  searchUrl="/api/search/drugs"
                  renderSuggestion={(item: DrugSearchItem) => ({
                    label: item.inn ? `${item.inn}${item.strength ? ` ${item.strength}` : ""}` : item.name,
                    sub: item.name !== item.inn ? item.name : undefined,
                    inn: item.inn ?? undefined,
                    atcCode: item.atcCode ?? undefined,
                  })}
                  placeholder={t("preop.allergenSearchPlaceholder")}
                />
              )} />
              <RejectionNote msg={rejectionOf("allergyDetails")} />
            </>
          )}
          <div className="flex items-center gap-2">
            <Controller name="latexAllergy" control={control} render={({ field }) => (
              <ClinicalYesNo id="latexAllergy" value={field.value ?? null} onChange={field.onChange} tone="danger" />
            )} />
            <Label htmlFor="latexAllergy" className="font-normal cursor-pointer">{t("preop.latexAllergy")}</Label>
          </div>
          <Separator />
          {/* Family history */}
          <div className="flex items-center gap-2">
            <Controller name="familyAnesthesiaProblems" control={control} render={({ field }) => (
              <ClinicalYesNo id="familyAnesthesiaProblems" value={field.value ?? null} tone="danger" onChange={(answer) => {
                field.onChange(answer)
                if (answer !== true) setValue("familyAnesthesiaDetails", "", { shouldDirty: true })
              }} />
            )} />
            <Label htmlFor="familyAnesthesiaProblems" className="font-normal cursor-pointer">{t("preop.familyAnesthesia")}</Label>
          </div>
          {familyAnesthesiaProblems && (
            <>
              <Textarea maxLength={500} placeholder={t("common.details")} {...register("familyAnesthesiaDetails")} />
              <RejectionNote msg={rejectionOf("familyAnesthesiaDetails")} />
            </>
          )}
          <Separator />
          {/* Dental */}
          <div className="flex items-center gap-2">
            <Controller name="dentalProsthetics" control={control} render={({ field }) => (
              <ClinicalYesNo id="dentalProsthetics" value={field.value ?? null} onChange={field.onChange} />
            )} />
            <Label htmlFor="dentalProsthetics" className="font-normal cursor-pointer">{t("preop.dentalProsthetics")}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Controller name="looseTeeth" control={control} render={({ field }) => (
              <ClinicalYesNo id="looseTeeth" value={field.value ?? null} onChange={field.onChange} />
            )} />
            <Label htmlFor="looseTeeth" className="font-normal cursor-pointer">{t("preop.looseTeeth")}</Label>
          </div>
          <Separator />
          {/* Habits */}
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t("preop.harmfulHabits")}</p>
          <div className="flex items-center gap-2">
            <Controller name="smoking" control={control} render={({ field }) => (
              <ClinicalYesNo id="smoking" value={field.value ?? null} onChange={field.onChange} />
            )} />
            <Label htmlFor="smoking" className="font-normal cursor-pointer">{t("preop.smoking")}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Controller name="substanceAbuse" control={control} render={({ field }) => (
              <ClinicalYesNo id="substanceAbuse" value={field.value ?? null} onChange={field.onChange} />
            )} />
            <Label htmlFor="substanceAbuse" className="font-normal cursor-pointer">{t("preop.substanceAbuse")}</Label>
          </div>

          {!isPediatric && (<>
          <Separator />

          {/* RCRI */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t("preop.rcriTitle")}</p>
            <p className="text-xs text-slate-400">{t("preop.rcriHint")}</p>
            {([
              { id:"rcriIschemicHeart", label:"Ischaemic heart disease (history of MI, positive stress test, use of nitrates, ECG Q waves)" },
              { id:"rcriCHF",           label:"Congestive heart failure (pulmonary oedema, PND, S3, bilateral crackles, CXR redistribution)" },
              { id:"rcriCVD",           label:"Cerebrovascular disease (history of TIA or stroke)" },
              { id:"rcriInsulinDM",     label:"Insulin-dependent diabetes mellitus" },
              { id:"rcriCreatinine",    label:"Creatinine > 177 µmol/L (> 2.0 mg/dL)" },
            ] as const).map(item => {
              const suggested = rcriSuggested[item.id as keyof typeof rcriSuggested]
              const checked = !!watch(item.id)
              return (
                <div key={item.id} className="flex items-start gap-2">
                  <Controller name={item.id} control={control} render={({ field }) => (
                    <ClinicalYesNo id={item.id} value={field.value ?? null} onChange={field.onChange} className="mt-0.5" />
                  )} />
                  <div>
                    <Label htmlFor={item.id} className="font-normal cursor-pointer leading-snug">{item.label}</Label>
                    {suggested && !checked && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">{t("preop.suggestedReviewConfirm")}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <Separator />

          {/* APFEL */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t("preop.apfelTitle")}</p>
            <p className="text-xs text-slate-400">{t("preop.apfelHint")}</p>
            {([
              { id:"apfelPONVHistory",   label:"History of PONV or motion sickness" },
              { id:"apfelPostopOpioids", label:"Postoperative opioids planned" },
            ] as const).map(item => (
              <div key={item.id} className="flex items-center gap-2">
                <Controller name={item.id} control={control} render={({ field }) => (
                  <ClinicalYesNo id={item.id} value={field.value ?? null} onChange={field.onChange} />
                )} />
                <Label htmlFor={item.id} className="font-normal cursor-pointer">{item.label}</Label>
              </div>
            ))}
          </div>

          <Separator />

          {/* STOP-BANG */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t("preop.stopBangTitle")}</p>
            <p className="text-xs text-slate-400">{t("preop.stopBangHint")}</p>
            {([
              { id:"stopbangSnoring",  label:"Snoring — do you snore loudly?" },
              { id:"stopbangTired",    label:"Tired — often feel tired, fatigued, or sleepy during daytime?" },
              { id:"stopbangObserved", label:"Observed — has anyone observed you stop breathing during sleep?" },
              { id:"stopbangBP",       label:"Pressure — do you have or are you being treated for high blood pressure?" },
              { id:"stopbangNeck",     label:"Neck circumference > 40 cm" },
            ] as const).map(item => {
              const suggested = item.id === "stopbangBP" && stopBangBPSuggested
              const checked = !!watch(item.id)
              return (
                <div key={item.id} className="flex items-start gap-2">
                  <Controller name={item.id} control={control} render={({ field }) => (
                    <ClinicalYesNo id={item.id} value={field.value ?? null} onChange={field.onChange} className="mt-0.5" />
                  )} />
                  <div>
                    <Label htmlFor={item.id} className="font-normal cursor-pointer leading-snug">{item.label}</Label>
                    {suggested && !checked && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">{t("preop.suggestedReviewConfirm")}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          </>)}
        </div>
      </SectionCard>
      </div>

      {/* ── Exam tab ─────────────────────────────────────────────── */}
      <div className={layoutMode === "tabs" && activeTab !== "exam" ? "hidden" : "space-y-6"}>
      {/* Vitals */}
      <div ref={el => { refMap.current.vitals = el }}>
      <SectionCard title={t("preop.vitalsSection")} error={fieldErrors.has("bp") || fieldErrors.has("heartRate") || fieldErrors.has("respiratoryRate")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <PediatricVitalReferenceNote control={control} />

          {/* BP */}
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.bloodPressure")} <span className="text-red-500">*</span></Label>
              <button type="button"
                onClick={() => toggleUTO("bp", () => { setValue("bpSystolic", undefined); setValue("bpDiastolic", undefined) })}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${vitalsUTO.has("bp") ? "bg-slate-200 border-slate-400 text-slate-700 font-semibold" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}>
                {t("preop.unableToObtain")}
              </button>
            </div>
            {vitalsUTO.has("bp")
              ? <p className="text-sm text-slate-400 italic py-2">{t("preop.unableToObtain")}</p>
              : <div className={`flex items-center gap-3 ${fe("bp")}`}>
                  <div className="flex-1">
                    <p className="text-xs text-slate-400 text-center mb-1">{t("preop.systolic")}</p>
                    <Controller name="bpSystolic" control={control} render={({ field }) => (
                      <NumberStepper value={field.value} onChange={field.onChange} min={isPediatric ? 20 : bpSystolicRange.min} max={bpSystolicRange.max} step={bpSystolicRange.step} showSlider />
                    )} />
                  </div>
                  <span className="text-2xl font-light text-slate-300 mt-4">/</span>
                  <div className="flex-1">
                    <p className="text-xs text-slate-400 text-center mb-1">{t("preop.diastolic")}</p>
                    <Controller name="bpDiastolic" control={control} render={({ field }) => (
                      <NumberStepper value={field.value} onChange={field.onChange} min={isPediatric ? 10 : bpDiastolicRange.min} max={bpDiastolicRange.max} step={bpDiastolicRange.step} showSlider />
                    )} />
                  </div>
                </div>
            }
            {fieldErrors.has("bp") && !vitalsUTO.has("bp") && <p className="text-red-500 text-xs">{t("common.required")}</p>}
            <RejectionNote msg={rejectionOf("bpSystolic") ?? rejectionOf("bpDiastolic")} />
          </div>

          {([
            { id: "heartRate",      label: t("preop.heartRate"),      min: isPediatric ? 10 : heartRateRange.min,       max: heartRateRange.max,    step: heartRateRange.step,    unit: "bpm",  required: true,  slider: true, measurement: undefined as "temperature" | undefined },
            { id: "spO2",           label: t("preop.spO2"),           min: isPediatric ? 20 : spo2Range.min,            max: spo2Range.max,         step: spo2Range.step,         unit: "%",    required: false, slider: true, measurement: undefined as "temperature" | undefined },
            { id: "temperature",    label: t("preop.temperature"),    min: isPediatric ? 25 : temperatureRange.min,     max: temperatureRange.max,  step: temperatureRange.step, unit: "°C",   required: false, slider: true, measurement: "temperature" as "temperature" | undefined },
            { id: "respiratoryRate",label: t("preop.respiratoryRate"),min: isPediatric ? 1 : respiratoryRange.min,       max: respiratoryRange.max,  step: respiratoryRange.step, unit: "/min", required: true,  slider: true, measurement: undefined as "temperature" | undefined },
          ] as const).map(v => (
            <div key={v.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {v.label}{v.required && <span className="text-red-500 ml-0.5">*</span>}
                  </Label>
                  {v.id === "heartRate" && (
                    <Controller name="heartArrhythmia" control={control} render={({ field }) => (
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <ClinicalYesNo id="heartArrhythmia" value={field.value ?? null} onChange={field.onChange} />
                        <span className="text-xs text-slate-500">{t("preop.arrhythmia")}</span>
                      </label>
                    )} />
                  )}
                </div>
                <button type="button"
                  onClick={() => toggleUTO(v.id, () => setValue(v.id, undefined))}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${vitalsUTO.has(v.id) ? "bg-slate-200 border-slate-400 text-slate-700 font-semibold" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}>
                  {t("preop.unableToObtain")}
                </button>
              </div>
              {vitalsUTO.has(v.id)
                ? <p className="text-sm text-slate-400 italic py-2">{t("preop.unableToObtain")}</p>
                : <>
                    <Controller name={v.id} control={control} render={({ field }) => (
                      <div className={fe(v.id)}>
                        {"measurement" in v && v.measurement ? (
                          <ConvertedStepper measurement={v.measurement} canonicalValue={field.value} onCanonicalChange={field.onChange} canonicalMin={v.min} canonicalMax={v.max} canonicalStep={v.step} showSlider={v.slider} />
                        ) : (
                          <NumberStepper value={field.value} onChange={field.onChange} min={v.min} max={v.max} step={v.step} unit={v.unit} showSlider={v.slider} />
                        )}
                      </div>
                    )} />
                    {fieldErrors.has(v.id) && <p className="text-red-500 text-xs">{t("common.required")}</p>}
                    <RejectionNote msg={rejectionOf(v.id)} />
                  </>
              }
            </div>
          ))}

        </div>

        {/* Physical Exam Report */}
        <div className="space-y-1 pt-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.physicalExamReport")}</Label>
          <Textarea maxLength={500} placeholder={t("preop.physicalExamPlaceholder")} rows={3} {...register("physicalExamReport")} />
          <RejectionNote msg={rejectionOf("physicalExamReport")} />
        </div>
      </SectionCard>
      </div>

      {/* Airway */}
      <div ref={el => { refMap.current.airway = el }} data-tour="preop-airway">
      <SectionCard title={`${t("preop.airwaySection")} *`} error={fieldErrors.has("airway")} action={
        <button type="button"
          onClick={() => setValue("airwayUnobtainable", !airwayUTO)}
          className={`text-xs px-3 py-1 rounded-full border transition-all ${airwayUTO ? "bg-slate-200 border-slate-400 text-slate-700 font-semibold" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}>
          {t("preop.unableToObtain")}
        </button>
      }>
        {airwayUTO ? (
          <p className="text-sm text-slate-400 italic py-4 text-center">{t("preop.airwayUTO")}</p>
        ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="space-y-2 col-span-2 sm:col-span-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.mallampati")}</Label>
            <Controller name="mallampati" control={control} render={({ field }) => (
              <div className="grid grid-cols-4 gap-2">
                {mallampatiOptions.map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => field.onChange(field.value === opt.value ? undefined : opt.value)}
                    className={`rounded-xl border-2 p-3 text-center transition-all ${field.value === opt.value ? opt.color+" scale-105 shadow-sm" : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555]"}`}>
                    <div className="text-xl font-bold">{opt.value}</div>
                    <div className="text-[10px] mt-1 leading-tight">{resolveDisplayOption("MALLAMPATI", opt, locale).description}</div>
                  </button>
                ))}
              </div>
            )} />
          </div>
          <div className="space-y-1">
            <Label>{t("preop.mouthOpening")}</Label>
            <Controller name="mouthOpeningCm" control={control} render={({ field }) => (
              <NumberStepper value={field.value} onChange={field.onChange} min={mouthOpeningRange.min} max={mouthOpeningRange.max} step={mouthOpeningRange.step} unit="cm" />
            )} />
          </div>
          <div className="space-y-1">
            <Label>{t("preop.thyromental")}</Label>
            <Controller name="thyromental" control={control} render={({ field }) => (
              <NumberStepper value={field.value} onChange={field.onChange} min={thyromentalRange.min} max={thyromentalRange.max} step={thyromentalRange.step} unit="cm" />
            )} />
          </div>
          <div className="space-y-2 col-span-2 sm:col-span-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.neckMobility")}</Label>
            <Controller name="neckMobility" control={control} render={({ field }) => (
              <div className="flex gap-3">
                {neckMobilityOptions.map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => field.onChange(field.value === opt.value ? undefined : opt.value)}
                    className={`flex-1 rounded-xl border-2 py-2.5 font-semibold text-sm transition-all ${field.value === opt.value ? opt.color+" scale-105 shadow-sm" : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555]"}`}>
                    {displayOption("NECK_MOBILITY", opt, locale)}
                  </button>
                ))}
              </div>
            )} />
          </div>
          <div className="space-y-2 col-span-2 sm:col-span-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.upperLipBite")}</Label>
            <Controller name="upperLipBiteTest" control={control} render={({ field }) => (
              <div className="flex gap-3">
                {upperLipBiteOptions.map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => field.onChange(field.value === opt.value ? undefined : opt.value)}
                    className={`flex-1 rounded-xl border-2 p-3 text-center transition-all ${field.value === opt.value ? opt.color+" scale-105 shadow-sm" : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555]"}`}>
                    <div className="font-bold">{displayOption("UPPER_LIP_BITE", opt, locale)}</div>
                    <div className="text-[10px] mt-0.5 leading-tight">{resolveDisplayOption("UPPER_LIP_BITE", opt, locale).description}</div>
                  </button>
                ))}
              </div>
            )} />
          </div>
          <div className="space-y-2 col-span-2 sm:col-span-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.cormackLehane")}</Label>
            <Controller name="cormackLehane" control={control} render={({ field }) => (
              <div className="flex gap-2">
                {cormackLehaneOptions.map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => field.onChange(field.value === opt.value ? undefined : opt.value)}
                    className={`flex-1 rounded-xl border-2 p-2 text-center transition-all ${field.value === opt.value ? opt.color+" scale-105 shadow-sm" : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555]"}`}>
                    <div className="text-lg font-bold">{opt.value}</div>
                    <div className="text-[9px] mt-0.5 leading-tight">{resolveDisplayOption("CORMACK_LEHANE", opt, locale).description}</div>
                  </button>
                ))}
              </div>
            )} />
          </div>
          <AirwayFeatures control={control} />
        </div>
        )}
        {!airwayUTO && difficultAirwayHistory && (
          <div className="space-y-1">
            <Label>{t("common.details")}</Label>
            <Textarea maxLength={500} placeholder={t("preop.difficultAirwayDetails")} {...register("difficultAirwayNotes")} />
            <RejectionNote msg={rejectionOf("difficultAirwayNotes")} />
          </div>
        )}
        {fieldErrors.has("airway") && !airwayUTO && (
          <p className="text-red-500 text-xs pt-1">{t("preop.mallampatiRequired")}</p>
        )}
      </SectionCard>
      </div>
      </div>

      {/* ── Risk & ASA tab ────────────────────────────────────────── */}
      <div className={layoutMode === "tabs" && activeTab !== "risk" ? "hidden" : "space-y-6"}>
      {/* Lab Results */}
      <SectionCard title={t("preop.labSection")}>
        <Controller name="labResults" control={control} render={({ field }) => (
          <LabResults
            value={(field.value ?? []) as LabResult[]}
            onChange={field.onChange}
          />
        )} />
      </SectionCard>

      {/* ASA */}
      <div ref={el => { refMap.current.asa = el }} data-tour="preop-scores">
      <SectionCard title={`${t("preop.riskSection")} *`} error={fieldErrors.has("asaScore")}>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>{t("preop.asaLabel")} <span className="text-red-500">*</span></Label>
            {asaSuggestion && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 space-y-1">
                <div className="flex items-center gap-2 text-sm text-blue-700">
                  <Lightbulb className="h-4 w-4 shrink-0" />
                  <span>{t("preop.asaSuggested")}: <strong>ASA {asaSuggestion.cls}</strong> — {t("preop.asaReview")}</span>
                </div>
                {asaSuggestion.reasons.length > 0 && (
                  <ul className="text-xs text-blue-600 pl-6 list-disc space-y-0.5">
                    {asaSuggestion.reasons.map(r => <li key={r}>{r}</li>)}
                  </ul>
                )}
              </div>
            )}
            {emergencySurgery && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                🚨 Emergency surgery — ASA class will be suffixed with E
              </div>
            )}
            <Controller name="asaScore" control={control} render={({ field }) => (
              <div className={`grid grid-cols-3 sm:grid-cols-6 gap-2 ${fe("asaScore")}`}>
                {[
                  { v:"I",   desc:"Normal healthy patient",               color:"bg-green-500  border-green-500  text-white dark:bg-green-700  dark:border-green-500" },
                  { v:"II",  desc:"Mild systemic disease",                color:"bg-lime-500   border-lime-500   text-white dark:bg-lime-700   dark:border-lime-500"   },
                  { v:"III", desc:"Severe systemic disease",              color:"bg-yellow-500 border-yellow-500 text-white dark:bg-yellow-700 dark:border-yellow-500" },
                  { v:"IV",  desc:"Constant threat to life",              color:"bg-orange-500 border-orange-500 text-white dark:bg-orange-700 dark:border-orange-500" },
                  { v:"V",   desc:"Moribund patient",                     color:"bg-red-500    border-red-500    text-white dark:bg-red-700    dark:border-red-500"    },
                  { v:"VI",  desc:"Brain-dead organ donor",               color:"bg-slate-500  border-slate-500  text-white dark:bg-slate-600  dark:border-slate-400"  },
                ].map(opt => {
                  const label = emergencySurgery && opt.v !== "VI" ? `${opt.v}E` : opt.v
                  return (
                    <button key={opt.v} type="button"
                      onClick={() => field.onChange(field.value === opt.v ? undefined : opt.v)}
                      className={`rounded-xl border-2 p-3 text-center transition-all ${field.value === opt.v ? opt.color + " scale-105 shadow-sm" : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#555]"}`}>
                      <div className="text-xl font-bold">{label}</div>
                      <div className="text-[9px] mt-1 leading-tight">{opt.desc}</div>
                    </button>
                  )
                })}
              </div>
            )} />
          </div>
          {fieldErrors.has("asaScore") && <p className="text-red-500 text-xs">{t("preop.asaRequired")}</p>}
          <p className="text-xs text-slate-500">{t("preop.scoresNote")}</p>
        </div>

        {/* Calculated risk scores */}
        {isPediatric ? (
          <div className="pt-1 border-t border-slate-100 dark:border-[#2a2a2a]">
            <PediatricRiskAndCalculators control={control} setValue={setValue} caseId={caseId} />
          </div>
        ) : (
        <RiskScoreCards
          rcriScore={rcriScore}
          apfelScore={apfelScore}
          stopBangScore={stopBangScore}
          rcriAnswered={rcriAnswered}
          apfelAnswered={apfelAnswered}
          stopBangAnswered={stopBangAnswered}
        />
        )}

        {/* Notes */}
        <div className="space-y-1 pt-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("preop.notesLabel")}</Label>
          <Textarea placeholder={t("preop.notesPlaceholder")} rows={3} {...register("notes")} />
          <RejectionNote msg={rejectionOf("notes")} />
        </div>
      </SectionCard>
      </div>

      {/* AI advisor opt-in */}
      {!isPediatric && (<>
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1c1c1c] px-4 py-3">
        <Controller name="aiOptIn" control={control} render={({ field }) => (
          <input type="checkbox" id="aiOptIn" checked={!!field.value} onChange={e => field.onChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0" />
        )} />
        <div>
          <label htmlFor="aiOptIn" className="text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
            {t("preop.aiOptInLabel")}
          </label>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {t("preop.aiOptInHint")}
          </p>
        </div>
      </div>

      {watch("aiOptIn") && <AIAdvisor getFormData={getValues} caseId={caseId} onSaveBeforeAI={onAutoSave ? flushSave : undefined} />}
      </>)}
      </div>

      {fieldErrors.size > 0 && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <p className="font-semibold mb-1">{t("preop.completeRequiredFields")}</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            {(fieldErrors.has("ageYears") || fieldErrors.has("ageValue")) && <li>{t("preop.fieldAge")}</li>}
            {fieldErrors.has("sex")         && <li>{t("preop.sex")}</li>}
            {fieldErrors.has("heightCm")    && <li>{t("preop.fieldHeight")}</li>}
            {fieldErrors.has("weightKg")    && <li>{t("preop.fieldWeight")}</li>}
            {fieldErrors.has("diagnoses")   && <li>At least one diagnosis</li>}
            {fieldErrors.has("procedures")  && <li>At least one planned procedure</li>}
            {fieldErrors.has("bp")          && <li>{t("preop.fieldBloodPressure")}</li>}
            {fieldErrors.has("heartRate")   && <li>{t("preop.fieldHeartRate")}</li>}
            {fieldErrors.has("respiratoryRate") && <li>{t("preop.fieldRespiratoryRate")}</li>}
            {fieldErrors.has("airway")      && <li>{t("preop.fieldAirwayEvaluation")}</li>}
            {fieldErrors.has("asaScore")    && <li>{t("preop.fieldAsaClass")}</li>}
          </ul>
        </div>
      )}

      <div className="flex justify-end" data-tour="preop-submit">
        <Button type="submit" size="lg" className="gap-2 bg-blue-600 hover:bg-blue-700">
          {t("preop.continueIntraop")} <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  )
}
