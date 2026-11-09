import { useMemo, useState } from "react"
import { Text, TextInput, TouchableOpacity, View } from "react-native"
import { airwayPrimaryConflict, airwayDevicesInUse, hasActiveTrachealTube, type AirwayDeviceEntry, type AirwayExchangeReason } from "@lospor/core/airway-device-entries"
import {
  addAirwayDevice,
  airwayAsks,
  airwayAsksHow,
  airwayClinicalEvent,
  airwayHowOrder,
  airwayRecordFields,
  resolveAirwayTime,
  suggestedAirwayDetails,
  type AirwayPatient,
  type AirwayTimeChoice,
} from "@lospor/core/airway-smart"
import { instantFromLocalTime, localTimeOf } from "@lospor/core/intraop-time"
import { clinicalRecordId } from "@lospor/core/clinical-record-id"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"

/**
 * The one panel Smart selection adds a device with (10.2.0), on the phone: size
 * and cuff (the size suggested for this patient marked), how it was placed,
 * and when. It opens under the Airway tab, and from the timeline when
 * Intubated, LMA in and the like are charted, with that time already set.
 * What it offers and how it saves is Core's (airway-smart), the same as the web.
 */
export type AirwaySmartRequest = {
  device: string
  at?: string | null
  source: "tab" | "timeline"
  eventId?: string
  eventLabel?: string
  replaces?: { id: string; reason: AirwayExchangeReason } | null
}

export type AirwaySmartChartEvent = { id?: string; label: string; ts: string; intraopPatch?: Record<string, unknown> }

const WHY = [["failed_device", "awxFailedDevice"], ["planned", "awxPlanned"], ["unplanned_extubation", "awxUnplanned"]] as const

type Details = Record<string, string | number | boolean | null | undefined>

