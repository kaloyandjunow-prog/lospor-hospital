import { useMemo } from "react"
import { Pressable, Text, View } from "react-native"
import { useWatch, type Control, type UseFormSetValue } from "react-hook-form"
import Ionicons from "@expo/vector-icons/Ionicons"
import {
  APAGBI_FASTING_POLICY_2023,
  isFastingAssignmentBelowMinimum,
  PEDIATRIC_FASTING_CATEGORIES,
  policyFastingAssignments,
  getPediatricVitalReference,
  normalizePediatricAge,
  validateClinicalModeAge,
  validatePediatricAge,
  type ClinicalMode,
  type PediatricAgeUnit,
  type PediatricFastingCategory,
} from "@lospor/core/pediatric"
import { ClinicalNumberInput } from "@/components/ClinicalNumberInput"
import { Field } from "@/components/ui"
import { SegmentedSelect } from "@/components/preop/PreopFormWidgets"
import { PEDIATRIC_PREOP_LABELS, type PediatricPreopLabels } from "@/components/preop/pediatric-preop-labels"
import { applyClinicalModeSwitch } from "@/lib/clinical-mode-switch"
import type { PediatricModeCapability } from "@/lib/deployment-capabilities"
import type { PreopFormInput } from "@/lib/preop-form-schema"
import type { ClinicalStringKey } from "@/lib/preferences-context"
import { colors, withAlpha } from "@/theme/colors"
export { PediatricRiskAndCalculators } from "@/components/preop/PediatricRiskAndCalculators"
export { PEDIATRIC_PREOP_LABELS } from "@/components/preop/pediatric-preop-labels"
type Props = {
  control: Control<PreopFormInput>
  setValue: UseFormSetValue<PreopFormInput>
  tc: (key: ClinicalStringKey) => string
  language: "en" | "bg"
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

export function PediatricModeAgeFields({
  control,
  setValue,
  language,
  pediatricModeCapability,
  existingPediatricRecord = false,
}: Props & {
  pediatricModeCapability: PediatricModeCapability
  existingPediatricRecord?: boolean
}) {
  const labels = PEDIATRIC_PREOP_LABELS[language]
  const [modeRaw, ageValue, ageUnitRaw, ageYears] = useWatch({
    control,
    name: ["clinicalMode", "ageValue", "ageUnit", "ageYears"],
  })
  const mode: ClinicalMode = modeRaw ?? "ADULT"
  const pediatricModeEnabled = pediatricModeCapability.enabled === true
  const pediatricRecordLocked = existingPediatricRecord
    && mode === "PEDIATRIC"
    && !pediatricModeEnabled
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
    if (next === "PEDIATRIC" && !pediatricModeEnabled) return
    if (pediatricRecordLocked) return
    applyClinicalModeSwitch(next, { ageYears, ageValue, ageUnit }, setValue as never)
  }

  function updateAge(value: number | null | undefined, unit = ageUnit) {
    setValue("ageValue", value ?? null, { shouldDirty: true })
    if (value == null) {
      setValue("ageYears", null, { shouldDirty: true })
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
            { value: "ADULT", label: labels.adult, disabled: pediatricRecordLocked },
            { value: "PEDIATRIC", label: labels.pediatric, disabled: !pediatricModeEnabled },
          ]}
        />
      </Field>

      {!pediatricModeEnabled ? (
        <Notice tone={mode === "PEDIATRIC" ? "warning" : "info"}>
          {pediatricModeCapability.reason === "CLIENT_UPDATE_REQUIRED"
            ? labels.pediatricClientUpdateRequired
            : existingPediatricRecord && mode === "PEDIATRIC"
              ? labels.pediatricUnavailableExisting
              : mode === "PEDIATRIC"
                ? labels.pediatricUnavailableDraft
                : labels.pediatricUnavailableNew}
        </Notice>
      ) : null}

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
          {modeMismatch.code !== "PEDIATRIC_MODE_REQUIRED" || pediatricModeEnabled ? (
            <Pressable
              onPress={() => selectMode(modeMismatch.code === "PEDIATRIC_MODE_REQUIRED" ? "PEDIATRIC" : "ADULT")}
              style={{ minHeight: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.warning, borderRadius: 10 }}
            >
              <Text style={{ color: colors.warning, fontWeight: "900" }}>{modeMismatch.code === "PEDIATRIC_MODE_REQUIRED" ? labels.switchToPediatric : labels.switchToAdult}</Text>
            </Pressable>
          ) : null}
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
  const labels = PEDIATRIC_PREOP_LABELS[language]
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

function fastingLabel(category: PediatricFastingCategory, labels: PediatricPreopLabels): string {
  if (category === "CLEAR_FLUIDS") return labels.clearFluids
  if (category === "BREAST_MILK") return labels.breastMilk
  if (category === "INFANT_FORMULA_UNDER_1_YEAR") return labels.formula
  return labels.solids
}

/**
 * The nil-by-mouth assignment, a section of its own with the orders (10.0.0);
 * it sat inside the risk scores, though it is an instruction, not a score.
 */
export function PediatricFastingFields({ control, setValue, language }: Pick<Props, "control" | "setValue" | "language">) {
  const labels = PEDIATRIC_PREOP_LABELS[language]
  const fastingRows = useWatch({ control, name: "pediatricFasting" })
  const fastingByCategory = useMemo(
    () => new Map((fastingRows ?? []).map(row => [row.category, row])),
    [fastingRows],
  )

  // A nil-by-mouth assignment: each intake stops so many hours before
  // surgery. Clearing the hours removes that intake from the assignment.
  function assignFasting(category: PediatricFastingCategory, hoursBefore?: number | null) {
    const remaining = (fastingRows ?? []).filter(row => row.category !== category)
    if (hoursBefore == null || !Number.isFinite(hoursBefore) || hoursBefore < 0) {
      setValue("pediatricFasting", remaining, { shouldDirty: true })
      return
    }
    setValue("pediatricFasting", [
      ...remaining,
      { category, hoursBefore: Math.min(hoursBefore, 24), policyId: APAGBI_FASTING_POLICY_2023.id, policyVersion: APAGBI_FASTING_POLICY_2023.version },
    ], { shouldDirty: true })
  }

  return (
      <View style={{ gap: 10 }} testID="preop-fasting">
        <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "900" }}>{labels.npoTitle}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{labels.npoHint}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setValue("pediatricFasting", policyFastingAssignments(), { shouldDirty: true })}
          style={{ alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.primary }}
        >
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "900" }}>{labels.npoUsePolicy}</Text>
        </Pressable>
        {PEDIATRIC_FASTING_CATEGORIES.map(category => {
          const row = fastingByCategory.get(category)
          const minimum = APAGBI_FASTING_POLICY_2023.minimumHours[category]
          return (
            <View key={category} style={{ gap: 5 }} testID={`npo-${category}`}>
              <Field label={fastingLabel(category, labels)}>
                <ClinicalNumberInput
                  value={row?.hoursBefore ?? null}
                  onChange={value => assignFasting(category, value)}
                  min={0}
                  max={24}
                  step={0.5}
                  precision={1}
                  unit={labels.npoHoursBefore}
                  placeholder={String(minimum)}
                />
              </Field>
              {row && isFastingAssignmentBelowMinimum(row)
                ? <Text style={{ color: colors.warning, fontSize: 11, fontWeight: "800" }}>{labels.npoBelowMinimum.replace("{hours}", String(minimum))}</Text>
                : null}
            </View>
          )
        })}
        <Text style={{ color: colors.textMuted, fontSize: 10 }}>{APAGBI_FASTING_POLICY_2023.id} {APAGBI_FASTING_POLICY_2023.version}</Text>
      </View>
  )
}
