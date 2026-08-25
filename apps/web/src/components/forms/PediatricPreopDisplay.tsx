"use client"

import { Check } from "lucide-react"
import { useTranslations } from "next-intl"
import { useWatch, type Control } from "react-hook-form"
import { getPediatricVitalReference } from "@lospor/core/pediatric"
import { Button } from "@/components/ui/button"
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

export function CalculationCard({
  title,
  value,
  caseId,
  accepted,
  accepting,
  onAccept,
}: {
  title: string
  value: string
  caseId?: string | null
  accepted: boolean
  accepting: boolean
  onAccept?: () => void
}) {
  const t = useTranslations("pediatric")
  return (
    <div className="border border-slate-200 bg-slate-50 p-3 dark:border-[#2e2e2e] dark:bg-[#181818]">
      <p className="text-xs font-semibold text-slate-500">{title}</p>
      <p className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-100">{value}</p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-2 w-full"
        disabled={!caseId || !onAccept || accepting || accepted}
        onClick={onAccept}
      >
        {accepted ? <><Check className="mr-1 h-3.5 w-3.5" />{t("accepted")}</> : caseId ? t("accept") : t("saveFirst")}
      </Button>
    </div>
  )
}
