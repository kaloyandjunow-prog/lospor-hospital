"use client"
import { Controller, type Control, type UseFormWatch } from "react-hook-form"
import { useLocale } from "next-intl"
import { SectionCard } from "@/components/forms/shared/SectionCard"
import type { LibraryOption } from "@/hooks/useOptionLibrary"
import { resolveDisplayOption } from "@/lib/clinical-display"
import type { IntraopFormFields } from "@/components/forms/IntraopForm"

export function PositionSection({ t, control, watch, positionOptions }: {
  t: (key: string) => string
  control: Control<IntraopFormFields>
  watch: UseFormWatch<IntraopFormFields>
  positionOptions: LibraryOption[]
}) {
  const locale = useLocale()
  const display = (option: LibraryOption) => resolveDisplayOption("POSITION", option, locale)
  return (
    <SectionCard title={t("intraop.positionSection")} collapsible
      badge={(() => {
        const selected: string[] = watch("positions") ?? []
        return selected.length
          ? selected.map(value => {
              const option = positionOptions.find(candidate => candidate.value === value)
              return option ? display(option).label : value
            }).join(", ")
          : undefined
      })()}>
      <Controller name="positions" control={control} render={({ field }) => {
        const selected: string[] = field.value ?? []
        function toggle(v: string) {
          field.onChange(
            selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]
          )
        }
        return (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {positionOptions.map(opt => {
              const on = selected.includes(opt.value)
              return (
                <button key={opt.value} type="button" onClick={() => toggle(opt.value)}
                  className={`rounded-xl border-2 p-2.5 text-center transition-all ${
                    on ? opt.color + " scale-105 shadow-sm"
                       : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-[#888] hover:border-slate-300 dark:hover:border-[#555]"
                  }`}>
                  <div className="text-xs font-bold leading-tight">{display(opt).label}</div>
                  <div className="text-[9px] mt-1 leading-tight opacity-75">{display(opt).description}</div>
                </button>
              )
            })}
          </div>
        )
      }} />
    </SectionCard>
  )
}
