import { Text, TouchableOpacity, View } from "react-native"
import { useShade } from "@/theme/colors"
import type { RunningItem } from "@/lib/intraop-running"

/** What stopped before a row and was not started again: one line, each name opens its menu (Resume, ...) (10.8.0). */
export function RowStopped({ stopped, col, label, onOpen }: {
  stopped: Array<{ id: string; label: string; color: string; at: string }>
  col: number
  label: string
  onOpen?: (id: string, col: number, title?: string) => void
}) {
  const shade = useShade()
  return (
    <View testID="timetable-row-stopped" style={{ paddingHorizontal: 14, paddingTop: 10, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      <Text style={{ color: shade("#64748b"), fontSize: 12, fontWeight: "700" }}>{label}</Text>
      {stopped.map(item => (
        <TouchableOpacity key={item.id} testID={`timetable-row-stopped-${item.id}`} onPress={() => onOpen?.(item.id, col, item.label)}
          style={{ minHeight: 44, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: item.color + "55", justifyContent: "center" }}>
          <Text style={{ color: item.color, fontSize: 13, fontWeight: "700" }}>{item.label} {item.at}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

/**
 * Running strips at the row's edge, stacked inward. Not a control (10.8.0): they say something runs; the row is opened to
 * work with it. A planned start and the way to a planned stop are dashed; a planned dose change is a dot on the strip.
 */
export function RunningStrips({ running }: { running: RunningItem[] }) {
  return (
    <View pointerEvents="none" style={{ flexDirection: "row", alignSelf: "stretch", gap: 1 }}>
      {running.slice().reverse().map(item => {
        const dashed = !!(item.planned || item.plannedStop || item.towardsPlannedStop)
        const faint = !dashed && !!item.projected
        return (
          <View key={item.id} testID={`row-strip-${item.id}`} style={{ width: 6, alignItems: "center", justifyContent: "center",
            backgroundColor: dashed ? "transparent" : item.color + (faint ? "33" : "99"),
            borderLeftWidth: dashed ? 2 : 0, borderRightWidth: dashed ? 2 : 0, borderColor: item.color, borderStyle: dashed ? "dashed" : "solid" }}>
            {item.plannedChange ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: item.color }} /> : null}
          </View>
        )
      })}
    </View>
  )
}
