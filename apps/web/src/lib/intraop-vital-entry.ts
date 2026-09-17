import {
  intraopVitalHardError,
  intraopVitalWarning,
  type IntraopVitalHardError,
  type IntraopVitalKey,
  type IntraopVitalWarning,
} from "@lospor/core/intraop-vitals"
import { cvpToCanonical } from "@lospor/core/monitoring-values"

export type WebVitalFeedback = {
  value: number | undefined
  error: IntraopVitalHardError | null
  warning: IntraopVitalWarning | null
}

export type VitalFeedbackMessageKey =
  | "vitalErrorBis"
  | "vitalErrorTofRatio"
  | "vitalErrorSpo2"
  | "vitalErrorWholeNonnegative"
  | "vitalErrorNonnegative"
  | "vitalErrorNumber"
  | "vitalWarningSysHigh"
  | "vitalWarningDiaHigh"
  | "vitalWarningHeartLow"
  | "vitalWarningHeartHigh"
  | "vitalWarningTempLow"
  | "vitalWarningTempHigh"

export function evaluateVitalInput(
  key: IntraopVitalKey,
  raw: string,
  cvpUnit: "cmH2O" | "mmHg" = "mmHg",
): WebVitalFeedback {
  const normalized = raw.trim().replace(",", ".")
  if (normalized === "") return { value: undefined, error: null, warning: null }
  const displayValue = Number(normalized)
  const value = key === "cvp" && Number.isFinite(displayValue)
    ? cvpToCanonical(displayValue, cvpUnit)
    : displayValue
  const error = intraopVitalHardError(key, value)
  return {
    value,
    error,
    warning: error ? null : intraopVitalWarning(key, value),
  }
}

export function evaluateVitalValue(
  key: IntraopVitalKey,
  value: number | undefined,
): WebVitalFeedback {
  if (value == null) return { value: undefined, error: null, warning: null }
  const error = intraopVitalHardError(key, value)
  return { value, error, warning: error ? null : intraopVitalWarning(key, value) }
}

export function vitalFeedbackMessageKey(
  key: IntraopVitalKey,
  feedback: Pick<WebVitalFeedback, "error" | "warning">,
): VitalFeedbackMessageKey | null {
  if (feedback.error) {
    if (key === "bis") return "vitalErrorBis"
    if (key === "tofRatio") return "vitalErrorTofRatio"
    if (key === "spO2") return "vitalErrorSpo2"
    if (key === "systolic" || key === "diastolic" || key === "heartRate") return "vitalErrorWholeNonnegative"
    if (key === "etco2") return "vitalErrorNonnegative"
    return "vitalErrorNumber"
  }
  if (!feedback.warning) return null
  if (key === "systolic") return "vitalWarningSysHigh"
  if (key === "diastolic") return "vitalWarningDiaHigh"
  if (key === "heartRate") return feedback.warning === "low" ? "vitalWarningHeartLow" : "vitalWarningHeartHigh"
  return feedback.warning === "low" ? "vitalWarningTempLow" : "vitalWarningTempHigh"
}
