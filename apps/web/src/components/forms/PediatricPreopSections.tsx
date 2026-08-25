"use client"

import { useMemo, useState } from "react"
import {
  Controller,
  useWatch,
  type Control,
  type UseFormSetValue,
} from "react-hook-form"
import { useLocale, useTranslations } from "next-intl"
import { ShieldAlert } from "lucide-react"
import {
  APAGBI_FASTING_POLICY_2023,
  calculateColds,
  calculatePovoc,
  evaluatePediatricFasting,
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
import { ClinicalYesNo } from "@/components/ClinicalYesNo"
import { NumberStepper } from "@/components/NumberStepper"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import type { PreopData } from "@/components/forms/preopSchema"
import {
  pediatricCapabilityMessageKey,
  type PediatricModeCapability,
} from "@/lib/deployment-capabilities"
import { CalculationCard } from "@/components/forms/PediatricPreopDisplay"

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
    setValue("clinicalMode", next, { shouldDirty: true })
    setValue("aiOptIn", false, { shouldDirty: true })
    if (next === "PEDIATRIC") {
      const currentYears = ageYears != null && ageYears < 18 ? ageYears : undefined
      setValue("ageUnit", "YEARS", { shouldDirty: true })
      setValue("ageValue", currentYears, { shouldDirty: true })
      setValue("ageYears", currentYears, { shouldDirty: true })
      setValue("rcriScore", undefined, { shouldDirty: true })
      setValue("apfelScore", undefined, { shouldDirty: true })
      setValue("stopBangScore", undefined, { shouldDirty: true })
      setValue("bpSystolic", undefined, { shouldDirty: true })
      setValue("bpDiastolic", undefined, { shouldDirty: true })
      setValue("heartRate", undefined, { shouldDirty: true })
      setValue("spO2", undefined, { shouldDirty: true })
      setValue("temperature", undefined, { shouldDirty: true })
      setValue("respiratoryRate", undefined, { shouldDirty: true })
      return
    }
    setValue(
      "ageYears",
      ageValue != null && ageUnit === "YEARS" ? ageValue : undefined,
      { shouldDirty: true },
    )
    setValue("ageValue", undefined, { shouldDirty: true })
    setValue("ageUnit", undefined, { shouldDirty: true })
    setValue("pediatricFasting", [], { shouldDirty: true })
    setValue("coldsApplicable", false, { shouldDirty: true })
  }

  function updatePediatricAge(value: number | undefined, unit = ageUnit) {
    setValue("ageValue", value, { shouldDirty: true })
    if (value == null) {
      setValue("ageYears", undefined, { shouldDirty: true })
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
            {t("switchMode")}
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

const COLDS_OPTIONS = {
  coldsCurrentSymptoms: ["NONE", "MILD", "MODERATE_OR_SEVERE"],
  coldsOnset: ["MORE_THAN_4_WEEKS", "TWO_TO_4_WEEKS", "LESS_THAN_2_WEEKS"],
  coldsLungDisease: ["NONE", "MILD", "MODERATE_OR_SEVERE"],
  coldsAirwayDevice: ["FACE_MASK_OR_NONE", "SUPRAGLOTTIC", "TRACHEAL_TUBE"],
  coldsSurgery: ["NON_AIRWAY", "MINOR_AIRWAY", "MAJOR_AIRWAY"],
} as const

type ColdsField = keyof typeof COLDS_OPTIONS

const FASTING_CATEGORIES: PediatricFastingCategory[] = [
  "CLEAR_FLUIDS",
  "BREAST_MILK",
  "INFANT_FORMULA_UNDER_1_YEAR",
  "SOLID_FOOD_OR_COW_MILK",
]

type AcceptedKind = "MOSTELLER_BSA" | "MAINTENANCE_FLUID" | "RCUK_RESUSCITATION"

export function PediatricRiskAndCalculators({
  control,
  setValue,
  caseId,
}: FormProps & { caseId?: string | null }) {
  const t = useTranslations("pediatric")
  const locale = useLocale()
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
  const colds = coldsApplicable
    && coldsCurrentSymptoms && coldsOnset && coldsLungDisease && coldsAirwayDevice && coldsSurgery
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
    ? calculatePediatricMaintenanceFluid({
        weightKg,
        age: ageValue != null ? { value: ageValue, unit: ageUnit } : null,
      })
    : null
  const resuscitation = weightKg ? calculateRcukPediatricResuscitation({ weightKg }) : null

  const coldsValues: Partial<Record<ColdsField, string>> = {
    coldsCurrentSymptoms,
    coldsOnset,
    coldsLungDisease,
    coldsAirwayDevice,
    coldsSurgery,
  }
  const fastingByCategory = useMemo(
    () => new Map((fastingRows ?? []).map(row => [row.category, row])),
    [fastingRows],
  )

  if (mode !== "PEDIATRIC") return null

  function setColds(field: ColdsField, value: string) {
    setValue(field, value as never, { shouldDirty: true })
  }

  function updateFasting(category: PediatricFastingCategory, rawLocalDate: string) {
    const remaining = (fastingRows ?? []).filter(row => row.category !== category)
    if (!rawLocalDate) {
      setValue("pediatricFasting", remaining, { shouldDirty: true })
      return
    }
    const lastIntakeAt = new Date(rawLocalDate).toISOString()
    const result = evaluatePediatricFasting({
      category,
      lastIntakeAt,
      assessmentAt: new Date(),
    })
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
    try {
      const response = await fetch(`/api/cases/${caseId}/calculations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, inputs }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setAccepted(current => new Set(current).add(kind))
    } finally {
      setAccepting(null)
    }
  }

  function localDateValue(value?: string | null) {
    if (!value) return ""
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return ""
    const offset = date.getTimezoneOffset() * 60_000
    return new Date(date.getTime() - offset).toISOString().slice(0, 16)
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("povoc")}</p>
          {povoc && <Badge variant="outline">{povoc.score}/4 · {povoc.riskPercent}%</Badge>}
        </div>
        {([
          ["povocSurgeryAtLeast30Minutes", "povocSurgery"],
          ["povocStrabismusSurgery", "povocStrabismus"],
          ["povocHistory", "povocHistory"],
        ] as const).map(([field, label]) => (
          <Controller key={field} name={field} control={control} render={({ field: controller }) => (
            <ClinicalYesNo id={field} label={t(label)} value={controller.value ?? null} onChange={controller.onChange} />
          )} />
        ))}
        {povoc && <p className="text-xs text-slate-500">{t("povocAgeFactor", { active: povoc.factors.ageAtLeast3Years ? t("yes") : t("no") })}</p>}
      </div>

      <div className="border-t border-slate-200 pt-4 dark:border-[#2e2e2e]">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <Controller name="coldsApplicable" control={control} render={({ field }) => (
            <Checkbox checked={!!field.value} onCheckedChange={field.onChange} />
          )} />
          {t("coldsApplicable")}
        </label>
        {coldsApplicable && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(Object.keys(COLDS_OPTIONS) as ColdsField[]).map(field => (
              <label key={field} className="space-y-1 text-xs font-semibold text-slate-500">
                <span>{t(`coldsFields.${field}`)}</span>
                <select
                  value={coldsValues[field] ?? ""}
                  onChange={event => setColds(field, event.target.value)}
                  className="h-10 w-full border border-slate-300 bg-white px-2 text-sm font-normal text-slate-800 dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-slate-100"
                >
                  <option value="">{t("select")}</option>
                  {COLDS_OPTIONS[field].map(value => (
                    <option key={value} value={value}>{t(`coldsValues.${value}`)}</option>
                  ))}
                </select>
              </label>
            ))}
            <div className="flex items-end">
              <Badge variant="outline">{t("coldsScore")}: {colds?.score ?? "—"}/25</Badge>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 pt-4 dark:border-[#2e2e2e]">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("fasting")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {FASTING_CATEGORIES.map(category => {
            const row = fastingByCategory.get(category)
            return (
              <label key={category} className="space-y-1 text-xs font-semibold text-slate-500">
                <span>{t(`fastingCategories.${category}`)}</span>
                <input
                  type="datetime-local"
                  value={localDateValue(row?.lastIntakeAt)}
                  onChange={event => updateFasting(category, event.target.value)}
                  className="h-10 w-full border border-slate-300 bg-white px-2 text-sm font-normal text-slate-800 dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-slate-100"
                />
                {row && (
                  <span className={row.status === "MET" ? "text-emerald-600" : row.status === "NOT_MET" ? "text-red-600" : "text-amber-600"}>
                    {t(`fastingStatus.${row.status ?? "UNKNOWN"}`)} · {row.requiredHours} h
                  </span>
                )}
              </label>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {APAGBI_FASTING_POLICY_2023.id} {APAGBI_FASTING_POLICY_2023.version}
        </p>
      </div>

      <div className="border-t border-slate-200 pt-4 dark:border-[#2e2e2e]">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("calculators")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <CalculationCard
            title={t("bsa")}
            value={bsa?.available ? `${bsa.value.squareMetres} m²` : "—"}
            caseId={caseId}
            accepted={accepted.has("MOSTELLER_BSA")}
            accepting={accepting === "MOSTELLER_BSA"}
            onAccept={heightCm && weightKg
              ? () => acceptCalculation("MOSTELLER_BSA", { heightCm, weightKg })
              : undefined}
          />
          <CalculationCard
            title={t("maintenanceFluid")}
            value={maintenance?.available
              ? maintenance.value.dailyRangeMl
                ? `${maintenance.value.dailyRangeMl.minimum}–${maintenance.value.dailyRangeMl.maximum} ml/day`
                : `${maintenance.value.dailyMl} ml/day · ${maintenance.value.hourlyMl} ml/h`
              : "—"}
            caseId={caseId}
            accepted={accepted.has("MAINTENANCE_FLUID")}
            accepting={accepting === "MAINTENANCE_FLUID"}
            onAccept={weightKg
              ? () => acceptCalculation("MAINTENANCE_FLUID", {
                  weightKg,
                  age: ageValue != null ? { value: ageValue, unit: ageUnit } : null,
                })
              : undefined}
          />
          <CalculationCard
            title={t("resuscitation")}
            value={resuscitation?.available
              ? `${resuscitation.value.shockJoules} J · ${resuscitation.value.adrenalineMicrograms} mcg`
              : "—"}
            caseId={caseId}
            accepted={accepted.has("RCUK_RESUSCITATION")}
            accepting={accepting === "RCUK_RESUSCITATION"}
            onAccept={weightKg
              ? () => acceptCalculation("RCUK_RESUSCITATION", { weightKg })
              : undefined}
          />
        </div>
        <div className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {t("profilesUnavailable")}
        </div>
        <p className="mt-2 text-xs text-slate-400">{locale === "bg" ? "Версия на правилата" : "Ruleset"}: {bsa?.ruleVersion ?? "—"}</p>
      </div>
    </div>
  )
}

export { PediatricVitalReferenceNote } from "@/components/forms/PediatricPreopDisplay"
