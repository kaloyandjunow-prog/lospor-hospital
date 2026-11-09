import { Alert, View, Text, TouchableOpacity } from "react-native"
import { usePreferences } from "@/lib/preferences-context"
import { airwayAbsentReason } from "@lospor/core/intraop"

/**
 * Why there is no airway device of this team's own. First, because both answers
 * change what the rest of the Airway tab means, and finding that out after
 * scrolling through tools and devices is the wrong order. Independent, not
 * exclusive: a patient can arrive from the ICU already intubated AND have no
 * airway intervention here, which is both of them at once.
 */
export function AirwayAbsentToggles({ presentsIntubated, setPresentsIntubated, notApplicable, setNotApplicable, hasRecordedAirway, onNoAirwayInterventionSelected }: {
  presentsIntubated: boolean
  setPresentsIntubated: (updater: (prev: boolean) => boolean) => void
  notApplicable: boolean
  setNotApplicable: (updater: (prev: boolean) => boolean) => void
  /** Devices or tools already recorded: choosing "no airway intervention" asks before clearing them. */
  hasRecordedAirway: boolean
  onNoAirwayInterventionSelected: () => void
}) {
  const { tc, shade } = usePreferences()
  return (
    <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8, marginBottom:20 }}>
      {([
        { key: "presents", on: presentsIntubated, label: tc("awPresentsIntubated") },
        { key: "na", on: notApplicable, label: tc("awNotApplicable") },
      ] as const).map(option => (
        <TouchableOpacity
          key={option.key}
          onPress={() => {
            // The exclusivity rule lives in core, so web and mobile cannot
            // disagree about it the way they did when each had its own.
            const next = airwayAbsentReason(
              option.key === "presents" ? "presentsIntubated" : "airwayNotApplicable",
              { presentsIntubated, airwayNotApplicable: notApplicable },
            )
            const apply = () => {
              setPresentsIntubated(() => next.presentsIntubated)
              setNotApplicable(() => next.airwayNotApplicable)
              if (next.airwayNotApplicable) onNoAirwayInterventionSelected()
            }
            if (next.airwayNotApplicable && hasRecordedAirway) {
              Alert.alert(tc("awClearTitle"), tc("awClearMessage"), [
                { text: tc("cancelLabel"), style: "cancel" },
                { text: tc("awClearConfirm"), style: "destructive", onPress: apply },
              ])
              return
            }
            apply()
          }}
          style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:12,
            backgroundColor: option.on ? shade("#3f2d1a") : shade("#111111"),
            borderWidth:1, borderColor: option.on ? shade("#f59e0b") : shade("#1e2d40") }}
        >
          <Text style={{ color: option.on ? shade("#fcd34d") : shade("#64748b"), fontSize:12, fontWeight:"700" }}>
            {option.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}
