import { View, Text, ScrollView } from "react-native"
import { calcEquipment } from "@/lib/equipment-calculator"
import { getMedicationWarnings } from "@/lib/risk-derivation"

export function EquipmentTab({ preop }: {
  preop: {
    age?: number; weight?: number; height?: number; sex?: string
    mallampati?: string; neckMobility?: string; mouthOpeningCm?: number; cormackLehane?: string
    currentMedications?: { label: string; atcCode?: string }[]
  } | null
}) {
  const hasPreop = preop && (preop.age != null || preop.weight != null || preop.height != null)
  const cats = hasPreop ? calcEquipment(preop?.age, preop?.weight, preop?.height, preop?.sex, {
    mallampati: preop?.mallampati, neckMobility: preop?.neckMobility,
    mouthOpeningCm: preop?.mouthOpeningCm, cormackLehane: preop?.cormackLehane,
  }) : []
  const medicationWarnings = getMedicationWarnings(preop?.currentMedications ?? [])
  return (
    <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>
      {medicationWarnings.length > 0 && (
        <View style={{ backgroundColor:"#2a1410", borderRadius:14, borderWidth:1, borderColor:"#7c2d12",
          padding:14, marginBottom:16, gap:4 }}>
          {medicationWarnings.map(w => (
            <Text key={w.key} style={{ color:"#fb923c", fontSize:13, fontWeight:"700" }}>⚠ {w.label}</Text>
          ))}
        </View>
      )}
      {!hasPreop ? (
        <View style={{ backgroundColor:"#111111", borderRadius:14, borderWidth:1, borderColor:"#1e2d40",
          padding:20, alignItems:"center" }}>
          <Text style={{ color:"#64748b", fontSize:13, textAlign:"center", lineHeight:20 }}>
            — Add patient details in preop to see suggestions —
          </Text>
        </View>
      ) : (
        <>
          {/* Patient summary */}
          <View style={{ backgroundColor:"#111111", borderRadius:14, borderWidth:1, borderColor:"#1e2d40",
            padding:14, marginBottom:16, flexDirection:"row", gap:16, flexWrap:"wrap" }}>
            {preop?.age    != null && <Text style={{ color:"#94a3b8", fontSize:13 }}>Age <Text style={{ color:"#f8fafc", fontWeight:"700" }}>{preop.age < 1 ? `${Math.round(preop.age * 12)}mo` : `${preop.age}y`}</Text></Text>}
            {preop?.weight != null && <Text style={{ color:"#94a3b8", fontSize:13 }}>Weight <Text style={{ color:"#f8fafc", fontWeight:"700" }}>{preop.weight} kg</Text></Text>}
            {preop?.height != null && <Text style={{ color:"#94a3b8", fontSize:13 }}>Height <Text style={{ color:"#f8fafc", fontWeight:"700" }}>{preop.height} cm</Text></Text>}
            {preop?.sex    != null && <Text style={{ color:"#94a3b8", fontSize:13 }}>Sex <Text style={{ color:"#f8fafc", fontWeight:"700" }}>{preop.sex}</Text></Text>}
          </View>

          {cats.map((cat, ci) => (
            <View key={cat.cat} style={{ marginBottom: ci < cats.length - 1 ? 16 : 0 }}>
              <View style={{ flexDirection:"row", alignItems:"center", marginBottom:8, gap:8 }}>
                <View style={{ width:3, height:14, borderRadius:2, backgroundColor: cat.color }} />
                <Text style={{ color: cat.color, fontSize:10, fontWeight:"700", letterSpacing:1.2, textTransform:"uppercase" }}>
                  {cat.cat}
                </Text>
              </View>
              <View style={{ backgroundColor:"#111111", borderRadius:14, borderWidth:1, borderColor:"#1e2d40", padding:14 }}>
                {cat.items.map((item, ii) => (
                  <View key={item.label} style={{
                    flexDirection:"row", justifyContent:"space-between", alignItems:"flex-start",
                    paddingVertical:8,
                    borderBottomWidth: ii < cat.items.length - 1 ? 1 : 0,
                    borderBottomColor:"#1e2d40",
                  }}>
                    <Text style={{ color:"#64748b", fontSize:13, flex:1 }}>{item.label}</Text>
                    <View style={{ alignItems:"flex-end" }}>
                      <Text style={{ color:"#f8fafc", fontSize:13, fontWeight:"700" }}>{item.value}</Text>
                      {!!item.note && <Text style={{ color:"#475569", fontSize:11, marginTop:1 }}>{item.note}</Text>}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  )
}
