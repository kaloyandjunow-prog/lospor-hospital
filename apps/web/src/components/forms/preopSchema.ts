import { z } from "zod"
import { CLINICAL_NUMBER_RULES } from "@lospor/core/clinical-validation"

/**
 * Every clinical bound comes from core's rule table, which the API validates
 * against too. Hand-written bounds here meant this form accepted values the
 * server refuses -- and worse, left the vitals with no bounds at all, so a
 * systolic of 4000 reached the wire before anything objected.
 *
 * Throwing on a missing rule is deliberate: a field silently losing its bounds
 * is the failure this replaces, so it must not be possible to add one here
 * without a rule behind it.
 */
const preopNumber = (field: string) => {
  const rule = CLINICAL_NUMBER_RULES.preop[field]
  if (!rule) throw new Error(`Missing Core number rule for preop.${field}`)
  return z.coerce.number().min(rule.min).max(rule.max)
}

const tagSchema = z.object({ label: z.string(), sub: z.string().optional() }).passthrough()
// .passthrough() so `source` ("manual" | "ai-scan" | "import") rides through
// with the tag instead of being stripped before the request is built — see
// the sibling tagSchema, which needed the same fix.
const drugTagSchema = z.object({ label: z.string(), sub: z.string().optional(), inn: z.string().optional(), atcCode: z.string().optional() }).passthrough()

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
  ageYears:  preopNumber("ageYears").nullable().optional(),
  ageValue:  preopNumber("ageValue").nullable().optional(),
  ageUnit:   z.enum(["DAYS", "MONTHS", "YEARS"]).nullable().optional(),
  sex:       z.enum(["MALE","FEMALE","OTHER","UNKNOWN"]).optional(),
  heightCm:  preopNumber("heightCm"),
  weightKg:  preopNumber("weightKg"),
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
  // The patient's own anaesthetic history, beside the family history above.
  unexplainedAnaesthesiaComplications: z.boolean().nullable().default(null),
  malignantHyperthermiaHistory:        z.boolean().nullable().default(null),
  // The anaesthetist's overall airway judgement, recorded so prediction can be
  // paired against the Cormack-Lehane grade actually found. Not derived.
  anticipatedDifficultAirway: z.boolean().nullable().default(null),
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
  rcriScore:               preopNumber("rcriScore").optional(),
  apfelScore:              preopNumber("apfelScore").optional(),
  stopBangScore:           preopNumber("stopBangScore").optional(),

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
  bpSystolic: preopNumber("bpSystolic").nullable().optional(),
  bpDiastolic: preopNumber("bpDiastolic").nullable().optional(),
  heartRate: preopNumber("heartRate").nullable().optional(),
  spO2: preopNumber("spO2").nullable().optional(),
  temperature: preopNumber("temperature").nullable().optional(),
  respiratoryRate: preopNumber("respiratoryRate").nullable().optional(),
  heartArrhythmia: z.boolean().nullable().default(null),
  bpUnobtainable:          z.boolean().default(false),
  heartRateUnobtainable:   z.boolean().default(false),
  spO2Unobtainable:        z.boolean().default(false),
  temperatureUnobtainable: z.boolean().default(false),
  respiratoryRateUnobtainable: z.boolean().default(false),

  // Airway
  mallampati:             z.enum(["I","II","III","IV"]).optional(),
  mouthOpeningCm:         preopNumber("mouthOpeningCm").nullable().optional(),
  thyromental:            preopNumber("thyromental").nullable().optional(),
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

  // `source` and `takenAt` are per-item provenance: which lab in the array was
  // typed in versus read off a photograph by AI, and when it was drawn. Both
  // are optional here because older/queued patches predate the fields.
  labResults: z.array(z.object({
    test: z.string(),
    value: z.string(),
    unit: z.string(),
    source: z.enum(["manual", "ai-scan", "import"]).optional(),
    takenAt: z.string().datetime().optional(),
  })).default([]),
})

export type PreopData = z.infer<typeof schema>

// ── Comorbidity list grouped by system ────────────────────────────────────────
