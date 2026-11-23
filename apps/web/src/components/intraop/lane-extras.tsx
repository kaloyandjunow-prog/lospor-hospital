"use client"

import { intraopRunDurationLabel } from "@lospor/core/intraop-summary"

/**
 * Small pieces every continuous lane shares (10.8.0, rule 5 web):
 * the total in the cell after a bar's end (or after now while it runs),
 * and a duration written the way the record writes it -- Core's label, so
 * the PWA's open row says the same.
 */
export const laneDuration = intraopRunDurationLabel

/** The column the total goes in: after the end of a stopped bar, after now on a running one. */
export function totalColumn(seg: { endCol: number; stopped?: boolean }, nowCol: number | null): number {
  return seg.stopped || nowCol == null ? seg.endCol + 1 : nowCol + 1
}

export function LaneTotal({ text, color, testId = "lane-total" }: { text: string; color?: string; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className="pointer-events-none absolute inset-y-0 left-1 z-30 flex items-center whitespace-nowrap text-xs font-bold tabular-nums text-slate-600 dark:text-slate-300"
      style={color ? { color } : undefined}
    >
      {/* On a pill, so the running stripes after it do not run through the figures. */}
      <span className="rounded bg-white px-1 py-0.5 dark:bg-[#1c1c1c]">Σ {text}</span>
    </span>
  )
}