export function AirwaySmartPanel({
  request, entries, patient, startedAt, now, timeZone, difficultAirway, deviceLabel, toolLabel, toolCodes, onSave, onClose,
}: {
  request: AirwaySmartRequest
  entries: readonly AirwayDeviceEntry[]
  patient: AirwayPatient
  startedAt: string | null
  now: () => string
  timeZone: string | null
  difficultAirway: boolean
  deviceLabel: (code: string) => string
  toolLabel: (code: string) => string
  toolCodes?: readonly string[]
  onSave: (next: AirwayDeviceEntry[], event?: AirwaySmartChartEvent) => void
  onClose: () => void
}) {
  const shade = useShade()
  const { tc } = usePreferences()
  const suggested = useMemo(() => suggestedAirwayDetails(request.device, patient) as Details, [request.device, patient])
  const asks = airwayAsks(request.device)
  const [details, setDetails] = useState<Details>(suggested)
  const [how, setHow] = useState<string[]>([])
  const [reason, setReason] = useState<AirwayExchangeReason | null>(request.replaces?.reason ?? null)
  const [choice, setChoice] = useState<AirwayTimeChoice>(request.source === "timeline" ? "timeline" : request.replaces ? "now" : "start")
  const clock = (iso: string | null | undefined) => (iso && timeZone ? localTimeOf(new Date(iso), timeZone) : null) ?? iso?.slice(11, 16) ?? ""
  const [picked, setPicked] = useState<string>(() => clock(request.at ?? now()))
  const fill = (key: "asmFromTimeline" | "asmStart" | "asmNow", iso: string | null | undefined) => tc(key).replace("{time}", clock(iso))
  const conflict = request.replaces ? null : airwayPrimaryConflict(entries, request.device)
  const replacementId = request.replaces?.id ?? conflict?.id ?? null
  const pickedInstant = timeZone && /^\d{1,2}:\d{2}$/.test(picked)
    ? instantFromLocalTime(new Date(startedAt ?? now()), picked, timeZone)?.toISOString() ?? null
    : null
  const timeMissing = ((choice === "start" || choice === "now") && startedAt == null)
    || (choice === "timeline" && !request.at)
    || (choice === "pick" && !pickedInstant)

  function save() {
    if (replacementId && !reason) return
    const at = resolveAirwayTime(choice, { startedAt, now: now(), picked: choice === "timeline" ? request.at ?? null : pickedInstant })
    if (!at) return
    const priorTrachealTube = hasActiveTrachealTube(entries)
    const eventLabel = request.source === "timeline"
      ? replacementId
        ? airwayClinicalEvent(request.device, { replaces: true, priorTrachealTube })
        : request.eventLabel ?? null
      : airwayClinicalEvent(request.device, { replaces: !!replacementId, priorTrachealTube })
    const eventId = eventLabel ? (request.eventId ?? clinicalRecordId("airway-event", at)) : undefined
    const kept = Object.fromEntries(asks.filter(ask => details[ask.field] !== undefined && details[ask.field] !== "").map(ask => [ask.field, details[ask.field]]))
    const next = addAirwayDevice(entries, {
      id: clinicalRecordId("airway", at), device: request.device, details: kept, insertedAt: at, instruments: how,
      ...(eventId ? { sourceEventId: eventId } : {}),
      replaces: replacementId ? { id: replacementId, reason: reason ?? request.replaces?.reason ?? "planned" } : null,
    })
    onSave(next, eventLabel
      ? { id: eventId, label: eventLabel, ts: at, intraopPatch: airwayRecordFields(next) }
      : undefined)
  }

  const pill = (on: boolean) => ({
    minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, justifyContent: "center" as const,
    borderColor: on ? shade("#a67cff") : shade("#334155"), backgroundColor: on ? shade("#a67cff") + "33" : shade("#1c1c1c"),
  })
  const pillText = (on: boolean) => ({ color: on ? shade("#e9ddff") : shade("#e2e8f0"), fontWeight: "700" as const, fontSize: 14 })
  const label = (text: string) => <Text style={{ color: shade("#94a3b8"), fontSize: 10, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>{text}</Text>
  const row = { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6, marginBottom: 12 }
  const replaced = replacementId ? airwayDevicesInUse(entries).find(entry => entry.id === replacementId) : null
  const sizeLabel = (field: string) => (field === "dltType" ? tc("awDltType") : field === "dltSide" ? tc("awDltSide") : tc("asmSize"))

  return (
    <View testID="airway-smart-panel" style={{ borderWidth: 1, borderColor: shade("#a67cff"), borderRadius: 14, padding: 12, backgroundColor: shade("#141414"), marginBottom: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
        <Text style={{ flex: 1, color: shade("#f8fafc"), fontSize: 16, fontWeight: "800" }}>{deviceLabel(request.device)}</Text>
        <TouchableOpacity testID="airway-smart-close" onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={{ color: shade("#94a3b8"), fontSize: 20 }}>✕</Text></TouchableOpacity>
      </View>

      {(request.replaces || conflict) ? (
        <View>
          {conflict ? <Text testID="airway-smart-active-conflict" style={{ color: shade("#fde68a"), backgroundColor: shade("#3b2f12"), borderRadius: 8, padding: 8, fontSize: 12, marginBottom: 8 }}>
            {tc("asmActivePrimaryConflict").replace("{device}", deviceLabel(conflict.device))}
          </Text> : null}
          {label(tc("awxWhy"))}
          <View style={row}>{WHY.map(([value, key]) => (
            <TouchableOpacity key={value} testID={`airway-smart-why-${value}`} style={pill(reason === value)} onPress={() => setReason(value)}><Text style={pillText(reason === value)}>{tc(key)}</Text></TouchableOpacity>
          ))}</View>
          {replaced ? <Text style={{ color: shade("#cbd5e1"), fontSize: 12, marginBottom: 12 }}>
            {tc("asmOldStays").replace("{device}", deviceLabel(replaced.device)).replace("{status}", reason === "planned" ? tc("awxReplaced") : tc("awxFailed"))}
          </Text> : null}
        </View>
      ) : null}

      {asks.map(ask => (
        <View key={ask.field}>
          {label(ask.kind === "cuff" ? tc("asmCuff") : sizeLabel(ask.field))}
          <View style={row}>
            {ask.kind === "cuff" ? (
              <>
                <TouchableOpacity testID="airway-smart-cuffed" style={pill(details[ask.field] === true)} onPress={() => setDetails(prev => ({ ...prev, [ask.field]: true }))}><Text style={pillText(details[ask.field] === true)}>{tc("asmCuffed")}</Text></TouchableOpacity>
                <TouchableOpacity testID="airway-smart-uncuffed" style={pill(details[ask.field] === false)} onPress={() => setDetails(prev => ({ ...prev, [ask.field]: false }))}><Text style={pillText(details[ask.field] === false)}>{tc("asmUncuffed")}</Text></TouchableOpacity>
              </>
            ) : ask.values.map(value => (
              <TouchableOpacity key={String(value)} testID={`airway-smart-${ask.field}-${value}`} style={pill(details[ask.field] === value)} onPress={() => setDetails(prev => ({ ...prev, [ask.field]: value }))}>
                <Text style={pillText(details[ask.field] === value)}>{String(value)}{suggested[ask.field] === value ? `  ${tc("asmSuggested")}` : ""}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      {airwayAsksHow(request.device) ? (
        <View>
          {label(tc("asmHow"))}
          <View style={row}>{airwayHowOrder(difficultAirway, toolCodes).map(code => (
            <TouchableOpacity key={code} testID={`airway-smart-how-${code}`} style={pill(how.includes(code))}
              onPress={() => setHow(prev => prev.includes(code) ? prev.filter(item => item !== code) : [...prev, code])}>
              <Text style={pillText(how.includes(code))}>{toolLabel(code)}</Text>
            </TouchableOpacity>
          ))}</View>
        </View>
      ) : null}

      {label(tc("asmTime"))}
      <View style={row}>
        {request.source === "timeline" ? <TouchableOpacity testID="airway-smart-time-timeline" style={pill(choice === "timeline")} onPress={() => setChoice("timeline")}><Text style={pillText(choice === "timeline")}>{fill("asmFromTimeline", request.at)}</Text></TouchableOpacity> : null}
        <TouchableOpacity testID="airway-smart-time-start" style={pill(choice === "start")} onPress={() => setChoice("start")}><Text style={pillText(choice === "start")}>{fill("asmStart", startedAt)}</Text></TouchableOpacity>
        <TouchableOpacity testID="airway-smart-time-now" style={pill(choice === "now")} onPress={() => setChoice("now")}><Text style={pillText(choice === "now")}>{fill("asmNow", now())}</Text></TouchableOpacity>
        <TouchableOpacity testID="airway-smart-time-pick" style={pill(choice === "pick")} onPress={() => setChoice("pick")}><Text style={pillText(choice === "pick")}>{tc("asmPick")}</Text></TouchableOpacity>
        {choice === "pick" ? (
          <TextInput testID="airway-smart-time-input" value={picked} onChangeText={setPicked} placeholder="HH:MM" placeholderTextColor={shade("#64748b")} keyboardType="numbers-and-punctuation" maxLength={5}
            style={{ minWidth: 90, minHeight: 44, borderWidth: 1, borderColor: shade("#334155"), borderRadius: 10, color: shade("#f8fafc"), paddingHorizontal: 10 }} />
        ) : null}
      </View>

      {timeMissing ? <Text testID="airway-smart-time-missing" style={{ color: shade("#fde68a"), backgroundColor: shade("#3b2f12"), borderRadius: 8, padding: 8, fontSize: 12, marginBottom: 8 }}>
        {tc("asmTimeMissing")}
      </Text> : null}
      <TouchableOpacity testID="airway-smart-add" disabled={(!!replacementId && !reason) || timeMissing} onPress={save}
        style={{ minHeight: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: ((replacementId && !reason) || timeMissing) ? shade("#262626") : shade("#a67cff") }}>
        <Text style={{ color: ((replacementId && !reason) || timeMissing) ? shade("#64748b") : shade("#12082b"), fontWeight: "800", fontSize: 15 }}>{tc("asmAdd")}</Text>
      </TouchableOpacity>
    </View>
  )
}
