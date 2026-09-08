"use client"
import { useSyncExternalStore } from "react"

// Reads the display-unit preferences SettingsMenu.tsx writes to localStorage
// (heightUnit/weightUnit/temperatureUnit/etco2Unit) — same storage + same
// cross-component "storage" event dispatch pattern already used for
// timetableLayout/vitalsExpanded in IntraopTimetable.tsx. Display-only: the
// canonical value (cm/kg/°C/mmHg) is always what's stored in the database —
// this hook only tells the UI what to show/accept as input.

export type HeightUnit = "cm" | "in"
export type WeightUnit = "kg" | "lb"
export type TemperatureUnit = "C" | "F"
export type Etco2Unit = "mmHg" | "kPa"
// Entry unit for central venous pressure. cmH2O by default because that is how
// the transducers here are scaled; the stored and exported value is always mmHg.
export type CvpUnit = "cmH2O" | "mmHg"

export type UnitPreferences = {
  heightUnit: HeightUnit
  weightUnit: WeightUnit
  temperatureUnit: TemperatureUnit
  etco2Unit: Etco2Unit
  cvpUnit: CvpUnit
}

const DEFAULTS: UnitPreferences = { heightUnit: "cm", weightUnit: "kg", temperatureUnit: "C", etco2Unit: "mmHg", cvpUnit: "cmH2O" }

function readPrefs(): UnitPreferences {
  if (typeof window === "undefined") return DEFAULTS
  const hu = localStorage.getItem("heightUnit")
  const wu = localStorage.getItem("weightUnit")
  const tu = localStorage.getItem("temperatureUnit")
  const eu = localStorage.getItem("etco2Unit")
  const cu = localStorage.getItem("cvpUnit")
  return {
    heightUnit: hu === "in" ? "in" : "cm",
    weightUnit: wu === "lb" ? "lb" : "kg",
    temperatureUnit: tu === "F" ? "F" : "C",
    etco2Unit: eu === "kPa" ? "kPa" : "mmHg",
    cvpUnit: cu === "mmHg" ? "mmHg" : "cmH2O",
  }
}

// useSyncExternalStore requires getSnapshot to return a stable (===) reference
// when nothing has changed, or it re-renders forever — cache the last read
// and only build a new object when a value actually differs.
let cached: UnitPreferences = DEFAULTS
function getSnapshot(): UnitPreferences {
  const next = readPrefs()
  if (next.heightUnit !== cached.heightUnit || next.weightUnit !== cached.weightUnit ||
      next.temperatureUnit !== cached.temperatureUnit || next.etco2Unit !== cached.etco2Unit ||
      next.cvpUnit !== cached.cvpUnit) {
    cached = next
  }
  return cached
}
function subscribe(onStoreChange: () => void) {
  function onStorage(e: StorageEvent) {
    if (["heightUnit", "weightUnit", "temperatureUnit", "etco2Unit", "cvpUnit"].includes(e.key ?? "")) onStoreChange()
  }
  window.addEventListener("storage", onStorage)
  return () => window.removeEventListener("storage", onStorage)
}

export function useUnitPreferences(): UnitPreferences {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULTS)
}
