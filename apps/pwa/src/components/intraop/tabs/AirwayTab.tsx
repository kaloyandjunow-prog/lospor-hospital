import type { ReactNode, RefObject } from "react"
import { View, Text, TouchableOpacity, TextInput } from "react-native"
import { CL_GRADES } from "@/lib/airway-ventilation"
import { usePreferences } from "@/lib/preferences-context"
import { AirwayAbsentToggles } from "./AirwayAbsentToggles"
import { AirwayDevicePanels } from "./AirwayDevicePanels"
import { VentilationModeSection } from "./VentilationModeSection"
import { useIntraopHeaderScroll } from "../IntraopHeaderCollapse"
import { OverflowCueScrollView } from "../OverflowCueScrollView"

type Opt = { code: string; label: string }

export function AirwayTab({
  awTools, setAwTools, awClGrade, setAwClGrade, awDevices, setAwDevices,
  awLmaSize, setAwLmaSize, awOralTubeSize, setAwOralTubeSize, awOralCuffed, setAwOralCuffed,
  awNasalTubeSize, setAwNasalTubeSize, awNasalCuffed, setAwNasalCuffed,
  awDltType, setAwDltType, awDltSide, setAwDltSide, awDltSize, setAwDltSize,
  awEbSize, setAwEbSize, awVentModes, setAwVentModes, awNotes, setAwNotes,
  awPresentsIntubated, setAwPresentsIntubated, awNotApplicable, setAwNotApplicable,
  saveAirwaySection, awExpandedDevice, setAwExpandedDevice, awExpandedWasComplete,
  airwayTools, airwayDevices, awVentExpanded, setAwVentExpanded, smart, onAirwayInterventionSelected, onNoAirwayInterventionSelected,
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
  /** Smart selection (10.2.0): stands in for the tools and the device pills; the legacy tab is untouched. */
  smart?: ReactNode
  onAirwayInterventionSelected: () => void
  onNoAirwayInterventionSelected: () => void
}) {
  const { tc, shade } = usePreferences()
  const { onScroll, scrollEventThrottle } = useIntraopHeaderScroll()

  return (
    <OverflowCueScrollView style={{ flex:1 }} scrollViewStyle={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }} onScroll={onScroll} scrollEventThrottle={scrollEventThrottle}>
      <AirwayAbsentToggles
        presentsIntubated={awPresentsIntubated} setPresentsIntubated={setAwPresentsIntubated}
        notApplicable={awNotApplicable} setNotApplicable={setAwNotApplicable}
        hasRecordedAirway={awDevices.length > 0 || awTools.length > 0}
        onNoAirwayInterventionSelected={onNoAirwayInterventionSelected} />

      {smart}
      {smart ? null : (
        <>
      {/* Tools used */}
      <Text style={{ color:shade("#94a3b8"), fontSize:10, fontWeight:"700", letterSpacing:1.2,
        textTransform:"uppercase", marginBottom:10 }}>{tc("awToolsUsed")}</Text>
      <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8, marginBottom:20 }}>
        {airwayTools.map(tool => {
          const sel = awTools.includes(tool.code)
          return (
            <TouchableOpacity key={tool.code} onPress={() => {
              if (!sel) onAirwayInterventionSelected()
              setAwTools(prev => sel ? prev.filter(x => x !== tool.code) : [...prev, tool.code])
            }} style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:12,
              backgroundColor: sel ? shade("#1e3a5f") : shade("#111111"),
              borderWidth:1, borderColor: sel ? shade("#3b82f6") : shade("#1e2d40") }}>
              <Text style={{ color: sel ? shade("#93c5fd") : shade("#64748b"), fontSize:12, fontWeight:"700" }}>{tool.label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

        </>
      )}

      {/* Cormack-Lehane grade */}
      {(awTools.includes("DIRECT_LARY") || awTools.includes("VIDEO_LARY")) && (
        <>
          <Text style={{ color:shade("#94a3b8"), fontSize:10, fontWeight:"700", letterSpacing:1.2,
            textTransform:"uppercase", marginBottom:10 }}>{tc("awClGrade")}</Text>
          <View style={{ flexDirection:"row", gap:8, marginBottom:20 }}>
            {CL_GRADES.map(g => (
              <TouchableOpacity key={g.code} onPress={() => setAwClGrade(awClGrade === g.code ? "" : g.code)}
                style={{ flex:1, paddingVertical:12, borderRadius:10, alignItems:"center",
                  backgroundColor: awClGrade === g.code ? g.color + "33" : shade("#111111"),
                  borderWidth:2, borderColor: awClGrade === g.code ? g.color : shade("#1e2d40") }}>
                <Text style={{ color: awClGrade === g.code ? g.color : shade("#64748b"),
                  fontWeight:"800", fontSize:14 }}>{g.code}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {smart ? null : (
        <>
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
        airwayDevices={airwayDevices} onAirwayInterventionSelected={onAirwayInterventionSelected}
      />

        </>
      )}

      {/* Ventilation mode */}
      <VentilationModeSection
        awVentModes={awVentModes} setAwVentModes={setAwVentModes}
        awVentExpanded={awVentExpanded} setAwVentExpanded={setAwVentExpanded}
      />

      {/* Notes */}
      <Text style={{ color:shade("#94a3b8"), fontSize:10, fontWeight:"700", letterSpacing:1.2,
        textTransform:"uppercase", marginBottom:8 }}>{tc("notesLabel")}</Text>
      <TextInput
        style={{ backgroundColor:shade("#111111"), color:shade("#e2e8f0"), borderRadius:10, padding:12,
          fontSize:13, borderWidth:1, borderColor:shade("#2a3a4a"), minHeight:72, marginBottom:20 }}
        placeholder={tc("awNotesPlaceholder")}
        placeholderTextColor={shade("#475569")}
        multiline
        value={awNotes}
        onChangeText={setAwNotes}
        onBlur={saveAirwaySection}
      />

    </OverflowCueScrollView>
  )
}
