import type { RefObject } from "react"
import { View, Text, ScrollView, TouchableOpacity, TextInput } from "react-native"
import * as Haptics from "expo-haptics"
import { CL_GRADES, AIRWAY_HAS_SUBOPTIONS, VENT_ASSISTED, VENT_CONTROLLED } from "@/lib/airway-ventilation"
import { usePreferences } from "@/lib/preferences-context"
import { displayClinicalCode } from "@/lib/clinical-display"
import {
  DLT_SIDES,
  DLT_SIZES,
  DLT_TYPES,
  ENDOBRONCHIAL_SIZES,
  ETT_SIZES,
  LMA_SIZES as CORE_LMA_SIZES,
} from "@lospor/core/intraop"

type Opt = { code: string; label: string }

// 2 to 10, in 0.5 steps — Oral ETT / Nasal ETT tube size range
const TUBE_SIZES = ETT_SIZES.map(String)
// Real-world LMA sizes — not a continuous half-step scale (no 3.5 or 4.5)
const LMA_SIZES = CORE_LMA_SIZES.map(String)

export function AirwayTab({
  awTools, setAwTools, awClGrade, setAwClGrade, awDevices, setAwDevices,
  awLmaSize, setAwLmaSize, awOralTubeSize, setAwOralTubeSize, awOralCuffed, setAwOralCuffed,
  awNasalTubeSize, setAwNasalTubeSize, awNasalCuffed, setAwNasalCuffed,
  awDltType, setAwDltType, awDltSide, setAwDltSide, awDltSize, setAwDltSize,
  awEbSize, setAwEbSize, awVentModes, setAwVentModes, awNotes, setAwNotes,
  saveAirwaySection, awExpandedDevice, setAwExpandedDevice, awExpandedWasComplete,
  airwayTools, airwayDevices, awVentExpanded, setAwVentExpanded,
}: {
  awTools: string[]
  setAwTools: (updater: (prev: string[]) => string[]) => void
  awClGrade: string
  setAwClGrade: (v: string) => void
  awDevices: string[]
  setAwDevices: (updater: (prev: string[]) => string[]) => void
  awLmaSize: string | null
  setAwLmaSize: (v: string | null) => void
  awOralTubeSize: string | null
  setAwOralTubeSize: (v: string | null) => void
  awOralCuffed: boolean | null
  setAwOralCuffed: (v: boolean | null) => void
  awNasalTubeSize: string | null
  setAwNasalTubeSize: (v: string | null) => void
  awNasalCuffed: boolean | null
  setAwNasalCuffed: (v: boolean | null) => void
  awDltType: string | null
  setAwDltType: (v: "Carlens" | "Robertshaw" | null) => void
  awDltSide: string | null
  setAwDltSide: (v: "Left" | "Right" | null) => void
  awDltSize: number | null
  setAwDltSize: (v: number | null) => void
  awEbSize: number | null
  setAwEbSize: (v: number | null) => void
  awVentModes: string[]
  setAwVentModes: (updater: (prev: string[]) => string[]) => void
  awNotes: string
  setAwNotes: (v: string) => void
  saveAirwaySection: () => void
  awExpandedDevice: string | null
  setAwExpandedDevice: (v: string | null) => void
  awExpandedWasComplete: RefObject<boolean>
  airwayTools: Opt[]
  airwayDevices: Opt[]
  awVentExpanded: "assisted" | "controlled" | null
  setAwVentExpanded: (v: "assisted" | "controlled" | null) => void
}) {
  const { tc, language } = usePreferences()
  const deviceName = (code: string) => airwayDevices.find(device => device.code === code)?.label ?? code
  const deviceSummary: Record<string, string | null> = {
    LMA:               awLmaSize ? `${deviceName("LMA")} ${awLmaSize}` : null,
    ORAL_ETT:          awOralTubeSize && awOralCuffed != null ? `${deviceName("ORAL_ETT")} ${awOralTubeSize} ${awOralCuffed ? tc("awCuffed") : tc("awUncuffed")}` : null,
    NASAL_ETT:         awNasalTubeSize && awNasalCuffed != null ? `${deviceName("NASAL_ETT")} ${awNasalTubeSize} ${awNasalCuffed ? tc("awCuffed") : tc("awUncuffed")}` : null,
    DOUBLE_LUMEN_TUBE: (awDltType || awDltSide || awDltSize) ? `${deviceName("DOUBLE_LUMEN_TUBE")}${awDltType ? " "+awDltType : ""}${awDltSide ? " "+displayClinicalCode("clinicalAttribute", awDltSide.toLowerCase(), language) : ""}${awDltSize ? " "+awDltSize+"Fr" : ""}` : null,
    ENDOBRONCHIAL_TUBE:awEbSize ? `${deviceName("ENDOBRONCHIAL_TUBE")} ${awEbSize}mm` : null,
  }
  function clearDeviceFields(code: string) {
    switch (code) {
      case "LMA": setAwLmaSize(null); break
      case "ORAL_ETT": setAwOralTubeSize(null); setAwOralCuffed(null); break
      case "NASAL_ETT": setAwNasalTubeSize(null); setAwNasalCuffed(null); break
      case "DOUBLE_LUMEN_TUBE": setAwDltType(null); setAwDltSide(null); setAwDltSize(null); break
      case "ENDOBRONCHIAL_TUBE": setAwEbSize(null); break
    }
  }

  // Reopening an already-added device is a re-edit: clear its sub-fields so the
  // panel opens with everything deselected and the user re-picks from scratch,
  // exactly like first-time entry (the normal incomplete→complete→auto-collapse
  // flow then runs again). Previously we kept the old values and set a
  // "wasComplete" flag to suppress the auto-collapse — but that flag was never
  // reset, so after a re-edit the panel could never collapse again and the
  // device was effectively impossible to edit.
  function expandDevice(code: string) {
    if (awDevices.includes(code)) clearDeviceFields(code)
    awExpandedWasComplete.current = false
    setAwExpandedDevice(code)
  }

  // Long-press to remove — mirrors web's right-click-to-remove, since these devices
  // don't toggle off on tap once confirmed (tap re-opens them for editing instead).
  function removeDevice(code: string) {
    setAwDevices(prev => prev.filter(d => d !== code))
    if (awExpandedDevice === code) setAwExpandedDevice(null)
    clearDeviceFields(code)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
  }

  return (
    <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>
      {/* Tools used */}
      <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
        textTransform:"uppercase", marginBottom:10 }}>{tc("awToolsUsed")}</Text>
      <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8, marginBottom:20 }}>
        {airwayTools.map(tool => {
          const sel = awTools.includes(tool.code)
          return (
            <TouchableOpacity key={tool.code} onPress={() => {
              setAwTools(prev => sel ? prev.filter(x => x !== tool.code) : [...prev, tool.code])
            }} style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:12,
              backgroundColor: sel ? "#1e3a5f" : "#111111",
              borderWidth:1, borderColor: sel ? "#3b82f6" : "#1e2d40" }}>
              <Text style={{ color: sel ? "#93c5fd" : "#64748b", fontSize:12, fontWeight:"700" }}>{tool.label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Cormack-Lehane grade */}
      {(awTools.includes("DIRECT_LARY") || awTools.includes("VIDEO_LARY")) && (
        <>
          <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
            textTransform:"uppercase", marginBottom:10 }}>{tc("awClGrade")}</Text>
          <View style={{ flexDirection:"row", gap:8, marginBottom:20 }}>
            {CL_GRADES.map(g => (
              <TouchableOpacity key={g.code} onPress={() => setAwClGrade(awClGrade === g.code ? "" : g.code)}
                style={{ flex:1, paddingVertical:12, borderRadius:10, alignItems:"center",
                  backgroundColor: awClGrade === g.code ? g.color + "33" : "#111111",
                  borderWidth:2, borderColor: awClGrade === g.code ? g.color : "#1e2d40" }}>
                <Text style={{ color: awClGrade === g.code ? g.color : "#64748b",
                  fontWeight:"800", fontSize:14 }}>{g.code}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Airway devices */}
      {(() => {
        return (
          <>
            <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
              textTransform:"uppercase", marginBottom:10 }}>{tc("awDeviceUsed")}</Text>
            <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8, marginBottom:12 }}>
              {airwayDevices.map(dev => {
                const hasSub = AIRWAY_HAS_SUBOPTIONS.includes(dev.code)
                if (!hasSub) {
                  const sel = awDevices.includes(dev.code)
                  return (
                    <TouchableOpacity key={dev.code} onPress={() => {
                      setAwDevices(prev => sel ? prev.filter(x => x !== dev.code) : [...prev, dev.code])
                    }} style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:12,
                      backgroundColor: sel ? "#1e3a5f" : "#111111",
                      borderWidth:1, borderColor: sel ? "#3b82f6" : "#1e2d40" }}>
                      <Text style={{ color: sel ? "#93c5fd" : "#64748b", fontSize:12, fontWeight:"700" }}>{dev.label}</Text>
                    </TouchableOpacity>
                  )
                }
                const confirmed = awDevices.includes(dev.code)
                const summary = confirmed ? deviceSummary[dev.code] : null
                const isExpanded = awExpandedDevice === dev.code
                const inProgress = !confirmed && isExpanded
                const btnLabel = summary && !isExpanded ? summary : (inProgress ? `${dev.label}…` : dev.label)
                return (
                  <TouchableOpacity key={dev.code}
                    onPress={() => isExpanded ? setAwExpandedDevice(null) : expandDevice(dev.code)}
                    onLongPress={() => removeDevice(dev.code)}
                    style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:12,
                      backgroundColor: confirmed ? (summary && !isExpanded ? "#1a2e5a" : "#1e3a5f") : (inProgress ? "#0d1a2d" : "#111111"),
                      borderWidth:1, borderStyle: inProgress ? "dashed" : "solid",
                      borderColor: confirmed ? "#3b82f6" : (inProgress ? "#3b82f699" : "#1e2d40") }}>
                    <Text style={{ color: confirmed ? "#93c5fd" : (inProgress ? "#60a5fa" : "#64748b"), fontSize:12, fontWeight:"700" }}>{btnLabel}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* Sub-option panel — LMA */}
            {awExpandedDevice === "LMA" && (
              <View style={{ backgroundColor:"#0d1a2d", borderRadius:12, borderWidth:1,
                borderColor:"#1e3a5f", padding:12, marginBottom:12 }}>
                <Text style={{ color:"#93c5fd", fontSize:12, fontWeight:"700", marginBottom:10 }}>{deviceName("LMA")}</Text>
                <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase",
                  letterSpacing:1, marginBottom:6 }}>{tc("awSize")}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection:"row", gap:6 }}>
                    {LMA_SIZES.map(s => (
                      <TouchableOpacity key={s} onPress={() => setAwLmaSize(awLmaSize === s ? null : s)}
                        style={{ paddingHorizontal:14, paddingVertical:8, borderRadius:8,
                          backgroundColor: awLmaSize === s ? "#3b82f6" : "#1e2d40",
                          borderWidth:1, borderColor:"#3b82f644" }}>
                        <Text style={{ color: awLmaSize === s ? "#fff" : "#93c5fd", fontWeight:"700", fontSize:13 }}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Sub-option panel — Oral ETT */}
            {awExpandedDevice === "ORAL_ETT" && (
              <View style={{ backgroundColor:"#0d1a2d", borderRadius:12, borderWidth:1,
                borderColor:"#1e3a5f", padding:12, marginBottom:12 }}>
                <Text style={{ color:"#93c5fd", fontSize:12, fontWeight:"700", marginBottom:10 }}>{deviceName("ORAL_ETT")}</Text>
                <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase",
                  letterSpacing:1, marginBottom:6 }}>{tc("awTubeSizeMmId")}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:10 }}>
                  <View style={{ flexDirection:"row", gap:6 }}>
                    {TUBE_SIZES.map(s => (
                      <TouchableOpacity key={s} onPress={() => setAwOralTubeSize(awOralTubeSize === s ? null : s)}
                        style={{ paddingHorizontal:14, paddingVertical:8, borderRadius:8,
                          backgroundColor: awOralTubeSize === s ? "#3b82f6" : "#1e2d40",
                          borderWidth:1, borderColor:"#3b82f644" }}>
                        <Text style={{ color: awOralTubeSize === s ? "#fff" : "#93c5fd", fontWeight:"700", fontSize:13 }}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase",
                  letterSpacing:1, marginBottom:6 }}>{tc("awCuff")}</Text>
                <View style={{ flexDirection:"row", gap:8 }}>
                  {[{ v:true, label:tc("awCuffed") },{ v:false, label:tc("awUncuffed") }].map(opt => (
                    <TouchableOpacity key={String(opt.v)} onPress={() => setAwOralCuffed(awOralCuffed === opt.v ? null : opt.v)}
                      style={{ flex:1, paddingVertical:9, borderRadius:8, alignItems:"center",
                        backgroundColor: awOralCuffed === opt.v ? "#1e3a5f" : "#0a0f1a",
                        borderWidth:1, borderColor:"#2a3a4a" }}>
                      <Text style={{ color: awOralCuffed === opt.v ? "#93c5fd" : "#64748b",
                        fontWeight:"700", fontSize:12 }}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Sub-option panel — Nasal ETT */}
            {awExpandedDevice === "NASAL_ETT" && (
              <View style={{ backgroundColor:"#0d1a2d", borderRadius:12, borderWidth:1,
                borderColor:"#1e3a5f", padding:12, marginBottom:12 }}>
                <Text style={{ color:"#93c5fd", fontSize:12, fontWeight:"700", marginBottom:10 }}>{deviceName("NASAL_ETT")}</Text>
                <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase",
                  letterSpacing:1, marginBottom:6 }}>{tc("awTubeSizeMmId")}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:10 }}>
                  <View style={{ flexDirection:"row", gap:6 }}>
                    {TUBE_SIZES.map(s => (
                      <TouchableOpacity key={s} onPress={() => setAwNasalTubeSize(awNasalTubeSize === s ? null : s)}
                        style={{ paddingHorizontal:14, paddingVertical:8, borderRadius:8,
                          backgroundColor: awNasalTubeSize === s ? "#3b82f6" : "#1e2d40",
                          borderWidth:1, borderColor:"#3b82f644" }}>
                        <Text style={{ color: awNasalTubeSize === s ? "#fff" : "#93c5fd", fontWeight:"700", fontSize:13 }}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase",
                  letterSpacing:1, marginBottom:6 }}>{tc("awCuff")}</Text>
                <View style={{ flexDirection:"row", gap:8 }}>
                  {[{ v:true, label:tc("awCuffed") },{ v:false, label:tc("awUncuffed") }].map(opt => (
                    <TouchableOpacity key={String(opt.v)} onPress={() => setAwNasalCuffed(awNasalCuffed === opt.v ? null : opt.v)}
                      style={{ flex:1, paddingVertical:9, borderRadius:8, alignItems:"center",
                        backgroundColor: awNasalCuffed === opt.v ? "#1e3a5f" : "#0a0f1a",
                        borderWidth:1, borderColor:"#2a3a4a" }}>
                      <Text style={{ color: awNasalCuffed === opt.v ? "#93c5fd" : "#64748b",
                        fontWeight:"700", fontSize:12 }}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Sub-option panel — Double Lumen Tube */}
            {awExpandedDevice === "DOUBLE_LUMEN_TUBE" && (
              <View style={{ backgroundColor:"#0d1a2d", borderRadius:12, borderWidth:1,
                borderColor:"#1e3a5f", padding:12, marginBottom:12 }}>
                <Text style={{ color:"#93c5fd", fontSize:12, fontWeight:"700", marginBottom:10 }}>{deviceName("DOUBLE_LUMEN_TUBE")}</Text>
                <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>{tc("awDltType")}</Text>
                <View style={{ flexDirection:"row", gap:8, marginBottom:10 }}>
                  {DLT_TYPES.map(t => (
                    <TouchableOpacity key={t} onPress={() => setAwDltType(awDltType === t ? null : t)}
                      style={{ flex:1, paddingVertical:9, borderRadius:8, alignItems:"center",
                        backgroundColor: awDltType === t ? "#1e3a5f" : "#0a0f1a",
                        borderWidth:1, borderColor:"#2a3a4a" }}>
                      <Text style={{ color: awDltType === t ? "#93c5fd" : "#64748b", fontWeight:"700", fontSize:12 }}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>{tc("awDltSide")}</Text>
                <View style={{ flexDirection:"row", gap:8, marginBottom:10 }}>
                  {DLT_SIDES.map(s => (
                    <TouchableOpacity key={s} onPress={() => setAwDltSide(awDltSide === s ? null : s)}
                      style={{ flex:1, paddingVertical:9, borderRadius:8, alignItems:"center",
                        backgroundColor: awDltSide === s ? "#1e3a5f" : "#0a0f1a",
                        borderWidth:1, borderColor:"#2a3a4a" }}>
                      <Text style={{ color: awDltSide === s ? "#93c5fd" : "#64748b", fontWeight:"700", fontSize:13 }}>{displayClinicalCode("clinicalAttribute", s.toLowerCase(), language, { label: s })}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>{tc("awSizeFr")}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection:"row", gap:6 }}>
                    {DLT_SIZES.map(sz => (
                      <TouchableOpacity key={sz} onPress={() => setAwDltSize(awDltSize === sz ? null : sz)}
                        style={{ paddingHorizontal:14, paddingVertical:8, borderRadius:8,
                          backgroundColor: awDltSize === sz ? "#3b82f6" : "#1e2d40",
                          borderWidth:1, borderColor:"#3b82f644" }}>
                        <Text style={{ color: awDltSize === sz ? "#fff" : "#93c5fd", fontWeight:"700", fontSize:13 }}>{sz}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Sub-option panel — Endobronchial Tube */}
            {awExpandedDevice === "ENDOBRONCHIAL_TUBE" && (
              <View style={{ backgroundColor:"#0d1a2d", borderRadius:12, borderWidth:1,
                borderColor:"#1e3a5f", padding:12, marginBottom:12 }}>
                <Text style={{ color:"#93c5fd", fontSize:12, fontWeight:"700", marginBottom:10 }}>{deviceName("ENDOBRONCHIAL_TUBE")}</Text>
                <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>{tc("awSizeMmId")}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection:"row", gap:6 }}>
                    {ENDOBRONCHIAL_SIZES.map(sz => (
                      <TouchableOpacity key={sz} onPress={() => setAwEbSize(awEbSize === sz ? null : sz)}
                        style={{ paddingHorizontal:14, paddingVertical:8, borderRadius:8,
                          backgroundColor: awEbSize === sz ? "#3b82f6" : "#1e2d40",
                          borderWidth:1, borderColor:"#3b82f644" }}>
                        <Text style={{ color: awEbSize === sz ? "#fff" : "#93c5fd", fontWeight:"700", fontSize:13 }}>{sz}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}
          </>
        )
      })()}

      {/* Ventilation mode — hierarchical */}
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

      {/* Notes */}
      <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
        textTransform:"uppercase", marginBottom:8 }}>{tc("notesLabel")}</Text>
      <TextInput
        style={{ backgroundColor:"#111111", color:"#e2e8f0", borderRadius:10, padding:12,
          fontSize:13, borderWidth:1, borderColor:"#2a3a4a", minHeight:72, marginBottom:20 }}
        placeholder={tc("awNotesPlaceholder")}
        placeholderTextColor="#475569"
        multiline
        value={awNotes}
        onChangeText={setAwNotes}
        onBlur={saveAirwaySection}
      />

    </ScrollView>
  )
}
