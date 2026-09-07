import { View, Text, TouchableOpacity } from "react-native"
import { VENT_ASSISTED, VENT_CONTROLLED } from "@/lib/airway-ventilation"
import { usePreferences } from "@/lib/preferences-context"
import { displayClinicalCode } from "@/lib/clinical-display"

/** Split out of AirwayTab: the hierarchical ventilation-mode picker (spontaneous / assisted / controlled / jet, with expandable sub-modes) touches none of the airway-device state around it. */
export function VentilationModeSection({
  awVentModes, setAwVentModes, awVentExpanded, setAwVentExpanded,
}: {
  awVentModes: string[]
  setAwVentModes: (updater: (prev: string[]) => string[]) => void
  awVentExpanded: "assisted" | "controlled" | null
  setAwVentExpanded: (v: "assisted" | "controlled" | null) => void
}) {
  const { tc, language } = usePreferences()

  return (
    <>
      <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
        textTransform:"uppercase", marginBottom:10 }}>{tc("ventilationMode")}</Text>
      <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8, marginBottom:8 }}>
        {/* Spontaneous */}
        {(() => {
          const on = awVentModes.includes("Spontaneous")
          return (
            <TouchableOpacity onPress={() => setAwVentModes(prev => prev.includes("Spontaneous") ? prev.filter(m => m !== "Spontaneous") : [...prev, "Spontaneous"])}
              style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:12,
                backgroundColor: on ? "#0f2a1a" : "#111111",
                borderWidth:1, borderColor: on ? "#22c55e" : "#1e2d40" }}>
              <Text style={{ color: on ? "#86efac" : "#64748b", fontSize:12, fontWeight:"700" }}>{tc("ventSpontaneous")}</Text>
            </TouchableOpacity>
          )
        })()}
        {/* Assisted expander */}
        {(() => {
          const hasAny = VENT_ASSISTED.some(a => awVentModes.includes(a.v))
          const open = awVentExpanded === "assisted"
          return (
            <TouchableOpacity onPress={() => setAwVentExpanded(open ? null : "assisted")}
              style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:12,
                backgroundColor: hasAny || open ? "#0f2a1a" : "#111111",
                borderWidth:1, borderColor: hasAny || open ? "#22c55e" : "#1e2d40",
                flexDirection:"row", alignItems:"center", gap:4 }}>
              <Text style={{ color: hasAny || open ? "#86efac" : "#64748b", fontSize:12, fontWeight:"700" }}>{tc("ventAssisted")}</Text>
              <Text style={{ color:"#475569", fontSize:10 }}>{open ? "▲" : "▼"}</Text>
            </TouchableOpacity>
          )
        })()}
        {/* Controlled expander */}
        {(() => {
          const hasAny = VENT_CONTROLLED.some(c => awVentModes.includes(c.v))
          const open = awVentExpanded === "controlled"
          return (
            <TouchableOpacity onPress={() => setAwVentExpanded(open ? null : "controlled")}
              style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:12,
                backgroundColor: hasAny || open ? "#0f2a1a" : "#111111",
                borderWidth:1, borderColor: hasAny || open ? "#22c55e" : "#1e2d40",
                flexDirection:"row", alignItems:"center", gap:4 }}>
              <Text style={{ color: hasAny || open ? "#86efac" : "#64748b", fontSize:12, fontWeight:"700" }}>{tc("ventControlled")}</Text>
              <Text style={{ color:"#475569", fontSize:10 }}>{open ? "▲" : "▼"}</Text>
            </TouchableOpacity>
          )
        })()}
        {/* Jet ventilation */}
        {(() => {
          const on = awVentModes.includes("Jet")
          return (
            <TouchableOpacity onPress={() => setAwVentModes(prev => prev.includes("Jet") ? prev.filter(m => m !== "Jet") : [...prev, "Jet"])}
              style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:12,
                backgroundColor: on ? "#0f2a1a" : "#111111",
                borderWidth:1, borderColor: on ? "#22c55e" : "#1e2d40" }}>
              <Text style={{ color: on ? "#86efac" : "#64748b", fontSize:12, fontWeight:"700" }}>{tc("ventJet")}</Text>
            </TouchableOpacity>
          )
        })()}
      </View>
      {/* Assisted sub-modes */}
      {awVentExpanded === "assisted" && (
        <View style={{ flexDirection:"row", flexWrap:"wrap", gap:6, marginBottom:8,
          paddingLeft:10, borderLeftWidth:2, borderLeftColor:"#1e3a5f" }}>
          {VENT_ASSISTED.map(({ v, label }) => {
            const on = awVentModes.includes(v)
            return (
              <TouchableOpacity key={v} onPress={() => setAwVentModes(prev => {
                if (prev.includes(v)) return prev.filter(m => m !== v)
                const controlled = new Set(VENT_CONTROLLED.map(mode => mode.v))
                return [...prev.filter(m => !controlled.has(m)), v]
              })}
                style={{ paddingHorizontal:12, paddingVertical:7, borderRadius:10,
                  backgroundColor: on ? "#0f2a1a" : "#111111",
                  borderWidth:1, borderColor: on ? "#22c55e" : "#1e2d40" }}>
                <Text style={{ color: on ? "#86efac" : "#64748b", fontSize:11, fontWeight:"700" }}>{displayClinicalCode("ventilationMode", v, language, { label })}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      )}
      {/* Controlled sub-modes */}
      {awVentExpanded === "controlled" && (
        <View style={{ flexDirection:"row", flexWrap:"wrap", gap:6, marginBottom:8,
          paddingLeft:10, borderLeftWidth:2, borderLeftColor:"#1e3a5f" }}>
          {VENT_CONTROLLED.map(({ v, label }) => {
            const on = awVentModes.includes(v)
            return (
              <TouchableOpacity key={v} onPress={() => setAwVentModes(prev => {
                if (prev.includes(v)) return prev.filter(m => m !== v)
                const assisted = new Set(VENT_ASSISTED.map(mode => mode.v))
                return [...prev.filter(m => !assisted.has(m)), v]
              })}
                style={{ paddingHorizontal:12, paddingVertical:7, borderRadius:10,
                  backgroundColor: on ? "#0f2a1a" : "#111111",
                  borderWidth:1, borderColor: on ? "#22c55e" : "#1e2d40" }}>
                <Text style={{ color: on ? "#86efac" : "#64748b", fontSize:11, fontWeight:"700" }}>{displayClinicalCode("ventilationMode", v, language, { label })}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      )}
      <View style={{ marginBottom:20 }} />
    </>
  )
}
