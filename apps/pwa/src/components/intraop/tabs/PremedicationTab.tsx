import { View, Text, ScrollView, TouchableOpacity } from "react-native"
import type { ClinicalStringKey } from "@/lib/preferences-context"
import { usePreferences } from "@/lib/preferences-context"
import { displayOptionEntry } from "@/lib/clinical-display"
import { useShade } from "@/theme/shade"
import { isPremedicationAsOrdered, type PremedicationOrders } from "@lospor/core/premedication"

export function PremedicationTab({
  premedEveningText, setPremedEveningText, premedMorningText, setPremedMorningText, savePremedication,
  tc, openPremedPicker, ordered,
}: {
  /** The premedication ordered at the preop visit, to say where a phase still holds it. */
  ordered?: PremedicationOrders
  premedEveningText: string
  setPremedEveningText: (v: string) => void
  premedMorningText: string
  setPremedMorningText: (v: string) => void
  savePremedication: (overrides?: { evening?: string | null; morning?: string | null }) => void
  tc: (key: ClinicalStringKey) => string
  openPremedPicker: (phase: "evening" | "morning") => void
}) {
  const shade = useShade()
  const { language } = usePreferences()
  return (
    <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>
      {/* ── Evening ─────────────────────────────────────────── */}
      {(() => {
        const items = premedEveningText ? premedEveningText.split(";").map(s => s.trim()).filter(Boolean) : []
        return (
          <View style={{ marginBottom:24 }}>
            <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <Text style={{ color:shade("#64748b"), fontSize:11, fontWeight:"700", textTransform:"uppercase", letterSpacing:0.8 }}>{tc("premedEvening")}</Text>
              <View style={{ flexDirection:"row", gap:8 }}>
                <TouchableOpacity
                  onPress={() => { const next = "N/A"; setPremedEveningText(next); setTimeout(() => savePremedication({ evening: next }), 100) }}
                  style={{ paddingHorizontal:10, paddingVertical:5, borderRadius:8, backgroundColor:shade("#1e2d40"), borderWidth:1, borderColor:shade("#2a3a50") }}>
                  <Text style={{ color:shade("#64748b"), fontSize:11, fontWeight:"700" }}>{tc("notApplicableShort")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => openPremedPicker("evening")}
                  style={{ paddingHorizontal:10, paddingVertical:5, borderRadius:8, backgroundColor:shade("#1e3a5f"), borderWidth:1, borderColor:shade("#3b82f644") }}>
                  <Text style={{ color:shade("#93c5fd"), fontSize:11, fontWeight:"700" }}>{tc("premedAddFromLibrary")}</Text>
                </TouchableOpacity>
              </View>
            </View>
            {isPremedicationAsOrdered(premedEveningText, ordered?.DAY_BEFORE) ? <AsOrdered phase="evening" onEdit={() => openPremedPicker("evening")} tc={tc} /> : null}
            {items.length > 0 ? (
              <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
                {items.map(item => (
                  <View key={item} style={{ flexDirection:"row", alignItems:"center", gap:6, paddingHorizontal:10, paddingVertical:6, borderRadius:999, backgroundColor:shade("#1e3a5f22"), borderWidth:1, borderColor:shade("#3b82f655") }}>
                    <Text style={{ color:shade("#93c5fd"), fontSize:12, fontWeight:"600" }}>{displayOptionEntry("PREMED_DRUG", item, language)}</Text>
                    <TouchableOpacity onPress={() => {
                      const next = items.filter(i => i !== item).join("; ")
                      setPremedEveningText(next)
                      setTimeout(() => savePremedication({ evening: next }), 100)
                    }} hitSlop={6}>
                      <Text style={{ color:shade("#64748b"), fontSize:14, fontWeight:"700" }}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ color:shade("#475569"), fontSize:12, fontStyle:"italic" }}>{tc("premedNotSet")}</Text>
            )}
          </View>
        )
      })()}

      {/* ── Morning ─────────────────────────────────────────── */}
      {(() => {
        const items = premedMorningText ? premedMorningText.split(";").map(s => s.trim()).filter(Boolean) : []
        return (
          <View>
            <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <Text style={{ color:shade("#64748b"), fontSize:11, fontWeight:"700", textTransform:"uppercase", letterSpacing:0.8 }}>{tc("premedMorning")}</Text>
              <View style={{ flexDirection:"row", gap:8 }}>
                <TouchableOpacity
                  onPress={() => { const next = "N/A"; setPremedMorningText(next); setTimeout(() => savePremedication({ morning: next }), 100) }}
                  style={{ paddingHorizontal:10, paddingVertical:5, borderRadius:8, backgroundColor:shade("#1e2d40"), borderWidth:1, borderColor:shade("#2a3a50") }}>
                  <Text style={{ color:shade("#64748b"), fontSize:11, fontWeight:"700" }}>{tc("notApplicableShort")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => openPremedPicker("morning")}
                  style={{ paddingHorizontal:10, paddingVertical:5, borderRadius:8, backgroundColor:shade("#1e3a5f"), borderWidth:1, borderColor:shade("#3b82f644") }}>
                  <Text style={{ color:shade("#93c5fd"), fontSize:11, fontWeight:"700" }}>{tc("premedAddFromLibrary")}</Text>
                </TouchableOpacity>
              </View>
            </View>
            {isPremedicationAsOrdered(premedMorningText, ordered?.MORNING) ? <AsOrdered phase="morning" onEdit={() => openPremedPicker("morning")} tc={tc} /> : null}
            {items.length > 0 ? (
              <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8 }}>
                {items.map(item => (
                  <View key={item} style={{ flexDirection:"row", alignItems:"center", gap:6, paddingHorizontal:10, paddingVertical:6, borderRadius:999, backgroundColor:shade("#1e3a5f22"), borderWidth:1, borderColor:shade("#3b82f655") }}>
                    <Text style={{ color:shade("#93c5fd"), fontSize:12, fontWeight:"600" }}>{displayOptionEntry("PREMED_DRUG", item, language)}</Text>
                    <TouchableOpacity onPress={() => {
                      const next = items.filter(i => i !== item).join("; ")
                      setPremedMorningText(next)
                      setTimeout(() => savePremedication({ morning: next }), 100)
                    }} hitSlop={6}>
                      <Text style={{ color:shade("#64748b"), fontSize:14, fontWeight:"700" }}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ color:shade("#475569"), fontSize:12, fontStyle:"italic" }}>{tc("premedNotSet")}</Text>
            )}
          </View>
        )
      })()}
    </ScrollView>
  )
}

/** The phase still holds what the preop visit ordered: say so, with an edit button beside it. */
function AsOrdered({ phase, onEdit, tc }: { phase: "evening" | "morning"; onEdit: () => void; tc: (key: ClinicalStringKey) => string }) {
  const shade = useShade()
  return (
    <View testID={`premed-as-ordered-${phase}`} style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between", gap:8, marginBottom:10 }}>
      <Text style={{ flex:1, color:shade("#34d399"), fontSize:12, fontWeight:"700" }}>{tc("premedAsOrdered")}</Text>
      <TouchableOpacity testID={`premed-edit-ordered-${phase}`} onPress={onEdit} hitSlop={8}
        style={{ paddingHorizontal:12, paddingVertical:7, borderRadius:8, borderWidth:1, borderColor:shade("#3b82f655"), backgroundColor:shade("#1e3a5f") }}>
        <Text style={{ color:shade("#93c5fd"), fontSize:12, fontWeight:"800" }}>✎ {tc("premedEditOrdered")}</Text>
      </TouchableOpacity>
    </View>
  )
}
