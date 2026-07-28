import { View, Text, ScrollView, TextInput, TouchableOpacity } from "react-native"
import type { RefObject } from "react"
import type { ClinicalStringKey } from "@/lib/preferences-context"
import type { IntraopTimingOverrides } from "@/lib/intraop-timing"

export function TimingTab({
  caseMonthYear, setCaseMonthYear, caseStartTime, setCaseStartTime, caseEndTime, setCaseEndTime,
  caseEndNextDay, setCaseEndNextDay, timingSaving, saveTiming, startRef, tc,
}: {
  caseMonthYear: string
  setCaseMonthYear: (v: string) => void
  caseStartTime: string
  setCaseStartTime: (v: string) => void
  caseEndTime: string
  setCaseEndTime: (v: string) => void
  caseEndNextDay: boolean
  setCaseEndNextDay: (updater: (v: boolean) => boolean) => void
  timingSaving: boolean
  saveTiming: (overrides?: IntraopTimingOverrides) => void
  startRef: RefObject<Date | null>
  tc: (key: ClinicalStringKey) => string
}) {
  // Compute duration from caseStartTime / caseEndTime strings (HH:MM)
  let durationStr = ""
  if (caseStartTime && caseEndTime) {
    const [sh, sm] = caseStartTime.split(":").map(Number)
    const [eh, em] = caseEndTime.split(":").map(Number)
    if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
      let mins = (eh * 60 + em) - (sh * 60 + sm)
      if (caseEndNextDay) mins += 24 * 60
      if (mins > 0) {
        const h = Math.floor(mins / 60); const m = mins % 60
        durationStr = h > 0 ? `${h}h ${m}m` : `${m}m`
      }
    }
  }
  const nowHHMM = `${String(new Date().getHours()).padStart(2,"0")}:${String(new Date().getMinutes()).padStart(2,"0")}`
  return (
    <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>

      {/* Month/Year */}
      <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
        textTransform:"uppercase", marginBottom:8 }}>{tc("caseMonthYear")}</Text>
      <TextInput
        style={{ backgroundColor:"#111111", color:"#f8fafc", borderRadius:10, padding:12,
          fontSize:16, borderWidth:1, borderColor:"#2a3a4a", marginBottom:18 }}
        placeholder="YYYY-MM  (e.g. 2026-05)"
        placeholderTextColor="#475569"
        value={caseMonthYear}
        onChangeText={setCaseMonthYear}
        onBlur={() => saveTiming()}
      />

      {/* Start time */}
      <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
        textTransform:"uppercase", marginBottom:8 }}>{tc("anesthesiaStartTime")}</Text>
      <View style={{ flexDirection:"row", gap:10, marginBottom:8 }}>
        {startRef.current ? (
          // Locked — once case has started the start time cannot be changed
          <View style={{ flex:1, backgroundColor:"#0a0f1a", borderRadius:10, padding:12,
            borderWidth:1, borderColor:"#1e2d40", alignItems:"center", flexDirection:"row", gap:8 }}>
            <Text style={{ flex:1, color:"#f8fafc", fontSize:22, fontWeight:"700",
              fontVariant:["tabular-nums"], textAlign:"center" }}>{caseStartTime}</Text>
            <Text style={{ color:"#475569", fontSize:10, fontWeight:"700" }}>{tc("timingLocked")}</Text>
          </View>
        ) : (
          <>
            <TextInput
              style={{ flex:1, minWidth:0, backgroundColor:"#111111", color:"#f8fafc", borderRadius:10, padding:12,
                fontSize:22, fontWeight:"700", borderWidth:1, borderColor:"#2a3a4a", textAlign:"center",
                fontVariant:["tabular-nums"] }}
              placeholder="08:00"
              placeholderTextColor="#475569"
              value={caseStartTime}
              onChangeText={setCaseStartTime}
              onBlur={() => saveTiming({ startTime: caseStartTime })}
            />
            <TouchableOpacity
              onPress={() => { setCaseStartTime(nowHHMM); saveTiming({ startTime: nowHHMM }) }}
              style={{ paddingHorizontal:14, paddingVertical:12, borderRadius:10,
                backgroundColor:"#1e3a5f", borderWidth:1, borderColor:"#3b82f644",
                justifyContent:"center" }}>
              <Text style={{ color:"#93c5fd", fontSize:12, fontWeight:"700" }}>{tc("timingNow")}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* End time */}
      <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
        textTransform:"uppercase", marginBottom:8 }}>{tc("anesthesiaEndTime")}</Text>
      <View style={{ flexDirection:"row", gap:10, marginBottom:8 }}>
        <TextInput
          style={{ flex:1, minWidth:0, backgroundColor:"#111111", color:"#f8fafc", borderRadius:10, padding:12,
            fontSize:22, fontWeight:"700", borderWidth:1, borderColor:"#2a3a4a", textAlign:"center",
            fontVariant:["tabular-nums"] }}
          placeholder="14:30"
          placeholderTextColor="#475569"
          value={caseEndTime}
          onChangeText={setCaseEndTime}
          onBlur={() => saveTiming({ endTime: caseEndTime })}
        />
        <TouchableOpacity
          onPress={() => {
            const nextDay = !!caseStartTime && nowHHMM < caseStartTime
            setCaseEndTime(nowHHMM)
            if (nextDay !== caseEndNextDay) setCaseEndNextDay(() => nextDay)
            saveTiming({ endTime: nowHHMM, endTimeNextDay: nextDay })
          }}
          style={{ paddingHorizontal:14, paddingVertical:12, borderRadius:10,
            backgroundColor:"#1e3a5f", borderWidth:1, borderColor:"#3b82f644",
            justifyContent:"center" }}>
          <Text style={{ color:"#93c5fd", fontSize:12, fontWeight:"700" }}>Now</Text>
        </TouchableOpacity>
      </View>

      {/* Next day toggle */}
      <TouchableOpacity
        onPress={() => {
          const nextDay = !caseEndNextDay
          setCaseEndNextDay(() => nextDay)
          saveTiming({ endTimeNextDay: nextDay })
        }}
        style={{ flexDirection:"row", alignItems:"center", gap:10, marginBottom:20,
          paddingHorizontal:14, paddingVertical:10, borderRadius:10,
          backgroundColor: caseEndNextDay ? "#1e3a5f" : "#111111",
          borderWidth:1, borderColor: caseEndNextDay ? "#3b82f6" : "#2a3a4a" }}>
        <View style={{ width:20, height:20, borderRadius:4,
          backgroundColor: caseEndNextDay ? "#3b82f6" : "transparent",
          borderWidth: caseEndNextDay ? 0 : 1.5, borderColor:"#475569",
          alignItems:"center", justifyContent:"center" }}>
          {caseEndNextDay && <Text style={{ color:"#fff", fontSize:11, fontWeight:"900" }}>✓</Text>}
        </View>
        <Text style={{ color: caseEndNextDay ? "#93c5fd" : "#64748b", fontSize:13, fontWeight:"600" }}>
          {tc("endTimeNextDay")}
        </Text>
      </TouchableOpacity>

      {/* Duration */}
      {durationStr ? (
        <View style={{ backgroundColor:"#0f1a2e", borderRadius:12, padding:14,
          borderWidth:1, borderColor:"#1e3a5f", alignItems:"center" }}>
          <Text style={{ color:"#64748b", fontSize:10, fontWeight:"700",
            textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>{tc("duration")}</Text>
          <Text style={{ color:"#93c5fd", fontSize:24, fontWeight:"700" }}>{durationStr}</Text>
        </View>
      ) : null}

      {timingSaving && (
        <Text style={{ color:"#64748b", fontSize:11, textAlign:"center", marginTop:12 }}>{tc("draftSaving")}</Text>
      )}
    </ScrollView>
  )
}
