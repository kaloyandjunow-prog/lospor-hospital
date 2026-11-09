import { Text, TouchableOpacity, View } from "react-native"
import { MONITORING_PURPOSE_GROUPS } from "@lospor/core/monitoring-smart"
import { displayClinicalCode } from "@/lib/clinical-display"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"

type MonitoringOpt = { label: string; field: string; section: string }

const GROUP_KEY = { heart: "msmGroupHeart", breathing: "msmGroupBreathing", brain: "msmGroupBrain", muscle: "msmGroupMuscle", temperature: "msmGroupTemperature" } as const

/**
 * Every monitor, grouped by what it tells you (10.2.0): the Legacy Monitoring tab, and what "More monitors"
 * opens on the Smart one. The groups and short names are Core's (monitoring-smart).
 */
export function MonitoringGroups({ monitoring, onToggle, monitoringOpts }: {
  monitoring: readonly string[]
  onToggle: (field: string) => void
  monitoringOpts: readonly MonitoringOpt[]
}) {
  const shade = useShade()
  const { language, tc } = usePreferences()
  return (
    <View testID="monitoring-groups">
      {MONITORING_PURPOSE_GROUPS.map(group => (
        <View key={group.id} style={{ marginBottom: 16 }}>
          <Text style={{ color: shade("#94a3b8"), fontSize: 10, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>{tc(GROUP_KEY[group.id])}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {group.fields.map(({ field, short }) => {
              const sel = monitoring.includes(field)
              const opt = monitoringOpts.find(item => item.field === field)
              return (
                <TouchableOpacity key={field} testID={`monitoring-tile-${field}`} accessibilityState={{ selected: sel }} onPress={() => onToggle(field)}
                  style={{ width: "48%", flexGrow: 1, minHeight: 58, padding: 10, borderRadius: 12, borderWidth: sel ? 2 : 1,
                    backgroundColor: sel ? shade("#0f2a1a") : shade("#111111"), borderColor: sel ? shade("#22c55e") : shade("#1e2d40") }}>
                  <Text style={{ color: sel ? shade("#86efac") : shade("#e2e8f0"), fontSize: 15, fontWeight: "800" }}>{short}</Text>
                  <Text numberOfLines={2} style={{ color: shade("#64748b"), fontSize: 11 }}>
                    {displayClinicalCode("option:MONITORING", field, language, { label: opt?.label ?? short })}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      ))}
    </View>
  )
}
