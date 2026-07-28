import { View, Text, TouchableOpacity } from "react-native"
import { usePreferences } from "@/lib/preferences-context"

// Sticky footer under the vertical timetable: jump-to-now + end-case.
// Presentational — markup moved verbatim from cases/intraop/[id].tsx.
export function TimetableFooter({ started, isWatching, onJumpToNow, onEndCase }: {
  started: boolean
  isWatching: boolean
  onJumpToNow: () => void
  onEndCase: () => void
}) {
  const { tc } = usePreferences()
  return (
    <View style={{
      flexDirection: "row", gap: 10,
      paddingHorizontal: 12, paddingVertical: 10, paddingBottom: 16,
      backgroundColor: "#070c14", borderTopWidth: 1, borderTopColor: "#0f172a",
    }}>
      <TouchableOpacity
        onPress={onJumpToNow}
        disabled={!started}
        style={{
          flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: "center",
          backgroundColor: "#0f1828",
          borderWidth: 1, borderColor: "#f9731655",
          opacity: started ? 1 : 0.35,
        }}
      >
        <Text style={{ color: "#fb923c", fontSize: 13, fontWeight: "800" }}>{tc("tfJumpToNow")}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => { if (!isWatching) onEndCase() }}
        disabled={isWatching}
        style={{
          flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: "center",
          backgroundColor: "#1a1005", borderWidth: 1, borderColor: "#f9731644",
          opacity: isWatching ? 0.4 : 1,
        }}
      >
        <Text style={{ color: "#fb923c", fontSize: 13, fontWeight: "800" }}>{tc("tfEndCase")}</Text>
      </TouchableOpacity>
    </View>
  )
}
