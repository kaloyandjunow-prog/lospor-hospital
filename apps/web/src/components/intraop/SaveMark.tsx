"use client"

import { useTranslations } from "next-intl"
import { eventsSaveState, type ItemSaveState } from "@lospor/core/intraop-save-state"

import { useChartSaveState } from "@/lib/use-case-save-state"
import type { CaseSection } from "@lospor/core/sync"

/**
 * The mark on one chart item that has not reached the server (9.13.0): a
 * clock while queued or saving, a red cross when refused. Never a dashed
 * outline -- dashes already mean planned on this chart. Nothing when saved.
 * Which state, for which events, is Core's rule, the same as the PWA's.
 */
export function SaveMark({ eventIds = [], section, className = "absolute -top-1 -right-1" }: {
  eventIds?: readonly (string | undefined)[]
  /**
   * For what is saved with a form section rather than as events -- the lab
   * results: queued while that section has changes not yet on the server.
   */
  section?: CaseSection
  className?: string
}) {
  const save = useChartSaveState()
  const state = eventsSaveState(eventIds, save) ?? (section && save.queuedSections.includes(section) ? "queued" : null)
  return state ? <SaveMarkBadge state={state} className={className} /> : null
}

/** Rendered only when there is something to mark: a saved chart asks for no copy. */
function SaveMarkBadge({ state, className }: { state: ItemSaveState; className: string }) {
  const t = useTranslations("intraop.timelineRules")
  const label = t(state === "refused" ? "refusedShort" : state === "sending" ? "sendingShort" : "queuedShort")
  return (
    <span
      title={label}
      aria-label={label}
      data-testid={`save-mark-${state}`}
      className={`${className} z-40 pointer-events-none select-none text-[10px] leading-none font-bold rounded-full px-0.5 ${
        state === "refused" ? "text-red-600 bg-red-50 dark:bg-red-900/40" : "text-amber-600 bg-amber-50 dark:bg-amber-900/40"
      } ${state === "sending" ? "animate-pulse" : ""}`}
    >
      {state === "refused" ? "✕" : "◷"}
    </span>
  )
}
