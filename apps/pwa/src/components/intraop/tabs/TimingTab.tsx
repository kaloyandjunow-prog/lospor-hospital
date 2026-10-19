import { View, Text, ScrollView, TextInput, TouchableOpacity } from "react-native"
import { useState, type RefObject } from "react"
import {
  daysBetweenDateKeys,
  durationMinutesBetween,
  earliestEndDateKey,
  formatDateKeyShort,
  isValidTimeZone,
  localDateKey,
  resolvedTimeZone,
  shiftDateKey,
} from "@lospor/core/intraop-time"
import { DayStepper } from "@/components/DayStepper"
import { usePreferences } from "@/lib/preferences-context"
import type { ClinicalStringKey } from "@/lib/preferences-context"
import type { IntraopTimingOverrides } from "@/lib/intraop-timing"
import { useShade } from "@/theme/shade"

export function TimingTab({
  caseStartTime, setCaseStartTime, caseEndTime, setCaseEndTime,
  caseEndNextDay, setCaseEndNextDay, timingSaving, saveTiming, startRef, endedAtRef, caseTimezone, tc,
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
  /** The stored end, to show its date. */
  endedAtRef?: RefObject<Date | null>
  caseTimezone?: string | null
  tc: (key: ClinicalStringKey) => string
}) {
  const shade = useShade()
  const { language } = usePreferences()
  // Dates in the case's zone. Left at "Today", a typed start keeps the old
  // rule (a time ahead of now means yesterday); a stepped date places it on
  // that date. The end follows the start, the next day when its clock time
  // is earlier, until the end's own stepper moves it.
  const zone = isValidTimeZone(caseTimezone) ? caseTimezone : resolvedTimeZone()
  const todayKey = (zone && localDateKey(new Date(), zone)) ?? new Date().toISOString().slice(0, 10)
  const [startDayKey, setStartDayKey] = useState(todayKey)
  const startKey = startRef.current && zone ? localDateKey(startRef.current, zone) : null
  const endKey = endedAtRef?.current && zone ? localDateKey(endedAtRef.current, zone) : null
  const formatDay = (key: string) => formatDateKeyShort(key, language === "bg" ? "bg" : "en") ?? key
  // Compute duration from caseStartTime / caseEndTime strings (HH:MM)
  let durationStr = ""
  const storedMinutes = startRef.current && endedAtRef?.current ? durationMinutesBetween(startRef.current, endedAtRef.current) : null
  if (storedMinutes != null && storedMinutes > 0) {
    const h = Math.floor(storedMinutes / 60); const m = storedMinutes % 60
    durationStr = h > 0 ? `${h} ${tc("hoursShort")} ${m} ${tc("minutesShort")}` : `${m} ${tc("minutesShort")}`
  } else if (caseStartTime && caseEndTime) {
    const [sh, sm] = caseStartTime.split(":").map(Number)
    const [eh, em] = caseEndTime.split(":").map(Number)
    if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
      let mins = (eh * 60 + em) - (sh * 60 + sm)
      if (caseEndNextDay) mins += 24 * 60
      if (mins > 0) {
        const h = Math.floor(mins / 60); const m = mins % 60
        durationStr = h > 0
          ? `${h} ${tc("hoursShort")} ${m} ${tc("minutesShort")}`
          : `${m} ${tc("minutesShort")}`
      }
    }
  }
  const nowHHMM = `${String(new Date().getHours()).padStart(2,"0")}:${String(new Date().getMinutes()).padStart(2,"0")}`
  return (
    <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>

      {/* Start time */}
      <Text style={{ color:shade("#94a3b8"), fontSize:10, fontWeight:"700", letterSpacing:1.2,
        textTransform:"uppercase", marginBottom:8 }}>{tc("anesthesiaStartTime")}</Text>
      {!startRef.current ? (
        <DayStepper value={startDayKey} onChange={setStartDayKey} todayKey={todayKey} min={shiftDateKey(todayKey, -14)} max={todayKey}
          language={language} label={tc("timingStartDate")} testID="intraop-start-day" />
      ) : null}
      <View style={{ flexDirection:"row", gap:10, marginBottom:8 }}>
        {startRef.current ? (
          // Locked — once case has started the start time cannot be changed
          <View style={{ flex:1, backgroundColor:shade("#0a0f1a"), borderRadius:10, padding:12,
            borderWidth:1, borderColor:shade("#1e2d40"), alignItems:"center", flexDirection:"row", gap:8 }}>
            <Text style={{ flex:1, color:shade("#f8fafc"), fontSize:22, fontWeight:"700",
              fontVariant:["tabular-nums"], textAlign:"center" }} testID="intraop-start-locked">{startKey ? `${formatDay(startKey)} · ` : ""}{caseStartTime}</Text>
            <Text style={{ color:shade("#475569"), fontSize:10, fontWeight:"700" }}>{tc("timingLocked")}</Text>
          </View>
        ) : (
          <>
            <TextInput
              style={{ flex:1, minWidth:0, backgroundColor:shade("#111111"), color:shade("#f8fafc"), borderRadius:10, padding:12,
                fontSize:22, fontWeight:"700", borderWidth:1, borderColor:shade("#2a3a4a"), textAlign:"center",
                fontVariant:["tabular-nums"] }}
              placeholder="08:00"
              placeholderTextColor={shade("#475569")}
              value={caseStartTime}
              onChangeText={setCaseStartTime}
              onBlur={() => saveTiming({ startTime: caseStartTime, startDayKey })}
            />
            <TouchableOpacity
              onPress={() => { setStartDayKey(todayKey); setCaseStartTime(nowHHMM); saveTiming({ startTime: nowHHMM }) }}
              style={{ paddingHorizontal:14, paddingVertical:12, borderRadius:10,
                backgroundColor:shade("#1e3a5f"), borderWidth:1, borderColor:shade("#3b82f644"),
                justifyContent:"center" }}>
              <Text style={{ color:shade("#93c5fd"), fontSize:12, fontWeight:"700" }}>{tc("timingNow")}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* End time */}
      <Text style={{ color:shade("#94a3b8"), fontSize:10, fontWeight:"700", letterSpacing:1.2,
        textTransform:"uppercase", marginBottom:8 }}>{tc("anesthesiaEndTime")}</Text>
      <View style={{ flexDirection:"row", gap:10, marginBottom:8 }}>
        <TextInput
          style={{ flex:1, minWidth:0, backgroundColor:shade("#111111"), color:shade("#f8fafc"), borderRadius:10, padding:12,
            fontSize:22, fontWeight:"700", borderWidth:1, borderColor:shade("#2a3a4a"), textAlign:"center",
            fontVariant:["tabular-nums"] }}
          placeholder="14:30"
          placeholderTextColor={shade("#475569")}
          value={caseEndTime}
          onChangeText={setCaseEndTime}
          onBlur={() => saveTiming({ endTime: caseEndTime })}
        />
        <TouchableOpacity
          onPress={() => {
            const offset = startKey ? Math.max(0, daysBetweenDateKeys(startKey, todayKey) ?? 0) : 0
            setCaseEndTime(nowHHMM)
            if ((offset > 0) !== caseEndNextDay) setCaseEndNextDay(() => offset > 0)
            saveTiming({ endTime: nowHHMM, endDayOffset: offset })
          }}
          style={{ paddingHorizontal:14, paddingVertical:12, borderRadius:10,
            backgroundColor:shade("#1e3a5f"), borderWidth:1, borderColor:shade("#3b82f644"),
            justifyContent:"center" }}>
          <Text style={{ color:shade("#93c5fd"), fontSize:12, fontWeight:"700" }}>{tc("timingNow")}</Text>
        </TouchableOpacity>
      </View>

      {/* The end date: the start's, the next day when the end time is earlier. */}
      <DayStepper
        value={endKey ?? startKey ?? todayKey}
        onChange={key => {
          const offset = startKey ? daysBetweenDateKeys(startKey, key) : null
          if (offset == null || offset < 0 || !caseEndTime) return
          setCaseEndNextDay(() => offset > 0)
          saveTiming({ endTime: caseEndTime, endDayOffset: offset })
        }}
        todayKey={todayKey}
        min={startRef.current && zone && caseEndTime ? earliestEndDateKey(startRef.current, caseEndTime, zone) : startKey}
        max={startKey ? shiftDateKey(startKey, 2) : null}
        language={language}
        label={tc("timingEndDate")}
        disabled={!startKey || !caseEndTime}
        testID="intraop-end-day"
      />

      {storedMinutes != null && storedMinutes > 24 * 60 ? (
        <Text testID="intraop-longer-than-day" style={{ color:shade("#fbbf24"), fontSize:12, fontWeight:"800", marginBottom:12 }}>{tc("timingLongerThanDay")}</Text>
      ) : null}

      {/* Duration */}
      {durationStr ? (
        <View style={{ backgroundColor:shade("#0f1a2e"), borderRadius:12, padding:14,
          borderWidth:1, borderColor:shade("#1e3a5f"), alignItems:"center" }}>
          <Text style={{ color:shade("#64748b"), fontSize:10, fontWeight:"700",
            textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>{tc("duration")}</Text>
          <Text style={{ color:shade("#93c5fd"), fontSize:24, fontWeight:"700" }}>{durationStr}</Text>
        </View>
      ) : null}

      {timingSaving && (
        <Text style={{ color:shade("#64748b"), fontSize:11, textAlign:"center", marginTop:12 }}>{tc("draftSaving")}</Text>
      )}
    </ScrollView>
  )
}
