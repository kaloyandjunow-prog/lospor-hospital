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
  clinicalMode: z.enum(["ADULT", "PEDIATRIC"]).default("ADULT"),
  ageYears: preopNumber("ageYears").optional(),
  ageValue: preopNumber("ageValue").optional(),
  ageUnit: z.enum(["DAYS", "MONTHS", "YEARS"]).optional(),

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

  allergies: z.boolean().nullable().default(null),
  latexAllergy: z.boolean().nullable().default(null),
  allergyDetails: z.array(z.object({ label: z.string(), inn: z.string().optional(), atcCode: z.string().optional() })).default([]),
  familyAnesthesiaProblems: z.boolean().nullable().default(null),
  familyAnesthesiaDetails: z.string().max(500).optional(),
  dentalProsthetics: z.boolean().nullable().default(null),
  looseTeeth: z.boolean().nullable().default(null),
  smoking: z.boolean().nullable().default(null),
  substanceAbuse: z.boolean().nullable().default(null),

  bpSystolic: preopNumber("bpSystolic").optional(),
  bpDiastolic: preopNumber("bpDiastolic").optional(),
  heartRate: preopNumber("heartRate").optional(),
  heartArrhythmia: z.boolean().nullable().default(null),
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
  retrognathia: z.boolean().nullable().default(null),
  prominentIncisors: z.boolean().nullable().default(null),
  facialHair: z.boolean().nullable().default(null),
  difficultAirwayHistory: z.boolean().nullable().default(null),
  difficultAirwayNotes: z.string().max(500).optional(),
  airwayUnobtainable: z.boolean().default(false),

  rcriIschemicHeart: z.boolean().nullable().default(null),
  rcriCHF: z.boolean().nullable().default(null),
  rcriCVD: z.boolean().nullable().default(null),
  rcriInsulinDM: z.boolean().nullable().default(null),
  rcriCreatinine: z.boolean().nullable().default(null),
  apfelPONVHistory: z.boolean().nullable().default(null),
  apfelPostopOpioids: z.boolean().nullable().default(null),
  stopbangSnoring: z.boolean().nullable().default(null),
  stopbangTired: z.boolean().nullable().default(null),
  stopbangObserved: z.boolean().nullable().default(null),
  stopbangBP: z.boolean().nullable().default(null),
  stopbangNeck: z.boolean().nullable().default(null),

  povocSurgeryAtLeast30Minutes: z.boolean().nullable().default(null),
  povocAgeAtLeast3Years: z.boolean().nullable().default(null),
  povocStrabismusSurgery: z.boolean().nullable().default(null),
  povocHistory: z.boolean().nullable().default(null),
  povocScore: preopNumber("povocScore").optional(),
  povocRiskPercent: preopNumber("povocRiskPercent").optional(),
  coldsApplicable: z.boolean().default(false),
  coldsScore: preopNumber("coldsScore").optional(),
  coldsCurrentSymptoms: z.enum(["NONE", "MILD", "MODERATE_OR_SEVERE"]).optional(),
  coldsOnset: z.enum(["MORE_THAN_4_WEEKS", "TWO_TO_4_WEEKS", "LESS_THAN_2_WEEKS"]).optional(),
  coldsLungDisease: z.enum(["NONE", "MILD", "MODERATE_OR_SEVERE"]).optional(),
  coldsAirwayDevice: z.enum(["FACE_MASK_OR_NONE", "SUPRAGLOTTIC", "TRACHEAL_TUBE"]).optional(),
  coldsSurgery: z.enum(["NON_AIRWAY", "MINOR_AIRWAY", "MAJOR_AIRWAY"]).optional(),
  pediatricFasting: z.array(z.object({
    category: z.enum(["CLEAR_FLUIDS", "BREAST_MILK", "INFANT_FORMULA_UNDER_1_YEAR", "SOLID_FOOD_OR_COW_MILK"]),
    lastIntakeAt: z.string().nullable(),
    status: z.enum(["MET", "NOT_MET", "UNKNOWN"]).optional(),
    requiredHours: z.number().optional(),
    policyId: z.string(),
    policyVersion: z.string(),
  })).default([]),

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
