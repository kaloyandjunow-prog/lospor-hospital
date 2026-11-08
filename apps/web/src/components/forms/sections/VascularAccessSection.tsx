"use client"
import { Controller, type Control, type UseFormWatch } from "react-hook-form"
import { useTranslations } from "next-intl"
import { SectionCard } from "@/components/forms/shared/SectionCard"
import { VascularAccessTree, type VascularAccess } from "@/components/VascularAccessTree"
import type { IntraopFormFields } from "@/components/forms/IntraopForm"
import { localTimeOf } from "@lospor/core/intraop-time"
import type { ReactNode } from "react"

export function VascularAccessSection({ control, watch, smart }: {
  control: Control<IntraopFormFields>
  watch: UseFormWatch<IntraopFormFields>
  /** Smart selection (10.2.0): when given, it stands in for the tree below; the legacy tab is untouched. */
  smart?: ReactNode
}) {
  const t = useTranslations()
  return (
    <SectionCard title={t("intraop.vascularSection")} collapsible defaultCollapsed={!smart}
      badge={(() => { const a = (watch("vascularAccesses") ?? []) as VascularAccess[]; return a.length ? t("intraop.vascular.accessCount", { count: a.length }) : undefined })()}>

      {smart ?? <Controller name="vascularAccesses" control={control} render={({ field }) => (
        <VascularAccessTree
          value={(field.value ?? []) as VascularAccess[]}
          onChange={field.onChange}
        />
      )} />}
      {!smart && (() => {
        // 10.2.0: a line that failed stays on the list, marked with the time.
        const failed = ((watch("vascularAccesses") ?? []) as (VascularAccess & { failed?: boolean; failedAt?: string | null })[]).filter(line => line.failed)
        if (failed.length === 0) return null
        const zone = watch("timezone")
        return (
          <ul className="mt-2 text-xs text-red-600 dark:text-red-300" data-testid="vascular-failed-lines">
            {failed.map((line, index) => (
              <li key={`${line.site}-${index}`}>
                {line.siteLabel || line.site}{line.size ? ` ${line.size}${line.sizeUnit ?? ""}` : ""} · {t("intraop.airwayExchange.failed")}
                {line.failedAt ? ` ${(zone ? localTimeOf(new Date(line.failedAt), zone) : null) ?? line.failedAt.slice(11, 16)}` : ""}
              </li>
            ))}
          </ul>
        )
      })()}
    </SectionCard>
  )
}
