import { useMemo, useState } from "react"
import { ActivityIndicator, Pressable, Text, View } from "react-native"
import { Controller, useWatch, type Control, type UseFormSetValue } from "react-hook-form"
import Ionicons from "@expo/vector-icons/Ionicons"
import {
  APAGBI_FASTING_POLICY_2023,
  calculateColds,
  calculatePovoc,
  evaluatePediatricFasting,
  getPediatricVitalReference,
  normalizePediatricAge,
  validateClinicalModeAge,
  validatePediatricAge,
  type ClinicalMode,
  type PediatricAgeUnit,
  type PediatricFastingCategory,
} from "@lospor/core/pediatric"
import {
  calculateMostellerBsa,
  calculatePediatricMaintenanceFluid,
  calculateRcukPediatricResuscitation,
} from "@lospor/core/pediatric-calculators"
import { ClinicalNumberInput } from "@/components/ClinicalNumberInput"
import { ClinicalSwitchRow, Field } from "@/components/ui"
import { PovocSection } from "@/components/preop/PovocSection"
import { SegmentedSelect } from "@/components/preop/PreopFormWidgets"
import { apiFetch } from "@/lib/api"
import type { PreopFormInput } from "@/lib/preop-form-schema"
import type { ClinicalStringKey } from "@/lib/preferences-context"
import { colors, withAlpha } from "@/theme/colors"

type Props = {
  control: Control<PreopFormInput>
  setValue: UseFormSetValue<PreopFormInput>
  tc: (key: ClinicalStringKey) => string
  language: "en" | "bg"
}

type Labels = {
  mode: string
  adult: string
  pediatric: string
  preciseAge: string
  ageUnit: string
  days: string
  months: string
  years: string
  daysShort: string
  monthsShort: string
  yearsShort: string
  switchRequired: string
  adultRequired: string
  switchMode: string
  softReference: string
  povoc: string
  povocSurgery: string
  povocStrabismus: string
  povocHistory: string
  povocAgeFactor: string
  coldsApplicable: string
  coldsScore: string
  currentSymptoms: string
  onset: string
  lungDisease: string
  airwayDevice: string
  surgery: string
  select: string
  none: string
  mild: string
  moderateSevere: string
  moreThan4Weeks: string
  twoTo4Weeks: string
  lessThan2Weeks: string
  maskOrNone: string
  supraglottic: string
  trachealTube: string
  nonAirway: string
  minorAirway: string
  majorAirway: string
  fasting: string
  hoursSinceIntake: string
  clearFluids: string
  breastMilk: string
  formula: string
  solids: string
  met: string
  notMet: string
  unknown: string
  calculators: string
  bsa: string
  maintenanceFluid: string
  resuscitation: string
  accept: string
  accepted: string
  saveFirst: string
  profilesUnavailable: string
  ruleset: string
  yes: string
  no: string
  calculationFailed: string
}

