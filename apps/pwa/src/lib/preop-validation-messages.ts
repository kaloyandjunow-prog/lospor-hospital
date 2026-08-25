import type { ClinicalStringKey } from "@/lib/preferences-context"

const PREOP_VALIDATION_KEYS: Record<string, ClinicalStringKey> = {
  missing_diagnosis: "validationMissingDiagnosis",
  missing_procedure: "validationMissingProcedure",
  missing_blood_pressure: "validationMissingBloodPressure",
  missing_heart_rate: "validationMissingHeartRate",
  missing_respiratory_rate: "validationMissingRespiratoryRate",
  missing_airway: "validationMissingAirway",
  missing_age: "validationMissingAge",
  missing_sex: "validationMissingSex",
  missing_height: "validationMissingHeight",
  missing_weight: "validationMissingWeight",
  missing_asa: "validationMissingAsa",
}

export function localizedPreopValidationMessage(
  message: unknown,
  translate: (key: ClinicalStringKey) => string,
): string | undefined {
  if (typeof message !== "string" || !message) return undefined
  return translate(PREOP_VALIDATION_KEYS[message] ?? "validationInvalidField")
}
