"use client"

import { useMemo } from "react"
import {
  Controller,
  useWatch,
  type Control,
  type UseFormSetValue,
} from "react-hook-form"
import { useTranslations } from "next-intl"
import { applyClinicalModeSwitch } from "@/lib/clinical-mode-switch"
import { ShieldAlert } from "lucide-react"
import {
  APAGBI_FASTING_POLICY_2023,
  calculatePovoc,
  isFastingAssignmentBelowMinimum,
  PEDIATRIC_FASTING_CATEGORIES,
  policyFastingAssignments,
  normalizePediatricAge,
  validateClinicalModeAge,
  validatePediatricAge,
  type ClinicalMode,
  type PediatricAgeUnit,
  type PediatricFastingCategory,
} from "@lospor/core/pediatric"
import { ClinicalYesNo } from "@/components/ClinicalYesNo"
import { NumberStepper } from "@/components/NumberStepper"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import type { PreopData } from "@/components/forms/preopSchema"
import {
  pediatricCapabilityMessageKey,
  type PediatricModeCapability,
} from "@/lib/deployment-capabilities"
import { PediatricColdsCard } from "@/components/forms/PediatricColdsCard"

type FormProps = {
  control: Control<PreopData>
  setValue: UseFormSetValue<PreopData>
}
const AGE_UNITS: PediatricAgeUnit[] = ["DAYS", "MONTHS", "YEARS"]

function ageMaximum(unit: PediatricAgeUnit): number {
  if (unit === "DAYS") return 6573
  if (unit === "MONTHS") return 215
  return 17
}

export function ClinicalModeAgeFields({
  control,
  setValue,
  pediatricCapability,
  existingPediatricRecord = false,
}: FormProps & {
  pediatricCapability: PediatricModeCapability
  existingPediatricRecord?: boolean
}) {
  const t = useTranslations("pediatric")
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
  const pediatricRecordReadOnly = existingPediatricRecord
    && mode === "PEDIATRIC"
    && !pediatricCapability.enabled
  const pediatricNoticeId = "pediatric-mode-capability-notice"

  function selectMode(next: ClinicalMode) {
    if (!pediatricCapability.enabled && (
      next === "PEDIATRIC" || existingPediatricRecord
    )) return
    applyClinicalModeSwitch(next, { ageYears, ageValue, ageUnit }, setValue as never)
  }

  function updatePediatricAge(value: number | null | undefined, unit = ageUnit) {
    setValue("ageValue", value ?? null, { shouldDirty: true })
    if (value == null) {
      setValue("ageYears", null, { shouldDirty: true })
      return
    }
    const result = normalizePediatricAge({ value, unit })
    setValue("ageYears", result?.completedYears, { shouldDirty: true })
  }

  return (
    <fieldset
      disabled={pediatricRecordReadOnly}
      className="min-w-0 space-y-4 border-0 p-0 sm:col-span-3"
    >
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("mode")}
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {(["ADULT", "PEDIATRIC"] as const).map(value => (
            <button
              key={value}
              type="button"
              onClick={() => selectMode(value)}
              disabled={value === "PEDIATRIC" && !pediatricCapability.enabled}
              aria-pressed={mode === value}
              aria-describedby={value === "PEDIATRIC"
                && !pediatricCapability.enabled
                && !pediatricRecordReadOnly
                ? pediatricNoticeId
                : undefined}
              className={`min-h-11 border-2 px-3 py-2 text-sm font-semibold transition-colors ${
                mode === value
                  ? "border-blue-500 bg-blue-500 text-white"
                  : "border-slate-200 text-slate-600 hover:border-blue-300 dark:border-[#3a3a3a] dark:text-slate-300"
              } disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:hover:border-slate-200 dark:disabled:border-[#3a3a3a] dark:disabled:bg-[#202020] dark:disabled:text-slate-500`}
            >
              {value === "ADULT" ? t("adult") : t("pediatric")}
            </button>
          ))}
        </div>
        {!pediatricCapability.enabled && !pediatricRecordReadOnly && (
          <p
            id={pediatricNoticeId}
            role="status"
            className="flex items-start gap-2 border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200"
          >
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t(pediatricCapabilityMessageKey(
              pediatricCapability,
              pediatricRecordReadOnly,
            ))}</span>
          </p>
        )}
      </div>

      {mode === "ADULT" ? (
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("age")} <span className="text-red-500">*</span>
          </Label>
          <Controller name="ageYears" control={control} render={({ field }) => (
            <NumberStepper
              value={field.value}
              onChange={field.onChange}
              min={0}
              max={149}
              step={1}
              unit={t("yearsShort")}
              showSlider
            />
          )} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("preciseAge")} <span className="text-red-500">*</span>
            </Label>
            <NumberStepper
              value={ageValue}
              onChange={updatePediatricAge}
              min={0}
              max={ageMaximum(ageUnit)}
              step={1}
              unit={t(ageUnit === "DAYS" ? "daysShort" : ageUnit === "MONTHS" ? "monthsShort" : "yearsShort")}
              showSlider={ageUnit === "YEARS"}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("ageUnit")}
            </Label>
            <div className="grid grid-cols-3 gap-1">
              {AGE_UNITS.map(unit => (
                <button
                  key={unit}
                  type="button"
                  onClick={() => {
                    setValue("ageUnit", unit, { shouldDirty: true })
                    updatePediatricAge(undefined, unit)
                  }}
                  className={`h-10 border text-xs font-semibold ${
                    ageUnit === unit
                      ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                      : "border-slate-200 text-slate-500 dark:border-[#3a3a3a]"
                  }`}
                >
                  {t(unit === "DAYS" ? "days" : unit === "MONTHS" ? "months" : "years")}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end pb-2">
            {normalized && (
              <Badge variant="outline">{t(`ageGroups.${normalized.ageGroup}`)}</Badge>
            )}
          </div>
        </div>
      )}

      {!modeMismatch.valid && (
        <div className="flex items-start justify-between gap-3 border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
          <span className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            {modeMismatch.code === "PEDIATRIC_MODE_REQUIRED" ? t("switchRequired") : t("adultRequired")}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={modeMismatch.code === "PEDIATRIC_MODE_REQUIRED"
              && !pediatricCapability.enabled}
            onClick={() => selectMode(modeMismatch.code === "PEDIATRIC_MODE_REQUIRED" ? "PEDIATRIC" : "ADULT")}
          >
            {/* Named destination: a bare "Switch mode" reads as an offer to override the warning. */}
            {modeMismatch.code === "PEDIATRIC_MODE_REQUIRED" ? t("switchToPediatric") : t("switchToAdult")}
          </Button>
        </div>
      )}
      {ageIssues.map(issue => (
        <p
          key={issue.code}
          className={issue.severity === "ERROR" ? "text-xs text-red-600" : "text-xs text-amber-600"}
        >
          {t(`ageIssues.${issue.code}`)}
        </p>
      ))}
    </fieldset>
  )
}