const LABELS: Record<"en" | "bg", Labels> = {
  en: {
    mode: "Clinical mode",
    adult: "Adult",
    pediatric: "Pediatric",
    preciseAge: "Precise age",
    ageUnit: "Age unit",
    days: "Days",
    months: "Months",
    years: "Years",
    daysShort: "d",
    monthsShort: "mo",
    yearsShort: "y",
    switchRequired: "This age requires pediatric mode.",
    adultRequired: "Pediatric mode is limited to patients under 18.",
    switchMode: "Switch mode",
    softReference: "Age-based reference, not a hard limit",
    povoc: "POVOC",
    povocSurgery: "Expected surgery duration at least 30 minutes",
    povocStrabismus: "Strabismus surgery",
    povocHistory: "Patient or family history of postoperative vomiting",
    povocAgeFactor: "Age at least 3 years",
    coldsApplicable: "Current or recent upper respiratory infection",
    coldsScore: "COLDS score",
    currentSymptoms: "Current symptoms",
    onset: "Onset",
    lungDisease: "Lung disease",
    airwayDevice: "Planned airway device",
    surgery: "Surgery type",
    select: "Select",
    none: "None",
    mild: "Mild",
    moderateSevere: "Moderate or severe",
    moreThan4Weeks: "More than 4 weeks",
    twoTo4Weeks: "2 to 4 weeks",
    lessThan2Weeks: "Less than 2 weeks",
    maskOrNone: "Face mask or none",
    supraglottic: "Supraglottic airway",
    trachealTube: "Tracheal tube",
    nonAirway: "Non-airway surgery",
    minorAirway: "Minor airway surgery",
    majorAirway: "Major airway surgery",
    fasting: "Pediatric fasting",
    hoursSinceIntake: "Hours since last intake",
    clearFluids: "Clear fluids",
    breastMilk: "Breast milk",
    formula: "Infant formula under 1 year",
    solids: "Solid food or cow milk",
    met: "Met",
    notMet: "Not met",
    unknown: "Unknown",
    calculators: "Pediatric calculators",
    bsa: "Body surface area",
    maintenanceFluid: "Maintenance fluid",
    resuscitation: "Resuscitation reference",
    accept: "Accept result",
    accepted: "Accepted",
    saveFirst: "Save case first",
    profilesUnavailable: "Equipment, ventilation, blood-volume, local-anaesthetic and dose suggestions remain unavailable until their clinical profiles are reviewed and approved.",
    ruleset: "Ruleset",
    yes: "Yes",
    no: "No",
    calculationFailed: "Could not record the accepted calculation.",
  },
  bg: {
    mode: "Клиничен режим",
    adult: "Възрастен",
    pediatric: "Педиатричен",
    preciseAge: "Точна възраст",
    ageUnit: "Единица за възраст",
    days: "Дни",
    months: "Месеци",
    years: "Години",
    daysShort: "д.",
    monthsShort: "мес.",
    yearsShort: "г.",
    switchRequired: "Тази възраст изисква педиатричен режим.",
    adultRequired: "Педиатричният режим е за пациенти под 18 години.",
    switchMode: "Смени режима",
    softReference: "Референтни стойности за възрастта, а не твърди граници",
    povoc: "POVOC",
    povocSurgery: "Очаквана продължителност на операцията поне 30 минути",
    povocStrabismus: "Операция за страбизъм",
    povocHistory: "Анамнеза за постоперативно повръщане при пациента или семейството",
    povocAgeFactor: "Възраст поне 3 години",
    coldsApplicable: "Настояща или скорошна инфекция на горните дихателни пътища",
    coldsScore: "Оценка по COLDS",
    currentSymptoms: "Настоящи симптоми",
    onset: "Начало",
    lungDisease: "Белодробно заболяване",
    airwayDevice: "Планирано устройство за дихателните пътища",
    surgery: "Вид операция",
    select: "Избери",
    none: "Няма",
    mild: "Леки",
    moderateSevere: "Умерени или тежки",
    moreThan4Weeks: "Преди повече от 4 седмици",
    twoTo4Weeks: "Преди 2 до 4 седмици",
    lessThan2Weeks: "Преди по-малко от 2 седмици",
    maskOrNone: "Лицева маска или без устройство",
    supraglottic: "Супраглотично устройство",
    trachealTube: "Трахеална тръба",
    nonAirway: "Операция извън дихателните пътища",
    minorAirway: "Малка операция на дихателните пътища",
    majorAirway: "Голяма операция на дихателните пътища",
    fasting: "Предоперативно гладуване при деца",
    hoursSinceIntake: "Часове от последния прием",
    clearFluids: "Бистри течности",
    breastMilk: "Кърма",
    formula: "Мляко за кърмачета под 1 година",
    solids: "Твърда храна или краве мляко",
    met: "Изпълнено",
    notMet: "Не е изпълнено",
    unknown: "Неизвестно",
    calculators: "Педиатрични калкулатори",
    bsa: "Телесна повърхност",
    maintenanceFluid: "Поддържащи течности",
    resuscitation: "Референтни стойности за ресусцитация",
    accept: "Приеми резултата",
    accepted: "Прието",
    saveFirst: "Първо запази случая",
    profilesUnavailable: "Препоръките за оборудване, вентилация, кръвен обем, локални анестетици и лекарствени дози остават недостъпни, докато клиничните им профили не бъдат прегледани и одобрени.",
    ruleset: "Версия на правилата",
    yes: "Да",
    no: "Не",
    calculationFailed: "Приетото изчисление не можа да бъде записано.",
  },
}

