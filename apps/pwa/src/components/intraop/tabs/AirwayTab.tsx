import type { RefObject } from "react"
import { View, Text, ScrollView, TouchableOpacity, TextInput } from "react-native"
import { CL_GRADES } from "@/lib/airway-ventilation"
import { usePreferences } from "@/lib/preferences-context"
import { airwayAbsentReason } from "@lospor/core/intraop"
import { AirwayDevicePanels } from "./AirwayDevicePanels"
import { VentilationModeSection } from "./VentilationModeSection"

type Opt = { code: string; label: string }

export function AirwayTab({
  awTools, setAwTools, awClGrade, setAwClGrade, awDevices, setAwDevices,
  awLmaSize, setAwLmaSize, awOralTubeSize, setAwOralTubeSize, awOralCuffed, setAwOralCuffed,
  awNasalTubeSize, setAwNasalTubeSize, awNasalCuffed, setAwNasalCuffed,
  awDltType, setAwDltType, awDltSide, setAwDltSide, awDltSize, setAwDltSize,
  awEbSize, setAwEbSize, awVentModes, setAwVentModes, awNotes, setAwNotes,
  awPresentsIntubated, setAwPresentsIntubated, awNotApplicable, setAwNotApplicable,
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
  awPresentsIntubated: boolean
  setAwPresentsIntubated: (updater: (prev: boolean) => boolean) => void
  awNotApplicable: boolean
  setAwNotApplicable: (updater: (prev: boolean) => boolean) => void
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
  const { tc } = usePreferences()

  return (
    <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>
      {/* Why there is no airway device of this team's own. First, because both
          answers change what the rest of this tab means, and finding that out
          after scrolling through tools and devices is the wrong order.
          Independent, not exclusive: a patient can arrive from the ICU already
          intubated AND have no airway intervention here, which is both of them
          at once. */}
      <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8, marginBottom:20 }}>
        {([
          { key: "presents", on: awPresentsIntubated, label: tc("awPresentsIntubated") },
          { key: "na", on: awNotApplicable, label: tc("awNotApplicable") },
        ] as const).map(option => (
          <TouchableOpacity
            key={option.key}
            onPress={() => {
              // The exclusivity rule lives in core, so web and mobile cannot
              // disagree about it the way they did when each had its own.
              const next = airwayAbsentReason(
                option.key === "presents" ? "presentsIntubated" : "airwayNotApplicable",
                { presentsIntubated: awPresentsIntubated, airwayNotApplicable: awNotApplicable },
              )
              setAwPresentsIntubated(() => next.presentsIntubated)
              setAwNotApplicable(() => next.airwayNotApplicable)
            }}
            style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:12,
              backgroundColor: option.on ? "#3f2d1a" : "#111111",
              borderWidth:1, borderColor: option.on ? "#f59e0b" : "#1e2d40" }}
          >
            <Text style={{ color: option.on ? "#fcd34d" : "#64748b", fontSize:12, fontWeight:"700" }}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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
      <AirwayDevicePanels
        awDevices={awDevices} setAwDevices={setAwDevices}
        awLmaSize={awLmaSize} setAwLmaSize={setAwLmaSize}
        awOralTubeSize={awOralTubeSize} setAwOralTubeSize={setAwOralTubeSize}
        awOralCuffed={awOralCuffed} setAwOralCuffed={setAwOralCuffed}
        awNasalTubeSize={awNasalTubeSize} setAwNasalTubeSize={setAwNasalTubeSize}
        awNasalCuffed={awNasalCuffed} setAwNasalCuffed={setAwNasalCuffed}
        awDltType={awDltType} setAwDltType={setAwDltType}
        awDltSide={awDltSide} setAwDltSide={setAwDltSide}
        awDltSize={awDltSize} setAwDltSize={setAwDltSize}
        awEbSize={awEbSize} setAwEbSize={setAwEbSize}
        awExpandedDevice={awExpandedDevice} setAwExpandedDevice={setAwExpandedDevice}
        awExpandedWasComplete={awExpandedWasComplete}
        airwayDevices={airwayDevices}
      />

      {/* Ventilation mode */}
      <VentilationModeSection
        awVentModes={awVentModes} setAwVentModes={setAwVentModes}
        awVentExpanded={awVentExpanded} setAwVentExpanded={setAwVentExpanded}
      />

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
