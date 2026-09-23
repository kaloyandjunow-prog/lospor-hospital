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

function addCoreIssues(
  result: ClinicalValidationResult,
  ctx: z.RefinementCtx,
): void {
  for (const issue of result.issues) {
    ctx.addIssue({
      code: "custom",
      path: issue.path,
      // Stable code only. The active app locale turns this into clinician-facing
      // copy at the form boundary, so schema validation never leaks English.
      message: issue.code,
    })
  }
}

export const preopFormSchema = z.object({
  // API-owned definition-driven answers. The PWA’s specialized controls
  // round-trip these rows and never invent a second question catalog.
  preopAnswers: z.array(z.object({
    stableKey: z.string().min(1),
    state: z.enum(["YES", "NO", "UNKNOWN", "NOT_APPLICABLE"]),
    optionKey: z.string().nullable().optional(),
    valueText: z.string().nullable().optional(),
    valueNumber: z.number().nullable().optional(),
    valueDate: z.string().datetime().nullable().optional(),
  }).passthrough()).default([]),
  preopProfileVersion: z.number().int().positive().optional(),
  adoptPreopProfile: z.boolean().optional(),
  patientNumber: z.string().trim().max(128).optional(),
  clinicalMode: z.enum(["ADULT", "PEDIATRIC"]).default("ADULT"),
  // nullable, not merely optional. Switching a case out of pediatric mode has
  // to clear the stored precise age, and only an explicit null survives into
  // the patch -- undefined is dropped before it reaches the wire.
  ageYears: preopNumber("ageYears").nullable().optional(),
  ageValue: preopNumber("ageValue").nullable().optional(),
  ageUnit: z.enum(["DAYS", "MONTHS", "YEARS"]).nullable().optional(),
  sex: z.enum(["MALE", "FEMALE", "OTHER"]),
  heightCm: preopNumber("heightCm"),
  weightKg: preopNumber("weightKg"),
  bloodType: z.enum(["A", "B", "AB", "O"]).optional(),
  rhFactor: z.enum(["POSITIVE", "NEGATIVE"]).optional(),

  // `source` ("manual" | "ai-scan" | "import") is per-item provenance shared
  // with the web client and read by the API. It is optional and appears on
  // every tag-shaped item below so it is not stripped by these otherwise-
  // closed inline schemas before the request is built.
  diagnoses: z.array(z.object({ label: z.string(), code: z.string().optional(), system: z.string().optional(), labelEn: z.string().optional(), labelBg: z.string().optional(), source: z.enum(["manual", "ai-scan", "import"]).optional() })).default([]),
  // system, group, domain and description carry the exact ICD-10-PCS operation
  // when one was chosen (@lospor/core/procedure-codes).
  procedures: z.array(z.object({ label: z.string(), code: z.string().optional(), system: z.string().optional(), group: z.string().optional(), domain: z.string().optional(), description: z.string().optional(), sub: z.string().optional(), sourceLabel: z.string().optional(), sourceVocabulary: z.string().optional(), suggestedCodes: z.array(z.string()).optional(), imported: z.record(z.string(), z.unknown()).optional(), source: z.enum(["manual", "ai-scan", "import"]).optional() })).default([]),
  highRiskSurgery: z.boolean().default(false),
  elective: z.boolean().default(false),
  emergencySurgery: z.boolean().default(false),

  comorbidities: z.array(z.object({ label: z.string(), code: z.string().optional(), sub: z.string().optional(), system: z.string().optional(), labelEn: z.string().optional(), labelBg: z.string().optional(), source: z.enum(["manual", "ai-scan", "import"]).optional() })).default([]),
  currentMedications: z.array(z.object({ label: z.string(), inn: z.string().optional(), atcCode: z.string().optional(), source: z.enum(["manual", "ai-scan", "import"]).optional() })).default([]),

  allergies: z.boolean().nullable().default(null),
  latexAllergy: z.boolean().nullable().default(null),
  allergyDetails: z.array(z.object({ label: z.string(), inn: z.string().optional(), atcCode: z.string().optional(), source: z.enum(["manual", "ai-scan", "import"]).optional() })).default([]),
  familyAnesthesiaProblems: z.boolean().nullable().default(null),
  familyAnesthesiaDetails: z.string().max(500).optional(),
  // The patient's own anaesthetic history, beside the family history above.
  unexplainedAnaesthesiaComplications: z.boolean().nullable().default(null),
  malignantHyperthermiaHistory: z.boolean().nullable().default(null),
  dentalProsthetics: z.boolean().nullable().default(null),
  looseTeeth: z.boolean().nullable().default(null),
  smoking: z.boolean().nullable().default(null),
  substanceAbuse: z.boolean().nullable().default(null),

  bpSystolic: preopNumber("bpSystolic").nullable().optional(),
  bpDiastolic: preopNumber("bpDiastolic").nullable().optional(),
  heartRate: preopNumber("heartRate").nullable().optional(),
  heartArrhythmia: z.boolean().nullable().default(null),
  spO2: preopNumber("spO2").nullable().optional(),
  temperature: preopNumber("temperature").nullable().optional(),
  respiratoryRate: preopNumber("respiratoryRate").nullable().optional(),
  bpUnobtainable: z.boolean().default(false),
  heartRateUnobtainable: z.boolean().default(false),
  spO2Unobtainable: z.boolean().default(false),
  temperatureUnobtainable: z.boolean().default(false),
  respiratoryRateUnobtainable: z.boolean().default(false),
  physicalExamReport: z.string().max(500).optional(),

  mallampati: z.enum(["I", "II", "III", "IV"]).optional(),
  mouthOpeningCm: preopNumber("mouthOpeningCm").nullable().optional(),
  thyromental: preopNumber("thyromental").nullable().optional(),
  neckMobility: z.enum(["FULL", "LIMITED", "FIXED"]).optional(),
  upperLipBiteTest: z.enum(["CLASS_I", "CLASS_II", "CLASS_III"]).optional(),
  cormackLehane: z.enum(["I", "IIa", "IIb", "III", "IV"]).optional(),
  retrognathia: z.boolean().nullable().default(null),
  prominentIncisors: z.boolean().nullable().default(null),
  facialHair: z.boolean().nullable().default(null),
  difficultAirwayHistory: z.boolean().nullable().default(null),
  difficultAirwayNotes: z.string().max(500).optional(),
  // The anaesthetist's overall airway judgement, not derived from the
  // predictors above — it is what prediction-versus-outcome studies compare
  // against the Cormack-Lehane grade actually found.
  anticipatedDifficultAirway: z.boolean().nullable().default(null),
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
  povocScore: preopNumber("povocScore").nullable().optional(),
  povocRiskPercent: preopNumber("povocRiskPercent").nullable().optional(),
  coldsApplicable: z.boolean().default(false),
  coldsScore: preopNumber("coldsScore").nullable().optional(),
  coldsCurrentSymptoms: z.enum(["NONE", "MILD", "MODERATE_OR_SEVERE"]).optional(),
  coldsOnset: z.enum(["MORE_THAN_4_WEEKS", "TWO_TO_4_WEEKS", "LESS_THAN_2_WEEKS"]).optional(),
  coldsLungDisease: z.enum(["NONE", "MILD", "MODERATE_OR_SEVERE"]).optional(),
  coldsAirwayDevice: z.enum(["FACE_MASK_OR_NONE", "SUPRAGLOTTIC", "TRACHEAL_TUBE"]).optional(),
  coldsSurgery: z.enum(["NON_AIRWAY", "MINOR_AIRWAY", "MAJOR_AIRWAY"]).optional(),
  pediatricFasting: z.array(z.object({
    category: z.enum(["CLEAR_FLUIDS", "BREAST_MILK", "INFANT_FORMULA_UNDER_1_YEAR", "SOLID_FOOD_OR_COW_MILK"]),
    lastIntakeAt: z.string().datetime().nullable(),
    status: z.enum(["MET", "NOT_MET", "UNKNOWN"]).optional(),
    requiredHours: z.number().optional(),
    policyId: z.string(),
    policyVersion: z.string(),
  })).default([]),

  asaScore: z.enum(["I", "II", "III", "IV", "V", "VI"]),
  teamNotes: z.string().max(500).optional(),
  notes: z.string().optional(),
  aiOptIn: z.boolean().default(false),
  // Labs additionally carry `takenAt`, the draw time, distinct from when the
  // row was entered into the form.
  labResults: z.array(z.object({
    test: z.string(),
    value: z.string(),
    unit: z.string(),
    source: z.enum(["manual", "ai-scan", "import"]).optional(),
    takenAt: z.string().datetime().optional(),
  })).default([]),
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
