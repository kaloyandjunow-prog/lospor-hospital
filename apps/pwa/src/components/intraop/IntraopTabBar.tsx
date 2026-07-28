import { type RefObject, type MutableRefObject } from "react"
import { View, Text, ScrollView, TouchableOpacity } from "react-native"
import type { ClinicalStringKey } from "@/lib/preferences-context"
import { INTRAOP_TAB_KEYS, type IntraopTab } from "@/lib/intraop-tabs"

// Horizontal tab rail for the intraop screen. Presentational — markup moved
// verbatim from cases/intraop/[id].tsx. The parent owns the centering effect
// (it reads `layouts`), so the rail ref + per-tab layouts are passed in.
export function IntraopTabBar({ tab, onSelect, tc, screenWidth, railRef, layouts }: {
  tab: IntraopTab
  onSelect: (t: IntraopTab) => void
  tc: (key: ClinicalStringKey) => string
  screenWidth: number
  railRef: RefObject<ScrollView | null>
  layouts: MutableRefObject<Partial<Record<string, { x: number; width: number }>>>
}) {
  return (
    <View style={{ backgroundColor:"#0a0f1a", borderBottomWidth:1, borderBottomColor:"#1e2d40" }}>
      <ScrollView ref={railRef} horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexDirection:"row", paddingHorizontal:Math.max(0, screenWidth / 2 - 48) }}>
        {INTRAOP_TAB_KEYS.map(t => {
          const label = t === "equipment" ? tc("tabEquipment")
            : t === "technique" ? tc("tabTechnique")
            : t === "timing" ? tc("tabTiming")
            : t === "position" ? tc("tabPosition")
            : t === "monitoring" ? tc("tabMonitoring")
            : t === "airway" ? tc("tabAirway")
            : t === "vascular" ? tc("tabVascular")
            : t === "premedication" ? tc("tabPremedication")
            : t === "log" ? "Timetable"
            : "Event log"
          return (
          <TouchableOpacity key={t} onPress={() => onSelect(t)}
            onLayout={(e) => { layouts.current[t] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width } }}
            style={{ paddingHorizontal:16, paddingVertical:8, alignItems:"center",
              borderBottomWidth:2, borderBottomColor: tab===t ? "#3b82f6" : "transparent" }}>
            <Text style={{ color: tab===t ? "#3b82f6" : "#64748b", fontSize:12, fontWeight:"700" }}>
              {label}
            </Text>
          </TouchableOpacity>
          )
        })}
      </ScrollView>
    </View>
  )
}
