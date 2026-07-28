import type { LogEvent } from "@/lib/intraop-log-event"
import { trendArrow } from "@/lib/intraop-format"
import { describeIntraopEvent } from "@lospor/core/intraop-summary"

export type EventLabel = { text: string; color: string; sub?: string }
export type EventLabelColors = {
  drugColor: (name: string) => string
  clinicalEventColor: (label: string) => string
}

export function buildEventLabel(
  event: LogEvent,
  previousVital: LogEvent | undefined,
  colors: EventLabelColors,
): EventLabel {
  const descriptor = describeIntraopEvent(event, {
    previousVital,
    trend: trendArrow,
    drugColor: colors.drugColor,
    clinicalEventColor: colors.clinicalEventColor,
  })
  return {
    text: descriptor.text,
    color: descriptor.color,
    sub: descriptor.sub,
  }
}
