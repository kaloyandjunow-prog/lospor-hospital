import { View, Text, TouchableOpacity } from "react-native"
import type { ClinicalStringKey } from "@/lib/preferences-context"

// Banner shown after a case is ended, offering a time-limited Resume.
// Presentational — markup moved verbatim from cases/intraop/[id].tsx.
export function CaseEndedBanner({ tc, resumeSecsLeft, onResume }: {
  tc: (key: ClinicalStringKey) => string
  resumeSecsLeft: number
  onResume: () => void
}) {
  return (
    <View style={{ backgroundColor:"#0f2a1a", borderBottomWidth:1, borderBottomColor:"#22c55e44",
      flexDirection:"row", alignItems:"center", justifyContent:"space-between",
      paddingHorizontal:16, paddingVertical:10 }}>
      <Text style={{ color:"#22c55e", fontWeight:"800", fontSize:13 }}>{tc("caseEnded")}</Text>
      <View style={{ flexDirection:"row", alignItems:"center", gap:10 }}>
        {resumeSecsLeft > 0 && (
          <TouchableOpacity onPress={onResume}
            style={{ paddingHorizontal:12, paddingVertical:6, borderRadius:999,
              borderWidth:1.5, borderColor:"#f59e0b", backgroundColor:"#1a140a" }}>
            <Text style={{ color:"#f59e0b", fontWeight:"700", fontSize:12 }}>
              {tc("resumeCase")} ({Math.floor(resumeSecsLeft/60)}:{String(resumeSecsLeft%60).padStart(2,"0")})
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}
