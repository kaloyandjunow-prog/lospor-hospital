import { useMemo, useState } from "react"
import { Text, TextInput, TouchableOpacity, View } from "react-native"
import { AIRWAY_DEVICE_REQUIRED_FIELDS } from "@lospor/core/intraop"
import { airwayDevicesInUse, replaceAirwayDevice, type AirwayDeviceEntry, type AirwayExchangeReason } from "@lospor/core/airway-device-entries"
import { clinicalRecordId } from "@lospor/core/clinical-record-id"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"
import { Sheet } from "./Sheet"

/**
 * The airway picker, embedded (10.2.0), on the phone: opened by Reintubation,
 * Airway exchange (which asks why), unplanned extubation's "Reintubate?" and
 * the rescues. The new device is its own entry on the airway list; the one it
 * replaces stays, marked replaced after a planned exchange and failed
 * otherwise (Core replaceAirwayDevice).
 */
const REASONS = [
  ["planned", "awxPlanned"], ["failed_device", "awxFailedDevice"], ["unplanned_extubation", "awxUnplanned"],
] as const

type Details = Record<string, string | number | boolean>

export function AirwayExchangeSheet({ entries, devices, reason: fixedReason, at, onSave, onClose }: {
  entries: readonly AirwayDeviceEntry[]
  devices: readonly { code: string; label: string }[]
  reason: AirwayExchangeReason | null
  at: string
  onSave: (next: AirwayDeviceEntry[]) => void
  onClose: () => void
}) {
  const shade = useShade()
  const { tc } = usePreferences()
  const inUse = useMemo(() => airwayDevicesInUse(entries), [entries])
  const last = inUse[inUse.length - 1]
  const [reason, setReason] = useState<AirwayExchangeReason | null>(fixedReason)
  const [outId, setOutId] = useState<string | null>(last?.id ?? null)
  const [device, setDevice] = useState<string | null>(last?.device ?? null)
  const [details, setDetails] = useState<Details>(() => ({ ...(last?.details as Details | undefined) }))
  const fields = device ? (AIRWAY_DEVICE_REQUIRED_FIELDS as Record<string, readonly string[]>)[device] ?? [] : []
  const label = (code: string) => devices.find(item => item.code === code)?.label ?? code
  const pill = (on: boolean) => ({ minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, justifyContent: "center" as const,
    borderColor: on ? shade("#3b82f6") : shade("#334155"), backgroundColor: on ? shade("#3b82f6") + "33" : shade("#1c1c1c") })
  const pillText = (on: boolean) => ({ color: on ? shade("#bfdbfe") : shade("#e2e8f0"), fontWeight: "700" as const })

  function save() {
    if (!device || !reason) return
    const kept = Object.fromEntries(fields.filter(field => details[field] !== undefined && details[field] !== "").map(field => [field, details[field]]))
    onSave(replaceAirwayDevice(entries, outId, { id: clinicalRecordId("airway", at), device, details: kept, insertedAt: at }, reason))
  }

  return (
    <Sheet visible onClose={onClose} title={tc("awxTitle")} full footer={
      <TouchableOpacity testID="airway-exchange-save" disabled={!device || !reason} onPress={save}
        style={{ minHeight: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: device && reason ? shade("#22c55e") : shade("#262626") }}>
        <Text style={{ color: device && reason ? shade("#04210f") : shade("#64748b"), fontWeight: "800" }}>{tc("awxSave")}</Text>
      </TouchableOpacity>
    }>
      {!fixedReason && (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: shade("#94a3b8"), marginBottom: 6 }}>{tc("awxWhy")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{REASONS.map(([value, key]) => (
            <TouchableOpacity key={value} testID={`airway-reason-${value}`} style={pill(reason === value)} onPress={() => setReason(value)}><Text style={pillText(reason === value)}>{tc(key)}</Text></TouchableOpacity>
          ))}</View>
        </View>
      )}
      {inUse.length > 1 && (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: shade("#94a3b8"), marginBottom: 6 }}>{tc("awxWhich")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{inUse.map(entry => (
            <TouchableOpacity key={entry.id} style={pill(outId === entry.id)} onPress={() => setOutId(entry.id)}><Text style={pillText(outId === entry.id)}>{label(entry.device)}</Text></TouchableOpacity>
          ))}</View>
        </View>
      )}
      <Text style={{ color: shade("#94a3b8"), marginBottom: 6 }}>{tc("awxNewDevice")}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>{devices.map(option => (
        <TouchableOpacity key={option.code} testID={`airway-device-${option.code}`} style={pill(device === option.code)}
          onPress={() => { if (option.code !== device) setDetails({}); setDevice(option.code) }}><Text style={pillText(device === option.code)}>{option.label}</Text></TouchableOpacity>
      ))}</View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>{fields.map(field => field.endsWith("Cuffed") ? (
        <TouchableOpacity key={field} testID={`airway-field-${field}`} style={pill(details[field] === true)} onPress={() => setDetails(prev => ({ ...prev, [field]: prev[field] !== true }))}>
          <Text style={pillText(details[field] === true)}>{tc("awCuffed")}</Text>
        </TouchableOpacity>
      ) : (
        <TextInput key={field} testID={`airway-field-${field}`} value={String(details[field] ?? "")} placeholder={field === "dltType" || field === "dltSide" ? "—" : "#"}
          placeholderTextColor={shade("#64748b")} keyboardType={field === "dltType" || field === "dltSide" ? "default" : "decimal-pad"}
          onChangeText={raw => { const n = Number(raw.replace(",", ".")); setDetails(prev => ({ ...prev, [field]: field === "dltType" || field === "dltSide" || raw === "" || !Number.isFinite(n) ? raw : n })) }}
          style={{ minWidth: 80, minHeight: 44, borderWidth: 1, borderColor: shade("#334155"), borderRadius: 10, color: shade("#f8fafc"), paddingHorizontal: 10 }} />
      ))}</View>
    </Sheet>
  )
}
