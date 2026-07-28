import { Text, TouchableOpacity, View } from "react-native"
import { Sheet } from "./Sheet"
import { displayClinicalCode } from "@/lib/clinical-display"
import { usePreferences } from "@/lib/preferences-context"

export type ComplicationGroup = {
  id: string
  title: string
  items: string[]
}

type Props = {
  visible: boolean
  onClose: () => void
  groups: ComplicationGroup[]
  titleForGroup: (group: ComplicationGroup) => string
  selected: string[]
  expanded: Record<string, boolean>
  saving: boolean
  onToggleGroup: (id: string) => void
  onToggleItem: (item: string) => void
  onClear: () => void
  onSave: () => void
}

export function ComplicationsSheet({
  visible,
  onClose,
  groups,
  titleForGroup,
  selected,
  expanded,
  saving,
  onToggleGroup,
  onToggleItem,
  onClear,
  onSave,
}: Props) {
  const { language } = usePreferences()
  return (
    <Sheet visible={visible} onClose={onClose} title="Complications" full>
      <View style={{ gap:4 }}>
        {groups.map(group => {
          const isExpanded = !!expanded[group.id]
          const groupSelected = group.items.filter(i => selected.includes(i))
          return (
            <View key={group.id} style={{ borderRadius:12, overflow:"hidden",
              borderWidth:1, borderColor: groupSelected.length > 0 ? "#ef444455" : "#1e2d40",
              marginBottom:6 }}>
              <TouchableOpacity
                onPress={() => onToggleGroup(group.id)}
                style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between",
                  paddingHorizontal:14, paddingVertical:12,
                  backgroundColor: groupSelected.length > 0 ? "#ef444412" : "#111820" }}>
                <View style={{ flexDirection:"row", alignItems:"center", gap:8 }}>
                  <Text style={{ color: groupSelected.length > 0 ? "#f87171" : "#cbd5e1",
                    fontSize:13, fontWeight:"700" }}>
                    {displayClinicalCode("complication", group.id, language, { label: titleForGroup(group) })}
                  </Text>
                  {groupSelected.length > 0 && (
                    <View style={{ paddingHorizontal:6, paddingVertical:2, borderRadius:6,
                      backgroundColor:"#ef444433" }}>
                      <Text style={{ color:"#fca5a5", fontSize:10, fontWeight:"700" }}>
                        {groupSelected.length}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ color:"#64748b", fontSize:12 }}>{isExpanded ? "^" : "v"}</Text>
              </TouchableOpacity>
              {isExpanded && (
                <View style={{ paddingHorizontal:12, paddingBottom:10, paddingTop:4,
                  backgroundColor:"#0d1520", flexDirection:"row", flexWrap:"wrap", gap:8 }}>
                  {group.items.map(item => {
                    const checked = selected.includes(item)
                    return (
                      <TouchableOpacity key={item}
                        onPress={() => onToggleItem(item)}
                        style={{ flexDirection:"row", alignItems:"center", gap:6,
                          paddingHorizontal:10, paddingVertical:8, borderRadius:9,
                          backgroundColor: checked ? "#ef444420" : "#151c28",
                          borderWidth:1, borderColor: checked ? "#ef4444" : "#263246" }}>
                        <View style={{ width:14, height:14, borderRadius:3,
                          backgroundColor: checked ? "#ef4444" : "transparent",
                          borderWidth: checked ? 0 : 1.5, borderColor:"#475569",
                          alignItems:"center", justifyContent:"center" }}>
                          {checked && <Text style={{ color:"#fff", fontSize:9, fontWeight:"900" }}>x</Text>}
                        </View>
                        <Text style={{ color: checked ? "#fca5a5" : "#94a3b8",
                          fontSize:12, fontWeight: checked ? "700" : "500" }}>{displayClinicalCode("complication", item, language, { label: item })}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}
            </View>
          )
        })}
      </View>
      <View style={{ marginTop:12, gap:10 }}>
        {selected.length > 0 && (
          <TouchableOpacity
            onPress={onClear}
            style={{ paddingVertical:10, borderRadius:10, alignItems:"center",
              backgroundColor:"#1c1414", borderWidth:1, borderColor:"#ef444433" }}>
            <Text style={{ color:"#ef4444", fontSize:12, fontWeight:"700" }}>Clear all</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={onSave}
          disabled={saving}
          style={{ paddingVertical:16, borderRadius:12, alignItems:"center",
            backgroundColor: saving ? "#1a1a1a" : "#7f1d1d",
            borderWidth:1, borderColor: saving ? "#3e3e3e" : "#ef4444" }}>
          <Text style={{ color: saving ? "#64748b" : "#fca5a5", fontSize:15, fontWeight:"700" }}>
            {saving ? "Saving..." : `Save${selected.length > 0 ? ` (${selected.length} complication${selected.length === 1 ? "" : "s"})` : ""}`}
          </Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  )
}
