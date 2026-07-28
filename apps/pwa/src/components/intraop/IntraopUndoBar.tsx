import { View, Text, TouchableOpacity } from "react-native"
import { colors } from "@/theme/colors"
import { usePreferences } from "@/lib/preferences-context"

// Undo/dismiss bar shown after an event is added on the Timetable tab.
// Presentational only — markup moved verbatim from cases/intraop/[id].tsx.
export function IntraopUndoBar({ text, onUndo, onDismiss }: {
  text: string
  onUndo: () => void
  onDismiss: () => void
}) {
  const { tc } = usePreferences()
  return (
    <View style={{ flexDirection:"row", alignItems:"center", gap:10,
      paddingHorizontal:12, paddingVertical:9, backgroundColor:"#17212a",
      borderBottomWidth:1, borderBottomColor:"#2a3a46" }}>
      <Text style={{ color:colors.textSecondary, fontSize:12, flex:1 }} numberOfLines={1}>
        {tc("ubItemAdded").replace("{text}", text)}
      </Text>
      <TouchableOpacity onPress={onUndo}
        style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:8,
          backgroundColor:colors.primarySoft, borderWidth:1, borderColor:colors.primary }}>
        <Text style={{ color:colors.primary, fontSize:11, fontWeight:"900" }}>{tc("ubUndo")}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDismiss} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
        <Text style={{ color:colors.textMuted, fontSize:13, fontWeight:"800" }}>{tc("ubDismiss")}</Text>
      </TouchableOpacity>
    </View>
  )
}
