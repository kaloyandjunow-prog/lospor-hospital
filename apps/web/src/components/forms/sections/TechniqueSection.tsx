"use client"
import type { ReactNode } from "react"
import { Controller, type Control } from "react-hook-form"
import { SectionCard } from "@/components/forms/shared/SectionCard"
import { TechniqueTree, techniqueDisplayLabel, type TechniqueNode } from "@/components/TechniqueTree"
import type { IntraopFormFields } from "@/components/forms/IntraopForm"

export function TechniqueSection({ t, control, techniques, techniqueTree, presentsIntubated, setPresentsIntubated, smart }: {
  t: (key: string) => string
  control: Control<IntraopFormFields>
  techniques: string[]
  techniqueTree: TechniqueNode[]
  presentsIntubated: boolean
  setPresentsIntubated: () => void
  /** Smart selection (10.2.0). Without it this is the Legacy section, the list you drill down through. */
  smart?: ReactNode
}) {
  return (
    <SectionCard title={t("intraop.techniqueSection")} collapsible required
      badge={techniques.length ? techniques.slice(0, 2).map(v => techniqueDisplayLabel(v, techniqueTree)).join(", ") : undefined}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {smart ?? (
              <Controller name="techniques" control={control} render={({ field }) => (
                <TechniqueTree value={field.value ?? []} onChange={field.onChange} />
              )} />
            )}
          </div>
          <button type="button"
            onClick={() => setPresentsIntubated()}
            title={t("intraop.techniquePicker.presentsTitle")}
            className={`shrink-0 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border-2 leading-tight text-center max-w-[120px] transition-all ${
              presentsIntubated
                ? "bg-amber-500 border-amber-500 text-white shadow-sm"
                : "border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
            }`}>
            {presentsIntubated ? t("intraop.techniquePicker.presentsActive") : t("intraop.techniquePicker.presentsInactive")}
          </button>
        </div>
      </div>
    </SectionCard>
  )
}