const AGE_UNITS: PediatricAgeUnit[] = ["DAYS", "MONTHS", "YEARS"]

function ageMaximum(unit: PediatricAgeUnit): number {
  if (unit === "DAYS") return 6573
  if (unit === "MONTHS") return 215
  return 17
}

function Notice({ tone, children }: { tone: "info" | "warning" | "danger"; children: React.ReactNode }) {
  const color = tone === "info" ? colors.primary : tone === "warning" ? colors.warning : colors.danger
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderColor: withAlpha(color, "55"), backgroundColor: withAlpha(color, "12"), borderRadius: 10, padding: 10 }}>
      <Ionicons name={tone === "info" ? "information-circle-outline" : "warning-outline"} size={17} color={color} />
      <Text style={{ flex: 1, color, fontSize: 12, lineHeight: 17, fontWeight: "700" }}>{children}</Text>
    </View>
  )
}

export function PediatricModeAgeFields({ control, setValue, language }: Props) {
  const labels = LABELS[language]
  const [modeRaw, ageValue, ageUnitRaw, ageYears] = useWatch({
    control,
    name: ["clinicalMode", "ageValue", "ageUnit", "ageYears"],
  })
  const mode: ClinicalMode = modeRaw ?? "ADULT"
  const ageUnit: PediatricAgeUnit = ageUnitRaw ?? "YEARS"
  const normalized = mode === "PEDIATRIC" && ageValue != null
    ? normalizePediatricAge({ value: ageValue, unit: ageUnit })
    : null
  const ageIssues = mode === "PEDIATRIC" && ageValue != null
    ? validatePediatricAge({ value: ageValue, unit: ageUnit })
    : []
  const modeMismatch = mode === "ADULT" && ageYears != null
    ? validateClinicalModeAge("ADULT", { value: ageYears, unit: "YEARS" })
    : mode === "PEDIATRIC" && ageValue != null
      ? validateClinicalModeAge("PEDIATRIC", { value: ageValue, unit: ageUnit })
      : { valid: true as const }

  function selectMode(next: ClinicalMode) {
    setValue("clinicalMode", next, { shouldDirty: true })
    setValue("aiOptIn", false, { shouldDirty: true })
    if (next === "PEDIATRIC") {
      const currentYears = ageYears != null && ageYears < 18 ? ageYears : undefined
      setValue("ageUnit", "YEARS", { shouldDirty: true })
      setValue("ageValue", currentYears, { shouldDirty: true })
      setValue("ageYears", currentYears, { shouldDirty: true })
      setValue("bpSystolic", undefined, { shouldDirty: true })
      setValue("bpDiastolic", undefined, { shouldDirty: true })
      setValue("heartRate", undefined, { shouldDirty: true })
      setValue("spO2", undefined, { shouldDirty: true })
      setValue("temperature", undefined, { shouldDirty: true })
      setValue("respiratoryRate", undefined, { shouldDirty: true })
      return
    }
    setValue("ageYears", ageValue != null && ageUnit === "YEARS" ? ageValue : undefined, { shouldDirty: true })
    setValue("ageValue", undefined, { shouldDirty: true })
    setValue("ageUnit", undefined, { shouldDirty: true })
    setValue("pediatricFasting", [], { shouldDirty: true })
    setValue("coldsApplicable", false, { shouldDirty: true })
  }

  function updateAge(value: number | undefined, unit = ageUnit) {
    setValue("ageValue", value, { shouldDirty: true })
    if (value == null) {
      setValue("ageYears", undefined, { shouldDirty: true })
      return
    }
    const result = normalizePediatricAge({ value, unit })
    setValue("ageYears", result?.completedYears, { shouldDirty: true })
  }

  return (
    <View style={{ gap: 12, marginBottom: 14 }}>
      <Field label={labels.mode}>
        <SegmentedSelect
          value={mode}
          onChange={selectMode}
          options={[
            { value: "ADULT", label: labels.adult },
            { value: "PEDIATRIC", label: labels.pediatric },
          ]}
        />
      </Field>

      {mode === "PEDIATRIC" ? (
        <>
          <Field label={labels.preciseAge} required>
            <ClinicalNumberInput
              value={ageValue}
              onChange={updateAge}
              min={0}
              max={ageMaximum(ageUnit)}
              step={1}
              unit={ageUnit === "DAYS" ? labels.daysShort : ageUnit === "MONTHS" ? labels.monthsShort : labels.yearsShort}
              showSteppers={false}
            />
          </Field>
          <Field label={labels.ageUnit}>
            <SegmentedSelect
              value={ageUnit}
              onChange={(unit) => {
                setValue("ageUnit", unit, { shouldDirty: true })
                updateAge(undefined, unit)
              }}
              options={AGE_UNITS.map(unit => ({
                value: unit,
                label: unit === "DAYS" ? labels.days : unit === "MONTHS" ? labels.months : labels.years,
              }))}
            />
          </Field>

          {normalized ? (
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "800" }}>
              {normalized.ageGroup.replaceAll("_", " ")}
            </Text>
          ) : null}
        </>
      ) : null}

      {!modeMismatch.valid ? (
        <View style={{ gap: 8 }}>
          <Notice tone="warning">
            {modeMismatch.code === "PEDIATRIC_MODE_REQUIRED" ? labels.switchRequired : labels.adultRequired}
          </Notice>
          <Pressable
            onPress={() => selectMode(modeMismatch.code === "PEDIATRIC_MODE_REQUIRED" ? "PEDIATRIC" : "ADULT")}
            style={{ minHeight: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.warning, borderRadius: 10 }}
          >
            <Text style={{ color: colors.warning, fontWeight: "900" }}>{labels.switchMode}</Text>
          </Pressable>
        </View>
      ) : null}
      {ageIssues.map(issue => (
        <Notice key={issue.code} tone={issue.severity === "ERROR" ? "danger" : "warning"}>
          {issue.code.replaceAll("_", " ")}
        </Notice>
      ))}
    </View>
  )
}
export function PediatricVitalReferenceNote({ control, language }: Pick<Props, "control" | "language">) {
  const labels = LABELS[language]
  const [mode, ageValue, ageUnitRaw] = useWatch({ control, name: ["clinicalMode", "ageValue", "ageUnit"] })
  const reference = mode === "PEDIATRIC" && ageValue != null
    ? getPediatricVitalReference({ value: ageValue, unit: ageUnitRaw ?? "YEARS" })
    : null
  if (!reference) return null
  return (
    <View style={{ marginBottom: 12 }}>
      <Notice tone="info">
        {labels.softReference}: HR {reference.heartRate.lower}-{reference.heartRate.upper}/min; RR {reference.respiratoryRate.lower}-{reference.respiratoryRate.upper}/min; SBP P5/P10/P50 {reference.systolicBp.p5}/{reference.systolicBp.p10}/{reference.systolicBp.p50} mmHg.
      </Notice>
    </View>
  )
}

