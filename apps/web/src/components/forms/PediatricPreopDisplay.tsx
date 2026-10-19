"use client"

import { useTranslations } from "next-intl"
import { useWatch, type Control } from "react-hook-form"
import { getPediatricVitalReference } from "@lospor/core/pediatric"
import type { PreopData } from "@/components/forms/preopSchema"

export function PediatricVitalReferenceNote({ control }: { control: Control<PreopData> }) {
  const t = useTranslations("pediatric")
  const [mode, ageValue, ageUnitRaw] = useWatch({
    control,
    name: ["clinicalMode", "ageValue", "ageUnit"],
  })
  const ageUnit = ageUnitRaw ?? "YEARS"
  const reference = mode === "PEDIATRIC" && ageValue != null
    ? getPediatricVitalReference({ value: ageValue, unit: ageUnit })
    : null
  if (!reference) return null
  return (
    <div className="sm:col-span-2 border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
      <strong>{t("softReference")}:</strong>{" "}
      {t("heartRateRange", { min: reference.heartRate.lower, max: reference.heartRate.upper })};{" "}
      {t("respiratoryRange", { min: reference.respiratoryRate.lower, max: reference.respiratoryRate.upper })};{" "}
      {t("systolicReference", {
        p5: reference.systolicBp.p5,
        p10: reference.systolicBp.p10,
        p50: reference.systolicBp.p50,
      })}
    </div>
  )
}
