"use client"

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
  calculatePovoc,
  normalizePediatricAge,
  validateClinicalModeAge,
  validatePediatricAge,
  type ClinicalMode,
  type PediatricAgeUnit,
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
export { PediatricFastingFields } from "@/components/forms/PediatricFastingFields"

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
  part,
  compact = false,
}: FormProps & {
  pediatricCapability: PediatricModeCapability
  existingPediatricRecord?: boolean
  /** Only the mode switch, or only the age, so a compact layout can place them apart. */
  part?: "mode" | "age"
  /** No sliders and smaller buttons: the compact demographics layout. */
  compact?: boolean
}) {
  const showMode = part !== "age"
  const showAge = part !== "mode"
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
      className={compact ? "min-w-0 space-y-2 border-0 p-0" : "min-w-0 space-y-4 border-0 p-0 sm:col-span-3"}
    >
      {showMode && <div className="space-y-2">
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
              className={`${compact ? "min-h-9 py-1.5 text-xs" : "min-h-11 py-2 text-sm"} border-2 px-3 font-semibold transition-colors ${
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
      </div>}

      {showAge && (mode === "ADULT" ? (
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
              showSlider={!compact}
            />
          )} />
        </div>
      ) : (
        <div className={compact ? "grid grid-cols-1 gap-2" : "grid grid-cols-1 gap-4 sm:grid-cols-3"}>
          <div className={compact ? "space-y-2" : "space-y-2 sm:col-span-2"}>
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
              showSlider={!compact && ageUnit === "YEARS"}
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
      ))}

      {showAge && !modeMismatch.valid && (
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
      {showAge && ageIssues.map(issue => (
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
  ] = useWatch({
    control,
    name: [
      "clinicalMode",
      "ageValue",
      "ageUnit",
      "povocSurgeryAtLeast30Minutes",
      "povocStrabismusSurgery",
      "povocHistory",
    ],
  })
  const ageUnit: PediatricAgeUnit = ageUnitRaw ?? "YEARS"
  const age = ageValue != null ? normalizePediatricAge({ value: ageValue, unit: ageUnit }) : null
  // A score once all three are answered (10.0.0); an unanswered one is not a "no".
  const povocAnswers = [povocSurgeryAtLeast30Minutes, povocStrabismusSurgery, povocHistory]
  const povocAnsweredCount = povocAnswers.filter(answer => answer === true || answer === false).length
  const povoc = age && povocAnsweredCount === 3
    ? calculatePovoc({
        ageYears: age.approximateDays / 365.2425,
        surgeryMinutes: povocSurgeryAtLeast30Minutes ? 30 : 0,
        strabismusSurgery: !!povocStrabismusSurgery,
        patientOrFamilyHistory: !!povocHistory,
      })
    : null
  if (mode !== "PEDIATRIC") return null

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("povoc")}</p>
          {povoc && povocAvailable && <Badge variant="outline">{povoc.score}/4 · {povoc.riskPercent}%</Badge>}
          {!povoc && povocAvailable && <span className="text-xs text-slate-500" data-testid="povoc-answered">{tRoot("preop.questionsAnswered", { answered: povocAnsweredCount, total: 3 })}</span>}
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
    </div>
  )
}

export { PediatricVitalReferenceNote } from "@/components/forms/PediatricPreopDisplay"
