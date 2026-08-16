"use client"

import { Controller, type Control } from "react-hook-form"
import { useTranslations } from "next-intl"
import { Label } from "@/components/ui/label"
import { ClinicalYesNo } from "@/components/ClinicalYesNo"
import type { PreopData } from "@/components/forms/preopSchema"

/**
 * The four airway features found on examining the patient.
 *
 * These were single toggle pills, which could say only "present" or "not
 * present" -- so a feature nobody looked for rendered identically to one that
 * was looked for and absent. They are yes/no questions now, keeping the pill
 * shape so the row still reads as a compact group.
 *
 * Only a positive finding is tinted. Clearing difficultAirwayNotes when the
 * history is answered "no" or cleared is handled by an effect in PreopForm,
 * which fires for both.
 */
export function AirwayFeatures({ control }: { control: Control<PreopData> }) {
  const t = useTranslations()
  const features = [
    { id: "retrognathia", label: t("preop.retrognathia") },
    { id: "prominentIncisors", label: t("preop.prominentIncisors") },
    { id: "facialHair", label: t("preop.facialHair") },
    { id: "difficultAirwayHistory", label: t("preop.difficultAirway") },
  ] as const

  return (
    <div className="space-y-2 col-span-2 sm:col-span-3">
      <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {t("preop.airwayFeatures")}
      </Label>
      <div className="flex flex-wrap gap-2">
        {features.map(item => (
          <Controller key={item.id} name={item.id} control={control} render={({ field }) => (
            <ClinicalYesNo
              id={item.id}
              label={item.label}
              value={field.value ?? null}
              onChange={field.onChange}
              className={`items-center justify-start rounded-full border-2 px-4 py-1.5 transition-all ${
                field.value === true
                  ? "bg-amber-50 border-amber-400 text-amber-800 dark:bg-amber-950/30"
                  : "border-slate-200 dark:border-[#3a3a3a]"
              }`}
            />
          )} />
        ))}
      </div>
    </div>
  )
}
