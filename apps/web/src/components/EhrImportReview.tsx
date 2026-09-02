"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { applyEhrSelections } from "@lospor/core/ehr-import-apply"
import {
  visibleReviewItems,
  type EhrReviewItem,
  type EhrReviewPlan,
} from "@lospor/core/ehr-import-review"
import type { EhrLabValue, EhrTagValue } from "@lospor/core/ehr-import"
import type { ClinicalMode } from "@lospor/core/pediatric"

/**
 * Review what the hospital system sent, before any of it is written.
 *
 * The judgement — what is shown, what may be ticked, what is refused — is made
 * in Core and arrives in the plan. This renders it, and its mobile counterpart
 * renders the same plan, which is how the two stay in step. The last time a
 * clinical calculation lived separately in web and mobile the two drifted and a
 * running infusion read 0 mL on one of them.
 *
 * Nothing here is a conflict in the sync sense. An accepted value is applied as
 * an ordinary case edit by this clinician, so ConflictModal is not involved and
 * never will be.
 */

export function EhrImportReview({
  plan,
  current,
  currentClinicalMode,
  labelFor,
  onAccept,
  onDecline,
  onRequestModeChange,
  onClose,
}: {
  plan: EhrReviewPlan
  /** The case as it stands, by canonical field name. */
  current: Record<string, unknown>
  /** Decides which fields an accepted age is written into. */
  currentClinicalMode?: ClinicalMode | null
  /** Field labels come from wherever the form already keeps them. */
  labelFor: (field: string) => string
  onAccept: (patch: Record<string, unknown>, appliedKeys: string[]) => void
  /** Remembered by the server so the item is never offered again. */
  onDecline: (itemKey: string) => void
  /**
   * Take the clinician to the mode control.
   *
   * Less urgent here than on mobile, where the review covers the screen and a
   * blocked age would otherwise be a dead end — but a long preop form can put
   * the toggle well off-screen, so the row offers the same way out.
   */
  onRequestModeChange?: () => void
  onClose: () => void
}) {
  const t = useTranslations("ehr")
  const [selected, setSelected] = useState<Set<string>>(() => new Set(plan.preselectedKeys))
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const visible = useMemo(() => visibleReviewItems(plan), [plan])

  // Older results stay out of the way until asked for. A falling haemoglobin is
  // the interesting part, so they collapse rather than disappear.
  const shown = visible.filter(
    item => item.state !== "superseded" || expanded.has(labTest(item)),
  )

  function toggle(item: EhrReviewItem) {
    if (item.state === "needs-mode-decision") return
    setSelected(previous => {
      const next = new Set(previous)
      if (next.has(item.itemKey)) next.delete(item.itemKey)
      else next.add(item.itemKey)
      return next
    })
  }

  function decline(item: EhrReviewItem) {
    setSelected(previous => {
      const next = new Set(previous)
      next.delete(item.itemKey)
      return next
    })
    onDecline(item.itemKey)
  }

  return (
    <section
      aria-label={t("title")}
      className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
    >
      <header className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t("title")}
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
        >
          ×
        </button>
      </header>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          {t("nothingToReview")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map(item => {
            const isSelected = selected.has(item.itemKey)
            const blocked = item.state === "needs-mode-decision"
            const { title, detail } = describe(item, t("undated"), t("takenAt"))
            return (
              <li
                key={item.itemKey}
                className={`rounded-xl border p-3 ${
                  blocked
                    ? "border-amber-400 bg-amber-50 dark:border-amber-500/60 dark:bg-amber-500/10"
                    : isSelected
                      ? "border-sky-400 bg-sky-50 dark:border-sky-500/60 dark:bg-sky-500/10"
                      : "border-slate-200 dark:border-slate-700"
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {labelFor(item.field)}
                </p>

                <label className="mt-1 flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={blocked}
                    onChange={() => toggle(item)}
                    className="mt-1 h-4 w-4 shrink-0 accent-sky-600 disabled:cursor-not-allowed"
                  />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {title}
                    </span>
                    {detail ? (
                      <span className="block text-xs text-slate-600 dark:text-slate-400">
                        {detail}
                      </span>
                    ) : null}
                  </span>
                </label>

                {/* Their own value stays on screen beside the proposal — the
                    point of a conflict row is that they compare the two. */}
                {item.state === "conflict" ? (
                  <p className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-400">
                    {t("currentValue")}:{" "}
                    <strong className="font-semibold">{String(item.current ?? "—")}</strong>
                    <span className="mt-0.5 block text-slate-500 dark:text-slate-500">
                      {t("conflictNote")}
                    </span>
                  </p>
                ) : null}

                {blocked ? (
                  <div className="mt-2 text-xs font-medium leading-relaxed text-amber-800 dark:text-amber-300">
                    <strong className="block">{t("modeBlockedTitle")}</strong>
                    <p>{t("modeBlockedMsg")}</p>
                    {onRequestModeChange ? (
                      <button
                        type="button"
                        onClick={onRequestModeChange}
                        className="mt-2 rounded-lg border border-amber-400 px-3 py-1.5 font-semibold hover:bg-amber-100 dark:border-amber-500/60 dark:hover:bg-amber-500/20"
                      >
                        {t("goToMode")}
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => decline(item)}
                  className="mt-2 text-[11px] font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {t("decline")}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {Object.entries(plan.supersededCountByTest).map(([test, count]) => (
        <button
          key={`earlier-${test}`}
          type="button"
          onClick={() =>
            setExpanded(previous => {
              const next = new Set(previous)
              if (next.has(test)) next.delete(test)
              else next.add(test)
              return next
            })
          }
          className="mt-2 w-full py-1 text-xs font-semibold text-sky-700 hover:underline dark:text-sky-400"
        >
          {expanded.has(test) ? "− " : "+ "}
          {test.toUpperCase()} · {count} {t("earlierResults")}
        </button>
      ))}

      <button
        type="button"
        disabled={selected.size === 0}
        onClick={() => {
          const result = applyEhrSelections({
            plan, selectedKeys: selected, current, currentClinicalMode,
          })
          onAccept(result.patch, result.appliedKeys)
        }}
        className="mt-4 w-full rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
      >
        {t("accept")} ({selected.size})
      </button>
    </section>
  )
}

function describe(
  item: EhrReviewItem,
  undatedLabel: string,
  takenLabel: string,
): { title: string; detail?: string } {
  const proposed = item.proposed
  if (proposed && typeof proposed === "object") {
    if ("takenAt" in (proposed as object)) {
      const lab = proposed as EhrLabValue
      return {
        title: `${lab.test} ${lab.value}${lab.unit ? ` ${lab.unit}` : ""}`,
        // Never silent. An undated result beside dated ones would otherwise
        // read as current, and a preoperative haemoglobin is only worth
        // anything if you know how old it is.
        detail: lab.takenAt === null
          ? undatedLabel
          : `${takenLabel} ${lab.takenAt.slice(0, 10)}`,
      }
    }
    const tag = proposed as EhrTagValue
    const parts = [tag.dose, tag.route, tag.frequency].filter(Boolean)
    return { title: tag.label, detail: parts.length ? parts.join(" · ") : tag.code }
  }
  return { title: proposed === null ? "—" : String(proposed) }
}

function labTest(item: EhrReviewItem): string {
  const proposed = item.proposed as { test?: string } | null
  return typeof proposed?.test === "string" ? proposed.test.trim().toLowerCase() : ""
}
