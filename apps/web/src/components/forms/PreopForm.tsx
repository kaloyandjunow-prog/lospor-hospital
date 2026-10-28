"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { preopFocusTab, preopSectionForErrors, scrollToReadiness, useScrollToReadiness } from "@/lib/readiness-focus"
import { usePreopAutosave } from "@/lib/use-preop-autosave"
import { missingPreopFields } from "@/lib/preop-validation"
import { applyClinicalModeSwitch, applyEhrImportToForm } from "@/lib/clinical-mode-switch"
import { useForm, Controller, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations, useLocale } from "next-intl"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { EhrImportOffer } from "@/components/EhrImportOffer"
import { ehrFieldLabel } from "@/lib/ehr-field-labels"
import { Badge } from "@/components/ui/badge"
import { calcBMI, calcABW } from "@/lib/scores"
import { GuptaRiskCard, RiskScoreCards } from "@/components/forms/RiskScoreCards"
import { PreopSubmitAction } from "@/components/forms/PreopSubmitAction"
import { PlannedAnaesthesiaField } from "@/components/forms/PlannedAnaesthesiaField"
import { AsaClassButtons } from "@/components/forms/AsaClassButtons"
import { asaReasonLabel, suggestASAFromTags } from "@/lib/icd-categories"
import { usePreopRiskScores } from "@/hooks/usePreopRiskScores"
import { Lightbulb } from "lucide-react"
import { ClinicalYesNo } from "@/components/ClinicalYesNo"
import { AirwayFeatures } from "@/components/forms/sections/AirwayFeatures"
import { TagInput, type Tag } from "@/components/TagInput"
import { NumberStepper } from "@/components/NumberStepper"
import { ConvertedStepper } from "@/components/ConvertedStepper"
import { AiConsentSection } from "@/components/forms/sections/AiConsentSection"
import { useOptionLibrary, useRange } from "@/hooks/useOptionLibrary"
import { displayOption, resolveDisplayOption } from "@/lib/clinical-display"
import { schema, type PreopData } from "@/components/forms/preopSchema"
import {
  PediatricRiskAndCalculators,
  PediatricFastingFields,
  PediatricVitalReferenceNote,
} from "@/components/forms/PediatricPreopSections"
import { resolveIdealBodyWeight } from "@lospor/core/ideal-body-weight"
import { preopAgeInYears } from "@lospor/core/preop-documents"
import {
  pediatricCapabilityMessageKey,
  useClinicalAiCapabilities,
  usePediatricModeCapability,
  useEhrImportCapability,
} from "@/lib/deployment-capabilities"
import {
  ComorbiditiesBySystem,
  RejectionNote,
  SectionCard,
} from "@/components/forms/PreopFormPresentational"
import { PreopAnamnesisFields } from "@/components/forms/PreopAnamnesisFields"
import { PreopSidebar, type PreopSidebarProps } from "@/components/forms/PreopSidebar"
import type { CaseStages } from "@/components/forms/CaseSidebar"
import { StepTabBar } from "@/components/forms/StepTabBar"
import { SectionJumpStrip } from "@/components/forms/SectionJumpStrip"
import { broselowZone } from "@lospor/core/broselow"
import type { PreopLayout } from "@/lib/preop-layout"
import { LabResultsSection } from "@/components/forms/sections/LabResultsSection"
import { PreopMedicationInstructionsSection, PreopWardOrdersSection } from "@/components/forms/PreopOrdersSections"
import { PreopPremedicationOrderSection } from "@/components/forms/PreopPremedicationOrder"
import { preopSectionConfigFor } from "@lospor/core/preop-orders"
import { PreopCaseSection, PreopDemographicsSection } from "@/components/forms/PreopPatientSections"
import { PreopQuestionList, type PreopPendingSuggestion, type PreopQuestionAnswer } from "@/components/forms/PreopQuestionList"
import {
  isPreopQuestionShown, isPreopScoreAvailable, preopProfileForMode,
  PREOP_LEGACY_FIELD_BY_QUESTION, PREOP_MH_SUSCEPTIBILITY_GROUP,
  preopAnswerStates, preopAnswerOptionKeys,
  type PreopAssessmentProfile,
  type PreopFormSection,
} from "@lospor/core/preop-assessment"

/** Baseline question behind each legacy form field. */
const QUESTION_OF_FIELD: Record<string, string> = Object.fromEntries(
  Object.entries(PREOP_LEGACY_FIELD_BY_QUESTION).map(([stableKey, field]) => [field, stableKey]),
)

export type { PreopData } from "@/components/forms/preopSchema"

function numberOrNull(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN
  return Number.isFinite(number) ? number : null
}

type Icd10SearchItem = { code: string; description: string; descriptionBg?: string }
type DrugSearchItem = { name: string; inn?: string; strength?: string; atcCode?: string }


