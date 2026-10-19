"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { daysBetweenDateKeys, dayStepLabel, shiftDateKey } from "@lospor/core/intraop-time"

/**
 * A date as a day stepper: ‹ Today ›. One tap back is "Yesterday", then
 * "Tue 14.10". No calendar: the start and end of surgery are almost always
 * today, yesterday or the next day, and a stepper reaches them in a tap.
 * `min` and `max` are calendar dates (YYYY-MM-DD) the stepper will not pass.
 */
export function DayStepper({
  value,
  onChange,
  todayKey,
  min,
  max,
  locale,
  label,
  disabled = false,
  testId,
}: {
  value: string
  onChange: (key: string) => void
  todayKey: string
  min?: string | null
  max?: string | null
  locale: "en" | "bg"
  label: string
  disabled?: boolean
  testId?: string
}) {
  const previous = shiftDateKey(value, -1)
  const next = shiftDateKey(value, 1)
  const canGoBack = !disabled && previous != null && (min == null || (daysBetweenDateKeys(min, previous) ?? -1) >= 0)
  const canGoForward = !disabled && next != null && (max == null || (daysBetweenDateKeys(next, max) ?? -1) >= 0)
  const shown = dayStepLabel(value, todayKey, locale)
  const button = "flex h-9 w-8 items-center justify-center text-slate-500 hover:text-slate-800 disabled:opacity-30 dark:hover:text-slate-100"
  return (
    <div
      role="group"
      aria-label={label}
      data-testid={testId}
      className="inline-flex h-9 items-center rounded-md border border-input bg-background dark:border-[#3a3a3a] dark:bg-[#1c1c1c]"
    >
      <button type="button" aria-label={`${label}: −1`} disabled={!canGoBack} onClick={() => previous && onChange(previous)} className={button}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span aria-live="polite" className={`min-w-[5.5rem] text-center text-sm font-semibold tabular-nums ${shown.kind === "today" ? "text-slate-700 dark:text-slate-200" : "text-amber-700 dark:text-amber-300"}`}>
        {shown.text}
      </span>
      <button type="button" aria-label={`${label}: +1`} disabled={!canGoForward} onClick={() => next && onChange(next)} className={button}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
