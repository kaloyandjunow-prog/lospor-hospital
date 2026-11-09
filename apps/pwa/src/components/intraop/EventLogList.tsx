import { Pressable, Text, TouchableOpacity, View } from "react-native"
import { useState } from "react"
import { LAB_DRAW_COLOR } from "@/components/intraop/LabDrawCell"
import { labDrawSummary, type IntraopLabDraw } from "@lospor/core/labs"
import { intraopComplicationList } from "@lospor/core/complication-events"
import { formatComplications } from "@lospor/core/intraop-entries"
import { isChartedIntraopEvent } from "@lospor/core/intraop-summary"
import type { EventLabel } from "@/lib/intraop-event-label"
import { formatTs } from "@/lib/intraop-format"
import type { LogEvent } from "@/lib/intraop-log-event"
import { formatMessage } from "@/i18n/locale"
import type { ClinicalStringKey } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"

export type EventLogListProps = {
  log: LogEvent[]
  labDraws: IntraopLabDraw[]
  onOpenLabs?: (takenAt: string) => void
  selectedComplications: string[]
  onEventActions: (event: LogEvent) => void
  onPromptDelete: (event: LogEvent) => void
  eventLabel: (event: LogEvent, previousVital?: LogEvent) => EventLabel
  previousVitalFor: (index: number) => LogEvent | undefined
  tc: (key: ClinicalStringKey) => string
}

type EventLogEntry =
  | { kind: "event"; ev: LogEvent; idx: number }
  | { kind: "lab"; draw: IntraopLabDraw }

const FILTERS = [
  ["all", "eventLogFilterAll"],
  ["vitals", "eventLogFilterVitals"],
  ["events", "eventLogFilterEvents"],
  ["labs", "eventLogFilterLabs"],
  ["complications", "eventLogFilterComplications"],
] as const
type Filter = typeof FILTERS[number][0]

/** The pre-Timeline-stream list, kept intact for clinicians who choose Legacy. */
export function LegacyEventLogList({ log, labDraws, onOpenLabs, onEventActions, onPromptDelete, eventLabel, previousVitalFor, tc }: EventLogListProps) {
  const shade = useShade()
  return (
    <>
      <Text style={{ color: shade("#94a3b8"), fontSize: 10, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10 }}>{tc("eventLog")}</Text>
      {log.length === 0 && labDraws.length === 0 ? <EmptyLog tc={tc} shade={shade} /> : mergeLogWithLabDraws(log, labDraws).map(entry => {
        if (entry.kind === "lab") return <LabRow key={`lab-${entry.draw.takenAt}`} draw={entry.draw} onPress={() => onOpenLabs?.(entry.draw.takenAt)} tc={tc} shade={shade} />
        const { ev, idx } = entry
        if (!isChartedIntraopEvent(ev)) return null
        const prev = ev.type === "vital" ? previousVitalFor(idx) : undefined
        return <EventRow key={ev.id} ev={ev} previous={prev} eventLabel={eventLabel} onAction={() => onEventActions(ev)} onDelete={() => onPromptDelete(ev)} tc={tc} shade={shade} />
      })}
    </>
  )
}

/** The selected Smart presentation: the same chronological log with lightweight filters. */
export function EventLogTimelineStream({ log, labDraws, onOpenLabs, selectedComplications, onEventActions, onPromptDelete, eventLabel, previousVitalFor, tc }: EventLogListProps) {
  const shade = useShade()
  const [filter, setFilter] = useState<Filter>("all")
  const complicationIds = new Set(intraopComplicationList(log, formatComplications(selectedComplications, "")).flatMap(item => item.eventId ? [item.eventId] : []))
  const entries = mergeLogWithLabDraws(log, labDraws).filter(entry => entry.kind === "lab" ? filter === "all" || filter === "labs" : isChartedIntraopEvent(entry.ev) && matchesFilter(entry.ev, filter, complicationIds))
  return (
    <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>
        {FILTERS.map(([value, label]) => {
          const selected = filter === value
          return <TouchableOpacity key={value} testID={`event-log-filter-${value}`} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setFilter(value)} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: selected ? shade("#35627e") : shade("#203149"), backgroundColor: selected ? shade("#152d43") : "transparent" }}><Text style={{ color: selected ? shade("#e7eef7") : shade("#8ea2ba"), fontSize: 10, fontWeight: "800" }}>{tc(label)}</Text></TouchableOpacity>
        })}
      </View>
      <Text style={{ color: shade("#60758f"), fontSize: 10, marginBottom: 8 }}>{formatMessage(tc("eventLogShowing"), { count: entries.length })}</Text>
      {entries.length === 0 ? <EmptyLog tc={tc} shade={shade} /> : entries.map(entry => {
        if (entry.kind === "lab") return <LabRow key={`lab-${entry.draw.takenAt}`} draw={entry.draw} onPress={() => onOpenLabs?.(entry.draw.takenAt)} tc={tc} shade={shade} />
        const prev = entry.ev.type === "vital" ? previousVitalFor(entry.idx) : undefined
        return <EventRow key={entry.ev.id} ev={entry.ev} previous={prev} eventLabel={eventLabel} onAction={() => onEventActions(entry.ev)} onDelete={() => onPromptDelete(entry.ev)} tc={tc} shade={shade} />
      })}
    </>
  )
}

