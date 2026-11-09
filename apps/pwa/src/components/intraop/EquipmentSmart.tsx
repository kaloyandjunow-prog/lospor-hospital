import { useState, type ComponentProps } from "react"
import { AirwaySmartPanel } from "@/components/intraop/AirwaySmartPanel"
import { Text, TouchableOpacity, View } from "react-native"
import type { EquipmentCategory } from "@lospor/core/equipment"
import type { AirwayDeviceEntry } from "@lospor/core/airway-device-entries"
import {
  EQUIPMENT_TRACKED_LABELS,
  equipmentItemKey,
  equipmentPreparationGroups,
  equipmentPreparationStatus,
  equipmentRecordedValue,
  equipmentReferenceGroups,
  equipmentSuggestionStatus,
  type EquipmentFlagState,
  type EquipmentSuggestionStatus,
} from "@lospor/core/equipment-smart"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"

/** What the inline airway panel needs: the Airway tab's own panel asks the time and saves the same way. */
export type EquipmentAirwayPanel = Pick<ComponentProps<typeof AirwaySmartPanel>, "entries" | "patient" | "startedAt" | "now" | "timeZone" | "difficultAirway" | "deviceLabel" | "toolLabel" | "toolCodes" | "onSave"> & {
  conflict: (device: "ORAL_ETT" | "LMA") => boolean
}

