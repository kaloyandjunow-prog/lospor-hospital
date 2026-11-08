import { useState } from "react"
import { Text, TouchableOpacity, View } from "react-native"
import { MONITORING_READINGS, STANDARD_MONITORING, readingDue, standardMonitoringOn, toggleStandardMonitoring, type MonitoringReasonKey, type MonitoringSuggestion } from "@lospor/core/monitoring-smart"
import { displayClinicalCode } from "@/lib/clinical-display"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"
import { MonitoringGroups } from "./MonitoringGroups"

type MonitoringOpt = { label: string; field: string; section: string }

const REASON: Record<MonitoringReasonKey, string> = {
  airway: "msmReasonAirway", arterialLine: "msmReasonArterialLine", centralLine: "msmReasonCentralLine", relaxant: "msmReasonRelaxant",
  tiva: "msmReasonTiva", longGeneral: "msmReasonLongGeneral",
}

/**
 * The Monitoring tab, Smart selection (10.2.0), on the phone: standard monitoring in one switch, what is on
 * (with a shortcut into its reading when it carries a number), the monitors the case calls for with the
 * reason, and the full grouped list in place under "More monitors". What is suggested and when a reading is
 * due is Core's (monitoring-smart); a monitor added here writes the same flag the legacy tab writes.
 */
