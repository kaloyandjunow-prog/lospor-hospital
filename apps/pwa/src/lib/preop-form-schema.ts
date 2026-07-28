import { z } from "zod"
import {
  CLINICAL_NUMBER_RULES,
  evaluatePreopReadiness,
  validatePreopPatch,
  type ClinicalValidationResult,
} from "@lospor/core/clinical-validation"

const preopNumber = (field: string) => {
  const rule = CLINICAL_NUMBER_RULES.preop[field]
  if (!rule) throw new Error(`Missing Core number rule for preop.${field}`)
  return z.number().min(rule.min).max(rule.max)
}

const issueMessages: Record<string, string> = {
  missing_diagnosis: "At least one diagnosis is required",
  missing_procedure: "At least one procedure is required",
  missing_blood_pressure: "Blood pressure is required",
  missing_heart_rate: "Heart rate is required",
  missing_respiratory_rate: "Respiratory rate is required",
  missing_airway: "Mallampati class is required",
  missing_age: "Age is required",
  missing_sex: "Sex is required",
  missing_height: "Height is required",
  missing_weight: "Weight is required",
  missing_asa: "ASA score is required",
}

function addCoreIssues(
  result: ClinicalValidationResult,
  ctx: z.RefinementCtx,
): void {
  for (const issue of result.issues) {
    ctx.addIssue({
      code: "custom",
      path: issue.path,
      message: issueMessages[issue.code] ?? issue.code,
    })
  }
}

export const preopFormSchema = z.object({
  patientNumber: z.string().trim().max(128).optional(),
  ageYears: preopNumber("ageYears"),
  sex: z.enum(["MALE", "FEMALE", "OTHER"]),
  heightCm: preopNumber("heightCm"),
  weightKg: preopNumber("weightKg"),
  bloodType: z.enum(["A", "B", "AB", "O"]).optional(),
  rhFactor: z.enum(["POSITIVE", "NEGATIVE"]).optional(),

  diagnoses: z.array(z.object({ label: z.string(), code: z.string().optional(), system: z.string().optional(), labelEn: z.string().optional(), labelBg: z.string().optional() })).default([]),
  procedures: z.array(z.object({ label: z.string(), code: z.string().optional() })).default([]),
  highRiskSurgery: z.boolean().default(false),
  elective: z.boolean().default(false),
  emergencySurgery: z.boolean().default(false),

  comorbidities: z.array(z.object({ label: z.string(), code: z.string().optional(), sub: z.string().optional(), system: z.string().optional(), labelEn: z.string().optional(), labelBg: z.string().optional() })).default([]),
  currentMedications: z.array(z.object({ label: z.string(), inn: z.string().optional(), atcCode: z.string().optional() })).default([]),

  allergies: z.boolean().default(false),
  latexAllergy: z.boolean().default(false),
  allergyDetails: z.array(z.object({ label: z.string(), inn: z.string().optional(), atcCode: z.string().optional() })).default([]),
  familyAnesthesiaProblems: z.boolean().default(false),
  familyAnesthesiaDetails: z.string().max(500).optional(),
  dentalProsthetics: z.boolean().default(false),
  looseTeeth: z.boolean().default(false),
  smoking: z.boolean().default(false),
  substanceAbuse: z.boolean().default(false),

  bpSystolic: preopNumber("bpSystolic").optional(),
  bpDiastolic: preopNumber("bpDiastolic").optional(),
  heartRate: preopNumber("heartRate").optional(),
  heartArrhythmia: z.boolean().default(false),
  spO2: preopNumber("spO2").optional(),
  temperature: preopNumber("temperature").optional(),
  respiratoryRate: preopNumber("respiratoryRate").optional(),
  bpUnobtainable: z.boolean().default(false),
  heartRateUnobtainable: z.boolean().default(false),
  spO2Unobtainable: z.boolean().default(false),
  temperatureUnobtainable: z.boolean().default(false),
  respiratoryRateUnobtainable: z.boolean().default(false),
  physicalExamReport: z.string().max(500).optional(),

  mallampati: z.enum(["I", "II", "III", "IV"]).optional(),
  mouthOpeningCm: preopNumber("mouthOpeningCm").optional(),
  thyromental: preopNumber("thyromental").optional(),
  neckMobility: z.enum(["FULL", "LIMITED", "FIXED"]).optional(),
  upperLipBiteTest: z.enum(["CLASS_I", "CLASS_II", "CLASS_III"]).optional(),
  cormackLehane: z.enum(["I", "IIa", "IIb", "III", "IV"]).optional(),
  retrognathia: z.boolean().default(false),
  prominentIncisors: z.boolean().default(false),
  facialHair: z.boolean().default(false),
  difficultAirwayHistory: z.boolean().default(false),
  difficultAirwayNotes: z.string().max(500).optional(),
  airwayUnobtainable: z.boolean().default(false),

  rcriIschemicHeart: z.boolean().default(false),
  rcriCHF: z.boolean().default(false),
  rcriCVD: z.boolean().default(false),
  rcriInsulinDM: z.boolean().default(false),
  rcriCreatinine: z.boolean().default(false),
  apfelPONVHistory: z.boolean().default(false),
  apfelPostopOpioids: z.boolean().default(false),
  stopbangSnoring: z.boolean().default(false),
  stopbangTired: z.boolean().default(false),
  stopbangObserved: z.boolean().default(false),
  stopbangBP: z.boolean().default(false),
  stopbangNeck: z.boolean().default(false),

  asaScore: z.enum(["I", "II", "III", "IV", "V", "VI"]),
  teamNotes: z.string().max(500).optional(),
  notes: z.string().optional(),
  aiOptIn: z.boolean().default(false),
  labResults: z.array(z.object({ test: z.string(), value: z.string(), unit: z.string() })).default([]),
})
  .superRefine((d, ctx) => {
    addCoreIssues(validatePreopPatch(d), ctx)
    addCoreIssues(evaluatePreopReadiness(d), ctx)
  })

export type PreopFormInput = z.input<typeof preopFormSchema>
export type PreopFormData = z.output<typeof preopFormSchema>

export type PreopSection =
  | "patient"
  | "case"
  | "history"
  | "meds"
  | "anamnesis"
  | "exam"
  | "airway"
  | "labs"
  | "risk"
