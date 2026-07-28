import { View, Text, ScrollView, TouchableOpacity } from "react-native"

type PositionOption = { code: string; label: string; desc: string; color: string }

export function PositionTab({ positions, setPositions, savePositions, fieldSaving, positionsList }: {
  positions: string[]
  setPositions: (next: string[]) => void
  savePositions: (next: string[]) => void
  fieldSaving: string | null
  positionsList: PositionOption[]
}) {
  return (
    <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>
      <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
        textTransform:"uppercase", marginBottom:12 }}>
        Patient Position {fieldSaving === "positions" ? "(saving…)" : ""}
      </Text>
      <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
        {positionsList.map(pos => {
          const sel = positions.includes(pos.code) || positions.includes(pos.label)
          return (
            <TouchableOpacity key={pos.code} onPress={() => {
              const isSelected = positions.includes(pos.code) || positions.includes(pos.label)
              const next = isSelected
                ? positions.filter(p => p !== pos.code && p !== pos.label)
                : [...positions.filter(p => p !== pos.code && p !== pos.label), pos.code]
              setPositions(next)
              savePositions(next)
            }} style={{
              width:"30%", paddingHorizontal:10, paddingVertical:12, borderRadius:12,
              backgroundColor: sel ? pos.color + "22" : "#111111",
              borderWidth:1, borderColor: sel ? pos.color : "#1e2d40",
              alignItems:"center",
            }}>
              <Text style={{ color: sel ? pos.color : "#64748b", fontSize:12, fontWeight:"700",
                textAlign:"center" }}>{pos.label}</Text>
              <Text style={{ color: sel ? pos.color + "aa" : "#334155", fontSize:9, marginTop:3,
                textAlign:"center" }}>{pos.desc}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </ScrollView>
  )
}
