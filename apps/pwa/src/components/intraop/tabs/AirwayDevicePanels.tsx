import type { RefObject } from "react"
import { View, Text, ScrollView, TouchableOpacity } from "react-native"
import * as Haptics from "expo-haptics"
import { AIRWAY_HAS_SUBOPTIONS } from "@/lib/airway-ventilation"
import { usePreferences } from "@/lib/preferences-context"
import { displayClinicalCode } from "@/lib/clinical-display"
import {
  DLT_SIDES,
  DLT_SIZES,
  DLT_TYPES,
  ENDOBRONCHIAL_SIZES,
  ETT_SIZES,
  LMA_SIZES as CORE_LMA_SIZES,
  airwayDeviceSummary,
} from "@lospor/core/intraop"

type Opt = { code: string; label: string }

// 2 to 10, in 0.5 steps — Oral ETT / Nasal ETT tube size range
const TUBE_SIZES = ETT_SIZES.map(String)
// Real-world LMA sizes — not a continuous half-step scale (no 3.5 or 4.5)
const LMA_SIZES = CORE_LMA_SIZES.map(String)

/**
 * Split out of AirwayTab: the device picker and its five sub-option panels
 * (LMA / Oral ETT / Nasal ETT / Double Lumen Tube / Endobronchial Tube) —
 * self-contained, so the device-clearing and expand/collapse rules it owns
 * moved with it rather than staying behind in the parent.
 */
export function AirwayDevicePanels({
  awDevices, setAwDevices,
  awLmaSize, setAwLmaSize, awOralTubeSize, setAwOralTubeSize, awOralCuffed, setAwOralCuffed,
  awNasalTubeSize, setAwNasalTubeSize, awNasalCuffed, setAwNasalCuffed,
  awDltType, setAwDltType, awDltSide, setAwDltSide, awDltSize, setAwDltSize,
  awEbSize, setAwEbSize,
  awExpandedDevice, setAwExpandedDevice, awExpandedWasComplete,
  airwayDevices,
}: {
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
  awExpandedDevice: string | null
  setAwExpandedDevice: (v: string | null) => void
  awExpandedWasComplete: RefObject<boolean>
  airwayDevices: Opt[]
}) {
  const { tc, language } = usePreferences()
  // Composition is core's; the words are this app's. Cuffing now resolves
  // through the shared clinical vocabulary, as web already did -- the two used
  // to be able to print different words for the same tube.
  const deviceName = (code: string) => airwayDevices.find(device => device.code === code)?.label ?? code
  const deviceWords = {
    device: deviceName,
    attribute: (code: string) => displayClinicalCode("clinicalAttribute", code, language),
  }
  const airwayFields = {
    lmaSize: awLmaSize, oralTubeSize: awOralTubeSize, oralCuffed: awOralCuffed,
    nasalTubeSize: awNasalTubeSize, nasalCuffed: awNasalCuffed,
    dltType: awDltType, dltSide: awDltSide, dltSize: awDltSize, endobronchialSize: awEbSize,
  }
  const deviceSummary: Record<string, string | null> = Object.fromEntries(
    AIRWAY_HAS_SUBOPTIONS.map(code => [code, airwayDeviceSummary(code, airwayFields, deviceWords)]),
  )
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
}
