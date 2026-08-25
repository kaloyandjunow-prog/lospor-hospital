"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import type { CaseStatus } from "@lospor/core/case-status"
import { displayClinicalCode } from "@/lib/clinical-display"
import { FINALIZE_UNDO_WINDOW_MS } from "@/lib/constants"
import type { LABELS } from "@/components/case-summary/labels"

type Labels = (typeof LABELS)["en" | "bg"]

/**
 * The status badge and the actions that go with it, above the summary sheet.
 *
 * Split out of CaseSummary so the write affordances sit in one place. The API
 * refuses an edit, a finalize or an unfinalize from anyone who is not the
 * current assignee, and every control the server would refuse has to disappear
 * together or not at all.
 *
 * `canWrite` comes from the `capabilities` object the case endpoint returns. A
 * clinician who hands a case on keeps read and print access inside their
 * institution and loses write, so the print link and the whole read-only sheet
 * below stay exactly as they were.
 */
export function ReviewBar({
  caseId,
  status,
  canWrite,
  finalizedAtMs,
  now,
  labels: L,
  onFinalized,
  onUnfinalized,
}: {
  caseId: string
  status: CaseStatus | undefined
  canWrite: boolean
  finalizedAtMs: number | null
  now: number
  labels: Labels
  onFinalized: (finalizedAt: string) => void
  onUnfinalized: () => void
}) {
  const locale = useLocale()
  const t = useTranslations()
  const router = useRouter()
  const [finalizing, setFinalizing] = useState(false)
  const [showPrintPrompt, setShowPrintPrompt] = useState(false)

  // The undo window closes on its own clock: a summary left open past the
  // deadline must stop offering Unfinalize, since the server refuses it anyway.
  const withinUndoWindow = finalizedAtMs != null && now - finalizedAtMs < FINALIZE_UNDO_WINDOW_MS

  // Labels come from @lospor/core/case-status (shared canonical text with
  // lospor-mobile); only the Tailwind styling and which 4 of the 7 statuses
  // this badge shows stay local to this component.
  const statusLabel = (key: CaseStatus) => displayClinicalCode("caseStatus", key, locale)
  const statusConfig: Record<string, { label: string; cls: string }> = {
    COMPLETE:        { label: statusLabel("COMPLETE"),        cls: "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-700 dark:text-green-400" },
    AWAITING_REVIEW: { label: statusLabel("AWAITING_REVIEW"), cls: "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400" },
    IN_PROGRESS:     { label: statusLabel("IN_PROGRESS"),     cls: "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400" },
    DRAFT:           { label: statusLabel("DRAFT"),           cls: "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400" },
  }
  const sc = statusConfig[status ?? "DRAFT"] ?? statusConfig.DRAFT

  async function finalize() {
    setFinalizing(true)
    try {
      const res = await fetch(`/api/cases/${caseId}/finalize`, { method: "POST" })
      if (res.ok) {
        const body = await res.json().catch(() => null)
        onFinalized(body?.finalizedAt ?? new Date().toISOString())
        setShowPrintPrompt(true) // case finished → offer to print it
        return
      }
      const body = await res.json().catch(() => ({}))
      const REASON_LABELS: Record<string, string> = {
        missing_technique:      L.finalizeMissingTechnique,
        missing_postop:         L.finalizeMissingPostop,
        missing_aldrete:        L.finalizeMissingAldrete,
        missing_disposition:    L.finalizeMissingDisposition,
        missing_intraop:        L.finalizeMissingIntraop,
        missing_preop:          L.finalizeMissingPreop,
        invalid_intraop_times:  L.finalizeInvalidTimes,
      }
      alert(body?.reason ? (REASON_LABELS[body.reason] ?? body.reason) : L.finalizeFailed)
    } finally {
      setFinalizing(false)
    }
  }

  async function unfinalize() {
    // A refused or unreachable unfinalize used to do nothing at all: the case
    // stayed closed and the button looked broken. Say so, the way finalize does.
    try {
      const res = await fetch(`/api/cases/${caseId}/unfinalize`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(typeof body?.error === "string" ? body.error : L.unfinalizeFailed)
        return
      }
      onUnfinalized()
    } catch {
      alert(L.unfinalizeFailed)
    }
  }

  return (
    <>
      {/* ── "Case finished — print it?" prompt ────────────────────────────── */}
      {showPrintPrompt && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowPrintPrompt(false)}>
          <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{L.printPromptTitle}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{L.printPromptText}</p>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setShowPrintPrompt(false)}
                className="flex-1 text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors">
                {L.notNow}
              </button>
              <button type="button" onClick={() => { setShowPrintPrompt(false); router.push(`/cases/${caseId}/print`) }}
                className="flex-1 text-sm font-semibold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                {L.printCase}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`no-print rounded-xl border px-4 py-3 space-y-2 ${sc.cls}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className={`text-xs font-bold uppercase tracking-wide ${sc.cls.split(" ").filter(c => c.startsWith("text-")).join(" ")}`}>
            {sc.label}
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {canWrite && status !== "COMPLETE" && (
              <>
                <span className="text-xs text-slate-400">{L.edit}</span>
                <a href={`/cases/new?continue=${caseId}&step=0`}
                  className="text-xs font-semibold px-2 py-1 rounded border border-current opacity-70 hover:opacity-100 transition-opacity">
                  {L.preopShort}
                </a>
                <a href={`/cases/new?continue=${caseId}&step=1`}
                  className="text-xs font-semibold px-2 py-1 rounded border border-current opacity-70 hover:opacity-100 transition-opacity">
                  {L.intraopShort}
                </a>
                <a href={`/cases/new?continue=${caseId}&step=2`}
                  className="text-xs font-semibold px-2 py-1 rounded border border-current opacity-70 hover:opacity-100 transition-opacity">
                  {L.postopShort}
                </a>
                <button
                  disabled={finalizing}
                  onClick={finalize}
                  className="text-xs font-bold px-3 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 transition-colors">
                  {finalizing ? L.closing : L.closeNow}
                </button>
              </>
            )}
            {canWrite && status === "COMPLETE" && withinUndoWindow && (
              <button
                onClick={unfinalize}
                className="text-xs font-semibold px-3 py-1 rounded border border-amber-400 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
                {L.unfinalize}
              </button>
            )}
            {status === "COMPLETE" && (
              <a href={`/cases/${caseId}/print`}
                className="text-xs font-bold px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                {L.printCase}
              </a>
            )}
          </div>
        </div>
        {!canWrite && (
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("case.handedOnReadOnly")}</p>
        )}
      </div>
    </>
  )
}
