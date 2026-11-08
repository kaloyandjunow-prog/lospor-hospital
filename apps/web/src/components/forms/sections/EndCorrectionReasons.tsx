"use client"

import { useLocale } from "next-intl"
import {
  INTRAOP_END_CORRECTION_REASONS,
  intraopEndCorrectionReasonLabel,
  type IntraopEndCorrectionReason,
} from "@lospor/core/intraop-end-correction"

/**
 * Why the end of a case that has ended is being changed (10.1.0), asked
 * before the change is saved -- the PWA's same question. The reason goes to
 * the audit log with the old and new end; a fixed list, because free text in
 * an audit record could carry patient details.
 */
export function EndCorrectionReasons({ t, onChoose, onCancel }: {
  t: (key: string) => string
  onChoose: (reason: IntraopEndCorrectionReason) => void
  onCancel: () => void
}) {
  const locale = useLocale()
  return (
    <div data-testid="end-correction-reasons" className="mt-2 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-1.5">
      <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{t("intraop.timeline.endCorrectionTitle")}</p>
      {INTRAOP_END_CORRECTION_REASONS.map(reason => (
        <button key={reason} type="button" data-testid={`end-correction-${reason}`} onClick={() => onChoose(reason)}
          className="block w-full text-left text-sm px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] hover:border-amber-400">
          {intraopEndCorrectionReasonLabel(reason, locale)}
        </button>
      ))}
      <button type="button" data-testid="end-correction-cancel" onClick={onCancel} className="w-full text-xs text-slate-500 hover:underline pt-1">
        {t("intraop.timeline.endCorrectionCancel")}
      </button>
    </div>
  )
}
