import { Text, TouchableOpacity, View } from "react-native"
import { useShade } from "@/theme/colors"
import { formatDateHHMM } from "@/lib/intraop-projection"
import type { LogEvent } from "@/lib/intraop-log-event"

/** What the opened row lists: everything charted in it except an answer to a question, which is never drawn. */
export const isRowEntry = (event: LogEvent): boolean => event.type !== "prompt_answer"

/** A line's colour: the one the entry carries, else one for its kind. */
export function rowEntryColor(event: LogEvent): string {
  if (event.color) return event.color
  if (event.type === "complication" || event.type === "defibrillation") return "#ef4444"
  if (event.type === "drug") return "#3b82f6"
  if (event.type.startsWith("infusion")) return "#a855f7"
  if (event.type.startsWith("fluid")) return "#06b6d4"
  if (event.type.startsWith("agent")) return "#f59e0b"
  if (event.type.startsWith("gas")) return "#818cf8"
  if (event.type.startsWith("jet")) return "#14b8a6"
  if (event.type === "vital") return "#22c55e"
  return "#6366f1"
}

/**
 * Everything charted in this five minutes, in the order it happened, with no heading. The header of the opened row
 * names four drugs and events at most, so a complication, a shock, an infusion's start, a fluid, jet ventilation, a
 * position or a set of vitals was nowhere in it (found 2026-11-11).
 *
 * 10.8.0: a tap on any line opens its menu -- the same one it has on the web chart and in the event log.
 */
export function TimetableRowEntries({ entries, labelOf, col: _col, onOpenEvent, onEditJet }: {
  entries: LogEvent[]
  labelOf: (event: LogEvent) => string
  col: number
  onOpenEvent?: (event: LogEvent) => void
  /** Before the menu (kept for a caller that has not moved to it): the jet sheet at this row. */
  onEditJet?: (col: number) => void
}) {
  const shade = useShade()
  if (entries.length === 0) return null
  return (
    <View testID="timetable-row-entries" style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 }}>
      <View style={{ gap: 6 }}>
        {entries.map(ev => {
          const color = shade(rowEntryColor(ev))
          const opens = !!onOpenEvent || (ev.type.startsWith("jet") && !!onEditJet)
          return (
            <TouchableOpacity
              key={ev.id}
              testID={`timetable-row-entry-${ev.type}`}
              activeOpacity={opens ? 0.7 : 1}
              onPress={onOpenEvent ? () => onOpenEvent(ev) : ev.type.startsWith("jet") && onEditJet ? () => onEditJet(_col) : undefined}
              style={{
                flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44,
                backgroundColor: color + "12", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10,
                borderLeftWidth: 3, borderLeftColor: color,
              }}
            >
              <Text style={{ color: shade("#94a3b8"), fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"], width: 40 }}>
                {formatDateHHMM(new Date(ev.ts))}
              </Text>
              <Text style={{ color: shade("#e2e8f0"), fontSize: 14, fontWeight: "600", flex: 1 }}>{labelOf(ev)}</Text>
              {opens ? <Text style={{ color: shade("#64748b"), fontSize: 18 }}>⋯</Text> : null}
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}
