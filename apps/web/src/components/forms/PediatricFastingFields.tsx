"use client"

import { useMemo } from "react"
import { useWatch, type Control, type UseFormSetValue } from "react-hook-form"
import { useTranslations } from "next-intl"
import {
  APAGBI_FASTING_POLICY_2023,
  isFastingAssignmentBelowMinimum,
  PEDIATRIC_FASTING_CATEGORIES,
  policyFastingAssignments,
  type PediatricFastingCategory,
} from "@lospor/core/pediatric"
import { Button } from "@/components/ui/button"
import type { PreopData } from "@/components/forms/preopSchema"

export function PediatricFastingFields({ control, setValue }: { control: Control<PreopData>; setValue: UseFormSetValue<PreopData> }) {
  const t = useTranslations("pediatric")
  const fastingRows = useWatch({ control, name: "pediatricFasting" })
  const fastingByCategory = useMemo(() => new Map((fastingRows ?? []).map(row => [row.category, row])), [fastingRows])

  function assignFasting(category: PediatricFastingCategory, raw: string) {
    const remaining = (fastingRows ?? []).filter(row => row.category !== category)
    const hoursBefore = raw === "" ? null : Number(raw)
    if (hoursBefore == null || !Number.isFinite(hoursBefore) || hoursBefore < 0) {
      setValue("pediatricFasting", remaining, { shouldDirty: true })
      return
    }
    setValue("pediatricFasting", [...remaining, { category, hoursBefore: Math.min(hoursBefore, 24), policyId: APAGBI_FASTING_POLICY_2023.id, policyVersion: APAGBI_FASTING_POLICY_2023.version }], { shouldDirty: true })
  }

  return <div data-testid="preop-fasting">
    <div className="mb-1 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("npoTitle")}</p><Button type="button" size="sm" variant="outline" onClick={() => setValue("pediatricFasting", policyFastingAssignments(), { shouldDirty: true })}>{t("npoUsePolicy")}</Button></div>
    <p className="mb-3 text-xs text-slate-500">{t("npoHint")}</p>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {PEDIATRIC_FASTING_CATEGORIES.map(category => {
        const row = fastingByCategory.get(category)
        const minimum = APAGBI_FASTING_POLICY_2023.minimumHours[category]
        return <label key={category} className="space-y-1 text-xs font-semibold text-slate-500" data-testid={`npo-${category}`}><span>{t(`fastingCategories.${category}`)}</span><span className="flex items-center gap-2"><input type="number" min={0} max={24} step={0.5} inputMode="decimal" value={row?.hoursBefore ?? ""} placeholder={String(minimum)} onChange={event => assignFasting(category, event.target.value)} className="h-10 w-24 border border-slate-300 bg-white px-2 text-sm font-normal text-slate-800 dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-slate-100" /><span className="font-normal">{t("npoHoursBefore")}</span></span>{row && isFastingAssignmentBelowMinimum(row) && <span className="block font-normal text-amber-600">{t("npoBelowMinimum", { hours: minimum })}</span>}</label>
      })}
    </div>
    <p className="mt-2 text-xs text-slate-400">{APAGBI_FASTING_POLICY_2023.id} {APAGBI_FASTING_POLICY_2023.version}</p>
  </div>
}
