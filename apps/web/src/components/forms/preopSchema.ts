import { z } from "zod"

const tagSchema = z.object({ label: z.string(), sub: z.string().optional() }).passthrough()
const drugTagSchema = z.object({ label: z.string(), sub: z.string().optional(), inn: z.string().optional(), atcCode: z.string().optional() })

export const schema = z.object({
  // For printed protocol only
  patientFirstName: z.string().optional(),
  patientLastName:  z.string().optional(),
  patientId:        z.string().optional(),

  // Demographics
  ageYears:  z.coerce.number().min(0).max(120).optional(),
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
  allergies:               z.boolean().default(false),
  allergyDetails:          z.array(drugTagSchema).default([]),
  latexAllergy:            z.boolean().default(false),
  currentMedications:      z.array(drugTagSchema).default([]),
  familyAnesthesiaProblems: z.boolean().default(false),
  familyAnesthesiaDetails:  z.string().max(500).optional(),
  dentalProsthetics:       z.boolean().default(false),
  looseTeeth:              z.boolean().default(false),
  smoking:                 z.boolean().default(false),
  substanceAbuse:          z.boolean().default(false),

  // APFEL — PONV risk
  apfelPONVHistory:        z.boolean().default(false),
  apfelPostopOpioids:      z.boolean().default(false),

  // STOP-BANG — OSA screening
  stopbangSnoring:         z.boolean().default(false),
  stopbangTired:           z.boolean().default(false),
  stopbangObserved:        z.boolean().default(false),
  stopbangBP:              z.boolean().default(false),
  stopbangNeck:            z.boolean().default(false),

  // RCRI — cardiac risk (high-risk surgery reused from case section)
  rcriIschemicHeart:       z.boolean().default(false),
  rcriCHF:                 z.boolean().default(false),
  rcriCVD:                 z.boolean().default(false),
  rcriInsulinDM:           z.boolean().default(false),
  rcriCreatinine:          z.boolean().default(false),

  // Computed scores injected before submit
  rcriScore:               z.number().optional(),
  apfelScore:              z.number().optional(),
  stopBangScore:           z.number().optional(),

  // Vitals
  bpSystolic: z.coerce.number().optional(), bpDiastolic: z.coerce.number().optional(),
  heartRate:  z.coerce.number().optional(), spO2: z.coerce.number().optional(),
  temperature: z.coerce.number().optional(), respiratoryRate: z.coerce.number().optional(),
  heartArrhythmia: z.boolean().default(false),
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
  retrognathia:           z.boolean().default(false),
  prominentIncisors:      z.boolean().default(false),
  facialHair:             z.boolean().default(false),
  difficultAirwayHistory: z.boolean().default(false),
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