export function PediatricRiskAndCalculators({
  control,
  setValue,
  isShown = () => true,
}: FormProps & {
  /** Whether the hospital's preop profile asks this field's question. */
  isShown?: (field: string) => boolean
}) {
  const t = useTranslations("pediatric")
  const tRoot = useTranslations()
  // A score with a switched-off input is not computed as if the answer were "no".
  const povocAvailable = ["povocSurgeryAtLeast30Minutes", "povocStrabismusSurgery", "povocHistory"].every(field => isShown(field))
  const [
    mode,
    ageValue,
    ageUnitRaw,
    povocSurgeryAtLeast30Minutes,
    povocStrabismusSurgery,
    povocHistory,
    fastingRows,
  ] = useWatch({
    control,
    name: [
      "clinicalMode",
      "ageValue",
      "ageUnit",
      "povocSurgeryAtLeast30Minutes",
      "povocStrabismusSurgery",
      "povocHistory",
      "pediatricFasting",
    ],
  })
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
  const fastingByCategory = useMemo(
    () => new Map((fastingRows ?? []).map(row => [row.category, row])),
    [fastingRows],
  )

  if (mode !== "PEDIATRIC") return null

  // A nil-by-mouth assignment: each intake stops so many hours before
  // surgery. Clearing the hours removes that intake from the assignment.
  function assignFasting(category: PediatricFastingCategory, raw: string) {
    const remaining = (fastingRows ?? []).filter(row => row.category !== category)
    const hoursBefore = raw === "" ? null : Number(raw)
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
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("povoc")}</p>
          {povoc && povocAvailable && <Badge variant="outline">{povoc.score}/4 · {povoc.riskPercent}%</Badge>}
        </div>
        {!povocAvailable && <p className="text-xs text-slate-500" role="note">{tRoot("preop.scoreUnavailable")}</p>}
        {([
          ["povocSurgeryAtLeast30Minutes", "povocSurgery"],
          ["povocStrabismusSurgery", "povocStrabismus"],
          ["povocHistory", "povocHistory"],
        ] as const).filter(([field]) => isShown(field)).map(([field, label]) => (
          <Controller key={field} name={field} control={control} render={({ field: controller }) => (
            <ClinicalYesNo id={field} label={t(label)} value={controller.value ?? null} onChange={controller.onChange} />
          )} />
        ))}
        {povoc && povocAvailable && <p className="text-xs text-slate-500">{t("povocAgeFactor", { active: povoc.factors.ageAtLeast3Years ? t("yes") : t("no") })}</p>}
      </div>

      {isShown("coldsApplicable") && <PediatricColdsCard control={control} setValue={setValue} />}

      <div className="border-t border-slate-200 pt-4 dark:border-[#2e2e2e]">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("npoTitle")}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => setValue("pediatricFasting", policyFastingAssignments(), { shouldDirty: true })}>
            {t("npoUsePolicy")}
          </Button>
        </div>
        <p className="mb-3 text-xs text-slate-500">{t("npoHint")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PEDIATRIC_FASTING_CATEGORIES.map(category => {
            const row = fastingByCategory.get(category)
            const minimum = APAGBI_FASTING_POLICY_2023.minimumHours[category]
            return (
              <label key={category} className="space-y-1 text-xs font-semibold text-slate-500" data-testid={`npo-${category}`}>
                <span>{t(`fastingCategories.${category}`)}</span>
                <span className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    inputMode="decimal"
                    value={row?.hoursBefore ?? ""}
                    placeholder={String(minimum)}
                    onChange={event => assignFasting(category, event.target.value)}
                    className="h-10 w-24 border border-slate-300 bg-white px-2 text-sm font-normal text-slate-800 dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-slate-100"
                  />
                  <span className="font-normal">{t("npoHoursBefore")}</span>
                </span>
                {row && isFastingAssignmentBelowMinimum(row) && (
                  <span className="block font-normal text-amber-600">{t("npoBelowMinimum", { hours: minimum })}</span>
                )}
              </label>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {APAGBI_FASTING_POLICY_2023.id} {APAGBI_FASTING_POLICY_2023.version}
        </p>
      </div>

    </div>
  )
}

export { PediatricVitalReferenceNote } from "@/components/forms/PediatricPreopDisplay"
