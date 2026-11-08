import { useCallback, useState } from "react"
import { patchWebClinicalPreferences } from "@/lib/clinical-preferences-web"

export type UnitSettings = {
  height: "cm" | "in"; weight: "kg" | "lb"; temperature: "C" | "F"; etco2: "mmHg" | "kPa"; cvp: "cmH2O" | "mmHg"
}

/**
 * Display-only units — the database always stores the canonical value
 * (cm/kg/°C/mmHg); these just convert what is shown/typed in vitals entry.
 * Drugs, infusions, fluids, and labs are not affected.
 */
export function useUnitSettings() {
  const [heightUnit, setHeightUnitState] = useState<UnitSettings["height"]>("cm")
  const [weightUnit, setWeightUnitState] = useState<UnitSettings["weight"]>("kg")
  const [temperatureUnit, setTemperatureUnitState] = useState<UnitSettings["temperature"]>("C")
  const [etco2Unit, setEtco2UnitState] = useState<UnitSettings["etco2"]>("mmHg")
  const [cvpUnit, setCvpUnitState] = useState<UnitSettings["cvp"]>("cmH2O")

  /** Unit keys from localStorage, which cannot be read during SSR. */
  const loadStoredUnits = useCallback(() => {
    const hu = localStorage.getItem("heightUnit")
    if (hu === "cm" || hu === "in") setHeightUnitState(hu)
    const wu = localStorage.getItem("weightUnit")
    if (wu === "kg" || wu === "lb") setWeightUnitState(wu)
    const tu = localStorage.getItem("temperatureUnit")
    if (tu === "C" || tu === "F") setTemperatureUnitState(tu)
    const eu = localStorage.getItem("etco2Unit")
    const cu = localStorage.getItem("cvpUnit")
    if (eu === "mmHg" || eu === "kPa") setEtco2UnitState(eu)
    if (cu === "cmH2O" || cu === "mmHg") setCvpUnitState(cu)
  }, [])
  const applyServerUnits = useCallback((units: UnitSettings) => {
    setHeightUnitState(units.height)
    setWeightUnitState(units.weight)
    setTemperatureUnitState(units.temperature)
    setEtco2UnitState(units.etco2)
    setCvpUnitState(units.cvp)
  }, [])

  function applyHeightUnit(u: UnitSettings["height"]) { setHeightUnitState(u); void patchWebClinicalPreferences({ units: { height: u } }) }
  function applyWeightUnit(u: UnitSettings["weight"]) { setWeightUnitState(u); void patchWebClinicalPreferences({ units: { weight: u } }) }
  function applyTemperatureUnit(u: UnitSettings["temperature"]) { setTemperatureUnitState(u); void patchWebClinicalPreferences({ units: { temperature: u } }) }
  function applyEtco2Unit(u: UnitSettings["etco2"]) { setEtco2UnitState(u); void patchWebClinicalPreferences({ units: { etco2: u } }) }
  // Display only. Central venous pressure is stored and exported in mmHg
  // whatever is chosen here, so switching re-renders existing cases rather
  // than altering them.
  function applyCvpUnit(u: UnitSettings["cvp"]) { setCvpUnitState(u); void patchWebClinicalPreferences({ units: { cvp: u } }) }

  return { heightUnit, weightUnit, temperatureUnit, etco2Unit, cvpUnit, loadStoredUnits, applyServerUnits, applyHeightUnit, applyWeightUnit, applyTemperatureUnit, applyEtco2Unit, applyCvpUnit }
}
