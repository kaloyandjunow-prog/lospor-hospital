import { describeIntraopEvent, eventClockTimes, isChartedIntraopEvent, type SemanticLogEvent } from "./intraop-summary"
import { clinicalDisplayLabel, type ClinicalLocale } from "./display"
import { resolveIntraopEventLabel } from "./clinical-display"
import type { RecordLogKind } from "./record-labels"

/**
 * The printed record's event log (mock E, 2026-11-08): every charted entry in the order it happened, deleted
 * ones included and marked. It reads the same saved event log the chart does, so nothing here is stored twice.
 *
 * A deleted entry stays on the paper at the minute it was charted for, with the minute it was deleted. The
 * saved rows keep no reason for a deletion, so none is printed.
 */
export type RecordLogRow = {
  id: string
  /** Time of day in the case's zone (UTC when it has none). */
  time: string
  kind: RecordLogKind
  text: string
  /** The treatment card the entry was made from, in the reader's language. */
  card?: string
  complication: boolean
  /** Present on a deleted entry: when it was deleted, in the case's zone. */
  deletedTime?: string
}

type LogLike = SemanticLogEvent & { id?: string; ts?: string; suggestion?: string }
/** A deleted entry as the API sends it: the entry as it was, plus the minute it was deleted. */
export type DeletedLogEvent = LogLike & { deletedAt?: string | null }

const KIND_BY_TYPE: Record<string, RecordLogKind> = {
  drug: "drug", clinical_event: "event", defibrillation: "event", phase_change: "event", position_change: "position",
  infusion_start: "infusion", infusion_rate: "infusion", infusion_stop: "infusion",
  fluid_start: "fluid", fluid_rate: "fluid", fluid_end: "fluid",
  agent_start: "agent", agent_stop: "agent",
  gas_start: "fgf", gas_change: "fgf", gas_stop: "fgf",
  jet_start: "jet", jet_change: "jet", jet_stop: "jet",
  complication: "complication",
}

const validTs = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value))
const utcClock = (ts: string) => {
  const d = new Date(ts)
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`
}
const cardName = (suggestion: string | undefined) => {
  const parts = typeof suggestion === "string" && suggestion.startsWith("card:") ? suggestion.split(":") : null
  return parts && parts[1] ? parts[1] : null
}

export function buildRecordEventLog(
  log: readonly unknown[] | null | undefined,
  deleted: readonly unknown[] | null | undefined,
  timeZone: string | null | undefined,
  locale: string,
): RecordLogRow[] {
  const lang: ClinicalLocale = locale === "bg" ? "bg" : "en"
  const usable = (e: LogLike) => validTs(e.ts) && typeof e.id === "string" && !!e.type && !!KIND_BY_TYPE[e.type] && isChartedIntraopEvent(e)
  const live = ((Array.isArray(log) ? log : []) as LogLike[]).filter(usable)
  const gone = ((Array.isArray(deleted) ? deleted : []) as DeletedLogEvent[]).filter(usable)
  // A key for the clock lookup that cannot collide between a live entry and a deleted one with the same id.
  const keyed = [
    ...live.map(event => ({ event, key: event.id!, isGone: false })),
    ...gone.map(event => ({ event, key: `deleted:${event.id}`, isGone: true })),
  ]
  const clocks = eventClockTimes(keyed.map(({ event, key }) => ({ id: key, ts: event.ts })), timeZone)
  const delClocks = eventClockTimes(gone.filter(e => validTs(e.deletedAt)).map(e => ({ id: `deleted:${e.id}`, ts: e.deletedAt })), timeZone)
  const rows = keyed.map(({ event, key, isGone }, index) => {
    const type = event.type!
    const descriptor = describeIntraopEvent(event, { language: lang })
    const complication = type === "complication"
    const text = type === "clinical_event" ? resolveIntraopEventLabel(event.label ?? descriptor.text, lang)
      : complication ? clinicalDisplayLabel("complication", event.label ?? "", lang, { label: event.label ?? "" })
      : descriptor.text
    const card = cardName(event.suggestion)
    const deletedAt = isGone ? (event as DeletedLogEvent).deletedAt : null
    const row: RecordLogRow = {
      id: key,
      time: clocks.get(key) ?? utcClock(event.ts!),
      kind: KIND_BY_TYPE[type]!,
      text,
      complication,
      ...(card ? { card: clinicalDisplayLabel("complication", card, lang, { label: card }) } : {}),
      ...(validTs(deletedAt) ? { deletedTime: delClocks.get(key) ?? utcClock(deletedAt) } : {}),
    }
    return { row, ts: Date.parse(event.ts!), index }
  })
  rows.sort((a, b) => a.ts - b.ts || a.index - b.index)
  return rows.map(entry => entry.row)
}

/**
 * An episode on the record: a complication, with what was given while it lasted. A complication that has
 * not ended (or was a moment) is looked at for half an hour after it began.
 */
export type RecordEpisodeEntry = {
  id: string
  label: string
  from: string
  to?: string
  /** What was given during it, in the order given. */
  treated: Array<{ time: string; text: string; card: boolean }>
}

const EPISODE_WINDOW_MS = 30 * 60_000

export function buildRecordEpisodes(
  log: readonly unknown[] | null | undefined,
  timeZone: string | null | undefined,
  locale: string,
): RecordEpisodeEntry[] {
  const lang: ClinicalLocale = locale === "bg" ? "bg" : "en"
  const events = (Array.isArray(log) ? log : []) as LogLike[]
  const usable = events.filter(e => validTs(e.ts) && typeof e.id === "string")
  const clocks = eventClockTimes(usable.map(e => ({ id: e.id, ts: e.ts })), timeZone)
  const endClocks = eventClockTimes(usable.filter(e => validTs((e as { endTs?: unknown }).endTs)).map(e => ({ id: `${e.id}:end`, ts: (e as { endTs: string }).endTs })), timeZone)
  const clock = (id: string, ts: string) => clocks.get(id) ?? utcClock(ts)
  const doses = usable.filter(e => e.type === "drug")
  return usable
    .filter(e => e.type === "complication")
    .sort((a, b) => Date.parse(a.ts!) - Date.parse(b.ts!))
    .map(e => {
      const start = Date.parse(e.ts!)
      const endTs = (e as { endTs?: string }).endTs
      const end = validTs(endTs) && Date.parse(endTs) > start ? Date.parse(endTs) : start + EPISODE_WINDOW_MS
      const treated = doses
        .filter(d => Date.parse(d.ts!) >= start && Date.parse(d.ts!) <= end)
        .sort((a, b) => Date.parse(a.ts!) - Date.parse(b.ts!))
        .map(d => ({ time: clock(d.id!, d.ts!), text: describeIntraopEvent(d, { language: lang }).text, card: cardName(d.suggestion) != null }))
      return {
        id: e.id!,
        label: clinicalDisplayLabel("complication", e.label ?? "", lang, { label: e.label ?? "" }),
        from: clock(e.id!, e.ts!),
        ...(validTs(endTs) && Date.parse(endTs) > start ? { to: endClocks.get(`${e.id}:end`) ?? utcClock(endTs) } : {}),
        treated,
      }
    })
}
