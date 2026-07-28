import type { PreopSection } from "@/lib/preop-form-schema"

export const PREOP_REQUIRED_FIELD_SECTION: Record<string, PreopSection> = {
  ageYears: "patient",
  sex: "patient",
  heightCm: "patient",
  weightKg: "patient",
  diagnoses: "case",
  procedures: "case",
  bpSystolic: "exam",
  bpDiastolic: "exam",
  heartRate: "exam",
  respiratoryRate: "exam",
  mallampati: "airway",
  asaScore: "risk",
}

export type PreopRequiredFieldLabels = Partial<Record<keyof typeof PREOP_REQUIRED_FIELD_SECTION, string>>

export function preopRequiredFieldLabel(key: string, labels: PreopRequiredFieldLabels): string {
  return labels[key as keyof typeof PREOP_REQUIRED_FIELD_SECTION] ?? key
}

export function preopInvalidSubmitMessage(
  invalidKeys: string[],
  labels: PreopRequiredFieldLabels,
  intro: string
): string {
  return `${intro}\n\n${invalidKeys.map((key) => `- ${preopRequiredFieldLabel(key, labels)}`).join("\n")}`
}