function matchesFilter(event: LogEvent, filter: Filter, complicationIds: Set<string>) {
  if (filter === "all") return true
  if (filter === "vitals") return event.type === "vital"
  if (filter === "complications") return complicationIds.has(event.id)
  if (filter === "events") return event.type !== "vital"
  return false
}

function EmptyLog({ tc, shade }: { tc: (key: ClinicalStringKey) => string; shade: (hex: string) => string }) {
  return <View style={{ alignItems: "center", paddingTop: 40, paddingBottom: 20 }}><Text style={{ color: shade("#475569"), fontSize: 14 }}>{tc("noEventsYet")}</Text></View>
}

function LabRow({ draw, onPress, tc, shade }: { draw: IntraopLabDraw; onPress: () => void; tc: (key: ClinicalStringKey) => string; shade: (hex: string) => string }) {
  return <TouchableOpacity testID="event-log-lab-draw" accessibilityRole="button" onPress={onPress} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: shade("#1a2030") }}><Text style={{ color: shade("#64748b"), fontSize: 11, width: 42, fontVariant: ["tabular-nums"] }}>{formatTs(draw.takenAt)}</Text><View style={{ width: 3, height: 36, borderRadius: 2, backgroundColor: LAB_DRAW_COLOR, marginHorizontal: 12 }} /><View style={{ flex: 1 }}><Text style={{ color: shade("#e2e8f0"), fontSize: 13, fontWeight: "600" }}>{formatMessage(tc("labsPill"), { count: draw.results.length })}</Text><Text style={{ color: shade("#94a3b8"), fontSize: 11, marginTop: 1 }} numberOfLines={2}>{labDrawSummary(draw)}</Text></View></TouchableOpacity>
}

function EventRow({ ev, previous, eventLabel, onAction, onDelete, tc, shade }: { ev: LogEvent; previous?: LogEvent; eventLabel: (event: LogEvent, previousVital?: LogEvent) => EventLabel; onAction: () => void; onDelete: () => void; tc: (key: ClinicalStringKey) => string; shade: (hex: string) => string }) {
  const { text, color, sub } = eventLabel(ev, previous)
  return <TouchableOpacity accessibilityRole="button" onLongPress={onAction} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: shade("#1a2030") }}><Text style={{ color: shade("#64748b"), fontSize: 11, width: 42, fontVariant: ["tabular-nums"] }}>{formatTs(ev.ts)}</Text><View style={{ width: 3, height: 36, borderRadius: 2, backgroundColor: color, marginHorizontal: 12 }} /><View style={{ flex: 1 }}><Text style={{ color: shade("#e2e8f0"), fontSize: 13, fontWeight: "600" }}>{text}</Text>{!!sub && <Text style={{ color: shade("#94a3b8"), fontSize: 11, marginTop: 1 }}>{sub}</Text>}</View><Pressable accessibilityRole="button" accessibilityLabel={tc("deleteEventTitle")} onPress={onDelete} hitSlop={8} style={{ minHeight: 36, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" }}><Text style={{ color: shade("#94a3b8"), fontSize: 11, fontWeight: "800" }}>{tc("removeEventLabel")}</Text></Pressable></TouchableOpacity>
}

function mergeLogWithLabDraws(log: LogEvent[], draws: IntraopLabDraw[]): EventLogEntry[] {
  const entries: EventLogEntry[] = log.map((ev, idx) => ({ kind: "event", ev, idx }))
  for (const draw of draws) {
    const at = entries.findIndex(entry => entry.kind === "event" && entry.ev.ts <= draw.takenAt)
    entries.splice(at < 0 ? entries.length : at, 0, { kind: "lab", draw })
  }
  return entries
}

