"use client"
import type { ReactNode } from "react"
import { SectionCard } from "@/components/forms/shared/SectionCard"
import { MonitoringGroups } from "@/components/intraop/MonitoringGroups"
import type { LibraryOption } from "@/hooks/useOptionLibrary"
import type { Path, UseFormWatch, UseFormSetValue } from "react-hook-form"
import type { IntraopFormFields } from "@/components/forms/IntraopForm"

// monitoringOptions' `value` is a free-form string from the OptionLibrary
// DB table (MONITORING category), not a compile-time literal — these casts
// to Path<IntraopFormFields> document "this DB-driven field name is expected
// to match a real form field" rather than opting out of checking entirely.
function asPath(name: string): Path<IntraopFormFields> { return name as Path<IntraopFormFields> }

/**
 * The Monitoring section. Smart selection (10.2.0) arrives as `smart`; without it this is the Legacy
 * section, every monitor grouped by what it tells you (the same list the phone's Legacy tab shows).
 */
export function MonitoringSection({ t, watch, setValue, monitoringOptions, smart, onChange }: {
  t: (key: string) => string
  watch: UseFormWatch<IntraopFormFields>
  setValue: UseFormSetValue<IntraopFormFields>
  monitoringOptions: LibraryOption[]
  advancedMonOpen?: boolean
  setAdvancedMonOpen?: (updater: (v: boolean) => boolean) => void
  smart?: ReactNode
  /** The whole new monitoring list, so the form can ask its follow-up questions; without it a tap sets the one field. */
  onChange?: (next: string[]) => void
}) {
  const active = monitoringOptions.filter(m => watch(asPath(m.value))).map(m => m.value)
  return (
    <SectionCard title={t("intraop.monitoringSection")} collapsible
      badge={active.length ? `${active.length} active` : undefined}>
      {smart ?? (
        <MonitoringGroups monitoring={active} monitoringOptions={monitoringOptions}
          onToggle={field => {
            if (onChange) onChange(active.includes(field) ? active.filter(item => item !== field) : [...active, field])
            else setValue(asPath(field), !active.includes(field), { shouldDirty: true })
          }} />
      )}
    </SectionCard>
  )
}
