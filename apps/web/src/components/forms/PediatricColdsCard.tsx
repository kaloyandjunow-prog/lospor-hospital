"use client"

import { Controller, useWatch, type Control, type UseFormSetValue } from "react-hook-form"
import { useTranslations } from "next-intl"
import { calculateColds } from "@lospor/core/pediatric"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import type { PreopData } from "@/components/forms/preopSchema"

const COLDS_OPTIONS = {
  coldsCurrentSymptoms: ["NONE", "MILD", "MODERATE_OR_SEVERE"],
  coldsOnset: ["MORE_THAN_4_WEEKS", "TWO_TO_4_WEEKS", "LESS_THAN_2_WEEKS"],
  coldsLungDisease: ["NONE", "MILD", "MODERATE_OR_SEVERE"],
  coldsAirwayDevice: ["FACE_MASK_OR_NONE", "SUPRAGLOTTIC", "TRACHEAL_TUBE"],
  coldsSurgery: ["NON_AIRWAY", "MINOR_AIRWAY", "MAJOR_AIRWAY"],
} as const

type ColdsField = keyof typeof COLDS_OPTIONS

/** The COLDS score card of the pediatric risk section, drawn while the profile asks it. */
export function PediatricColdsCard({ control, setValue }: {
  control: Control<PreopData>
  setValue: UseFormSetValue<PreopData>
}) {
  const t = useTranslations("pediatric")
  const [coldsApplicable, coldsCurrentSymptoms, coldsOnset, coldsLungDisease, coldsAirwayDevice, coldsSurgery] = useWatch({
    control,
    name: ["coldsApplicable", "coldsCurrentSymptoms", "coldsOnset", "coldsLungDisease", "coldsAirwayDevice", "coldsSurgery"],
  })
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
  const coldsValues: Partial<Record<ColdsField, string>> = {
    coldsCurrentSymptoms,
    coldsOnset,
    coldsLungDisease,
    coldsAirwayDevice,
    coldsSurgery,
  }

  function setColds(field: ColdsField, value: string) {
    setValue(field, value as never, { shouldDirty: true })
  }

  return (
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
  )
}
