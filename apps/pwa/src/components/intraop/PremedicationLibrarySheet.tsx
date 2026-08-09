import { Platform, Text, TextInput, TouchableOpacity, View } from "react-native"
import type { PremDrug } from "@/lib/intraop-types"
import type { PediatricPremedDrug } from "@/lib/pediatric-premedication-library"
import { Sheet } from "./Sheet"
import { displayClinicalCode } from "@/lib/clinical-display"
import { usePreferences } from "@/lib/preferences-context"

type PremedCategory = {
  category: string
  drugs: PremDrug[]
}

type Props = {
  visible: boolean
  phase: "evening" | "morning"
  categories: PremedCategory[]
  openCategory: string | null
  drug: PremDrug | null
  dose: string
  route: string
  backLabel: string
  onClose: () => void
  onToggleCategory: (category: string) => void
  onSelectDrug: (drug: PremDrug) => void
  onBackToLibrary: () => void
  onDoseChange: (value: string) => void
  onRouteChange: (value: string) => void
  onAdd: () => void
  pediatricMode?: boolean
}

function adjustDose(drug: PremDrug, dose: string, direction: -1 | 1): string {
  const current = parseFloat(dose) || drug.dose
  const next = current + direction * drug.step
  const bounded = direction < 0 ? Math.max(drug.min, next) : Math.min(drug.max, next)
  return String(Math.round(bounded * 1000) / 1000)
}