/** Smart Equipment on the phone: recorded-vs-suggested first, preparation second, reference last. */
export function EquipmentSmart({ raw, shown, flags, airwayEntries, prepared, onFlag, onPreparedChange, onUseAirway, airway }: {
  raw: readonly EquipmentCategory[]
  shown: readonly EquipmentCategory[]
  flags: EquipmentFlagState
  airwayEntries: readonly AirwayDeviceEntry[]
  prepared: Readonly<Record<string, boolean>>
  onFlag: (field: "urinaryCatheter" | "stomachTube") => void
  onPreparedChange: (key: string, value: boolean) => void
  onUseAirway: (device: "ORAL_ETT" | "LMA") => boolean
  airway?: EquipmentAirwayPanel
}) {
  const shade = useShade()
  const { tc } = usePreferences()
  const [preparationOpen, setPreparationOpen] = useState(false)
  const [referenceOpen, setReferenceOpen] = useState(false)
  const [airwayActionBlocked, setAirwayActionBlocked] = useState(false)
  const [airwayRequest, setAirwayRequest] = useState<"ORAL_ETT" | "LMA" | null>(null)
  const record = { flags, airwayEntries }
  const shownItem = (category: string, label: string) => {
    const ci = raw.findIndex(item => item.cat === category)
    const ri = raw[ci]?.items.findIndex(item => item.label === label) ?? -1
    return shown[ci]?.items[ri] ?? raw[ci]?.items[ri]
  }
  const shownCategory = (category: string) => shown[raw.findIndex(item => item.cat === category)]?.cat ?? category
  const tracked = EQUIPMENT_TRACKED_LABELS.flatMap(label => {
    for (const category of raw) {
      const item = category.items.find(entry => entry.label === label)
      if (item) return [{ category: category.cat, item, display: shownItem(category.cat, label) ?? item }]
    }
    return []
  })
  const preparationGroups = equipmentPreparationGroups(raw)
  const referenceGroups = equipmentReferenceGroups(raw)
  const matchedCount = tracked.filter(({ item }) => equipmentSuggestionStatus(item.label, item.value, record) === "matched").length
  const statusText = (status: EquipmentSuggestionStatus) => ({ matched: tc("eqsMatched"), recorded_incomplete: tc("eqsRecordedIncomplete"), different: tc("eqsDifferent"), not_recorded: tc("eqsNotRecorded"), prepared: tc("eqsPrepared"), reference: tc("eqsReferenceOnly") })[status]
  const statusColor = (status: EquipmentSuggestionStatus) => ({ matched: ["#86efac", "#0f2a1a"], recorded_incomplete: ["#fcd34d", "#2a2010"], different: ["#fdba74", "#2a1810"], not_recorded: ["#94a3b8", "#171c26"], prepared: ["#93c5fd", "#101f35"], reference: ["#94a3b8", "#171c26"] })[status]!
  const actualText = (value: string | null) => value == null ? null : value === "Documented" ? tc("eqsDocumented") : value.replace(" cuffed", ` ${tc("eqsCuffedValue")}`).replace(" uncuffed", ` ${tc("eqsUncuffedValue")}`)
  const recordAirway = (device: "ORAL_ETT" | "LMA") => {
    if (airway) {
      const blocked = airway.conflict(device)
      setAirwayActionBlocked(blocked)
      setAirwayRequest(blocked ? null : device)
      return
    }
    setAirwayActionBlocked(onUseAirway(device) === false)
  }

  function action(label: string, status: EquipmentSuggestionStatus) {
    const button = (id: string, text: string, onPress: () => void, muted = false) => <TouchableOpacity testID={id} onPress={onPress} style={{ minHeight: 36, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: shade(muted ? "#334155" : "#8b5cf6"), justifyContent: "center" }}><Text style={{ color: shade(muted ? "#94a3b8" : "#c4b5fd"), fontSize: 11, fontWeight: "800" }}>{text}</Text></TouchableOpacity>
    if (label === "ETT size" && status === "not_recorded") return button("equipment-record-ETT-size", tc("eqsRecordInAirway"), () => recordAirway("ORAL_ETT"))
    if (label === "LMA size" && status === "not_recorded") return button("equipment-record-LMA-size", tc("eqsRecordInAirway"), () => recordAirway("LMA"))
    if ((label === "Urinary catheter" || label === "NGT") && status === "not_recorded") return button(`equipment-record-${label}`, tc("eqsMarkInPlace"), () => onFlag(label === "NGT" ? "stomachTube" : "urinaryCatheter"))
    if ((label === "Urinary catheter" || label === "NGT") && status === "recorded_incomplete") return button(`equipment-remove-${label}`, tc("eqsRemoveFromRecord"), () => onFlag(label === "NGT" ? "stomachTube" : "urinaryCatheter"), true)
    return null
  }

  const section = { borderRadius: 14, borderWidth: 1, borderColor: shade("#2a3140"), backgroundColor: shade("#111111"), overflow: "hidden" as const }

  return <View testID="equipment-smart" style={{ gap: 14 }}>
      <View testID="equipment-recorded">
      {airway && airwayRequest ? <View testID="equipment-airway-panel" style={{ marginBottom: 10 }}><AirwaySmartPanel request={{ device: airwayRequest, source: "tab" }} {...airway} onSave={(next, event) => { setAirwayRequest(null); airway.onSave(next, event) }} onClose={() => setAirwayRequest(null)} /></View> : null}
      {airwayActionBlocked ? <Text testID="equipment-airway-action-blocked" style={{ color: shade("#fde68a"), backgroundColor: shade("#3b2f12"), borderRadius: 8, padding: 8, fontSize: 12, marginBottom: 8 }}>{tc("eqsAirwayActionBlocked")}</Text> : null}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}><View style={{ flex: 1 }}><Text style={{ color: shade("#f8fafc"), fontSize: 15, fontWeight: "900" }}>{tc("eqsSuggestedRecorded")}</Text><Text style={{ color: shade("#94a3b8"), fontSize: 12, lineHeight: 17, marginTop: 2 }}>{tc("eqsSuggestedRecordedHint")}</Text></View><Text testID="equipment-summary" style={{ color: shade("#94a3b8"), fontSize: 12, fontWeight: "800" }}>{matchedCount}/{tracked.length} {tc("eqsMatchedShort")}</Text></View>
      <View style={{ gap: 8 }}>{tracked.map(({ item, display }) => { const status = equipmentSuggestionStatus(item.label, item.value, record); const actual = equipmentRecordedValue(item.label, record); const colors = statusColor(status); return <View key={item.label} testID={`equipment-tracked-${item.label}`} style={{ borderRadius: 14, borderWidth: 1, borderColor: shade(colors[0]), backgroundColor: shade(colors[1]), padding: 12 }}><View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}><View style={{ flex: 1 }}><Text style={{ color: shade("#f8fafc"), fontSize: 14, fontWeight: "900" }}>{display.label}</Text><View style={{ alignSelf: "flex-start", marginTop: 5, borderRadius: 10, borderWidth: 1, borderColor: shade(colors[0]), paddingHorizontal: 7, paddingVertical: 3 }}><Text style={{ color: shade(colors[0]), fontSize: 10, fontWeight: "900", textTransform: "uppercase" }}>{statusText(status)}</Text></View></View>{action(item.label, status)}</View><View style={{ flexDirection: "row", gap: 12, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: shade("#ffffff12") }}><View style={{ flex: 1 }}><Text style={{ color: shade("#94a3b8"), fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>{tc("eqsSuggested")}</Text><Text style={{ color: shade("#e2e8f0"), fontSize: 13, fontWeight: "700", marginTop: 2 }}>{display.value}</Text></View><View style={{ flex: 1 }}><Text style={{ color: shade("#94a3b8"), fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>{tc("eqsActual")}</Text><Text style={{ color: shade("#e2e8f0"), fontSize: 13, fontWeight: "700", marginTop: 2 }}>{actualText(actual) ?? tc("eqsNotRecorded")}</Text></View></View>{status === "recorded_incomplete" ? <Text style={{ color: shade("#fcd34d"), fontSize: 11, marginTop: 7 }}>{tc("eqsDetailsMissing")}</Text> : null}{status === "different" ? <Text style={{ color: shade("#fdba74"), fontSize: 11, marginTop: 7 }}>{tc("eqsDifferentHint")}</Text> : null}</View> })}</View>
    </View>

    <View style={section} testID="equipment-preparation"><TouchableOpacity testID="equipment-preparation-toggle" onPress={() => setPreparationOpen(open => !open)} accessibilityState={{ expanded: preparationOpen }} style={{ minHeight: 60, padding: 13, flexDirection: "row", alignItems: "center", gap: 10 }}><View style={{ flex: 1 }}><Text style={{ color: shade("#f8fafc"), fontSize: 14, fontWeight: "900" }}>{tc("eqsPreparation")}</Text><Text style={{ color: shade("#94a3b8"), fontSize: 12, lineHeight: 17, marginTop: 2 }}>{tc("eqsPreparationHint")}</Text></View><Text style={{ color: shade("#94a3b8"), fontSize: 18 }}>{preparationOpen ? "▾" : "▸"}</Text></TouchableOpacity>{preparationOpen ? <View style={{ borderTopWidth: 1, borderTopColor: shade("#2a3140"), padding: 12 }}>{preparationGroups.map(group => <View key={group.cat} testID={`equipment-preparation-group-${group.cat}`} style={{ marginBottom: 14 }}><Text style={{ color: shade("#94a3b8"), fontSize: 10, fontWeight: "800", letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 7 }}>{shownCategory(group.cat)}</Text><View style={{ gap: 6 }}>{group.items.map(item => { const key = equipmentItemKey(group.cat, item.label); const on = equipmentPreparationStatus(group.cat, item.label, prepared) === "prepared"; const display = shownItem(group.cat, item.label) ?? item; return <TouchableOpacity key={item.label} testID={`equipment-preparation-${item.label}`} accessibilityState={{ selected: on }} onPress={() => onPreparedChange(key, !on)} style={{ flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: shade(on ? "#3b82f6" : "#2a3140"), backgroundColor: shade(on ? "#101f35" : "#171c26") }}><View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: shade(on ? "#3b82f6" : "#475569"), backgroundColor: on ? shade("#3b82f6") : "transparent", alignItems: "center", justifyContent: "center" }}>{on ? <Text style={{ color: shade("#04130a"), fontWeight: "900", fontSize: 12 }}>✓</Text> : null}</View><View style={{ flex: 1 }}><Text style={{ color: shade("#e2e8f0"), fontSize: 13, fontWeight: "700" }}>{display.label}</Text><Text style={{ color: shade("#94a3b8"), fontSize: 12, marginTop: 2 }}>{display.value}</Text></View></TouchableOpacity> })}</View></View>)}</View> : null}</View>

    <View style={section} testID="equipment-reference"><TouchableOpacity onPress={() => setReferenceOpen(open => !open)} accessibilityState={{ expanded: referenceOpen }} style={{ minHeight: 54, padding: 13, flexDirection: "row", alignItems: "center", gap: 10 }}><View style={{ flex: 1 }}><Text style={{ color: shade("#e2e8f0"), fontSize: 14, fontWeight: "800" }}>{tc("eqsClinicalReference")}</Text><Text style={{ color: shade("#94a3b8"), fontSize: 12, marginTop: 2 }}>{tc("eqsClinicalReferenceHint")}</Text></View><Text style={{ color: shade("#94a3b8"), fontSize: 18 }}>{referenceOpen ? "▾" : "▸"}</Text></TouchableOpacity>{referenceOpen ? <View style={{ borderTopWidth: 1, borderTopColor: shade("#2a3140"), padding: 12, gap: 12 }}>{referenceGroups.map(group => <View key={group.cat} testID={`equipment-reference-group-${group.cat}`}><Text style={{ color: shade("#94a3b8"), fontSize: 10, fontWeight: "800", letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 5 }}>{shownCategory(group.cat)}</Text>{group.items.map(item => { const display = shownItem(group.cat, item.label) ?? item; return <View key={item.label} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: shade("#1e2d40") }}><Text style={{ color: shade("#94a3b8"), fontSize: 12, flex: 1 }}>{display.label}</Text><Text style={{ color: shade("#e2e8f0"), fontSize: 12, fontWeight: "700", flex: 1, textAlign: "right" }}>{display.value}</Text></View> })}</View>)}</View> : null}</View>
  </View>
}
