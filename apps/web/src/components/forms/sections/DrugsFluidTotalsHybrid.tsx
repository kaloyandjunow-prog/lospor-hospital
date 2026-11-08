"use client"

import { useState } from "react"
import { Controller, type Control } from "react-hook-form"
import { ChevronDown, ChevronUp } from "lucide-react"
import { NumberStepper } from "@/components/NumberStepper"
import type { IntraopFormFields } from "@/components/forms/IntraopForm"
import type { DrugsFluidTotalsProps, DrugTotals } from "@/components/forms/sections/DrugsFluidTotalsSection"
import { SectionCard } from "@/components/forms/shared/SectionCard"

/**
 * Aggregation-first fluid view. The values from the timetable are display-only;
 * the two clinician-measured fields are the only ones with an edit affordance.
 */
export function DrugsFluidTotalsHybrid({ t, control, watch, liveDrugTotals, liveFluidTotals, provisional = false }: DrugsFluidTotalsProps) {
  const [open, setOpen] = useState<"given" | "output" | "losses" | null>(null)
  const [editing, setEditing] = useState<"urine" | "blood" | null>(null)
  const fluidValue = (field: "crystalloidsMl" | "colloidsMl" | "bloodMl" | "infusionsMl") => liveFluidTotals?.[field] ?? watch(field)
  const crystalloids = Number(fluidValue("crystalloidsMl")) || 0
  const colloids = Number(fluidValue("colloidsMl")) || 0
  const blood = Number(fluidValue("bloodMl")) || 0
  const infusions = Number(fluidValue("infusionsMl")) || 0
  const totalIn = [fluidValue("crystalloidsMl"), fluidValue("colloidsMl"), fluidValue("bloodMl"), fluidValue("infusionsMl")].every(value => value == null)
    ? null : crystalloids + colloids + blood + infusions
  const urine = watch("urineMl")
  const bloodLoss = watch("bloodLossMl")
  const catheter = Boolean(watch("urinaryCatheter"))
  const totalOut = catheter && urine != null ? Number(urine) : null
  const totalLoss = bloodLoss == null ? null : Number(bloodLoss)
  const netBalance = totalIn == null || (totalOut == null && totalLoss == null) ? null : totalIn - (totalOut ?? 0) - (totalLoss ?? 0)
  const value = (number: unknown) => number == null || number === "" ? t("intraop.totals.notMeasured") : `${number} mL`
  const toggle = (group: "given" | "output" | "losses") => setOpen(current => current === group ? null : group)

  return (
    <SectionCard title={t("intraop.fluidsSection")} collapsible defaultCollapsed
      badge={(() => { const n = liveDrugTotals.bolusList.length + liveDrugTotals.infusionList.length; return n ? t("intraop.totals.drugCount", { count: n }) : undefined })()}>
      <section className="rounded-xl border border-slate-200 dark:border-[#333] overflow-hidden">
      <div data-testid="fluid-summary" className="p-4 bg-slate-50 dark:bg-[#171717]">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t("intraop.totals.recordedHint")}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <SummaryMetric testId="fluid-total-in" label={t("intraop.totals.recordedIn")} value={value(totalIn)} tone="text-cyan-500" />
          <SummaryMetric label={t("intraop.totals.output")} value={value(totalOut)} tone="text-violet-500" />
          <SummaryMetric label={t("intraop.totals.bloodLossSummary")} value={value(totalLoss)} tone="text-rose-500" />
          <SummaryMetric label={t("intraop.totals.netBalance")} value={value(netBalance)} tone="text-slate-700 dark:text-slate-100" />
        </div>
      </div>

      <SummaryGroup testId="fluid-given-toggle" label={t("intraop.totals.recordedIn")} open={open === "given"} onClick={() => toggle("given")} tone="text-cyan-500" expandLabel={t("intraop.totals.expandDetails")} collapseLabel={t("intraop.totals.collapseDetails")}>
        {[
          [t("intraop.crystalloids"), crystalloids],
          [t("intraop.colloids"), colloids],
          [t("intraop.bloodTransfusion"), blood],
          [t("intraop.drugInfusions"), infusions],
        ].map(([label, number]) => <ReadOnlyRow key={String(label)} label={String(label)} value={value(number)} />)}
        {liveDrugTotals.infusionList.length > 0 && <ReadOnlyDrugList title={`${provisional ? "≈ " : ""}${t("intraop.totals.infusions")}`} rows={liveDrugTotals.infusionList} weightNote={liveDrugTotals.weightNote} />}
        {liveDrugTotals.bolusList.length > 0 && <ReadOnlyDrugList title={`${provisional ? "≈ " : ""}${t("intraop.totals.bolusDrugs")}`} rows={liveDrugTotals.bolusList} />}
      </SummaryGroup>

      <SummaryGroup testId="fluid-output-toggle" label={t("intraop.totals.output")} open={open === "output"} onClick={() => toggle("output")} tone="text-violet-500" expandLabel={t("intraop.totals.expandDetails")} collapseLabel={t("intraop.totals.collapseDetails")}>
        {catheter ? (editing === "urine" ? (
          <MeasurementEditor testId="fluid-urine-editor" label={t("intraop.urineOutput")} name="urineMl" control={control} onDone={() => setEditing(null)} doneLabel={t("intraop.totals.done")} />
        ) : (
          <EditableRow testId="fluid-edit-urine" label={t("intraop.urineOutput")} value={value(urine)} editLabel={t("intraop.totals.edit")} onClick={() => setEditing("urine")} />
        )) : <p className="text-xs leading-5 text-slate-500">{t("intraop.totals.noCatheterHint")}</p>}
      </SummaryGroup>

      <SummaryGroup testId="fluid-losses-toggle" label={t("intraop.totals.bloodLossSummary")} open={open === "losses"} onClick={() => toggle("losses")} tone="text-rose-500" expandLabel={t("intraop.totals.expandDetails")} collapseLabel={t("intraop.totals.collapseDetails")}>
        {editing === "blood" ? (
          <MeasurementEditor testId="fluid-blood-loss-editor" label={t("intraop.bloodLoss")} name="bloodLossMl" control={control} onDone={() => setEditing(null)} doneLabel={t("intraop.totals.done")} bloodLoss />
        ) : (
          <EditableRow testId="fluid-edit-blood-loss" label={t("intraop.bloodLoss")} value={value(bloodLoss)} editLabel={t("intraop.totals.edit")} onClick={() => setEditing("blood")} />
        )}
        <p className="text-[10px] italic text-slate-500 mt-2">{t("intraop.bloodLossOptionalHint", {})}</p>
      </SummaryGroup>
      </section>
    </SectionCard>
  )
}

