import type { PreopSection } from "@/lib/preop-form-schema"
import { evaluatePreopReadiness, validatePreopPatch } from "@lospor/core/clinical-validation"

export const PREOP_REQUIRED_FIELD_SECTION: Record<string, PreopSection> = {
  ageYears: "patient",
  ageValue: "patient",
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

/**
 * Every required field still missing, in form order, so Continue names them
 * all at once and jumps to the first.
 *
 * zod runs the Core readiness refinement only once the basic fields parse, so
 * the form's own errors listed Sex/Height/Weight/ASA and the age, diagnosis,
 * procedure, vitals and Mallampati came one notice later (found on the
 * appliance, 1.5.0). Core is asked directly here and the two lists merged.
 */
export function preopMissingFieldKeys(invalidKeys: string[], values: Record<string, unknown>): string[] {
  const core = [...validatePreopPatch(values).issues, ...evaluatePreopReadiness(values).issues]
    .map(issue => issue.path[0])
    .filter((key): key is string => Boolean(key))
  const order = Object.keys(PREOP_REQUIRED_FIELD_SECTION)
  const rank = (key: string) => { const at = order.indexOf(key); return at < 0 ? order.length : at }
  return [...new Set([...invalidKeys, ...core])].sort((a, b) => rank(a) - rank(b))
}
