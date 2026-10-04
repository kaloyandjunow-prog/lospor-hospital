"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { calcABW } from "@/lib/scores"
import { getMedicationWarnings } from "@/lib/risk-derivation"
import { allergyRecords, uncheckedAllergies } from "@lospor/core/allergy-drug-check"
import type { PreopSummary } from "@/components/forms/preop-summary"

/**
 * The preoperative assessment, condensed, at the top of the intraoperative
 * record: what the anaesthetist needs in view while running the case.
 *
 * Split out of IntraopForm, which is at its size budget.
 */
export function IntraopPreopSummary({ preop, ibw: calcIbw, isPediatric }: {
  preop: PreopSummary
  ibw: number | null
  isPediatric: boolean
}) {
  const t = useTranslations()
  const medicationWarnings = useMemo(() => getMedicationWarnings(preop.currentMedications ?? []), [preop.currentMedications])
  // A typed allergy the drug check cannot read is named, so silence is not taken for a pass (1.5.0).
  const unchecked = uncheckedAllergies(allergyRecords(preop))
  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">{t("intraop.preopSummary")}</p>
      {preop.diagnosis && (
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 leading-snug">{preop.diagnosis}</p>
      )}
      {preop.plannedProcedure && (
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">{preop.plannedProcedure}</p>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {preop.asaScore && (
          <span className="font-bold text-amber-800 dark:text-amber-300">
            ASA {preop.asaScore}{preop.emergencySurgery ? "E" : ""}
          </span>
        )}
        {preop.emergencySurgery && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white">{t("intraop.emergencyBadge")}</span>
        )}
        {preop.bmi != null && <span className="text-slate-600 dark:text-slate-300">BMI {preop.bmi}</span>}
        {calcIbw != null && (() => {
          const ibw = Math.round(calcIbw * 10) / 10
          const abw = !isPediatric && preop.weightKg ? calcABW(ibw, preop.weightKg) : null
          return <>
            <span className="text-slate-600 dark:text-slate-300">IBW {ibw} kg</span>
            {abw != null && <span className="text-slate-600 dark:text-slate-300">ABW {abw} kg</span>}
          </>
        })()}
        {(preop.bpSystolic || preop.heartRate || preop.spO2) && (
          <span className="text-slate-600 dark:text-slate-300">
            {preop.bpSystolic && preop.bpDiastolic ? `BP ${preop.bpSystolic}/${preop.bpDiastolic}` : ""}
            {preop.heartRate ? ` · HR ${preop.heartRate}` : ""}
            {preop.spO2 ? ` · SpO₂ ${preop.spO2}%` : ""}
          </span>
        )}
        {preop.mallampati && <span className="text-slate-600 dark:text-slate-300">Mallampati {preop.mallampati}</span>}
        {preop.difficultAirwayHistory && <span className="font-semibold text-orange-700 dark:text-orange-400">{t("intraop.difficultAirwayHistory")}</span>}
      </div>
      {preop.allergies && preop.allergyDetails && preop.allergyDetails.length > 0 && (
        <p className="text-sm font-semibold text-red-700 dark:text-red-400">
          {t("intraop.allergiesPrefix")} {preop.allergyDetails.map(a => a.label).join(", ")}
        </p>
      )}
      {unchecked.length > 0 && (
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
          {t("intraop.allergiesUnchecked")} {unchecked.join(", ")}
        </p>
      )}
      {Array.isArray(preop.comorbidities) && preop.comorbidities.length > 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {preop.comorbidities.slice(0, 4).map(c => c.label).join(" · ")}
          {preop.comorbidities.length > 4 ? ` +${preop.comorbidities.length - 4} more` : ""}
        </p>
      )}
      {Array.isArray(preop.labResults) && preop.labResults.filter(l => l.value).length > 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {preop.labResults.filter(l => l.value).map(l => `${l.test} ${l.value}${l.unit ? " "+l.unit : ""}`).join(" · ")}
        </p>
      )}
      {medicationWarnings.length > 0 && (
        <div className="pt-1 space-y-0.5">
          {medicationWarnings.map(w => (
            <p key={w.key} className="text-sm font-semibold text-orange-700 dark:text-orange-400">⚠ {w.label}</p>
          ))}
        </div>
      )}
    </div>
  )
}
