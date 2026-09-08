"use client"

import { useMemo } from "react"
import { useLocale, useTranslations } from "next-intl"
import { X } from "lucide-react"
import { groupLabsByDraw, type LabResult } from "@lospor/core/labs"

import { LabResults } from "@/components/LabResults"

/**
 * One laboratory draw, or everything recorded.
 *
 * The same editor the preoperative form uses, because a result is a result:
 * the catalogue, the units, the reference ranges and the AI scan are all
 * identical, and the only thing that differs intraoperatively is that a draw
 * has a time. Rebuilding it here would be a second place for the lab library to
 * drift.
 *
 * Scoped to one draw when opened from a time cell. That scoping is what lets
 * the shared editor work unchanged: it keys rows by test name, which is unique
 * within a single draw and deliberately not unique across them.
 */

type Props = {
  open: boolean
  /**
   * The draw being edited, as an ISO instant, or null for the whole case.
   *
   * Null is the read-across view reached from a summary chip's overflow: every
   * draw, newest first, with nothing editable, because editing a result while
   * looking at four draws at once is how the wrong one gets changed.
   */
  takenAt: string | null
  /** Every intraoperative result on the case. */
  value: LabResult[]
  onChange: (next: LabResult[]) => void
  onClose: () => void
  /** Null until autosave has created the case; the AI scan needs one. */
  caseId?: string | null
  aiOptIn?: boolean
  /** Rendered under the editor where a deployment has a hospital feed. */
  importPanel?: React.ReactNode
}

export function IntraopLabsDialog({
  open,
  takenAt,
  value,
  onChange,
  onClose,
  caseId = null,
  aiOptIn = false,
  importPanel,
}: Props) {
  const t = useTranslations()
  const locale = useLocale()

  const thisDraw = useMemo(
    () => (takenAt ? value.filter(row => row.takenAt === takenAt) : []),
    [value, takenAt],
  )
  const otherDraws = useMemo(
    () => (takenAt ? value.filter(row => row.takenAt !== takenAt) : value),
    [value, takenAt],
  )
  const allDraws = useMemo(() => groupLabsByDraw(value), [value])

  if (!open) return null

  const drawTime = takenAt
    ? new Date(takenAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
    : null

  return (
    <div className="fixed inset-0 z-[9995] flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div
        className="w-full max-w-2xl rounded-xl bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] shadow-2xl my-8"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-[#2a2a2a]">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            {t("intraop.timetable.labs")}
            {drawTime && <span className="ml-2 font-mono text-xs text-slate-500 dark:text-[#888]">{drawTime}</span>}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {takenAt ? (
            <>
              {importPanel}
              <LabResults
                value={thisDraw}
                caseId={caseId}
                aiOptIn={aiOptIn}
                onChange={rows => {
                  // Stamped with this draw's instant on the way out, so the
                  // shared editor never has to know about time at all.
                  onChange([...otherDraws, ...rows.map(row => ({ ...row, takenAt }))])
                }}
              />
            </>
          ) : (
            // Read-across: every draw, newest first. Nothing editable — editing
            // a result while looking at four draws at once is how the wrong one
            // gets changed.
            <div className="space-y-4">
              {allDraws.map(draw => (
                <div key={draw.takenAt ?? "undated"}>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-[#666] mb-1">
                    {draw.takenAt
                      ? new Date(draw.takenAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
                      : t("ehr.undated")}
                  </p>
                  <div className="rounded-lg border border-slate-200 dark:border-[#333] divide-y divide-slate-100 dark:divide-[#2a2a2a]">
                    {draw.results.map((row, index) => (
                      <div key={`${row.test}-${index}`} className="flex items-center justify-between px-3 py-1.5 text-xs">
                        <span className="text-slate-600 dark:text-slate-300">{row.test}</span>
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                          {row.value} {row.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
