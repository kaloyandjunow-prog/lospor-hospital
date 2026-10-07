"use client"

import { Controller, type Control } from "react-hook-form"
import { useTranslations } from "next-intl"
import { AIAdvisor } from "@/components/AIAdvisor"
import type { PreopData } from "@/components/forms/preopSchema"
import { capabilityMessageKey, type ClinicalAiCapabilities } from "@/lib/deployment-capabilities"

/** Any AI feature this deployment has switched on (Status, with a key). */
export function anyClinicalAiEnabled(ai: ClinicalAiCapabilities): boolean {
  return ai.clinicalAdvice.enabled || ai.labImageExtraction.enabled || ai.monitorOcr.enabled
}

/**
 * The case's AI consent, and the advisor where it applies (9.14.3).
 *
 * One consent covers every AI feature the deployment has switched on: the lab
 * report scan, the monitor scan and the adult advisor. It used to live with the
 * advisor alone, so a paediatric case -- where the advisor is off -- could
 * never consent, and its scans always failed. With every AI feature off (Status,
 * or no key) nothing is shown here beyond what was shown before.
 */
export function AiConsentSection({ control, aiOptIn, isPediatric, clinicalAi, getFormData, caseId, onSaveBeforeAI }: {
  control: Control<PreopData>
  aiOptIn: boolean
  isPediatric: boolean
  clinicalAi: ClinicalAiCapabilities
  getFormData: () => PreopData
  caseId?: string | null
  onSaveBeforeAI?: () => Promise<void>
}) {
  const t = useTranslations()
  const adviceAvailable = !isPediatric && clinicalAi.clinicalAdvice.enabled
  if (!anyClinicalAiEnabled(clinicalAi)) {
    return isPediatric ? null : (
      <p className="rounded-xl border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1c1c1c] px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
        {t(capabilityMessageKey(clinicalAi.clinicalAdvice.reason))}
      </p>
    )
  }
  return (
    <>
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1c1c1c] px-4 py-3">
        <Controller name="aiOptIn" control={control} render={({ field }) => (
          <input type="checkbox" id="aiOptIn" checked={!!field.value} onChange={e => field.onChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0" />
        )} />
        <div>
          <label htmlFor="aiOptIn" className="text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
            {t("preop.aiOptInLabel")}
          </label>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {t("preop.aiOptInHint")}
          </p>
        </div>
      </div>
      {adviceAvailable && aiOptIn && <AIAdvisor getFormData={getFormData} caseId={caseId} onSaveBeforeAI={onSaveBeforeAI} />}
      {!isPediatric && !clinicalAi.clinicalAdvice.enabled ? (
        <p className="rounded-xl border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1c1c1c] px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
          {t(capabilityMessageKey(clinicalAi.clinicalAdvice.reason))}
        </p>
      ) : null}
    </>
  )
}
