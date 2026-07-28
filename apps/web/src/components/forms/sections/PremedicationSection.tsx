"use client"
import { Controller, type Control, type UseFormWatch } from "react-hook-form"
import { SectionCard } from "@/components/forms/shared/SectionCard"
import { PremedicationPicker, type PremDoseCfg, type PremedCat } from "@/components/intraop/PremedicationPicker"
import type { IntraopFormFields } from "@/components/forms/IntraopForm"

export function PremedicationSection({ t, control, watch, premedCategories, premedDoses }: {
  t: (key: string) => string
  control: Control<IntraopFormFields>
  watch: UseFormWatch<IntraopFormFields>
  premedCategories: PremedCat[]
  premedDoses: Record<string, PremDoseCfg>
}) {
  return (
    <SectionCard title={t("intraop.premedicationSection")} collapsible defaultCollapsed
      badge={[watch("premedicationEvening"), watch("premedicationMorning")].filter(Boolean).join(" · ") || undefined}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Controller name="premedicationEvening" control={control} render={({ field }) => (
          <PremedicationPicker label={t("intraop.premedicationEvening")} value={field.value} onChange={field.onChange} categories={premedCategories} doses={premedDoses} />
        )} />
        <Controller name="premedicationMorning" control={control} render={({ field }) => (
          <PremedicationPicker label={t("intraop.premedicationMorning")} value={field.value} onChange={field.onChange} categories={premedCategories} doses={premedDoses} />
        )} />
      </div>
    </SectionCard>
  )
}
