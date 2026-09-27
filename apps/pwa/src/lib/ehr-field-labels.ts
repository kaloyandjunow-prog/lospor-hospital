import type { EhrImportableField } from "@lospor/core/ehr-import"

/**
 * What each field the hospital system can send is called in the import review.
 *
 * The review showed the internal field name ("AGEUNIT", "ageUnit") because no
 * surface passed a label (1.4.13). One table for every importable field, so a
 * field added to `EHR_IMPORTABLE_FIELDS` without a name fails the type check
 * here rather than turning up raw on a clinician's screen. Kept in step with
 * the web copy of this file by `ehr-field-labels.test.ts` in both apps.
 */
export const EHR_FIELD_LABELS: Record<EhrImportableField, { en: string; bg: string }> = {
  ageYears: { en: "Age", bg: "Възраст" },
  ageValue: { en: "Exact age", bg: "Точна възраст" },
  ageUnit: { en: "Age unit", bg: "Единица за възраст" },
  sex: { en: "Sex", bg: "Пол" },
  heightCm: { en: "Height", bg: "Ръст" },
  weightKg: { en: "Weight", bg: "Тегло" },
  bloodType: { en: "Blood group", bg: "Кръвна група" },
  rhFactor: { en: "Rh factor", bg: "Rh фактор" },
  bpSystolic: { en: "Systolic blood pressure", bg: "Систолно артериално налягане" },
  bpDiastolic: { en: "Diastolic blood pressure", bg: "Диастолно артериално налягане" },
  heartRate: { en: "Heart rate", bg: "Сърдечна честота" },
  spO2: { en: "SpO₂", bg: "SpO₂" },
  temperature: { en: "Temperature", bg: "Температура" },
  respiratoryRate: { en: "Respiratory rate", bg: "Дихателна честота" },
  diagnoses: { en: "Diagnoses", bg: "Диагнози" },
  comorbidities: { en: "Comorbidities", bg: "Придружаващи заболявания" },
  currentMedications: { en: "Current medications", bg: "Приемани медикаменти" },
  allergyDetails: { en: "Allergies", bg: "Алергии" },
  allergies: { en: "Known allergies", bg: "Известни алергии" },
  latexAllergy: { en: "Latex allergy", bg: "Алергия към латекс" },
  procedures: { en: "Planned procedure", bg: "Планирана операция" },
  labResults: { en: "Laboratory results", bg: "Изследвания" },
}

export function ehrFieldLabel(field: string, language: string): string {
  const labels = (EHR_FIELD_LABELS as Record<string, { en: string; bg: string }>)[field]
  if (!labels) return field
  return language === "bg" ? labels.bg : labels.en
}
