"use client"

import { useTranslations } from "next-intl"
import type { IntraopAttentionAction, IntraopAttentionKind } from "@lospor/core/intraop-attention"

import type { IntraopAttentionEntry, RefusedLine } from "@/lib/use-intraop-attention"

/**
 * The two answers to each question the timeline asks (9.13.0), the same
 * wherever the question appears -- above the chart and in End case -- and the
 * same answers as the PWA. What each writes is Core's (intraop-attention).
 */
const ANSWERS: Record<IntraopAttentionKind, { action: IntraopAttentionAction; label: string; yes: boolean }[]> = {
  after_end: [
    { action: "did_not_happen", label: "endCaseDidntHappen", yes: false },
    { action: "happened", label: "endCaseHappened", yes: true },
  ],
  unconfirmed_stop: [
    { action: "still_running", label: "stopStillRunning", yes: false },
    { action: "stopped", label: "stopConfirmedStopped", yes: true },
  ],
}

export function IntraopAttentionPanel({ entries, onAnswer, endCase = false, refused = [], onDismissRefused }: {
  entries: IntraopAttentionEntry[]
  /** Changes the server refused for good, listed until seen (9.13.0). */
  refused?: RefusedLine[]
  onDismissRefused?: () => void
  onAnswer?: (key: string, action: IntraopAttentionAction) => void
  /** In End case: says the case cannot end until each is answered. */
  endCase?: boolean
}) {
  const tr = useTranslations("intraop.timelineRules")
  if (entries.length === 0 && refused.length === 0) return null
  return (
    <div
      // On the chart it floats above the page's bottom bar, in view however far
      // the chart is scrolled: a question scrolled out of sight is one nobody
      // answers. It goes when everything is answered.
      className={`rounded-lg border border-dashed border-amber-400 p-3 space-y-2 ${endCase
        ? "mt-3 bg-amber-50/60 dark:bg-amber-900/10"
        : "fixed bottom-20 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-2xl bg-amber-50 dark:bg-[#2a2110] shadow-lg"}`}
      data-testid={endCase ? "end-case-after-end" : "intraop-attention"}
    >
      {refused.length > 0 && (
        <div data-testid="intraop-refused" className="space-y-1">
          <p className="text-xs font-semibold text-red-600 dark:text-red-400">{tr("refusedTitle")}</p>
          {refused.map(item => (
            <p key={item.key} className="text-xs text-red-600/90 dark:text-red-300 break-words">
              {item.time ? `${item.time} · ` : ""}{item.text}
            </p>
          ))}
          <button type="button" data-testid="intraop-refused-dismiss" onClick={onDismissRefused}
            className="text-xs px-2.5 py-1 rounded-full border border-red-300 text-red-600">{tr("refusedDismiss")}</button>
        </div>
      )}
      {entries.length > 0 && <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{tr(endCase ? "endCaseAfterEndTitle" : "attentionTitle")}</p>}
      {endCase && <p className="text-[11px] text-slate-500">{tr("endCaseAfterEndHint")}</p>}
      {entries.map(entry => (
        <div key={entry.key} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex-1 min-w-[12rem] break-words">
            {entry.time ? `${entry.time} · ` : ""}{entry.label}
            {entry.kind === "unconfirmed_stop" ? ` — ${tr("stopUnconfirmed")}` : ""}
          </span>
          {ANSWERS[entry.kind].map(answer => (
            <button
              key={answer.action}
              type="button"
              data-testid={`attention-${answer.action}-${entry.key}`}
              disabled={!onAnswer}
              onClick={() => onAnswer?.(entry.key, answer.action)}
              className={`text-xs px-2.5 py-1 rounded-full border disabled:opacity-50 ${answer.yes ? "border-emerald-400 text-emerald-600" : "border-red-300 text-red-500"}`}
            >
              {tr(answer.label)}
            </button>
          ))}
        </div>
      ))}
      {endCase && <p className="text-[11px] text-amber-600">{tr("endCaseFinaliseBlocked")}</p>}
    </div>
  )
}
