import { ALL_COMPLICATIONS, canonicalComplicationLabel } from "./complications"
import { COMPLICATION_NOTE_SEPARATOR, formatComplications, parseComplications } from "./intraop-entries"
import type { LogEvent } from "./intraop-types"

/**
 * Intraoperative complications as timed entries (10.1.0). Each one is a
 * single event in the log, with its time and, for an episode, its end; the
 * timeline, the complications list and the event log all show that one entry,
 * so deleting it anywhere deletes it everywhere.
 *
 * Cases charted before 10.1.0 kept their complications as one line of text.
 * Those stay readable and exportable as they are, shown without a time: no
 * time is invented, and a finalised case is never rewritten.
 */

export type IntraopComplicationEntry = {
  key: string
  label: string
  /** "event": a timed entry. "legacy": from the old line of text, no time. */
  source: "event" | "legacy"
  eventId?: string
  ts?: string
  endTs?: string
  /** An episode from the vitals questions that is still being logged. */
  open?: boolean
  fromVitals?: boolean
}

/** The complications list: timed entries in time order, then the old text's items. */
export function intraopComplicationList(log: LogEvent[], legacyText: string | null | undefined): IntraopComplicationEntry[] {
  const timed = log
    .filter(event => event.type === "complication" && event.label && Number.isFinite(Date.parse(event.ts)))
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
    .map((event): IntraopComplicationEntry => ({
      key: `event:${event.id}`,
      label: event.label!,
      source: "event",
      eventId: event.id,
      ts: event.ts,
      ...(event.endTs ? { endTs: event.endTs } : {}),
      ...(event.complicationSource === "vitals" ? { fromVitals: true } : {}),
      ...((event.complicationSource === "vitals" || event.complicationSource === "readings") && !event.endTs ? { open: true } : {}),
    }))
  const legacy = legacyComplications(legacyText).selected.map((label, index): IntraopComplicationEntry => ({
    key: `legacy:${index}:${label}`,
    label,
    source: "legacy",
  }))
  return [...timed, ...legacy]
}

/**
 * The old line of text, split into its items and its notes. The PWA wrote
 * "A; B — notes"; the web wrote "A; B; notes", with the known items and the
 * free text side by side. Both are read.
 */
export function legacyComplications(text: string | null | undefined): { selected: string[]; notes: string } {
  if (!text) return { selected: [], notes: "" }
  if (text.includes(COMPLICATION_NOTE_SEPARATOR)) return parseComplications(text, ALL_COMPLICATIONS)
  const parts = text.split(";").map(part => part.trim()).filter(Boolean)
  return {
    selected: parts.filter(part => ALL_COMPLICATIONS.includes(part)),
    notes: parts.filter(part => !ALL_COMPLICATIONS.includes(part)).join("; "),
  }
}

/** The old line of text without one item, its notes kept; null when nothing is left. */
export function withoutLegacyComplication(text: string | null | undefined, label: string): string | null {
  const { selected, notes } = legacyComplications(text)
  return formatComplications(selected.filter(item => item !== label), notes)
}

/** The old line of text with new notes, its items kept; null when nothing is left. */
export function withLegacyComplicationNotes(text: string | null | undefined, notes: string): string | null {
  return formatComplications(legacyComplications(text).selected, notes)
}

/** The event a complication picked on the timeline writes, at the time of the slot tapped. */
export function timelineComplicationEvent(input: { id: string; ts: string; label: string; recordedAt?: string }): LogEvent {
  return {
    id: input.id,
    ts: input.ts,
    type: "complication",
    label: canonicalComplicationLabel(input.label),
    color: "#ef4444",
    complicationSource: "timeline",
    ...(input.recordedAt ? { recordedAt: input.recordedAt } : {}),
  }
}