const COLDS_OPTIONS = {
  coldsCurrentSymptoms: ["NONE", "MILD", "MODERATE_OR_SEVERE"],
  coldsOnset: ["MORE_THAN_4_WEEKS", "TWO_TO_4_WEEKS", "LESS_THAN_2_WEEKS"],
  coldsLungDisease: ["NONE", "MILD", "MODERATE_OR_SEVERE"],
  coldsAirwayDevice: ["FACE_MASK_OR_NONE", "SUPRAGLOTTIC", "TRACHEAL_TUBE"],
  coldsSurgery: ["NON_AIRWAY", "MINOR_AIRWAY", "MAJOR_AIRWAY"],
} as const

type ColdsField = keyof typeof COLDS_OPTIONS
type AcceptedKind = "MOSTELLER_BSA" | "MAINTENANCE_FLUID" | "RCUK_RESUSCITATION"

const FASTING_CATEGORIES: PediatricFastingCategory[] = [
  "CLEAR_FLUIDS",
  "BREAST_MILK",
  "INFANT_FORMULA_UNDER_1_YEAR",
  "SOLID_FOOD_OR_COW_MILK",
]

function ChoicePills({ value, options, onChange }: {
  value?: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
      {options.map(option => {
        const selected = value === option.value
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={{ minHeight: 38, justifyContent: "center", borderRadius: 9, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primarySoft : colors.surface, paddingHorizontal: 10, paddingVertical: 6 }}
          >
            <Text style={{ color: selected ? colors.primary : colors.textSecondary, fontSize: 12, fontWeight: "800" }}>{option.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function fastingLabel(category: PediatricFastingCategory, labels: Labels): string {
  if (category === "CLEAR_FLUIDS") return labels.clearFluids
  if (category === "BREAST_MILK") return labels.breastMilk
  if (category === "INFANT_FORMULA_UNDER_1_YEAR") return labels.formula
  return labels.solids
}

function hoursSince(value?: string | null): number | undefined {
  if (!value) return undefined
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return undefined
  return Math.max(0, Math.round((Date.now() - timestamp) / 36_000) / 100)
}

function CalculationCard({ title, value, caseId, accepted, accepting, labels, onAccept }: {
  title: string
  value: string
  caseId?: string | null
  accepted: boolean
  accepting: boolean
  labels: Labels
  onAccept?: () => void
}) {
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 10, padding: 11, gap: 7 }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "800" }}>{title}</Text>
      <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: "900" }}>{value}</Text>
      <Pressable
        disabled={!caseId || !onAccept || accepted || accepting}
        onPress={onAccept}
        style={{ minHeight: 38, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", borderRadius: 9, borderWidth: 1, borderColor: accepted ? colors.success : colors.primary, opacity: !caseId || !onAccept || accepting ? 0.5 : 1 }}
      >
        {accepting ? <ActivityIndicator size="small" color={colors.primary} /> : accepted ? <Ionicons name="checkmark" size={16} color={colors.success} /> : null}
        <Text style={{ color: accepted ? colors.success : colors.primary, fontSize: 12, fontWeight: "900" }}>
          {accepted ? labels.accepted : caseId ? labels.accept : labels.saveFirst}
        </Text>
      </Pressable>
    </View>
  )
}

export function PediatricRiskAndCalculators({ control, setValue, language, caseId }: Props & { caseId?: string | null }) {
  const labels = LABELS[language]
  const [
    mode,
    ageValue,
    ageUnitRaw,
    heightCm,
    weightKg,
    povocSurgeryAtLeast30Minutes,
    povocStrabismusSurgery,
    povocHistory,
    coldsApplicable,
    coldsCurrentSymptoms,
    coldsOnset,
    coldsLungDisease,
    coldsAirwayDevice,
    coldsSurgery,
    fastingRows,
  ] = useWatch({
    control,
    name: [
      "clinicalMode",
      "ageValue",
      "ageUnit",
      "heightCm",
      "weightKg",
      "povocSurgeryAtLeast30Minutes",
      "povocStrabismusSurgery",
      "povocHistory",
      "coldsApplicable",
      "coldsCurrentSymptoms",
      "coldsOnset",
      "coldsLungDisease",
      "coldsAirwayDevice",
      "coldsSurgery",
      "pediatricFasting",
    ],
  })
  const [accepting, setAccepting] = useState<AcceptedKind | null>(null)
  const [accepted, setAccepted] = useState<Set<AcceptedKind>>(new Set())
  const [acceptError, setAcceptError] = useState("")
  const ageUnit: PediatricAgeUnit = ageUnitRaw ?? "YEARS"
  const age = ageValue != null ? normalizePediatricAge({ value: ageValue, unit: ageUnit }) : null
  const povoc = age
    ? calculatePovoc({
        ageYears: age.approximateDays / 365.2425,
        surgeryMinutes: povocSurgeryAtLeast30Minutes ? 30 : 0,
        strabismusSurgery: !!povocStrabismusSurgery,
        patientOrFamilyHistory: !!povocHistory,
      })
    : null
  const colds = coldsApplicable && coldsCurrentSymptoms && coldsOnset && coldsLungDisease && coldsAirwayDevice && coldsSurgery
    ? calculateColds({
        currentSymptoms: coldsCurrentSymptoms,
        onset: coldsOnset,
        lungDisease: coldsLungDisease,
        airwayDevice: coldsAirwayDevice,
        surgery: coldsSurgery,
      })
    : null
  const bsa = heightCm && weightKg ? calculateMostellerBsa({ heightCm, weightKg }) : null
  const maintenance = weightKg
    ? calculatePediatricMaintenanceFluid({ weightKg, age: ageValue != null ? { value: ageValue, unit: ageUnit } : null })
    : null
  const resuscitation = weightKg ? calculateRcukPediatricResuscitation({ weightKg }) : null
  const fastingByCategory = useMemo(
    () => new Map((fastingRows ?? []).map(row => [row.category, row])),
    [fastingRows],
  )
  const coldsValues: Partial<Record<ColdsField, string>> = {
    coldsCurrentSymptoms,
    coldsOnset,
    coldsLungDisease,
    coldsAirwayDevice,
    coldsSurgery,
  }

  if (mode !== "PEDIATRIC") return null

  function coldsOptionLabel(value: string): string {
    if (value === "NONE") return labels.none
    if (value === "MILD") return labels.mild
    if (value === "MODERATE_OR_SEVERE") return labels.moderateSevere
    if (value === "MORE_THAN_4_WEEKS") return labels.moreThan4Weeks
    if (value === "TWO_TO_4_WEEKS") return labels.twoTo4Weeks
    if (value === "LESS_THAN_2_WEEKS") return labels.lessThan2Weeks
    if (value === "FACE_MASK_OR_NONE") return labels.maskOrNone
    if (value === "SUPRAGLOTTIC") return labels.supraglottic
    if (value === "TRACHEAL_TUBE") return labels.trachealTube
    if (value === "NON_AIRWAY") return labels.nonAirway
    if (value === "MINOR_AIRWAY") return labels.minorAirway
    return labels.majorAirway
  }

  function coldsFieldLabel(field: ColdsField): string {
    if (field === "coldsCurrentSymptoms") return labels.currentSymptoms
    if (field === "coldsOnset") return labels.onset
    if (field === "coldsLungDisease") return labels.lungDisease
    if (field === "coldsAirwayDevice") return labels.airwayDevice
    return labels.surgery
  }

  function updateFasting(category: PediatricFastingCategory, elapsedHours?: number) {
    const remaining = (fastingRows ?? []).filter(row => row.category !== category)
    if (elapsedHours == null) {
      setValue("pediatricFasting", remaining, { shouldDirty: true })
      return
    }
    const lastIntakeAt = new Date(Date.now() - elapsedHours * 3_600_000).toISOString()
    const result = evaluatePediatricFasting({ category, lastIntakeAt, assessmentAt: new Date() })
    setValue("pediatricFasting", [
      ...remaining,
      {
        category,
        lastIntakeAt,
        status: result.status,
        requiredHours: result.requiredHours,
        policyId: result.policyId,
        policyVersion: result.policyVersion,
      },
    ], { shouldDirty: true })
  }

  async function acceptCalculation(kind: AcceptedKind, inputs: Record<string, unknown>) {
    if (!caseId) return
    setAccepting(kind)
    setAcceptError("")
    try {
      const response = await apiFetch(`/api/cases/${caseId}/calculations`, {
        method: "POST",
        body: JSON.stringify({ kind, inputs }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setAccepted(current => new Set(current).add(kind))
    } catch {
      setAcceptError(labels.calculationFailed)
    } finally {
      setAccepting(null)
    }
  }

  return (
    <View style={{ gap: 16 }}>
      <PovocSection control={control} labels={labels} povoc={povoc} />

      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14, gap: 10 }}>
        <Controller control={control} name="coldsApplicable" render={({ field }) => (
          <ClinicalSwitchRow label={labels.coldsApplicable} value={!!field.value} onValueChange={field.onChange} activeColor={colors.warning} />
        )} />
        {coldsApplicable ? (Object.keys(COLDS_OPTIONS) as ColdsField[]).map(field => (
          <View key={field} style={{ gap: 6 }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "800" }}>{coldsFieldLabel(field)}</Text>
            <ChoicePills
              value={coldsValues[field]}
              options={COLDS_OPTIONS[field].map(value => ({ value, label: coldsOptionLabel(value) }))}
              onChange={value => setValue(field, value as never, { shouldDirty: true })}
            />
          </View>
        )) : null}
        {coldsApplicable ? (
          <Text style={{ color: colors.warning, fontSize: 13, fontWeight: "900" }}>{labels.coldsScore}: {colds?.score ?? "-"}/25</Text>
        ) : null}
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14, gap: 10 }}>
        <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "900" }}>{labels.fasting}</Text>
        {FASTING_CATEGORIES.map(category => {
          const row = fastingByCategory.get(category)
          const status = row?.status === "MET" ? labels.met : row?.status === "NOT_MET" ? labels.notMet : labels.unknown
          const statusColor = row?.status === "MET" ? colors.success : row?.status === "NOT_MET" ? colors.danger : colors.textMuted
          return (
            <View key={category} style={{ gap: 5 }}>
              <Field label={fastingLabel(category, labels)}>
                <ClinicalNumberInput
                  value={hoursSince(row?.lastIntakeAt)}
                  onChange={value => updateFasting(category, value)}
                  min={0}
                  max={168}
                  step={0.5}
                  precision={1}
                  unit="h"
                  placeholder={labels.hoursSinceIntake}
                />
              </Field>
              {row ? <Text style={{ color: statusColor, fontSize: 11, fontWeight: "800" }}>{status} - {row.requiredHours} h</Text> : null}
            </View>
          )
        })}
        <Text style={{ color: colors.textMuted, fontSize: 10 }}>{APAGBI_FASTING_POLICY_2023.id} {APAGBI_FASTING_POLICY_2023.version}</Text>
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14, gap: 10 }}>
        <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "900" }}>{labels.calculators}</Text>
        <CalculationCard
          title={labels.bsa}
          value={bsa?.available ? `${bsa.value.squareMetres} m2` : "-"}
          caseId={caseId}
          accepted={accepted.has("MOSTELLER_BSA")}
          accepting={accepting === "MOSTELLER_BSA"}
          labels={labels}
          onAccept={heightCm && weightKg ? () => acceptCalculation("MOSTELLER_BSA", { heightCm, weightKg }) : undefined}
        />
        <CalculationCard
          title={labels.maintenanceFluid}
          value={maintenance?.available
            ? maintenance.value.dailyRangeMl
              ? `${maintenance.value.dailyRangeMl.minimum}-${maintenance.value.dailyRangeMl.maximum} ml/day`
              : `${maintenance.value.dailyMl} ml/day - ${maintenance.value.hourlyMl} ml/h`
            : "-"}
          caseId={caseId}
          accepted={accepted.has("MAINTENANCE_FLUID")}
          accepting={accepting === "MAINTENANCE_FLUID"}
          labels={labels}
          onAccept={weightKg ? () => acceptCalculation("MAINTENANCE_FLUID", { weightKg, age: ageValue != null ? { value: ageValue, unit: ageUnit } : null }) : undefined}
        />
        <CalculationCard
          title={labels.resuscitation}
          value={resuscitation?.available ? `${resuscitation.value.shockJoules} J - ${resuscitation.value.adrenalineMicrograms} mcg adrenaline` : "-"}
          caseId={caseId}
          accepted={accepted.has("RCUK_RESUSCITATION")}
          accepting={accepting === "RCUK_RESUSCITATION"}
          labels={labels}
          onAccept={weightKg ? () => acceptCalculation("RCUK_RESUSCITATION", { weightKg }) : undefined}
        />
        {acceptError ? <Notice tone="danger">{acceptError}</Notice> : null}
        <Notice tone="warning">{labels.profilesUnavailable}</Notice>
        <Text style={{ color: colors.textMuted, fontSize: 10 }}>{labels.ruleset}: {bsa?.ruleVersion ?? "-"}</Text>
      </View>
    </View>
  )
}
