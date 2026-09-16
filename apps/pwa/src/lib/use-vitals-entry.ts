import { useState } from "react"
import type { RefObject } from "react"
import { Platform } from "react-native"
import type { TextInput } from "react-native"
import { apiFetch } from "@/lib/api"
import { notify } from "@/lib/notify"
import type { LogEvent } from "@/lib/intraop-log-event"
import {
  buildVitalEntry,
  hasAnyVitalValue,
  replaceVitalEvent,
  vitalEntryFeedback,
} from "@/lib/intraop-vital-entry"
import { prepareVitalsScanImage, getImagePicker, type ScanImageAsset } from "@/lib/vitals-scan"
import { pickVitalsForColumn } from "@/lib/intraop-projection"
import type { TimetableData } from "@/components/IntraopTimetable"
import {
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  kPaToMmHg,
  mmHgToKPa,
} from "@lospor/core/units"
import { cvpToCanonical, cvpToDisplay } from "@lospor/core/monitoring-values"
import { usePreferences } from "@/lib/preferences-context"

// Vitals entry, including the "change, not add" behavior (editing the vital
// already charted for this 5-minute column instead of creating a duplicate)
// and the camera-based monitor scan. The edit path bypasses the shared
// `save()` used by every other domain — it directly updates a log entry at
// the same timestamp and with the same logical ID — so this hook receives the
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
  cvpUnit: "cmH2O" | "mmHg" = "cmH2O",
) {
  const { tc } = usePreferences()
  // EtCO2/temp are always stored canonical (mmHg/°C) — these only convert
  // what's shown/typed in the quick-entry box to match the user's preference.
  const etco2ToDisplay = (mmHg: number) => etco2Unit === "kPa" ? Math.round(mmHgToKPa(mmHg) * 10) / 10 : mmHg
  const etco2ToCanonical = (displayVal: number) => etco2Unit === "kPa" ? kPaToMmHg(displayVal) : displayVal
  const tempToDisplay = (celsius: number) => temperatureUnit === "F" ? Math.round(celsiusToFahrenheit(celsius) * 10) / 10 : celsius
  const tempToCanonical = (displayVal: number) => temperatureUnit === "F" ? fahrenheitToCelsius(displayVal) : displayVal
  // CVP is the same arrangement as EtCO2 above, with the default inverted: the
  // column is mmHg and cmH2O is what a clinician usually reads off, because
  // that is how the transducers here are scaled.
  const cvpDisplay = (mmHg: number) => cvpToDisplay(mmHg, cvpUnit)
  const cvpCanonical = (displayVal: number) => cvpToCanonical(displayVal, cvpUnit)
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
  const [vBis, setVBis]     = useState("")
  const [vTof, setVTof]     = useState("")
  const [vCvp, setVCvp]     = useState("")
  const vitalEntry = buildVitalEntry({
    systolic: vSys,
    diastolic: vDia,
    heartRate: vHR,
    spO2: vSpO2,
    etco2: vEtco2,
    temp: vTemp,
    bis: vBis,
    tofRatio: vTof,
    cvp: vCvp,
  }, {
    etco2: etco2ToCanonical,
    temp: tempToCanonical,
    cvp: cvpCanonical,
  })
  const vitalFeedback = vitalEntryFeedback(vitalEntry)

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
    setVBis(prefill?.bis       != null ? String(prefill.bis)       : "")
    setVTof(prefill?.tofRatio  != null ? String(prefill.tofRatio)  : "")
    setVCvp(prefill?.cvp       != null ? String(cvpDisplay(prefill.cvp)) : "")
    setVitOpen(true)
  }

  function confirmVitals() {
    // A charted 0 counts as a reading: a BIS of 0 is an isoelectric EEG and a
    // train-of-four of 0 is a fully paralysed patient, so this checks for
    // absence rather than falsiness.
    if (!hasAnyVitalValue(vitalEntry) || vitalFeedback.hasHardErrors) return
    if (editingVitalId) {
      const edited = replaceVitalEvent(
        log,
        editingVitalId,
        vitalEntry,
        entryTs ?? new Date().toISOString(),
      )
      const newLog = edited.log
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
    void save(vitalEntry)
  }

  async function scanVitalsFromCamera() {
    const ImagePicker = getImagePicker()
    if (!ImagePicker) {
      notify(tc("monitorScanUnavailableTitle"), tc("monitorScanUnavailableMsg"))
      return
    }
    setVitScanBusy(true)
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (!perm.granted) {
        notify(tc("cameraPermissionDenied"), tc("cameraAccessRequired"))
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
        notify(tc("noReadingsFound"), tc("noReadingsFoundMsg"))
      }
    } catch {
      notify(tErrorLabel, tc("monitorScanFailedMsg"))
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
    vSys, setVSys, vDia, setVDia, vHR, setVHR, vSpO2, setVSpO2, vEtco2, setVEtco2, vTemp, setVTemp,
    vBis, setVBis, vTof, setVTof, vCvp, setVCvp,
    vitalFeedback, openVitals, confirmVitals, scanVitalsFromCamera, setAndAdvance,
  }
}