export function MonitoringSmart({
  monitoring, onChange, monitoringOpts, suggestions, onHide, lastReading, onReading, now, dueMinutes, saving = false, saveError = false,
}: {
  monitoring: readonly string[]
  onChange: (next: string[]) => void
  monitoringOpts: readonly MonitoringOpt[]
  suggestions: readonly MonitoringSuggestion[]
  onHide: (suggestion: MonitoringSuggestion) => void
  /** The last reading charted for a monitor: its text and when it was taken. */
  lastReading: (field: string) => { text: string; at: string } | null
  /** Opens the vitals entry for this monitor's reading. */
  onReading: (field: string) => void
  now: () => string
  /** The hospital's reading intervals (Status), per monitor, in minutes. */
  dueMinutes?: Readonly<Record<string, number>> | null
  saving?: boolean
  saveError?: boolean
}) {
  const shade = useShade()
  const { language, tc } = usePreferences()
  const [more, setMore] = useState(false)
  const name = (field: string) => displayClinicalCode("option:MONITORING", field, language, { label: monitoringOpts.find(item => item.field === field)?.label ?? field })
  const extras = monitoring.filter(field => !STANDARD_MONITORING.includes(field))
  const availableCount = monitoringOpts.filter(item => !monitoring.includes(item.field)).length
  // The active list is authoritative; do not leave a just-added suggestion
  // visible while a parent is persisting the same selection.
  const visibleSuggestions = suggestions.filter(item => !monitoring.includes(item.field))
  const standard = standardMonitoringOn(monitoring)
  const toggle = (field: string) => onChange(monitoring.includes(field) ? monitoring.filter(item => item !== field) : [...monitoring, field])
  const eyebrow = (text: string) => <Text style={{ color: shade("#94a3b8"), fontSize: 10, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginTop: 16, marginBottom: 8 }}>{text}</Text>
  const card = { flexDirection: "row" as const, alignItems: "center" as const, gap: 10, padding: 10, borderRadius: 12, marginBottom: 8, backgroundColor: shade("#171c26") }
  const side = { minWidth: 44, minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: "center" as const, justifyContent: "center" as const, paddingHorizontal: 10 }

  return (
    <View testID="monitoring-smart" style={{ marginBottom: 20 }}>
      {saving ? <Text testID="monitoring-smart-saving" style={{ color: shade("#94a3b8"), fontSize: 12, marginBottom: 6 }}>{tc("draftSaving")}</Text> : null}
      {saveError ? <Text testID="monitoring-smart-save-error" style={{ color: shade("#fca5a5"), fontSize: 12, marginBottom: 6 }}>{tc("draftSaveFailed")}</Text> : null}
      <TouchableOpacity testID="monitoring-standard" accessibilityState={{ selected: standard }} onPress={() => onChange(toggleStandardMonitoring(monitoring))}
        style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, borderWidth: 2,
          borderColor: standard ? shade("#22c55e") : shade("#2a3140"), backgroundColor: standard ? shade("#0f2a1a") : shade("#171c26") }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: shade("#f8fafc"), fontSize: 15, fontWeight: "800" }}>{tc("msmStandard")}</Text>
          <Text style={{ color: shade("#94a3b8"), fontSize: 12 }}>{tc("msmStandardHint")}</Text>
        </View>
        <View style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: "center", justifyContent: "center",
          borderColor: standard ? shade("#22c55e") : shade("#334155"), backgroundColor: standard ? shade("#22c55e") : "transparent" }}>
          {standard ? <Text style={{ color: shade("#04130a"), fontWeight: "800" }}>✓</Text> : null}
        </View>
      </TouchableOpacity>

      {eyebrow(`${tc("msmOnNow")}${extras.length > 0 ? ` · ${extras.length}` : ""}`)}
      {extras.length === 0 ? (
        <View testID="monitoring-smart-empty" style={card}><Text style={{ color: shade("#94a3b8") }}>{tc("msmNothingMore")}</Text></View>
      ) : extras.map(field => {
        const reading = MONITORING_READINGS[field] ? lastReading(field) : null
        const due = !!MONITORING_READINGS[field] && readingDue(field, reading?.at ?? null, null, now(), dueMinutes)
        return (
          <View key={field} testID={`monitoring-on-${field}`} style={card}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: shade("#22c55e") }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: shade("#f8fafc"), fontWeight: "700", fontSize: 14 }}>{name(field)}</Text>
              {due ? <Text style={{ color: shade("#fbbf24"), fontSize: 12 }}>{tc("msmDue")}</Text> : null}
            </View>
            {MONITORING_READINGS[field] ? (
              <TouchableOpacity testID={`monitoring-reading-${field}`} onPress={() => onReading(field)}
                style={[side, { borderColor: due ? shade("#fbbf24") : shade("#a67cff"), backgroundColor: due ? "transparent" : shade("#a67cff") + "26" }]}>
                <Text style={{ color: due ? shade("#fbbf24") : shade("#c4b0ff"), fontWeight: "800", fontVariant: ["tabular-nums"] }}>{reading?.text ?? tc("msmLog")}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity testID={`monitoring-off-${field}`} accessibilityLabel={tc("msmTurnOff")} onPress={() => toggle(field)} style={[side, { borderColor: shade("#334155") }]}>
              <Text style={{ color: shade("#94a3b8"), fontWeight: "800", fontSize: 11 }}>{tc("msmTurnOff")}</Text>
            </TouchableOpacity>
          </View>
        )
      })}

      {eyebrow(tc("msmSuggested"))}
      {visibleSuggestions.length === 0 ? (
        <View testID="monitoring-no-suggestions" style={card}><Text style={{ color: shade("#94a3b8") }}>{tc("msmNoSuggestions")}</Text></View>
      ) : visibleSuggestions.map(item => (
        <View key={item.field} testID={`monitoring-suggestion-${item.field}`} style={[card, { borderWidth: 1, borderStyle: "dashed", borderColor: shade("#fbbf24") }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: shade("#f8fafc"), fontWeight: "700", fontSize: 14 }}>{name(item.field)}</Text>
            <Text style={{ color: shade("#fbbf24"), fontSize: 12 }}>{tc(REASON[item.reason] as Parameters<typeof tc>[0])}</Text>
          </View>
          <TouchableOpacity testID={`monitoring-add-${item.field}`} accessibilityLabel={tc("msmAdd")} accessibilityState={{ selected: monitoring.includes(item.field) }} onPress={() => toggle(item.field)} style={[side, { borderColor: shade("#a67cff"), backgroundColor: shade("#a67cff") + "26" }]}>
            <Text style={{ color: shade("#c4b0ff"), fontWeight: "800" }}>{tc("msmAdd")}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID={`monitoring-hide-${item.field}`} accessibilityLabel={tc("msmHide")} onPress={() => onHide(item)} style={[side, { borderColor: shade("#334155") }]}>
            <Text style={{ color: shade("#94a3b8"), fontWeight: "800", fontSize: 11 }}>{tc("msmHide")}</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity testID="monitoring-more" onPress={() => setMore(value => !value)} style={{ minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: shade("#334155"), alignItems: "center", justifyContent: "center", marginTop: 6, marginBottom: more ? 14 : 0 }}>
        <Text style={{ color: shade("#a67cff"), fontWeight: "800" }}>{more ? tc("msmFewer") : tc("msmMore").replace("{count}", String(availableCount))}</Text>
      </TouchableOpacity>
      {more ? <MonitoringGroups monitoring={monitoring} onToggle={toggle} monitoringOpts={monitoringOpts} /> : null}
    </View>
  )
}
