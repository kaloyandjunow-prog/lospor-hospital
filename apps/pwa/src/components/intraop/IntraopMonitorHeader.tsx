import { View, Text, TouchableOpacity } from "react-native"
import { colors } from "@/theme/colors"
import { SyncBadge } from "@/components/clinical-ui"
import { fmtElapsed } from "@/lib/intraop-format"
import type { VitalsEntry } from "@/components/IntraopTimetable"
import { usePreferences } from "@/lib/preferences-context"

// Top "monitor" header for the intraop screen: technique/procedure/diagnosis,
// the running clock + start controls, sync state, and last vitals.
// Presentational — markup moved verbatim from cases/intraop/[id].tsx.
export function IntraopMonitorHeader({
  techniquesLabel, procedure, diagnosis, timeStr, started, elapsedMs,
  onStartNow, onStartAt, syncState, syncErrorMessage, pendingCount, lastSavedAt, onRetrySync, lastVitals,
}: {
  techniquesLabel: string
  procedure: string
  diagnosis?: string | null
  timeStr: string
  started: boolean
  elapsedMs: number
  onStartNow: () => void
  onStartAt: () => void
  syncState: "saved" | "saving" | "failed" | "offline"
  syncErrorMessage: string | null
  pendingCount: number
  lastSavedAt: string | null
  onRetrySync: () => void
  lastVitals?: VitalsEntry | null
}) {
  const { tc } = usePreferences()
  return (
    <View style={{ backgroundColor: colors.surface, paddingTop:10, paddingBottom:10,
      paddingHorizontal:16, borderBottomWidth:1, borderBottomColor: colors.border }}>
      <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"flex-start" }}>
        <View style={{ flex:1, marginRight:12 }}>
          <Text style={{ color:colors.primary, fontSize:10, fontWeight:"700", letterSpacing:1.2, textTransform:"uppercase" }}>
            {techniquesLabel}
          </Text>
          <Text style={{ color:colors.textPrimary, fontSize:16, fontWeight:"700", marginTop:3 }} numberOfLines={1}>
            {procedure}
          </Text>
          {!!diagnosis && (
            <Text style={{ color:colors.textSecondary, fontSize:12, marginTop:2 }} numberOfLines={1}>
              {diagnosis}
            </Text>
          )}
        </View>
        <View style={{ alignItems:"flex-end", gap:4 }}>
          <Text style={{ color:colors.textPrimary, fontSize:30, fontWeight:"200", letterSpacing:1,
            fontVariant:["tabular-nums"] }}>{timeStr}</Text>
          {!started ? (
            <View style={{ flexDirection:"row", gap:6 }}>
              <TouchableOpacity
                onPress={onStartNow}
                style={{ borderRadius:10, paddingHorizontal:12, paddingVertical:5,
                  backgroundColor:"#1a1005", borderWidth:1, borderColor:"#f97316aa" }}
              >
                <Text style={{ color:"#fb923c", fontSize:11, fontWeight:"900" }}>{tc("mhStartNow")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onStartAt}
                style={{ borderRadius:10, paddingHorizontal:12, paddingVertical:5,
                  backgroundColor:"#0f172a", borderWidth:1, borderColor:"#6366f1aa" }}
              >
                <Text style={{ color:"#a5b4fc", fontSize:11, fontWeight:"900" }}>{tc("mhStartAt")}</Text>
              </TouchableOpacity>
            </View>
          ) : elapsedMs > 60_000 ? (
            <Text style={{ color:colors.textMuted, fontSize:11 }}>+ {fmtElapsed(elapsedMs)}</Text>
          ) : null}
        </View>
      </View>
      <View style={{ marginTop:10, flexDirection:"row", alignItems:"center", justifyContent:"space-between", gap:10 }}>
        <SyncBadge
          state={syncState}
          detail={
            syncState === "failed" && syncErrorMessage ? syncErrorMessage
            : pendingCount > 0 ? `${pendingCount} unsynced`
            : syncState === "saved" && lastSavedAt ? `Saved ${lastSavedAt}`
            : undefined
          }
        />
        {pendingCount > 0 && (
          <TouchableOpacity
            onPress={onRetrySync}
            style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:10,
              borderWidth:1, borderColor:colors.warning, backgroundColor:"#2a210f" }}>
            <Text style={{ color:colors.warning, fontSize:11, fontWeight:"800" }}>{tc("mhRetrySync")}</Text>
          </TouchableOpacity>
        )}
      </View>
      {lastVitals && (
        <View style={{ flexDirection:"row", gap:18, marginTop:10 }}>
          {lastVitals.systolic != null && lastVitals.diastolic != null && (
            <Text style={{ color:"#ef4444", fontSize:13, fontWeight:"700", fontVariant:["tabular-nums"] }}>
              {lastVitals.systolic}/{lastVitals.diastolic}
            </Text>
          )}
          {lastVitals.heartRate != null && (
            <Text style={{ color:"#22c55e", fontSize:13, fontWeight:"700", fontVariant:["tabular-nums"] }}>
              ♥ {lastVitals.heartRate}
            </Text>
          )}
          {lastVitals.spO2 != null && (
            <Text style={{ color:"#06b6d4", fontSize:13, fontWeight:"700", fontVariant:["tabular-nums"] }}>
              SpO₂ {lastVitals.spO2}%
            </Text>
          )}
          {lastVitals.etco2 != null && (
            <Text style={{ color:"#f59e0b", fontSize:13, fontWeight:"700", fontVariant:["tabular-nums"] }}>
              CO₂ {lastVitals.etco2}
            </Text>
          )}
        </View>
      )}
    </View>
  )
}
