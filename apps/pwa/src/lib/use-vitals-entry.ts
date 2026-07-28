import { useState } from "react"
import type { RefObject } from "react"
import { Platform } from "react-native"
import type { TextInput } from "react-native"
import { apiFetch } from "@/lib/api"
import { notify } from "@/lib/notify"
import { uid } from "@/lib/intraop-log-event"
import type { LogEvent } from "@/lib/intraop-log-event"
import { prepareVitalsScanImage, getImagePicker, type ScanImageAsset } from "@/lib/vitals-scan"
import { pickVitalsForColumn } from "@/lib/intraop-projection"
import type { TimetableData } from "@/components/IntraopTimetable"
import {
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  kPaToMmHg,
  mmHgToKPa,
} from "@lospor/core/units"

// Vitals entry, including the "change, not add" behavior (editing the vital
// already charted for this 5-minute column instead of creating a duplicate)
// and the camera-based monitor scan. The edit path bypasses the shared
// `save()` used by every other domain — it directly replaces a log entry at
// the same timestamp rather than appending — so this hook receives the
// lower-level log/sync primitives (syncLog, log, logRef, setLog, startRef,
// setTimetable, eventsToTimetable, roundDown5Min) instead of just `save`.
export function useVitalsEntry(
  save: (partial: Omit<LogEvent, "id" | "ts">, tsOverride?: string, silent?: boolean) => Promise<LogEvent>,
  syncLog: (newLog: LogEvent[]) => Promise<void>,
  setEntryTs: (ts: string | null) => void,
  entryTs: string | null,
  log: LogEvent[],
  logRef: RefObject<LogEvent[]>,
  setLog: (newLog: LogEvent[]) => void,
  startRef: RefObject<Date | null>,
  setTimetable: (d: TimetableData) => void,
  eventsToTimetable: (log: LogEvent[], startTs: Date, now?: Date) => TimetableData,
  roundDown5Min: (d: Date) => Date,
  caseId: string,
  tErrorLabel: string,
  etco2Unit: "mmHg" | "kPa" = "mmHg",
  temperatureUnit: "C" | "F" = "C",
) {
  // EtCO2/temp are always stored canonical (mmHg/°C) — these only convert
  // what's shown/typed in the quick-entry box to match the user's preference.
  const etco2ToDisplay = (mmHg: number) => etco2Unit === "kPa" ? Math.round(mmHgToKPa(mmHg) * 10) / 10 : mmHg
  const etco2ToCanonical = (displayVal: number) => etco2Unit === "kPa" ? kPaToMmHg(displayVal) : displayVal
  const tempToDisplay = (celsius: number) => temperatureUnit === "F" ? Math.round(celsiusToFahrenheit(celsius) * 10) / 10 : celsius
  const tempToCanonical = (displayVal: number) => temperatureUnit === "F" ? fahrenheitToCelsius(displayVal) : displayVal
  const [vitOpen, setVitOpen]   = useState(false)
  const [vitMode, setVitMode]   = useState<"full"|"bp">("full")
  const [vitScanBusy, setVitScanBusy] = useState(false)
  const [editingVitalId, setEditingVitalId] = useState<string | null>(null)
  const [vSys, setVSys]     = useState("")
  const [vDia, setVDia]     = useState("")
  const [vHR, setVHR]       = useState("")
  const [vSpO2, setVSpO2]   = useState("")
  const [vEtco2, setVEtco2] = useState("")
  const [vTemp, setVTemp]   = useState("")
  const [vBgl, setVBgl]     = useState("")

  function openVitals(mode: "full"|"bp" = "full", ts?: string) {
    setEntryTs(ts ?? null)
    setVitMode(mode)
    const { existing: existingAtCol, carryForward } = pickVitalsForColumn(log, startRef.current, ts)
    setEditingVitalId(existingAtCol?.id ?? null)
    // Editing a cell shows that cell's own values; opening an empty cell carries
    // the previous cell's vitals forward, so the clinician only adjusts what
    // changed. (The old code took the first vital in the log array here, which
    // is neither the previous cell nor reliably ordered — so carry-forward
    // pulled a stale value or nothing at all.)
    const prefill = existingAtCol ?? carryForward
    setVSys(prefill?.systolic  != null ? String(prefill.systolic)  : "")
    setVDia(prefill?.diastolic != null ? String(prefill.diastolic) : "")
    setVHR( prefill?.heartRate != null ? String(prefill.heartRate) : "")
    setVSpO2(prefill?.spO2     != null ? String(prefill.spO2)      : "")
    setVEtco2(prefill?.etco2   != null ? String(etco2ToDisplay(prefill.etco2)) : "")
    setVTemp(prefill?.temp     != null ? String(tempToDisplay(prefill.temp))   : "")
    setVBgl(prefill?.bgl       != null ? String(prefill.bgl)       : "")
    setVitOpen(true)
  }

  function confirmVitals() {
    const n = (s: string) => { const v = parseFloat(s); return isNaN(v) ? undefined : v }
    const etco2Raw = n(vEtco2)
    const tempRaw = n(vTemp)
    const vitals = { type:"vital" as const, systolic:n(vSys), diastolic:n(vDia),
      heartRate:n(vHR), spO2:n(vSpO2), etco2: etco2Raw != null ? etco2ToCanonical(etco2Raw) : undefined,
      temp: tempRaw != null ? tempToCanonical(tempRaw) : undefined, bgl:n(vBgl) }
    if ([vitals.systolic,vitals.diastolic,vitals.heartRate,vitals.spO2,vitals.etco2,vitals.temp,vitals.bgl].every(v => v == null)) return
    if (editingVitalId) {
      // Replace existing vital — remove old event, insert new at same timestamp
      const oldEv = log.find(e => e.id === editingVitalId)
      const ts = oldEv?.ts ?? entryTs ?? new Date().toISOString()
      const newEv: LogEvent = { id: uid(), ts, syncStatus: "pending", ...vitals }
      const newLog = [newEv, ...log.filter(e => e.id !== editingVitalId)]
      logRef.current = newLog
      setLog(newLog)
      if (startRef.current) setTimetable(eventsToTimetable(newLog, roundDown5Min(startRef.current), new Date()))
      // Optimistic close, same pattern as confirmInfusion/confirmFluid/confirmAgent —
      // don't block the sheet on the network round-trip.
      setEditingVitalId(null)
      setVitOpen(false)
      void syncLog(newLog)
      return
    }
    setVitOpen(false)
    void save(vitals)
  }

  async function scanVitalsFromCamera() {
    const ImagePicker = getImagePicker()
    if (!ImagePicker) {
      notify("Not available", "Monitor scanning requires a full native rebuild. Run npx expo run:android to enable.")
      return
    }
    setVitScanBusy(true)
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (!perm.granted) {
        notify("Permission denied", "Camera access is required.")
        return
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: Platform.OS === "ios",
        quality: Platform.OS === "web" ? 1 : 0.25,
        base64: true,
      })
      if (result.canceled || !result.assets?.[0]) return

      const prepared = await prepareVitalsScanImage(result.assets[0] as ScanImageAsset)
      if (!prepared.image) throw new Error("Could not read the captured image.")
      if (prepared.image.length > 5_400_000) {
        throw new Error("The photo is still too large. Move closer to the monitor and try again.")
      }

      const res = await apiFetch(`/api/cases/${caseId}/vitals-scan`, {
        method: "POST",
        body: JSON.stringify(prepared),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Monitor scan failed (${res.status}).`)
      }
      const v = await res.json()
      if (v.systolic  != null) setVSys(String(v.systolic))
      if (v.diastolic != null) setVDia(String(v.diastolic))
      if (v.heartRate != null) setVHR(String(v.heartRate))
      if (v.spO2      != null) setVSpO2(String(v.spO2))
      if (v.etco2     != null) setVEtco2(String(etco2ToDisplay(v.etco2)))
      if (v.temp      != null) setVTemp(String(tempToDisplay(v.temp)))
      if ([v.systolic, v.diastolic, v.heartRate, v.spO2, v.etco2, v.temp].every((value: unknown) => value == null)) {
        notify("No readings found", "No clear monitor readings were detected. Retake the photo closer to the screen.")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not read monitor."
      notify(tErrorLabel, message)
    } finally {
      setVitScanBusy(false)
    }
  }

  function setAndAdvance(value: string, setter: (v: string) => void, next?: RefObject<TextInput | null>, maxLen = 3) {
    setter(value)
    if (value.length >= maxLen) next?.current?.focus()
  }

  return {
    vitOpen, setVitOpen, vitMode, setVitMode, vitScanBusy, editingVitalId, setEditingVitalId,
    vSys, setVSys, vDia, setVDia, vHR, setVHR, vSpO2, setVSpO2, vEtco2, setVEtco2, vTemp, setVTemp, vBgl, setVBgl,
    openVitals, confirmVitals, scanVitalsFromCamera, setAndAdvance,
  }
}
