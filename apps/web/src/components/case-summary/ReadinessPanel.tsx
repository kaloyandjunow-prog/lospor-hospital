"use client"

import type { CaseReadiness, ReadinessItem } from "@lospor/core/case-readiness"
import { READINESS_COPY, READINESS_STAGE, READINESS_TEXT } from "./readiness-labels"

const STEP = { preop: 0, intraop: 1, postop: 2 } as const

/**
 * Where "Go to" takes the clinician: the case's own step, with the part of the
 * form named so the step opens the right tab and scrolls to it.
 */
export function readinessHref(caseId: string, item: ReadinessItem): string {
  const target = item.target
  const focus = "section" in target ? target.section : target.area
  const base = `/cases/new?continue=${encodeURIComponent(caseId)}&step=${STEP[target.stage]}`
  return focus ? `${base}&focus=${focus}` : base
}

/**
 * Everything that stands between this case and finalization, at once.
 *
 * Blockers first, each with a way straight to it; warnings after, marked as
 * not blocking, so the clinician can see what matters without reading what
 * does not.
 */
export function ReadinessPanel({
  caseId,
  readiness,
  locale,
}: {
  caseId: string
  readiness: CaseReadiness
  locale: "en" | "bg"
}) {
  const copy = READINESS_COPY[locale]
  const stage = READINESS_STAGE[locale]
  const text = READINESS_TEXT[locale]
  if (readiness.blockers.length === 0 && readiness.warnings.length === 0) return null

  const row = (item: ReadinessItem, tone: "blocker" | "warning") => (
    <li key={`${item.kind}-${item.target.stage}`} className="flex items-center justify-between gap-3 py-1.5">
      <span className="flex min-w-0 items-center gap-2">
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
          tone === "blocker"
            ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
            : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
        }`}>
          {stage[item.target.stage]}
        </span>
        <span className="truncate text-sm text-slate-800 dark:text-slate-100">{copy[item.kind]}</span>
      </span>
      <a
        href={readinessHref(caseId, item)}
        className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {text.goTo} →
      </a>
    </li>
  )

  return (
    <section
      aria-label={text.title}
      className="no-print rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
    >
      {readiness.blockers.length > 0 ? (
        <>
          <h3 className="text-xs font-bold uppercase tracking-wide text-rose-700 dark:text-rose-300">
            {text.title} ({readiness.blockers.length})
          </h3>
          <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-800">
            {readiness.blockers.map(item => row(item, "blocker"))}
          </ul>
        </>
      ) : (
        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{text.ready}</p>
      )}
      {readiness.warnings.length > 0 ? (
        <>
          <h3 className="mt-3 text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            {text.warningsTitle}
          </h3>
          <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-800">
            {readiness.warnings.map(item => row(item, "warning"))}
          </ul>
        </>
      ) : null}
    </section>
  )
}
