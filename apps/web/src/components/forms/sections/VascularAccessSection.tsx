"use client"
import { Controller, type Control, type UseFormWatch } from "react-hook-form"
import { useTranslations } from "next-intl"
import { SectionCard } from "@/components/forms/shared/SectionCard"
import { VascularAccessTree, type VascularAccess } from "@/components/VascularAccessTree"
import type { IntraopFormFields } from "@/components/forms/IntraopForm"

export function VascularAccessSection({ control, watch }: {
  control: Control<IntraopFormFields>
  watch: UseFormWatch<IntraopFormFields>
}) {
  const t = useTranslations()
  return (
    <SectionCard title={t("intraop.vascularSection")} collapsible defaultCollapsed
      badge={(() => { const a = (watch("vascularAccesses") ?? []) as VascularAccess[]; return a.length ? t("intraop.vascular.accessCount", { count: a.length }) : undefined })()}>

      <Controller name="vascularAccesses" control={control} render={({ field }) => (
        <VascularAccessTree
          value={(field.value ?? []) as VascularAccess[]}
          onChange={field.onChange}
        />
      )} />
    </SectionCard>
  )
}
