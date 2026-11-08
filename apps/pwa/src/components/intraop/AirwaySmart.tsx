import { Fragment, useState } from "react"
import { Text, TouchableOpacity, View } from "react-native"
import { airwayDevicesInUse, type AirwayDeviceEntry } from "@lospor/core/airway-device-entries"
import { airwayChoices, suggestedAirwayDetails, type AirwayPatient } from "@lospor/core/airway-smart"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"
import { AirwaySmartPanel, type AirwaySmartChartEvent, type AirwaySmartRequest } from "./AirwaySmartPanel"

/**
 * The Airway tab, Smart selection (10.2.0), on the phone: what is in place
 * first, then the devices the technique leads with as big cards, the rest
 * behind "More devices", and one panel that opens under them. The choices, the
 * suggested sizes and the saving are Core's (airway-smart), as on the web.
 */
export function AirwaySmart({
  entries, onChange, onEvent, onAtomicSave, onRemove, patient, techniques, availableDevices, availableTools, startedAt, now, timeZone, difficultAirway, deviceLabel, toolLabel, describe, timeOf,
}: {
  entries: readonly AirwayDeviceEntry[]
  onChange: (next: AirwayDeviceEntry[]) => void
  onEvent?: (event: AirwaySmartChartEvent) => void
  onAtomicSave?: (next: AirwayDeviceEntry[], event: AirwaySmartChartEvent) => void
  onRemove?: (entry: AirwayDeviceEntry, next: AirwayDeviceEntry[]) => void
  patient: AirwayPatient
  techniques: readonly string[]
  availableDevices?: readonly string[]
  availableTools?: readonly string[]
  startedAt: string | null
  now: () => string
  timeZone: string | null
  difficultAirway: boolean
  deviceLabel: (code: string) => string
  toolLabel: (code: string) => string
  describe: (entry: AirwayDeviceEntry) => string
  timeOf: (iso: string) => string
}) {
  const shade = useShade()
  const { tc } = usePreferences()
  const [request, setRequest] = useState<AirwaySmartRequest | null>(null)
  const [showOther, setShowOther] = useState(false)
  const choices = airwayChoices(techniques, availableDevices)
  const live = airwayDevicesInUse(entries)
  const shown = [...entries].sort((a, b) => Number(a.status !== "in_use") - Number(b.status !== "in_use"))
  const mainRows = Array.from({ length: Math.ceil(choices.main.length / 3) }, (_, index) => choices.main.slice(index * 3, index * 3 + 3))
  const eyebrow = (text: string) => <Text style={{ color: shade("#94a3b8"), fontSize: 10, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>{text}</Text>
  const small = { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: shade("#334155"), justifyContent: "center" as const }
  const panel = request ? (
    <AirwaySmartPanel key={`${request.device}-${request.replaces?.id ?? ""}`} request={request} entries={entries} patient={patient}
      startedAt={startedAt} now={now} timeZone={timeZone} difficultAirway={difficultAirway} deviceLabel={deviceLabel} toolLabel={toolLabel}
      toolCodes={availableTools}
      onSave={(next, event) => {
        setRequest(null)
        if (event && onAtomicSave) onAtomicSave(next, event)
        else { onChange(next); if (event) onEvent?.(event) }
      }} onClose={() => setRequest(null)} />
  ) : null

  return (
    <View testID="airway-smart" style={{ marginBottom: 20 }}>
      {eyebrow(`${tc("asmInPlace")}${live.length > 0 ? ` · ${live.length}` : ""}`)}
      {entries.length === 0 ? (
        <View testID="airway-smart-empty" style={{ borderWidth: 1, borderStyle: "dashed", borderColor: shade("#334155"), borderRadius: 12, padding: 12, marginBottom: 16 }}>
          <Text style={{ color: shade("#94a3b8") }}>{tc("asmNone")}</Text>
        </View>
      ) : (
        <View style={{ gap: 8, marginBottom: 16 }}>{shown.map(entry => {
          const out = entry.status !== "in_use"
          const canReintubate = !out && (entry.device === "ORAL_ETT" || entry.device === "NASAL_ETT")
          const canExchange = !out && ["LMA", "DOUBLE_LUMEN_TUBE", "ENDOBRONCHIAL_TUBE"].includes(entry.device)
          return (
            <View key={entry.id} testID={`airway-smart-entry-${entry.id}`} style={{ borderWidth: 1, borderStyle: out ? "dashed" : "solid", borderColor: shade("#2a3140"), borderRadius: 12, padding: 10, backgroundColor: shade("#141414"), opacity: out ? 0.75 : 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ flex: 1, color: shade("#f8fafc"), fontWeight: "700", fontSize: 15, textDecorationLine: out ? "line-through" : "none" }}>{describe(entry)}</Text>
                {entry.insertedAt ? <Text style={{ color: shade("#94a3b8"), fontSize: 12, fontVariant: ["tabular-nums"] }}>{timeOf(entry.insertedAt)}</Text> : null}
              </View>
              {out ? <Text style={{ color: shade("#fca5a5"), fontSize: 12, fontWeight: "700" }}>{entry.status === "failed" ? tc("awxFailed") : tc("awxReplaced")}{entry.endedAt ? ` ${timeOf(entry.endedAt)}` : ""}</Text> : null}
              {(entry.instruments?.length ?? 0) > 0 ? <Text style={{ color: shade("#94a3b8"), fontSize: 12 }}>{tc("asmVia").replace("{tools}", entry.instruments!.map(toolLabel).join(" · "))}</Text> : null}
              {canReintubate ? <TouchableOpacity testID={`airway-smart-reintubate-${entry.id}`} style={[small, { alignSelf: "flex-start", marginTop: 6 }]}
                onPress={() => setRequest({ device: entry.device, source: "tab", replaces: { id: entry.id, reason: "failed_device" } })}><Text style={{ color: shade("#e2e8f0"), fontWeight: "700", fontSize: 12 }}>{tc("asmReintubate")}</Text></TouchableOpacity> : null}
              {canExchange ? <TouchableOpacity testID={`airway-smart-exchange-${entry.id}`} style={[small, { alignSelf: "flex-start", marginTop: 6 }]}
                onPress={() => setRequest({ device: entry.device, source: "tab", replaces: { id: entry.id, reason: "planned" } })}><Text style={{ color: shade("#e2e8f0"), fontWeight: "700", fontSize: 12 }}>{tc("asmExchange")}</Text></TouchableOpacity> : null}
              <TouchableOpacity testID={`airway-smart-remove-${entry.id}`} style={[small, { alignSelf: "flex-start", marginTop: 6, borderColor: shade("#7f1d1d") }]}
                onPress={() => {
                  const next = entries.filter(candidate => candidate.id !== entry.id)
                  if (onRemove) onRemove(entry, next)
                  else onChange(next)
                }}><Text style={{ color: shade("#fca5a5"), fontWeight: "700", fontSize: 12 }}>{tc("asmRemove")}</Text></TouchableOpacity>
            </View>
          )
        })}</View>
      )}

      {eyebrow(tc("asmAddDevice"))}
      <View style={{ gap: 8, marginBottom: 8 }}>{mainRows.map((row, rowIndex) => (
        <View key={`airway-smart-main-row-${rowIndex}`}>
          <View style={{ flexDirection: "row", gap: 8 }}>{row.map(device => {
            const suggestion = suggestedAirwayDetails(device, patient) as Record<string, unknown>
            const hint = [suggestion.oralTubeSize ?? suggestion.nasalTubeSize ?? suggestion.lmaSize, suggestion.oralCuffed === true || suggestion.nasalCuffed === true ? tc("asmCuffed") : null].filter(item => item != null).join(" · ")
            const on = request?.device === device
            return (
              <TouchableOpacity key={device} testID={`airway-smart-card-${device}`} accessibilityState={{ selected: on }} onPress={() => setRequest(current => current?.device === device && current.replaces == null ? null : { device, source: "tab" })}
                style={{ flex: 1, minHeight: 76, borderRadius: 14, borderWidth: 2, alignItems: "center", justifyContent: "center", padding: 6,
                  borderColor: on ? shade("#a67cff") : shade("#2a3140"), backgroundColor: on ? shade("#a67cff") + "26" : shade("#171c26") }}>
                <Text style={{ color: shade("#f8fafc"), fontWeight: "800", fontSize: 15, textAlign: "center" }}>{deviceLabel(device)}</Text>
                {hint ? <Text style={{ color: shade("#94a3b8"), fontSize: 11 }}>{hint}</Text> : null}
              </TouchableOpacity>
            )
          })}</View>
          {request && row.includes(request.device) ? panel : null}
        </View>
      ))}</View>
      {choices.other.length > 0 ? (
        <>
          <TouchableOpacity
            testID="airway-smart-more"
            accessibilityState={{ expanded: showOther }}
            onPress={() => setShowOther(value => !value)}
            style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: shade("#334155"), backgroundColor: shade("#111827"), paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: showOther ? 8 : 14 }}
          >
            <Text style={{ color: shade("#c4b0ff"), fontWeight: "800" }}>{tc("asmMoreDevices").replace("{count}", String(choices.other.length))}</Text>
            <Text style={{ color: shade("#94a3b8"), fontSize: 18 }}>{showOther ? "⌃" : "⌄"}</Text>
          </TouchableOpacity>
          {showOther ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              {choices.other.map(device => (
                <Fragment key={device}>
                  <TouchableOpacity testID={`airway-smart-other-${device}`} style={[small, { minHeight: 44 }]} onPress={() => setRequest({ device, source: "tab" })}>
                    <Text style={{ color: shade("#e2e8f0"), fontWeight: "700" }}>{deviceLabel(device)}</Text>
                  </TouchableOpacity>
                  {request?.device === device ? <View style={{ width: "100%" }}>{panel}</View> : null}
                </Fragment>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
      {request && !choices.main.includes(request.device) && !choices.other.includes(request.device) ? panel : null}
    </View>
  )
}
