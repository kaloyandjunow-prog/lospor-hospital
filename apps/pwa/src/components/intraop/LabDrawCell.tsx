import { Text, TouchableOpacity, View } from "react-native"

import { formatMessage } from "@/i18n/locale"
import { formatDateHHMM } from "@/lib/intraop-projection"
import { usePreferences } from "@/lib/preferences-context"
import type { IntraopLabDraw } from "@lospor/core/labs"
import { useShade } from "@/theme/shade"

export const LAB_DRAW_COLOR = "#14b8a6"

/** Lab draws taken in one chart row, merged: two draws can share five minutes. */
export function mergeRowLabDraws(draws: IntraopLabDraw[] | undefined): { count: number; draws: IntraopLabDraw[] } {
  const list = draws ?? []
  return { count: list.reduce((total, draw) => total + draw.results.length, 0), draws: list }
}

/** The compact teal "Labs · n" pill a collapsed chart row shows. */
export function LabDrawPill({ count }: { count: number }) {
  const { tc } = usePreferences()
  if (count === 0) return null
  return (
    <View testID="timetable-row-labs-pill" style={{
      alignSelf: "flex-start", marginTop: 2, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1,
      backgroundColor: LAB_DRAW_COLOR + "22", borderWidth: 1, borderColor: LAB_DRAW_COLOR + "55",
    }}>
      <Text style={{ color: LAB_DRAW_COLOR, fontSize: 10, fontWeight: "700" }}>
        {formatMessage(tc("labsPill"), { count })}
      </Text>
    </View>
  )
}

/** The full draw an expanded chart row shows; tapping opens it for editing. */
export function LabDrawDetail({ draws, onOpen }: { draws: IntraopLabDraw[]; onOpen?: (takenAt: string) => void }) {
  const shade = useShade()
  const { tc } = usePreferences()
  if (draws.length === 0) return null
  return (
    <View style={{ paddingHorizontal: 14, paddingTop: 12, gap: 7 }}>
      {draws.map(draw => (
        <TouchableOpacity
          key={draw.takenAt}
          testID="timetable-row-labs-detail"
          activeOpacity={onOpen ? 0.7 : 1}
          onPress={() => onOpen?.(draw.takenAt)}
          style={{
            backgroundColor: LAB_DRAW_COLOR + "14", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
            borderWidth: 1, borderColor: LAB_DRAW_COLOR + "44", borderLeftWidth: 4, borderLeftColor: LAB_DRAW_COLOR,
          }}
        >
          <Text style={{ color: LAB_DRAW_COLOR, fontSize: 12, fontWeight: "800", marginBottom: 4 }}>
            {tc("labsDrawLabel")} · {formatDateHHMM(new Date(draw.takenAt))}
          </Text>
          {draw.results.map((result, index) => (
            <Text key={`${result.test}-${index}`} style={{ color: shade("#cbd5e1"), fontSize: 12, fontVariant: ["tabular-nums"] }}>
              {result.test} {result.value} {result.unit}
            </Text>
          ))}
        </TouchableOpacity>
      ))}
    </View>
  )
}
