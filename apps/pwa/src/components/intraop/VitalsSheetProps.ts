import type { RefObject } from "react"
import type { TextInputInstance } from "react-native"
import type { VitalEntryFeedback } from "@/lib/intraop-vital-entry"

/** What the vitals sheet is given: the values, their refs, which optional fields show, and what to do on a change. */
export type VitalsSheetProps = {
  visible: boolean
  title: string
  mode: "bp" | "full"
  scanBusy: boolean
  showEtco2: boolean
  showTemperature: boolean
  showBis: boolean
  showTofRatio: boolean
  showCvp: boolean
  showIbp: boolean
  etco2Unit: string
  cvpUnit: string
  temperatureUnit: string
  sysRef: RefObject<TextInputInstance | null>
  diaRef: RefObject<TextInputInstance | null>
  hrRef: RefObject<TextInputInstance | null>
  spo2Ref: RefObject<TextInputInstance | null>
  etco2Ref: RefObject<TextInputInstance | null>
  tempRef: RefObject<TextInputInstance | null>
  bisRef: RefObject<TextInputInstance | null>
  tofRatioRef: RefObject<TextInputInstance | null>
  cvpRef: RefObject<TextInputInstance | null>
  systolic: string
  diastolic: string
  heartRate: string
  spo2: string
  etco2: string
  temperature: string
  bis: string
  tofRatio: string
  cvp: string
  /** The arterial line and the cuff mean (10.2.0). systolic and diastolic above are the cuff (NIBP). */
  ibp: Record<"ibpSystolic" | "ibpDiastolic" | "ibpMap" | "nibpMap", string>
  onIbpChange: (field: "ibpSystolic" | "ibpDiastolic" | "ibpMap" | "nibpMap", value: string) => void
  feedback: VitalEntryFeedback
  onClose: () => void
  onScan: () => void
  onSystolicChange: (value: string) => void
  onDiastolicChange: (value: string) => void
  onHeartRateChange: (value: string) => void
  onSpo2Change: (value: string) => void
  onEtco2Change: (value: string) => void
  onTemperatureChange: (value: string) => void
  onBisChange: (value: string) => void
  onTofRatioChange: (value: string) => void
  onCvpChange: (value: string) => void
  onConfirm: () => void
}
