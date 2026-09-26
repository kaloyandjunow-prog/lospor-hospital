import { View, Text, TouchableOpacity } from "react-native"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"

// Sticky footer under the vertical timetable: chart + jump-to-now + end-case.
// Presentational — markup moved verbatim from cases/intraop/[id].tsx.
export function TimetableFooter({ started, isWatching, onJumpToNow, onEndCase, onViewChart }: {
  started: boolean
  isWatching: boolean
  onJumpToNow: () => void
  onEndCase: () => void
  onViewChart?: () => void
}) {
  const shade = useShade()
  const { tc } = usePreferences()
  return (
    <View style={{
      flexDirection: "row", gap: 10,
      paddingHorizontal: 12, paddingVertical: 10, paddingBottom: 16,
      backgroundColor: shade("#070c14"), borderTopWidth: 1, borderTopColor: shade("#0f172a"),
    }}>
      {/* Read-only chart view. Sized to its content rather than flex:1, and
          placed first, so End case stays the rightmost button it has always
          been — that one is destructive and lives in thumb memory. */}
      {onViewChart ? (
        <TouchableOpacity
          onPress={onViewChart}
          style={{
            borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, alignItems: "center",
            backgroundColor: shade("#0f1828"), borderWidth: 1, borderColor: shade("#38bdf855"),
          }}
        >
          <Text style={{ color: shade("#7dd3fc"), fontSize: 13, fontWeight: "800" }}>{tc("tfViewChart")}</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        onPress={onJumpToNow}
        disabled={!started}
        style={{
          flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: "center",
          backgroundColor: shade("#0f1828"),
          borderWidth: 1, borderColor: shade("#f9731655"),
          opacity: started ? 1 : 0.35,
        }}
      >
        <Text style={{ color: shade("#fb923c"), fontSize: 13, fontWeight: "800" }}>{tc("tfJumpToNow")}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => { if (!isWatching) onEndCase() }}
        disabled={isWatching}
        style={{
          flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: "center",
          backgroundColor: shade("#1a1005"), borderWidth: 1, borderColor: shade("#f9731644"),
          opacity: isWatching ? 0.4 : 1,
        }}
      >
        <Text style={{ color: shade("#fb923c"), fontSize: 13, fontWeight: "800" }}>{tc("tfEndCase")}</Text>
      </TouchableOpacity>
    </View>
  )
}
