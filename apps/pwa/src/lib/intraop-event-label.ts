import type { LogEvent } from "@/lib/intraop-log-event"
import { trendArrow } from "@/lib/intraop-format"
import { describeIntraopEvent } from "@lospor/core/intraop-summary"
import { resolveIntraopEventLabel } from "@/lib/clinical-display"

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

/**
 * A clinical event in the clinician's language (9.14.2).
 *
 * An event is saved under its English label -- the record and the research
 * export read that -- and the pill printed it as saved, so a Bulgarian
 * clinician who picked "Увод" saw "Induction". The base name is looked up in
 * the event list the picker showed, then in Core's event catalogue, then in
 * the labels the app writes itself; a "(...)" detail after it is kept as typed.
 */
export function localizedClinicalEventText(
  label: string,
  language: string,
  events: readonly { label: string; labelBg?: string | null }[],
  fixed: Readonly<Record<string, string>>,
): string {
  if (language !== "bg") return label
  const open = label.indexOf(" (")
  const base = open >= 0 ? label.slice(0, open) : label
  const detail = open >= 0 ? label.slice(open) : ""
  const named = events.find(event => event.label === base)?.labelBg
    || fixed[base]
    || resolveIntraopEventLabel(base, "bg")
  return `${named || base}${detail}`
}