export function PremedicationLibrarySheet({
  visible,
  phase,
  categories,
  openCategory,
  drug,
  dose,
  route,
  backLabel,
  onClose,
  onToggleCategory,
  onSelectDrug,
  onBackToLibrary,
  onDoseChange,
  onRouteChange,
  onAdd,
  pediatricMode = false,
}: Props) {
  const { language, tc } = usePreferences()
  const drugLabel = (name: string) => displayClinicalCode("option:PREMED_DRUG", name, language, { label: name })
  const groupLabel = (name: string) => displayClinicalCode("optionGroup", name, language, { label: name })
  const pediatricAnnotation = drug ? (drug as PediatricPremedDrug).pediatric : undefined

  return (
    <Sheet visible={visible} onClose={onClose} title={`Premedication library - ${phase}`} full>
      {pediatricMode ? (
        <Text style={{ color:"#64748b", fontSize:11, lineHeight:16, marginBottom:12 }}>
          {tc("premedPediatricBasis")}
        </Text>
      ) : null}
      {!drug ? (
        <View>
          {categories.map(cat => {
            const open = openCategory === cat.category
            return (
              <View key={cat.category} style={{ marginBottom:6, borderRadius:10, overflow:"hidden",
                borderWidth:1, borderColor:"#1e2d40" }}>
                <TouchableOpacity
                  onPress={() => onToggleCategory(cat.category)}
                  style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center",
                    paddingHorizontal:14, paddingVertical:12, backgroundColor:"#111820" }}>
                  <Text style={{ color:"#cbd5e1", fontSize:13, fontWeight:"700" }}>{groupLabel(cat.category)}</Text>
                  <Text style={{ color:"#64748b" }}>{open ? "^" : "v"}</Text>
                </TouchableOpacity>
                {open && (
                  <View style={{ paddingHorizontal:12, paddingBottom:10, paddingTop:4,
                    backgroundColor:"#0d1520", flexDirection:"row", flexWrap:"wrap", gap:8 }}>
                    {cat.drugs.map(item => {
                      const annotation = (item as PediatricPremedDrug).pediatric
                      const withheld = annotation?.kind === "withheld"
                      return (
                        <TouchableOpacity key={item.name}
                          disabled={withheld}
                          onPress={() => onSelectDrug(item)}
                          style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:9,
                            opacity: withheld ? 0.55 : 1,
                            backgroundColor: withheld ? "#241a1a" : "#1e2d40",
                            borderWidth:1, borderColor: withheld ? "#7c2d12" : "#2a3a50" }}>
                          <Text style={{ color: withheld ? "#fca5a5" : "#93c5fd", fontSize:12, fontWeight:"700" }}>
                            {drugLabel(item.name)}
                          </Text>
                          {/* A withheld drug shows why instead of a dose, and a
                              drug with no calculable dose says so rather than
                              displaying a bare 0. */}
                          <Text style={{ color: withheld ? "#f87171" : "#64748b", fontSize:10, marginTop:2 }}>
                            {annotation && annotation.kind !== "calculated"
                              ? annotation.reason
                              : `${item.dose} ${item.unit}`}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                )}
              </View>
            )
          })}
        </View>
      ) : (
        <View style={{ gap:14 }}>
          <TouchableOpacity onPress={onBackToLibrary}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>{backLabel}</Text>
          </TouchableOpacity>
          <Text style={{ color:"#f8fafc", fontSize:16, fontWeight:"700" }}>{drugLabel(drug.name)}</Text>

          <View>
            <Text style={{ color:"#64748b", fontSize:11, fontWeight:"700", textTransform:"uppercase",
              letterSpacing:1, marginBottom:8 }}>Dose ({drug.unit})</Text>
            <View style={{ flexDirection:"row", alignItems:"center", gap:8 }}>
              <TouchableOpacity
                onPress={() => onDoseChange(adjustDose(drug, dose, -1))}
                style={{ width:44, height:44, borderRadius:10, backgroundColor:"#1e2d40", alignItems:"center", justifyContent:"center", borderWidth:1, borderColor:"#2a3a50" }}>
                <Text style={{ color:"#93c5fd", fontSize: Platform.OS === "web" ? 18 : 22, fontWeight:"700" }}>-</Text>
              </TouchableOpacity>
              <TextInput
                style={{ flex:1, minWidth:0, backgroundColor:"#111111", color:"#fff", borderRadius:10,
                  padding: Platform.OS === "web" ? 9 : 12,
                  fontSize: Platform.OS === "web" ? 18 : 22,
                  borderWidth:1, borderColor:"#3e3e3e", textAlign:"center" }}
                keyboardType="decimal-pad"
                value={dose}
                onChangeText={onDoseChange}
              />
              <TouchableOpacity
                onPress={() => onDoseChange(adjustDose(drug, dose, 1))}
                style={{ width:44, height:44, borderRadius:10, backgroundColor:"#1e2d40", alignItems:"center", justifyContent:"center", borderWidth:1, borderColor:"#2a3a50" }}>
                <Text style={{ color:"#93c5fd", fontSize: Platform.OS === "web" ? 18 : 22, fontWeight:"700" }}>+</Text>
              </TouchableOpacity>
            </View>
            {!!drug.hint && <Text style={{ color:"#475569", fontSize:11, marginTop:6 }}>{drug.hint}</Text>}
            {/* The arithmetic behind the number, so it can be checked at a
                glance instead of taken on trust. */}
            {pediatricAnnotation?.kind === "calculated" && (
              <Text style={{ color:"#38bdf8", fontSize:11, marginTop:4 }}>
                {pediatricAnnotation.perKg} {pediatricAnnotation.unit}/kg × {pediatricAnnotation.weightUsedKg} kg
                {pediatricAnnotation.basis === "IBW" ? ` (${tc("premedIdealWeight")})` : ""}
                {pediatricAnnotation.capped ? ` — ${tc("premedCappedAt")} ${pediatricAnnotation.cap} ${pediatricAnnotation.unit}` : ""}
              </Text>
            )}
            {pediatricAnnotation && pediatricAnnotation.kind !== "calculated" && (
              <Text style={{ color:"#fbbf24", fontSize:11, marginTop:4 }}>{pediatricAnnotation.reason}</Text>
            )}
          </View>

          <View>
            <Text style={{ color:"#64748b", fontSize:11, fontWeight:"700", textTransform:"uppercase",
              letterSpacing:1, marginBottom:8 }}>Route</Text>
            <View style={{ flexDirection:"row", gap:8 }}>
              {drug.routes.map(item => (
                <TouchableOpacity key={item} onPress={() => onRouteChange(item)}
                  style={{ flex:1, paddingVertical:10, borderRadius:8, alignItems:"center",
                    backgroundColor: route === item ? "#1e3a5f" : "#111111",
                    borderWidth:1, borderColor: route === item ? "#3b82f6" : "#2a3a4a" }}>
                  <Text style={{ color: route === item ? "#93c5fd" : "#64748b",
                    fontWeight:"700", fontSize:13 }}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity
            onPress={onAdd}
            disabled={!dose}
            style={{ backgroundColor: dose ? "#1e3a5f" : "#111111", borderRadius:12,
              padding:16, alignItems:"center", borderWidth:1, borderColor:"#3b82f6" }}>
            <Text style={{ color:"#93c5fd", fontWeight:"700", fontSize:15 }}>
              Add to {phase}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </Sheet>
  )
}
