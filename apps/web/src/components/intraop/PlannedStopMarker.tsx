"use client"

import { useTranslations } from "next-intl"

/**
 * Where a stop saved for a future time will fall (1.4.9). The bar itself ends
 * at now; this marks the row the stop takes effect in. It becomes a real stop
 * when its time comes.
 */
/**
 * A rate or setting change dated after now (9.13.0): drawn where it will
 * apply, with its new value, and applied to nothing until its time.
 */
export function PlannedChangeMarker({ value }: { value: string }) {
  const t = useTranslations("intraop.timelineRules")
  const label = `${t("plannedChange")} · ${value}`
  return (
    <span
      title={label}
      aria-label={label}
      data-testid="planned-change-marker"
      className="pointer-events-none absolute inset-y-1 left-0.5 z-10 w-1 rounded-sm border border-dashed border-sky-500 bg-sky-400/40"
    />
  )
}

export function PlannedStopMarker() {
  const t = useTranslations("intraop.timelineRules")
  return (
    <span
      title={t("plannedStopLabel")}
      aria-label={t("plannedStopLabel")}
      data-testid="planned-stop-marker"
      className="pointer-events-none absolute inset-y-1 left-0.5 z-10 w-1 rounded-sm border border-dashed border-amber-500 bg-amber-400/40"
    />
  )
}
