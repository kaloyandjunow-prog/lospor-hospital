"use client"
import { Controller, type Control, type UseFormWatch } from "react-hook-form"
import { SectionCard } from "@/components/forms/shared/SectionCard"
import {
  PremedicationPicker,
  type PremDoseCfg,
  type PremedRouteView,
  type PremedAnnotation,
  type PremedCat,
} from "@/components/intraop/PremedicationPicker"
import type { IntraopFormFields } from "@/components/forms/IntraopForm"
import { isPremedicationAsOrdered, type PremedicationOrders } from "@lospor/core/premedication"

export function PremedicationSection({
  t, control, watch, premedCategories, premedDoses,
  premedAnnotations = {}, premedDoseForRoute, prospectiveGuidanceEnabled, ordered,
}: {
  /** The premedication ordered at the preop visit, to say where a phase still holds it. */
  ordered?: PremedicationOrders | null
  t: (key: string) => string
  control: Control<IntraopFormFields>
  watch: UseFormWatch<IntraopFormFields>
  premedCategories: PremedCat[]
  premedDoses: Record<string, PremDoseCfg>
  prospectiveGuidanceEnabled: boolean
  /** Paediatric provenance per drug; empty in adult mode. */
  premedAnnotations?: Record<string, PremedAnnotation>
  premedDoseForRoute?: (drug: string, route: string) => PremedRouteView | null
}) {
  return (
    <SectionCard title={t("intraop.premedicationSection")} collapsible defaultCollapsed
      badge={[watch("premedicationEvening"), watch("premedicationMorning")].filter(Boolean).join(" · ") || undefined}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Controller name="premedicationEvening" control={control} render={({ field }) => (
          <PremedicationPicker label={t("intraop.premedicationEvening")} value={field.value} onChange={field.onChange}
            categories={premedCategories} doses={premedDoses}
            annotations={premedAnnotations} doseForRoute={premedDoseForRoute}
            prospectiveGuidanceEnabled={prospectiveGuidanceEnabled}
            asOrdered={isPremedicationAsOrdered(field.value, ordered?.DAY_BEFORE)} testId="premedication-evening" />
        )} />
        <Controller name="premedicationMorning" control={control} render={({ field }) => (
          <PremedicationPicker label={t("intraop.premedicationMorning")} value={field.value} onChange={field.onChange}
            categories={premedCategories} doses={premedDoses}
            annotations={premedAnnotations} doseForRoute={premedDoseForRoute}
            prospectiveGuidanceEnabled={prospectiveGuidanceEnabled}
            asOrdered={isPremedicationAsOrdered(field.value, ordered?.MORNING)} testId="premedication-morning" />
        )} />
      </div>
    </SectionCard>
  )
}
