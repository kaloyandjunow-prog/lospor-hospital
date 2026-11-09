import type { IntraopVitalKey } from "@lospor/core/intraop-vitals"
import type { VitalEntryFeedback } from "@/lib/intraop-vital-entry"

/** The message under a vital field: a hard error, else a soft warning, else nothing. */
export function vitalFeedbackText(
  feedback: VitalEntryFeedback,
  field: IntraopVitalKey,
  tc: (key: never) => string,
): { text: string; error: boolean } | null {
  const say = tc as (key: string) => string
  if (feedback.errors[field]) {
    const text = field === "bis" ? say("vsErrorBis")
      : field === "tofRatio" ? say("vsErrorTofRatio")
      : field === "spO2" ? say("vsErrorSpo2")
      : field === "systolic" || field === "diastolic" || field === "heartRate"
        ? say("vsErrorWholeNonnegative")
        : field === "etco2" ? say("vsErrorNonnegative")
        : say("vsErrorNumber")
    return { text, error: true }
  }
  const warning = feedback.warnings[field]
  if (!warning) return null
  const low = warning === "low"
  const key = field === "systolic" ? (low ? "vsWarningSysLow" : "vsWarningSysHigh")
    : field === "diastolic" ? "vsWarningDiaHigh"
    : field === "heartRate" ? (low ? "vsWarningHeartLow" : "vsWarningHeartHigh")
    : field === "spO2" ? "vsWarningSpo2Low"
    : field === "etco2" ? (low ? "vsWarningEtco2Low" : "vsWarningEtco2High")
    : field === "temp" ? (low ? "vsWarningTempLow" : "vsWarningTempHigh")
    : null
  return key ? { text: say(key), error: false } : null
}
