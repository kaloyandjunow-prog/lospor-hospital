"use client"
import { Controller, type Control, type UseFormWatch, type UseFormRegister } from "react-hook-form"
import { SectionCard } from "@/components/forms/shared/SectionCard"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { NumberStepper } from "@/components/NumberStepper"
import type { IntraopFormFields } from "@/components/forms/IntraopForm"

type DrugTotals = {
  bolusList: { name: string; total: number; unit: string; count: number; mgTotal: number | null }[]
  infusionList: { name: string; total: number; unit: string; mgTotal: number | null; weightUsed: number | null; weightBasis: "IBW" | "TBW" | "none" | null }[]
  weightNote: string | null
}

export function DrugsFluidTotalsSection({ t, control, watch, register, liveDrugTotals }: {
  t: (key: string, values?: Record<string, string | number>) => string
  control: Control<IntraopFormFields>
  watch: UseFormWatch<IntraopFormFields>
  register: UseFormRegister<IntraopFormFields>
  liveDrugTotals: DrugTotals
}) {
  return (
    <SectionCard title={t("intraop.fluidsSection")} collapsible defaultCollapsed
      badge={(() => { const n = liveDrugTotals.bolusList.length + liveDrugTotals.infusionList.length; return n ? t("intraop.totals.drugCount", { count: n }) : undefined })()}>

      <p className="text-[10px] text-slate-400 -mt-1">{t("intraop.totals.description")}</p>

      {/* Infusion totals */}
      {liveDrugTotals.infusionList.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500 dark:text-violet-400">{t("intraop.totals.infusions")}</p>
          {liveDrugTotals.infusionList.map(row => (
            <div key={row.name} className="flex items-center gap-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200 w-44 truncate">{row.name}</span>
              <span className="font-mono text-slate-600 dark:text-slate-300">
                {row.total} {row.unit}
                {row.weightUsed != null && <span className="text-[10px] text-slate-400 ml-1">†</span>}
              </span>
              {row.mgTotal !== null && (
                <span className="text-[11px] text-slate-400 dark:text-slate-500">({row.mgTotal} mg)</span>
              )}
            </div>
          ))}
          {liveDrugTotals.weightNote && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 italic mt-1">{liveDrugTotals.weightNote}</p>
          )}
        </div>
      )}

      {/* Bolus drug totals */}
      {liveDrugTotals.bolusList.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500 dark:text-violet-400">{t("intraop.totals.bolusDrugs")}</p>
          {liveDrugTotals.bolusList.map(row => (
            <div key={row.name} className="flex items-center gap-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200 w-44 truncate">{row.name}</span>
              <span className="font-mono text-slate-600 dark:text-slate-300">{row.total} {row.unit}</span>
              {row.count > 1 && <span className="text-[10px] text-slate-400">({t("intraop.totals.doseCount", { count: row.count })})</span>}
            </div>
          ))}
        </div>
      )}

      {/* Fluid balance */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-500 dark:text-teal-400 mb-2">{t("intraop.totals.fluidBalance")}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {([
            { label: t("intraop.crystalloids"), field: "crystalloidsMl" as const },
            { label: t("intraop.colloids"),     field: "colloidsMl"     as const },
            { label: t("intraop.bloodTransfusion"), field: "bloodMl"   as const },
          ] as const).map(({ label, field }) => (
            <div key={field} className="space-y-1">
              <Label>{label}</Label>
              <div className="flex h-9 items-center rounded-md border border-slate-100 dark:border-[#2e2e2e] bg-slate-50 dark:bg-[#1e1e1e] px-3 text-sm font-medium text-slate-700 dark:text-slate-200">
                {watch(field) ? `${watch(field)} mL` : <span className="text-slate-400">0 mL</span>}
              </div>
            </div>
          ))}
          {watch("urinaryCatheter") && (
            <div className="space-y-1 sm:col-span-3">
              <Label>{t("intraop.urineOutput")}</Label>
              <Controller name="urineMl" control={control} render={({ field }) => <NumberStepper value={field.value} onChange={field.onChange} min={0} max={5000} step={50} unit="mL" showSlider />} />
            </div>
          )}
          <div className="space-y-1 sm:col-span-2"><Label>{t("intraop.bloodProducts")}</Label><Input {...register("bloodProductsNote")} /></div>
        </div>
      </div>
    </SectionCard>
  )
}
