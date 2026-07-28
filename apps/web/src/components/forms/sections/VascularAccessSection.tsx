"use client"
import { Controller, type Control, type UseFormWatch } from "react-hook-form"
import { SectionCard } from "@/components/forms/shared/SectionCard"
import { VascularAccessTree, type VascularAccess } from "@/components/VascularAccessTree"
import type { IntraopFormFields } from "@/components/forms/IntraopForm"

export function VascularAccessSection({ control, watch }: {
  control: Control<IntraopFormFields>
  watch: UseFormWatch<IntraopFormFields>
}) {
  return (
    <SectionCard title="Vascular Access" collapsible defaultCollapsed
      badge={(() => { const a = (watch("vascularAccesses") ?? []) as VascularAccess[]; return a.length ? `${a.length} access${a.length > 1 ? "es" : ""}` : undefined })()}>

      <Controller name="vascularAccesses" control={control} render={({ field }) => (
        <VascularAccessTree
          value={(field.value ?? []) as VascularAccess[]}
          onChange={field.onChange}
        />
      )} />
    </SectionCard>
  )
}
