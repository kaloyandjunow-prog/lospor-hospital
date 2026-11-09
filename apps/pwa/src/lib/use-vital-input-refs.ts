import type { TextInputInstance } from "react-native"
import { useRef } from "react"

/** Text input refs for the vitals sheet's auto-advance focus chaining. */
export function useVitalInputRefs() {
  const vSysRef = useRef<TextInputInstance | null>(null)
  const vDiaRef = useRef<TextInputInstance | null>(null)
  const vHRRef = useRef<TextInputInstance | null>(null)
  const vSpO2Ref = useRef<TextInputInstance | null>(null)
  const vEtco2Ref = useRef<TextInputInstance | null>(null)
  const vTempRef = useRef<TextInputInstance | null>(null)
  const vBisRef = useRef<TextInputInstance | null>(null)
  const vTofRef = useRef<TextInputInstance | null>(null)
  const vCvpRef = useRef<TextInputInstance | null>(null)
  return { vSysRef, vDiaRef, vHRRef, vSpO2Ref, vEtco2Ref, vTempRef, vBisRef, vTofRef, vCvpRef }
}
