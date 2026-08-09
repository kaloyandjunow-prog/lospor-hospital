import { View, Text, ScrollView } from "react-native"
import { calcEquipment } from "@/lib/equipment-calculator"
import { getMedicationWarnings } from "@/lib/risk-derivation"
import { translateEquipment } from "@/i18n/equipment-strings"
import { usePreferences } from "@/lib/preferences-context"
import {
  pediatricAgeFromPreop,
  type IntraopPreopSummary,
} from "@/lib/intraop-preop-summary"

export function EquipmentTab({
  preop,
}: {
  preop: IntraopPreopSummary | null
}) {
  const { tc, language } = usePreferences()
  const pediatricMode = preop?.clinicalMode === "PEDIATRIC"
  const pediatricAge = pediatricAgeFromPreop(preop)
  const hasPreop = !!preop && (
    pediatricMode
      ? pediatricAge != null || preop.weight != null || preop.height != null
      : preop.age != null || preop.weight != null || preop.height != null
  )
  const cats = translateEquipment(hasPreop && preop ? calcEquipment({
    clinicalMode: preop.clinicalMode,
    age: pediatricAge,
    ageYears: pediatricMode ? null : preop.age,
    weightKg: preop.weight,
    heightCm: preop.height,
    sex: preop.sex,
    airway: {
      mallampati: preop.mallampati,
      neckMobility: preop.neckMobility,
      mouthOpeningCm: preop.mouthOpeningCm,
      cormackLehane: preop.cormackLehane,
    },
  }) : [], language)
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
            — {tc("equipmentNeedsPreop")} —
          </Text>
        </View>
      ) : (
        <>
          {/* Patient summary */}
          <View style={{ backgroundColor:"#111111", borderRadius:14, borderWidth:1, borderColor:"#1e2d40",
            padding:14, marginBottom:16, flexDirection:"row", gap:16, flexWrap:"wrap" }}>
            {preop?.age    != null && <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("agePlaceholder")} <Text style={{ color:"#f8fafc", fontWeight:"700" }}>{preop.age < 1 ? `${Math.round(preop.age * 12)}${tc("monthsShort")}` : `${preop.age}${tc("yearsShort")}`}</Text></Text>}
            {preop?.weight != null && <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("weightPlaceholder")} <Text style={{ color:"#f8fafc", fontWeight:"700" }}>{preop.weight} kg</Text></Text>}
            {preop?.height != null && <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("heightPlaceholder")} <Text style={{ color:"#f8fafc", fontWeight:"700" }}>{preop.height} cm</Text></Text>}
            {preop?.sex    != null && <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("sexLabel")} <Text style={{ color:"#f8fafc", fontWeight:"700" }}>{preop.sex === "MALE" ? tc("sexMale") : preop.sex === "FEMALE" ? tc("sexFemale") : preop.sex}</Text></Text>}
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
                {/* Label and value share one flexible row; the note gets its own
                    full-width line. Previously the value column had no flex bound,
                    so sentence-length values ran off the right edge of the card and
                    squeezed the label until it wrapped into them. */}
                {cat.items.map((item, ii) => (
                  <View key={item.label} style={{
                    paddingVertical:8, gap:3,
                    borderBottomWidth: ii < cat.items.length - 1 ? 1 : 0,
                    borderBottomColor:"#1e2d40",
                  }}>
                    <View style={{ flexDirection:"row", alignItems:"flex-start", gap:12 }}>
                      <Text style={{ color:"#64748b", fontSize:13, flexShrink:1 }}>{item.label}</Text>
                      <Text style={{ color:"#f8fafc", fontSize:13, fontWeight:"700", flex:1, minWidth:0, textAlign:"right" }}>
                        {item.value}
                      </Text>
                    </View>
                    {!!item.note && (
                      <Text style={{ color:"#475569", fontSize:11, lineHeight:15 }}>{item.note}</Text>
                    )}
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