export function PreopForm({ defaultValues, onSubmit, onAutoSave, layoutMode = "scroll", caseId, rejectedFields, onEhrAcceptedBeforeCase, submitting = false, submitError, onClinicalInput, preopProfile: profiles, focus, stages }: {
  /** Where the case is, for the case panel (sidebar layout). */
  stages?: CaseStages
  defaultValues?: Partial<PreopData>
  onSubmit: (data: PreopData) => void
  onNameChange?: (name: string) => void
  onIdChange?: (id: string) => void
  onAutoSave?: (data: PreopData) => void | Promise<void>
  layoutMode?: PreopLayout
  caseId?: string | null
  /**
   * The appliance's preoperative profile: which bundled questions are on, in
   * what order, and which are required. Absent (an older server, or before the
   * case read arrives) the form shows the bundled baseline as it always has.
   */
  preopProfile?: PreopAssessmentProfile | null
  /** Values the server refused, keyed by field, shown beside the field itself. */
  rejectedFields?: Map<string, string>
  /** Records an EHR acceptance made before the case existed. */
  onEhrAcceptedBeforeCase?: (importId: string, appliedKeys: string[]) => Promise<void>
  submitting?: boolean
  /** Shown above the submit action when the gated submit rejects the case. */
  submitError?: string | null
  onClinicalInput?: () => void
  /** A section to open on arrival, from a readiness "Go to" (1.5.0). */
  focus?: string | null
}) {
  const t      = useTranslations()
  const locale = useLocale()
  const clinicalAi = useClinicalAiCapabilities()
  const pediatricCapability = usePediatricModeCapability()
  const ehrImportCapability = useEhrImportCapability()
  // What the typed number is. ИЗ № unless the site permits national
  // identifiers and the clinician says otherwise -- the server supports
  // both and the policy allows both, but nothing ever offered the choice,
  // so every lookup went out as an ИЗ № whatever the clinician had typed.
  const [identifierType, setIdentifierType] = useState<"IZ" | "EGN">("IZ")


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
         clinicalMode, ageValue, ageUnit, procedureUndetermined] =
    // eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form watch() cannot be memoized; the form re-reads on every change.
    watch(["heightCm", "weightKg", "sex", "ageYears", "smoking", "highRiskSurgery", "emergencySurgery",
           "allergies", "familyAnesthesiaProblems", "difficultAirwayHistory", "comorbidities", "bloodType", "rhFactor",
           "clinicalMode", "ageValue", "ageUnit", "procedureUndetermined"])
  const isPediatric = clinicalMode === "PEDIATRIC"
  const preopMode = isPediatric ? "PEDIATRIC" : "ADULT"
  const sidebar = layoutMode === "sidebar"
  const preopProfile = useMemo(() => preopProfileForMode(profiles, preopMode), [profiles, preopMode]) // adults' or children's
  // Which optional sections this hospital asks, for adults or for children.
  const sectionConfig = useMemo(() => preopSectionConfigFor(profiles?.sectionConfigs, preopMode), [profiles, preopMode])
  const sectionOn = (key: keyof typeof sectionConfig.sections) => sectionConfig.sections[key]
  const shown = (stableKey: string) => isPreopQuestionShown(preopProfile, stableKey, preopMode)
  const shownField = (field: string) => !QUESTION_OF_FIELD[field] || shown(QUESTION_OF_FIELD[field])
  const formValues = watch() as unknown as Record<string, unknown>
  const questionStates = preopAnswerStates(formValues)
  const [pendingSuggestions, setPendingSuggestions] = useState<PreopPendingSuggestion[]>([])
  const loadSuggestions = useCallback(async () => {
    if (!caseId) return setPendingSuggestions([])
    const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/preop-suggestions`, { cache: "no-store" }).catch(() => null)
    if (!response?.ok) return
    const rows = await response.json().catch(() => []) as Array<{ id: string; status: string; proposedState: PreopPendingSuggestion["proposedState"]; question?: { stableKey?: string } }>
    setPendingSuggestions(rows
      .filter(row => row.status === "PENDING" && row.question?.stableKey)
      .map(row => ({ id: row.id, stableKey: row.question!.stableKey!, proposedState: row.proposedState })))
  }, [caseId])
  useEffect(() => { void loadSuggestions() }, [loadSuggestions])
  // Answers to the profile's own questions. preopAnswers is sent as the
  // complete set, so dropping an entry is how an answer is cleared; a parent
  // answered anything but YES takes its follow-ups with it.
  const answerQuestion = (stableKey: string, answer: PreopQuestionAnswer | null) => {
    const followUps = new Set((preopProfile?.questions ?? []).filter(item => item.parentKey === stableKey).map(item => item.stableKey))
    const keep = (getValues("preopAnswers") ?? []).filter(item => item.stableKey !== stableKey
      && !(answer?.state !== "YES" && followUps.has(item.stableKey)))
    setValue("preopAnswers", answer ? [...keep, answer] : keep, { shouldDirty: true })
  }
  const reviewSuggestion = async (suggestionId: string, status: "ACCEPTED" | "REJECTED") => {
    if (!caseId) return
    const suggestion = pendingSuggestions.find(item => item.id === suggestionId)
    const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/preop-suggestions/${encodeURIComponent(suggestionId)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }).catch(() => null)
    if (response?.ok && status === "ACCEPTED" && suggestion?.proposedState && suggestion.proposedState !== "NOT_ASKED") {
      answerQuestion(suggestion.stableKey, { stableKey: suggestion.stableKey, state: suggestion.proposedState, optionKey: suggestion.proposedState === "YES" || suggestion.proposedState === "NO" ? suggestion.proposedState : null })
    }
    await loadSuggestions()
  }
  const questionList = (formSection: PreopFormSection, groups?: { only?: string; except?: string }, oneColumn = false) => (
    <PreopQuestionList
      profile={preopProfile}
      formSection={formSection}
      mode={preopMode}
      ageYears={preopAgeInYears({ ageYears: ageYearsVal, ageValue, ageUnit })}
      sex={typeof sex === "string" ? sex : null}
      groups={groups}
      states={questionStates} optionKeys={preopAnswerOptionKeys(formValues)}
      onAnswer={answerQuestion}
      suggestions={pendingSuggestions}
      onReviewSuggestion={reviewSuggestion}
      className="pt-2"
      columns={sidebar && !oneColumn}
    />
  )
  const pediatricRecordReadOnly = isPediatric && !pediatricCapability.enabled
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
  // How much of each score was actually asked: the calculators treat an
  // unasked criterion as absent (deliberately, and documented in the hook),
  // but the card must say so rather than showing "low" for a score nobody
  // actually answered.
  const {
    rcriSuggested, stopBangBPSuggested, apfelScore, stopBangScore,
    rcriAnswered, apfelAnswered, stopBangAnswered, rcriScore,
  } = usePreopRiskScores({
    comorbidities, currentMedications, labResults, sex, smoking, bmi, ageYearsVal, highRiskSurgery,
    apfelPONVHistory, apfelPostopOpioids, stopbangSnoring, stopbangTired, stopbangObserved, stopbangBP, stopbangNeck,
    rcriIschemicHeart, rcriCHF, rcriCVD, rcriInsulinDM, rcriCreatinine,
  })

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

  // Debounce, in-flight tracking and flush are one mechanism, so they live
  // together in @/lib/use-preop-autosave. `flush` is what the AI advisor
  // calls before reading the case back: consent is a form field, and the read
  // has to happen after it is persisted rather than racing it.
  const { flush: flushSave } = usePreopAutosave({
    watch: watch as unknown as Parameters<typeof usePreopAutosave>[0]["watch"],
    getValues: getValues as unknown as () => Record<string, unknown>,
    onAutoSave: onAutoSave as unknown as Parameters<typeof usePreopAutosave>[0]["onAutoSave"],
    disabled: pediatricRecordReadOnly,
  })

  // Appliance-only: the EHR import offer withdraws once the clinician starts
  // entering the assessment themselves. Kept as its own subscription rather
  // than a parameter on the shared autosave hook, so the vendored hook stays
  // byte-identical to upstream and does not conflict on every re-vendor.
  useEffect(() => {
    if (!onClinicalInput || pediatricRecordReadOnly) return
    // eslint-disable-next-line react-hooks/incompatible-library
    const subscription = watch((_values, { name }) => { if (name) onClinicalInput() })
    return () => subscription.unsubscribe()
  }, [onClinicalInput, pediatricRecordReadOnly, watch])

  const airwayUTO = !!watch("airwayUnobtainable")
  const [activeTab, setActiveTab] = useState<"patient" | "case" | "history" | "exam" | "risk" | "plan">(() => preopFocusTab(focus) ?? "patient")
  useScrollToReadiness(focus)

  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set())

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

  // The rule itself lives in @/lib/preop-validation, where it is testable
  // without a form around it.
  const validate = (data: PreopData) => {
    const errs = missingPreopFields(data, vitalsUTO, airwayUTO)
    // Appliance-only: a case is opened against the hospital's own record
    // number, so a new case cannot be submitted without one. Existing cases
    // already carry their patient link and are not asked again.
    if (!caseId && !data.patientId?.trim()) errs.unshift("patientId")
    return errs
  }

  /** Same mapping @/lib/preop-validation uses for the readiness check's own field names. */
  const ZOD_ERROR_FIELD: Readonly<Record<string, string>> = {
    bpSystolic: "bp",
    bpDiastolic: "bp",
    mallampati: "airway",
    mouthOpeningCm: "airway",
    thyromental: "airway",
  }

  // The tabbed layout (10.0.0): the plan and what is ordered have a tab of
  // their own; they all sat on Risk & ASA. Labels translated, as they were not.
  const TABS = [
    { value: "patient", label: t("preop.tabs.patient") },
    { value: "case",    label: t("preop.tabs.case")    },
    { value: "history", label: t("preop.tabs.history") },
    { value: "exam",    label: t("preop.tabs.exam")    },
    { value: "risk",    label: t("preop.tabs.risk")    },
    { value: "plan",    label: t("preop.tabs.plan")    },
  ] as const

  function hasTabError(tab: string): boolean {
    if (fieldErrors.size === 0) return false
    switch (tab) {
      case "patient": return fieldErrors.has("patientId") || fieldErrors.has("ageYears") || fieldErrors.has("ageValue") || fieldErrors.has("sex") || fieldErrors.has("heightCm") || fieldErrors.has("weightKg")
      case "case":    return fieldErrors.has("diagnoses") || fieldErrors.has("procedures")
      case "exam":    return fieldErrors.has("bp") || fieldErrors.has("heartRate") || fieldErrors.has("respiratoryRate") || fieldErrors.has("airway")
      case "risk":    return fieldErrors.has("asaScore")
      default: return false
    }
  }

  /** Highlights the given (abstracted) field keys and jumps to wherever the first one lives. */
  function reportFieldErrorsAndJump(errs: string[]) {
    setFieldErrors(new Set(errs))
    // The same map a readiness "Go to" uses, so the two cannot disagree (1.5.0).
    const section = preopSectionForErrors(errs)
    setActiveTab(preopFocusTab(section) ?? "risk")
    scrollToReadiness(section)
  }

  function handleValidatedSubmit(data: PreopData) {
    const errs = validate(data)
    if (errs.length > 0) {
      reportFieldErrorsAndJump(errs)
      return
    }
    setFieldErrors(new Set())
    // A paediatric case keeps its AI consent: it covers the scans, and the
    // server refuses the advisor for a paediatric case on its own (9.14.3).
    onSubmit(isPediatric
      ? {
          ...data,
          rcriScore: undefined,
          apfelScore: undefined,
          stopBangScore: undefined,
        }
      : { ...data, rcriScore, apfelScore, stopBangScore },
    )
  }

  /**
   * react-hook-form's own zod resolver rejected the data -- a bad type, a
   * value outside the shared clinical-number range (`preopNumber` in
   * preopSchema.ts exists specifically to keep e.g. a systolic of 4000 from
   * reaching the wire), a malformed date. This used to retry through
   * `handleValidatedSubmit(getValues())` regardless, which only checks
   * clinical *readiness* (is the field filled in), not the type/range
   * validity zod just refused -- so exactly the value zod rejected could
   * still reach `onSubmit`. Report it the same way a missing field is
   * reported, and stop.
   */
  function handleInvalidSubmit(errors: Record<string, unknown>) {
    const errs = Object.keys(errors).map(key => ZOD_ERROR_FIELD[key] ?? key)
    reportFieldErrorsAndJump(errs)
  }

  const missingFields = sidebar ? new Set(missingPreopFields(formValues as unknown as PreopData, vitalsUTO, airwayUTO)) : new Set<string>()
  const anyMissing = (...keys: string[]) => keys.some(key => missingFields.has(key))
  // The drugs a medication instruction can name: the current medication list as it stands.
  const currentMedicationChoices = ((formValues.currentMedications ?? []) as Tag[]).filter(tag => !!tag.label).map(tag => ({ label: tag.label, inn: tag.inn, atcCode: tag.atcCode }))
  const allergyTags = ((watch("allergyDetails") ?? []) as Tag[]).map(tag => tag.label).filter((label): label is string => !!label)
  const ageUnitText = (unit: string | null | undefined) => unit === "MONTHS" ? (locale === "bg" ? "м." : "mo") : unit === "DAYS" ? (locale === "bg" ? "д." : "d") : (locale === "bg" ? "г." : "y")
  // The step's sections, for the case panel and for the scrolling page's strip.
  const preopSections = [
    { id: "demographics", label: t("preop.demographicsSection"), missing: anyMissing("ageYears", "ageValue", "sex", "heightCm", "weightKg") },
    { id: "case", label: t("preop.caseSection"), missing: anyMissing("diagnoses", "procedures") },
    ...(sectionOn("MEDICAL_HISTORY") ? [{ id: "history", label: t("preop.historySection"), missing: false }] : []),
    ...(sectionOn("CURRENT_MEDICATIONS") ? [{ id: "medications", label: t("preop.medicationsSection"), missing: false }] : []),
    { id: "anamnesis", label: t("preop.historyCardTitle"), missing: false },
    { id: "vitals", label: t("preop.vitalsSection"), missing: anyMissing("bp", "heartRate", "respiratoryRate") },
    { id: "airway", label: t("preop.airwaySection"), missing: anyMissing("airway") },
    ...(sectionOn("LABS") ? [{ id: "labs", label: t("preop.sidebar.labs"), missing: false }] : []),
    { id: "risk", label: t("preop.riskSection"), missing: anyMissing("asaScore") },
    ...(sectionOn("PLANNED_ANAESTHESIA") ? [{ id: "planned", label: t("preop.plannedAnaesthesia"), missing: false }] : []),
    ...(sectionOn("PREMEDICATION") ? [{ id: "premedication", label: t("preop.premedication.title"), missing: false }] : []),
    ...(isPediatric && sectionOn("PEDIATRIC_FASTING") ? [{ id: "fasting", label: t("preop.fastingSection"), missing: false }] : []),
    ...(sectionOn("WARD_ORDERS") ? [{ id: "ward-orders", label: t("preop.orders.wardTitle"), missing: false }] : []),
    ...(sectionOn("MEDICATION_INSTRUCTIONS") ? [{ id: "medication-instructions", label: t("preop.orders.medicationTitle"), missing: false }] : []),
    { id: "notes", label: t("preop.notesLabel"), missing: false },
  ]
  const sidebarProps: PreopSidebarProps | null = sidebar ? {
    sections: preopSections,
    patient: {
      ageText: ageValue != null && ageUnit ? `${ageValue} ${ageUnitText(ageUnit)}` : ageYearsVal != null ? `${ageYearsVal} ${ageUnitText("YEARS")}` : null,
      sexText: sex === "MALE" ? (locale === "bg" ? "М" : "M") : sex === "FEMALE" ? (locale === "bg" ? "Ж" : "F") : null,
      heightCm: height ? Number(height) : null,
      weightKg: weight ? Number(weight) : null,
      bmi: bmi ?? null,
      allergy: allergies === true,
      allergyDetails: allergyTags,
    },
    broselow: broselowZone({ clinicalMode: preopMode, heightCm: height ? Number(height) : null, weightKg: weight ? Number(weight) : null }),
    scores: isPediatric ? [] : [
      { label: t("preop.rcriShort"), value: rcriAnswered > 0 ? rcriScore : null, max: 6 },
      { label: t("preop.apfelShort"), value: apfelAnswered > 0 ? apfelScore : null, max: 4 },
      { label: t("preop.stopBangShort"), value: stopBangAnswered > 0 ? stopBangScore : null, max: 8 },
    ],
    asa: { chosen: (watch("asaScore") as string | null | undefined) ?? null, suggested: asaSuggestion?.cls ?? null },
    disabled: pediatricRecordReadOnly,
    stages,
  } : null

  return (
    <form
      onSubmit={pediatricRecordReadOnly
        ? event => event.preventDefault()
        : handleSubmit(handleValidatedSubmit, handleInvalidSubmit)}
      className={sidebar ? "space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-x-6" : "space-y-6"}
    >
      {sidebarProps ? <PreopSidebar {...sidebarProps} /> : null}
      {/* The scrolling page's strip of jump links (10.0.0); there the plan sits under the risk scores. */}
      {layoutMode === "scroll" && <SectionJumpStrip sections={preopSections.filter(section => section.id !== "planned")} anchorPrefix="preop-sec-" testId="preop-scroll-strip" />}

      {/* Tab bar — tabs mode only */}
      {layoutMode === "tabs" && (
        <StepTabBar
          tabs={TABS.map(tab => ({ ...tab, flagged: hasTabError(tab.value) }))}
          active={activeTab}
          onSelect={setActiveTab}
          label={t("case.steps.preop")}
          testId="preop-tabs"
        />
      )}

      {pediatricRecordReadOnly && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t(`pediatric.${pediatricCapabilityMessageKey(
            pediatricCapability,
            true,
          )}`)}</span>
        </div>
      )}

      <fieldset
        disabled={pediatricRecordReadOnly}
        className="min-w-0 space-y-6 border-0 p-0"
      >

      {/* ── Patient tab ─────────────────────────────────────────── */}
      <div className={layoutMode === "tabs" && activeTab !== "patient" ? "hidden" : ""}>
      {/* Demographics */}
      <div data-readiness="demographics" data-tour="preop-demographics">
      <SectionCard title={t("preop.demographicsSection")} error={fieldErrors.has("patientId") || fieldErrors.has("ageYears") || fieldErrors.has("ageValue") || fieldErrors.has("sex") || fieldErrors.has("heightCm") || fieldErrors.has("weightKg")}>
        {!caseId && (
          <div className="space-y-2">
            <Label htmlFor="hospital-patient-number" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {locale === "bg" ? "Болничен номер на пациента" : "Hospital patient number"} <span className="text-red-500">*</span>
            </Label>
            {/* Which numbering the typed number belongs to.

                Only where the site permits national identifiers. The API has
                accepted both since the adapter existed and the policy has
                defaulted to permitting both, but no client ever sent
                anything but IZ -- so an ЕГН typed here was looked up as a
                record number and found nothing, with no way to say what it
                actually was. */}
            {ehrImportCapability.egnPermitted && (
              <div className="flex gap-1" role="radiogroup" aria-label={locale === "bg" ? "Вид на номера" : "Kind of number"}>
                {(["IZ", "EGN"] as const).map(kind => (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={identifierType === kind}
                    onClick={() => setIdentifierType(kind)}
                    className={`rounded-lg border px-3 py-1 text-xs font-semibold transition-colors ${
                      identifierType === kind
                        ? "border-sky-400 bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400"
                        : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"
                    }`}
                  >
                    {kind === "IZ" ? (locale === "bg" ? "ИЗ №" : "Record no.") : "ЕГН"}
                  </button>
                ))}
              </div>
            )}
            <Input
              id="hospital-patient-number"
              autoComplete="off"
              maxLength={128}
              className={fe("patientId")}
              {...register("patientId")}
            />
            <p className="text-xs text-slate-400">
              {locale === "bg"
                ? "Остава в болницата. Към централния регистър се изпраща само псевдоним."
                : "Stays in this hospital. Only a pseudonym is sent to the central registry."}
            </p>
            {fieldErrors.has("patientId") && (
              <p className="text-red-500 text-xs">
                {locale === "bg" ? "Болничният номер е задължителен." : "Hospital patient number is required."}
              </p>
            )}
          </div>
        )}
        {/* Directly under the number, because that is what it answers. */}
        <EhrImportOffer
          caseId={caseId ?? null}
          onAcceptedBeforeCase={onEhrAcceptedBeforeCase && (async (importId, appliedKeys) => {
            // Flush here, record there. The values the clinician just
            // accepted are in the form; writing them is what creates the
            // case, and only the page sees the new id without waiting for
            // a render.
            await flushSave()
            await onEhrAcceptedBeforeCase(importId, appliedKeys)
          })}
          identifier={watch("patientId") ?? null}
          identifierType={identifierType}
          available={ehrImportCapability.enabled}
          transport={ehrImportCapability.transport}
          folderRequests={ehrImportCapability.folderRequests}
          current={getValues() as unknown as Record<string, unknown>}
          currentClinicalMode={isPediatric ? "PEDIATRIC" : "ADULT"}
          labelFor={field => ehrFieldLabel(field, locale)}
          modeChangeAvailable={pediatricCapability.enabled}
          onRequestModeChange={pediatricCapability.enabled ? () => {
            // Only reached from a review built by an appliance older than
            // 1.4.23, which still holds the age back until the mode is
            // switched by hand. The same switch the toggle performs.
            applyClinicalModeSwitch(isPediatric ? "ADULT" : "PEDIATRIC",
              { ageYears: getValues("ageYears"), ageValue: getValues("ageValue"), ageUnit: getValues("ageUnit") },
              setValue as never)
          } : undefined}
          onApply={(patch, modeChange) => applyEhrImportToForm(patch, modeChange, getValues as never, setValue as never)}
        />
        <div className="space-y-4">
          <ClinicalModeAgeFields
            control={control}
            setValue={setValue}
            pediatricCapability={pediatricCapability}
            existingPediatricRecord={pediatricRecordReadOnly}
          />
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
        {questionList("demographics")}
      </SectionCard>
      </div>
      </div>

      {/* ── Case tab ─────────────────────────────────────────────── */}
      <div className={layoutMode === "tabs" && activeTab !== "case" ? "hidden" : ""}>
      <PreopCaseSection control={control} setValue={setValue} register={register} fieldErrors={fieldErrors} fe={fe} rejectionOf={rejectionOf} questionList={() => questionList("case_details")} shown={shown} shownField={shownField} locale={locale} procedureUndetermined={!!procedureUndetermined} />
      </div>

      {/* ── History tab ──────────────────────────────────────────── */}
      <div data-readiness="medical_history current_medications anamnesis" className={layoutMode === "tabs" && activeTab !== "history" ? "hidden" : "space-y-6"}>
      {/* Medical history and medications side by side on a wide screen (10.0.0). */}
      <div className={sidebar && sectionOn("MEDICAL_HISTORY") && sectionOn("CURRENT_MEDICATIONS") ? "grid gap-6 lg:grid-cols-2 lg:items-start" : "space-y-6"}>
      {/* Medical History */}
      {sectionOn("MEDICAL_HISTORY") && (
      <SectionCard id="preop-sec-history" title={t("preop.historySection")}>
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
        {questionList("medical_history")}
      </SectionCard>
      )}

      {/* Medications */}
      {sectionOn("CURRENT_MEDICATIONS") && (
      <SectionCard id="preop-sec-medications" title={t("preop.medicationsSection")}>
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
        {questionList("current_medications")}
      </SectionCard>
      )}
      </div>

      {/* Anamnesis, habits & risk factor checkboxes */}
      <SectionCard id="preop-sec-anamnesis" title={t("preop.historyCardTitle")}>
        <PreopAnamnesisFields control={control} register={register} setValue={setValue} watch={watch}
          allergies={allergies} familyAnesthesiaProblems={familyAnesthesiaProblems} isPediatric={isPediatric}
          rcriSuggested={rcriSuggested} stopBangBPSuggested={stopBangBPSuggested} shownField={shownField} rejectionOf={rejectionOf} columns={sidebar}
          mhQuestions={questionList("anamnesis", { only: PREOP_MH_SUSCEPTIBILITY_GROUP }, true /* already inside one of the two columns */)}>
          {questionList("anamnesis", { except: PREOP_MH_SUSCEPTIBILITY_GROUP })}
        </PreopAnamnesisFields>
      </SectionCard>
      </div>

      {/* ── Exam tab ─────────────────────────────────────────────── */}
      <div className={layoutMode === "tabs" && activeTab !== "exam" ? "hidden" : "space-y-6"}>
      {/* Vitals */}
      <div id="preop-sec-vitals" className="scroll-mt-24" data-readiness="physical_exam">
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
                  {v.id === "heartRate" && shownField("heartArrhythmia") && (
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
        {questionList("physical_exam")}
      </SectionCard>
      </div>

      {/* Airway */}
      <div data-readiness="airway" data-tour="preop-airway">
      <SectionCard id="preop-sec-airway" title={`${t("preop.airwaySection")} *`} error={fieldErrors.has("airway")} action={
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
          {/*
            The conclusion the section builds to, kept as its own row rather
            than another pill among the bedside tests: this is the
            anaesthetist's overall judgement, which is what makes an
            unanticipated difficult airway — predicted easy, found grade III or
            IV — findable later. It is deliberately not derived from the
            predictors above.
          */}
          <div className="space-y-2 col-span-2 sm:col-span-3 border-t border-slate-100 dark:border-[#2a2a2a] pt-3">
            {shownField("anticipatedDifficultAirway") && (
            <div className="flex items-center gap-2">
              <Controller name="anticipatedDifficultAirway" control={control} render={({ field }) => (
                <ClinicalYesNo id="anticipatedDifficultAirway" value={field.value ?? null} tone="danger" onChange={field.onChange} />
              )} />
              <Label htmlFor="anticipatedDifficultAirway" className="font-normal cursor-pointer">{t("preop.anticipatedDifficultAirway")}</Label>
            </div>
            )}
          </div>
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
        {questionList("airway")}
      </SectionCard>
      </div>
      </div>

      {/* ── Risk & ASA tab ────────────────────────────────────────── */}
      <div data-readiness="labs" className={layoutMode === "tabs" && activeTab !== "risk" ? "hidden" : "space-y-6"}>
      {/* Lab Results */}
      {sectionOn("LABS") && <div id="preop-sec-labs" className="scroll-mt-24"><LabResultsSection control={control} aiOptIn={!!watch("aiOptIn")} caseId={caseId} /></div>}

      {/* ASA */}
      <div id="preop-sec-risk" className="scroll-mt-24" data-readiness="risk_scores" data-tour="preop-scores">
      <SectionCard title={`${t("preop.riskSection")} *`} error={fieldErrors.has("asaScore")}>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>{t("preop.asaLabel")} <span className="text-red-500">*</span></Label>
            {asaSuggestion && !watch("asaScore") && ( // a prompt to choose, gone once a class is chosen
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 space-y-1">
                <div className="flex items-center gap-2 text-sm text-blue-700">
                  <Lightbulb className="h-4 w-4 shrink-0" />
                  <span>{t("preop.asaSuggested")}: <strong>ASA {asaSuggestion.cls}</strong> — {t("preop.asaReview")}</span>
                </div>
                {asaSuggestion.reasons.length > 0 && (
                  <ul className="text-xs text-blue-600 pl-6 list-disc space-y-0.5">
                    {asaSuggestion.reasonCodes.map(code => <li key={code}>{asaReasonLabel(code, locale === "bg" ? "bg" : "en", bmi)}</li>)}
                  </ul>
                )}
              </div>
            )}
            {emergencySurgery && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                {t("preop.emergencyAsaSuffix")}
              </div>
            )}
            <Controller name="asaScore" control={control} render={({ field }) => (
              <AsaClassButtons value={field.value} onChange={field.onChange} emergencySurgery={!!emergencySurgery} className={fe("asaScore")} />
            )} />
          </div>
          {fieldErrors.has("asaScore") && <p className="text-red-500 text-xs">{t("preop.asaRequired")}</p>}
          {/* The adult scores; a child has none of them (10.0.0). */}
          {!isPediatric && <p className="text-xs text-slate-500">{t("preop.scoresNote")}</p>}
        </div>

        {layoutMode === "scroll" && sectionOn("PLANNED_ANAESTHESIA") && <Controller name="plannedAnaesthesia" control={control} render={({ field }) => <PlannedAnaesthesiaField value={field.value} onChange={field.onChange} />} />}

        {/* Calculated risk scores */}
        {isPediatric ? (
          <div className="pt-1 border-t border-slate-100 dark:border-[#2a2a2a]">
            <PediatricRiskAndCalculators control={control} setValue={setValue} isShown={shownField} />
          </div>
        ) : (<>
        <RiskScoreCards
          rcriScore={rcriScore} apfelScore={apfelScore} stopBangScore={stopBangScore}
          rcriAnswered={rcriAnswered} apfelAnswered={apfelAnswered} stopBangAnswered={stopBangAnswered}
          unavailable={{ rcri: !isPreopScoreAvailable(preopProfile, "RCRI"), apfel: !isPreopScoreAvailable(preopProfile, "APFEL"), stopBang: !isPreopScoreAvailable(preopProfile, "STOPBANG") }}
        />
        {questionList("risk_scores")}
        <GuptaRiskCard profile={preopProfile} values={formValues} onAnswer={answerQuestion} />
        </>)}
      </SectionCard>
      </div>
      </div>

      {/* Tabbed layout: the plan and the orders, with the notes, on their own tab. */}
      <div className={layoutMode === "tabs" && activeTab !== "plan" ? "hidden" : "space-y-6"}>
      {/* After the assessment, the plan and what is ordered (10.0.0): the plan,
          premedication, nil by mouth, the ward's orders, the medicines. */}
      {/* The plan, after the ASA it follows from; the legacy page keeps it under the risk scores. */}
      {layoutMode !== "scroll" && sectionOn("PLANNED_ANAESTHESIA") && (
        <SectionCard id="preop-sec-planned" title={t("preop.plannedAnaesthesia")}>
          <Controller name="plannedAnaesthesia" control={control} render={({ field }) => <PlannedAnaesthesiaField bare value={field.value} onChange={field.onChange} />} />
        </SectionCard>
      )}

      {sectionOn("PREMEDICATION") && (
        <SectionCard id="preop-sec-premedication" title={t("preop.premedication.title")}>
          <Controller name="preopPremedicationOrders" control={control} render={({ field }) => (
            <PreopPremedicationOrderSection
              patient={{
                clinicalMode: preopMode,
                weightKg: numberOrNull(formValues.weightKg),
                heightCm: numberOrNull(formValues.heightCm),
                sex: typeof formValues.sex === "string" ? formValues.sex : null,
                ageValue: numberOrNull(formValues.ageValue),
                ageUnit: (formValues.ageUnit ?? null) as PreopData["ageUnit"] | null,
              }}
              value={field.value ?? {}}
              onChange={field.onChange}
            />
          )} />
          <RejectionNote msg={rejectionOf("preopPremedicationOrders")} />
        </SectionCard>
      )}

      {isPediatric && sectionOn("PEDIATRIC_FASTING") && (
        <SectionCard id="preop-sec-fasting" title={t("preop.fastingSection")}>
          <PediatricFastingFields control={control} setValue={setValue} />
        </SectionCard>
      )}
      {/* What the ward is to do before the operation (9.16.0). */}
      {sectionOn("WARD_ORDERS") && (
        <SectionCard id="preop-sec-ward-orders" title={t("preop.orders.wardTitle")}>
          <Controller name="preopWardOrders" control={control} render={({ field }) => (
            <PreopWardOrdersSection config={sectionConfig} value={field.value ?? []} onChange={field.onChange} />
          )} />
          <RejectionNote msg={rejectionOf("preopWardOrders")} />
        </SectionCard>
      )}
      {sectionOn("MEDICATION_INSTRUCTIONS") && (
        <SectionCard id="preop-sec-medication-instructions" title={t("preop.orders.medicationTitle")}>
          <Controller name="preopMedicationInstructions" control={control} render={({ field }) => (
            <PreopMedicationInstructionsSection
              config={sectionConfig}
              value={field.value ?? []}
              onChange={field.onChange}
              medications={currentMedicationChoices}
            />
          )} />
          <RejectionNote msg={rejectionOf("preopMedicationInstructions")} />
        </SectionCard>
      )}

      {/* Free-text notes, last: they were inside the risk scores (10.0.0). */}
      <SectionCard id="preop-sec-notes" title={t("preop.notesLabel")}>
        <Textarea placeholder={t("preop.notesPlaceholder")} rows={3} {...register("notes")} />
        <RejectionNote msg={rejectionOf("notes")} />
      </SectionCard>


      {/* The case's AI consent, and the adult advisor (9.14.3). */}
      <AiConsentSection control={control} aiOptIn={!!watch("aiOptIn")} isPediatric={isPediatric} clinicalAi={clinicalAi}
        getFormData={getValues} caseId={caseId} onSaveBeforeAI={onAutoSave ? flushSave : undefined} />
      </div>

      {fieldErrors.size > 0 && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <p className="font-semibold mb-1">{t("preop.completeRequiredFields")}</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            {(fieldErrors.has("ageYears") || fieldErrors.has("ageValue")) && <li>{t("preop.fieldAge")}</li>}
            {fieldErrors.has("sex")         && <li>{t("preop.sex")}</li>}
            {fieldErrors.has("heightCm")    && <li>{t("preop.fieldHeight")}</li>}
            {fieldErrors.has("weightKg")    && <li>{t("preop.fieldWeight")}</li>}
            {fieldErrors.has("diagnoses")   && <li>{t("preop.fieldDiagnosis")}</li>}
            {fieldErrors.has("procedures")  && <li>{t("preop.fieldPlannedProcedure")}</li>}
            {fieldErrors.has("bp")          && <li>{t("preop.fieldBloodPressure")}</li>}
            {fieldErrors.has("heartRate")   && <li>{t("preop.fieldHeartRate")}</li>}
            {fieldErrors.has("respiratoryRate") && <li>{t("preop.fieldRespiratoryRate")}</li>}
            {fieldErrors.has("airway")      && <li>{t("preop.fieldAirwayEvaluation")}</li>}
            {fieldErrors.has("asaScore")    && <li>{t("preop.fieldAsaClass")}</li>}
          </ul>
        </div>
      )}
      </fieldset>

      <PreopSubmitAction submitting={submitting} error={submitError} disabled={pediatricRecordReadOnly} />
    </form>
  )
}
