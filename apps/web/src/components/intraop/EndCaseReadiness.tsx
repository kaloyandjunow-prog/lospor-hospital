"use client"

import { useState, type ReactNode } from "react"
import { caseReadiness, type CaseReadiness, type IntraopArea } from "@lospor/core/case-readiness"
import { READINESS_COPY } from "@/components/case-summary/readiness-labels"

const TEXT = {
  en: {
    title: "Complete before ending the case",
    note: "Needed to finalize. Fill it in now, while the team is still in theatre.",
    warnings: "Sections are incomplete:",
    continueAnyway: "End the case anyway?",
    goTo: "Go to",
    dismiss: "Later",
  },
  bg: {
    title: "Попълнете, преди да приключите случая",
    note: "Необходимо е за приключването. Попълнете го сега, докато екипът е още в залата.",
    warnings: "Непълни раздели:",
    continueAnyway: "Да се приключи ли случаят въпреки това?",
    goTo: "Към",
    dismiss: "По-късно",
  },
} as const

/**
 * Check the intraoperative record before the case is ended (1.5.0), the way
 * the phone app does: a blocker stops the end and is listed with a way to it;
 * warnings ask once whether to end anyway. Preop and postop items wait for
 * the summary, since recovery has not happened yet.
 *
 * `record` is read at the moment End is pressed, so it sees the chart as it
 * stands then.
 */
export function useEndCaseCheck({ record, locale, onGo }: {
  record: () => Record<string, unknown>
  locale: "en" | "bg"
  onGo: (area: IntraopArea) => void
}): { before: () => boolean; panel: ReactNode } {
  const [shown, setShown] = useState<CaseReadiness | null>(null)

  function before(): boolean {
    const check = caseReadiness(
      { clinicalMode: "ADULT", preop: {}, intraop: { ...record(), endedAt: new Date().toISOString() }, postop: null },
      { omitPostop: true },
    )
    const blockers = check.blockers.filter(item => item.target.stage === "intraop")
    const warnings = check.warnings.filter(item => item.target.stage === "intraop")
    if (blockers.length > 0) {
      setShown({ ready: false, blockers, warnings: [] })
      return false
    }
    setShown(null)
    if (warnings.length === 0) return true
    const copy = READINESS_COPY[locale]
    const text = TEXT[locale]
    const list = warnings.map(item => `• ${copy[item.kind]}`).join("\n")
    return window.confirm(`${text.warnings}\n\n${list}\n\n${text.continueAnyway}`)
  }

  const panel = shown
    ? <EndCaseReadiness readiness={shown} locale={locale} onGo={onGo} onDismiss={() => setShown(null)} />
    : null
  return { before, panel }
}

/**
 * What stopped the case from ending, with a way to each (1.5.0). The buttons
 * stay inside the form, switching tabs rather than leaving the chart.
 */
export function EndCaseReadiness({
  readiness,
  locale,
  onGo,
  onDismiss,
}: {
  readiness: CaseReadiness
  locale: "en" | "bg"
  onGo: (area: IntraopArea) => void
  onDismiss: () => void
}) {
  const copy = READINESS_COPY[locale]
  const text = TEXT[locale]
  const items = [...readiness.blockers, ...readiness.warnings]
  if (items.length === 0) return null

  return (
    <section
      role="status"
      aria-label={text.title}
      className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-600/60 dark:bg-amber-950/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">{text.title}</h3>
          <p className="text-xs text-amber-800 dark:text-amber-300">{text.note}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-semibold text-amber-800 hover:underline dark:text-amber-300"
        >
          {text.dismiss}
        </button>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {items.map(item => item.target.stage === "intraop" ? (
          <li key={item.kind}>
            <button
              type="button"
              onClick={() => onGo((item.target as { area: IntraopArea }).area)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                item.severity === "blocker"
                  ? "border-rose-300 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-500/50 dark:bg-transparent dark:text-rose-300"
                  : "border-amber-300 bg-white text-amber-800 hover:bg-amber-100 dark:border-amber-500/50 dark:bg-transparent dark:text-amber-300"
              }`}
            >
              {copy[item.kind]} · {text.goTo} →
            </button>
          </li>
        ) : null)}
      </ul>
    </section>
  )
}