function SummaryMetric({ testId, label, value, tone }: { testId?: string; label: string; value: string; tone: string }) {
  return (
    <div data-testid={testId} className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2 dark:border-[#333] dark:bg-[#0c0c0c]">
      <p className={`text-[10px] font-extrabold uppercase tracking-wide ${tone}`}>{label}</p>
      <p className="mt-1 text-base font-extrabold tabular-nums text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  )
}

function SummaryGroup({ testId, label, open, onClick, tone, expandLabel, collapseLabel, children }: { testId: string; label: string; open: boolean; onClick: () => void; tone: string; expandLabel: string; collapseLabel: string; children: React.ReactNode }) {
  return <div className="border-t border-slate-200 dark:border-[#333] first:border-t-0">
    <button type="button" data-testid={testId} aria-expanded={open} aria-label={`${label}. ${open ? collapseLabel : expandLabel}`} onClick={onClick} className="w-full min-h-[58px] px-4 py-3 flex items-center justify-between text-left bg-white dark:bg-[#101010] hover:bg-slate-50 dark:hover:bg-[#171717]">
      <span className="flex-1"><span className={`block text-[10px] font-semibold uppercase tracking-wide ${tone}`}>{label}</span></span>
      {open ? <ChevronUp aria-hidden="true" className="h-5 w-5 text-slate-400" /> : <ChevronDown aria-hidden="true" className="h-5 w-5 text-slate-400" />}
    </button>
    {open && <div className="px-4 py-3 bg-slate-50/60 dark:bg-[#0c0c0c]">{children}</div>}
  </div>
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 dark:border-[#242424] text-sm"><span className="font-medium text-slate-700 dark:text-slate-200">{label}</span><span className="font-mono font-semibold tabular-nums text-slate-600 dark:text-slate-300">{value}</span></div>
}

function ReadOnlyDrugList({ title, rows, weightNote }: { title: string; rows: DrugTotals["infusionList"] | DrugTotals["bolusList"]; weightNote?: string | null }) {
  return <div className="mt-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>{rows.map(row => <ReadOnlyRow key={`${row.name}-${row.unit}`} label={`${row.name}${"count" in row && row.count > 1 ? ` ×${row.count}` : ""}`} value={"display" in row && row.display ? row.display : `${row.total} ${row.unit}`} />)}{weightNote && <p className="text-[10px] italic text-slate-500 mt-1">{weightNote}</p>}</div>
}

function EditableRow({ testId, label, value, editLabel, onClick }: { testId: string; label: string; value: string; editLabel: string; onClick: () => void }) {
  return <div className="flex items-center justify-between gap-3 py-1"><div><p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</p><p className="text-base font-extrabold tabular-nums text-slate-900 dark:text-slate-100 mt-1">{value}</p></div><button type="button" data-testid={testId} onClick={onClick} className="min-h-10 px-3 rounded-md border border-slate-300 dark:border-[#444] text-xs font-bold text-sky-600 dark:text-sky-300">{editLabel}</button></div>
}

function MeasurementEditor({ testId, label, name, control, onDone, doneLabel, bloodLoss = false }: { testId: string; label: string; name: "urineMl" | "bloodLossMl"; control: Control<IntraopFormFields>; onDone: () => void; doneLabel: string; bloodLoss?: boolean }) {
  return <div data-testid={testId}><p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">{label}</p><Controller name={name} control={control} render={({ field }) => <NumberStepper value={field.value} onChange={value => field.onChange(bloodLoss ? value ?? null : value)} min={0} max={bloodLoss ? 20000 : 5000} step={50} unit="mL" showSlider />} /><button type="button" data-testid={`${testId}-done`} onClick={onDone} className="mt-2 min-h-9 px-3 rounded-md bg-cyan-900 text-xs font-bold text-cyan-50">{doneLabel}</button></div>
}
