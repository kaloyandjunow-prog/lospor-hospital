import { z } from "zod"

const tagSchema = z.object({ label: z.string(), sub: z.string().optional() }).passthrough()
const drugTagSchema = z.object({ label: z.string(), sub: z.string().optional(), inn: z.string().optional(), atcCode: z.string().optional() })

export const schema = z.object({
  // For printed protocol only
  patientFirstName: z.string().optional(),
  patientLastName:  z.string().optional(),
  patientId:        z.string().optional(),

  // Demographics
  clinicalMode: z.enum(["ADULT", "PEDIATRIC"]).default("ADULT"),
  // nullable, not merely optional. Switching a case out of pediatric mode has
  // to clear the stored precise age, and only an explicit null survives into
  // the patch -- undefined is dropped. Without .nullable() z.coerce.number()
  // would run Number(null) and record the clear as age 0, i.e. a newborn.
  ageYears:  z.coerce.number().min(0).max(149).nullable().optional(),
  ageValue:  z.coerce.number().min(0).max(6574).nullable().optional(),
  ageUnit:   z.enum(["DAYS", "MONTHS", "YEARS"]).nullable().optional(),
  sex:       z.enum(["MALE","FEMALE","OTHER","UNKNOWN"]).optional(),
  heightCm:  z.coerce.number({ error: "Height is required" }).positive("Height is required"),
  weightKg:  z.coerce.number({ error: "Weight is required" }).positive("Weight is required"),
  bloodType: z.enum(["A","B","AB","O"]).optional(),
  rhFactor:  z.enum(["POSITIVE","NEGATIVE"]).optional(),

  // Case
  diagnoses:    z.array(tagSchema).default([]),
  procedures:   z.array(tagSchema).default([]),
  teamNotes:            z.string().max(500).optional(),
  highRiskSurgery:      z.boolean().default(false),
  elective:             z.boolean().default(false),
  emergencySurgery:     z.boolean().default(false),
  aiOptIn:              z.boolean().default(false),

  // Medical history — ICD-10 tags
  comorbidities: z.array(tagSchema).default([]),

  // Safety-critical fields
  allergies:               z.boolean().nullable().default(null),
  allergyDetails:          z.array(drugTagSchema).default([]),
  latexAllergy:            z.boolean().nullable().default(null),
  currentMedications:      z.array(drugTagSchema).default([]),
  familyAnesthesiaProblems: z.boolean().nullable().default(null),
  familyAnesthesiaDetails:  z.string().max(500).optional(),
  dentalProsthetics:       z.boolean().nullable().default(null),
  looseTeeth:              z.boolean().nullable().default(null),
  smoking:                 z.boolean().nullable().default(null),
  substanceAbuse:          z.boolean().nullable().default(null),

  // APFEL — PONV risk
  apfelPONVHistory:        z.boolean().nullable().default(null),
  apfelPostopOpioids:      z.boolean().nullable().default(null),

  // STOP-BANG — OSA screening
  stopbangSnoring:         z.boolean().nullable().default(null),
  stopbangTired:           z.boolean().nullable().default(null),
  stopbangObserved:        z.boolean().nullable().default(null),
  stopbangBP:              z.boolean().nullable().default(null),
  stopbangNeck:            z.boolean().nullable().default(null),

  // RCRI — cardiac risk (high-risk surgery reused from case section)
  rcriIschemicHeart:       z.boolean().nullable().default(null),
  rcriCHF:                 z.boolean().nullable().default(null),
  rcriCVD:                 z.boolean().nullable().default(null),
  rcriInsulinDM:           z.boolean().nullable().default(null),
  rcriCreatinine:          z.boolean().nullable().default(null),

  // Computed scores injected before submit
  rcriScore:               z.number().optional(),
  apfelScore:              z.number().optional(),
  stopBangScore:           z.number().optional(),

  // Pediatric risk and fasting. Scores are recomputed by the API.
  povocSurgeryAtLeast30Minutes: z.boolean().nullable().default(null),
  povocStrabismusSurgery:       z.boolean().nullable().default(null),
  povocHistory:                 z.boolean().nullable().default(null),
  coldsApplicable:              z.boolean().default(false),
  coldsCurrentSymptoms: z.enum(["NONE", "MILD", "MODERATE_OR_SEVERE"]).optional(),
  coldsOnset: z.enum(["MORE_THAN_4_WEEKS", "TWO_TO_4_WEEKS", "LESS_THAN_2_WEEKS"]).optional(),
  coldsLungDisease: z.enum(["NONE", "MILD", "MODERATE_OR_SEVERE"]).optional(),
  coldsAirwayDevice: z.enum(["FACE_MASK_OR_NONE", "SUPRAGLOTTIC", "TRACHEAL_TUBE"]).optional(),
  coldsSurgery: z.enum(["NON_AIRWAY", "MINOR_AIRWAY", "MAJOR_AIRWAY"]).optional(),
  pediatricFasting: z.array(z.object({
    category: z.enum([
      "CLEAR_FLUIDS",
      "BREAST_MILK",
      "INFANT_FORMULA_UNDER_1_YEAR",
      "SOLID_FOOD_OR_COW_MILK",
    ]),
    lastIntakeAt: z.string().datetime().nullable(),
    status: z.enum(["MET", "NOT_MET", "UNKNOWN"]).optional(),
    requiredHours: z.number().nonnegative().optional(),
    policyId: z.string(),
    policyVersion: z.string(),
  })).default([]),

  // Vitals
  bpSystolic: z.coerce.number().optional(), bpDiastolic: z.coerce.number().optional(),
  heartRate:  z.coerce.number().optional(), spO2: z.coerce.number().optional(),
  temperature: z.coerce.number().optional(), respiratoryRate: z.coerce.number().optional(),
  heartArrhythmia: z.boolean().nullable().default(null),
  bpUnobtainable:          z.boolean().default(false),
  heartRateUnobtainable:   z.boolean().default(false),
  spO2Unobtainable:        z.boolean().default(false),
  temperatureUnobtainable: z.boolean().default(false),
  respiratoryRateUnobtainable: z.boolean().default(false),

  // Airway
  mallampati:             z.enum(["I","II","III","IV"]).optional(),
  mouthOpeningCm:         z.coerce.number().optional(),
  thyromental:            z.coerce.number().optional(),
  neckMobility:           z.enum(["FULL","LIMITED","FIXED"]).optional(),
  upperLipBiteTest:       z.enum(["CLASS_I","CLASS_II","CLASS_III"]).optional(),
  retrognathia:           z.boolean().nullable().default(null),
  prominentIncisors:      z.boolean().nullable().default(null),
  facialHair:             z.boolean().nullable().default(null),
  difficultAirwayHistory: z.boolean().nullable().default(null),
  difficultAirwayNotes:   z.string().max(500).optional(),
  cormackLehane:          z.enum(["I","IIa","IIb","III","IV"]).optional(),
  airwayUnobtainable:     z.boolean().default(false),

  // Scores
  asaScore: z.enum(["I","II","III","IV","V","VI"]).optional(),

  // Free-text
  physicalExamReport: z.string().max(500).optional(),
  notes:              z.string().optional(),

  labResults: z.array(z.object({ test: z.string(), value: z.string(), unit: z.string() })).default([]),
})

export type PreopData = z.infer<typeof schema>

// ── Comorbidity list grouped by system ────────────────────────────────────────
