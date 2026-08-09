/**
 * Stamped onto every pediatric dose as `clinicalRulesVersion`, so it is part of
 * the permanent record of what guidance produced an administration. It must
 * therefore describe a released ruleset: while this said "draft", any dose
 * recorded in production would have claimed a draft as its provenance.
 */
export const PEDIATRIC_RULESET_VERSION = "2026.08.04-release.1"
export const PEDIATRIC_MIN_CLIENT_VERSION = "8.0.0"

/**
 * Whether the reviewed clinical manifest permits pediatric dosing in
 * production. This is a clinical sign-off, not a deployment switch: it asserts
 * that the pediatric drug profiles have been reviewed as fit to calculate a
 * dose for a real child.
 *
 * Production additionally requires PEDIATRIC_MODE_ENABLED=true; either alone is
 * not enough. Local development ignores both.
 *
 * Signed off 2026-08-04 against LOSPOR_PEDIATRICS v2 (335 rules): identical drug
 * coverage to the adult ruleset -- 181 bolus drugs, 48 infusions, 22 fluids --
 * with three drugs withheld from children entirely, nine gated by age or weight,
 * and no overlapping bands once age and weight are considered together.
 */
export const PEDIATRIC_PRODUCTION_READY = true

export type ClinicalMode = "ADULT" | "PEDIATRIC"
export type PediatricAgeUnit = "DAYS" | "MONTHS" | "YEARS"
export type PediatricAgeGroup =
  | "NEONATE"
  | "INFANT"
  | "TODDLER"
  | "PRESCHOOL"
  | "SCHOOL_AGE"
  | "ADOLESCENT"

export type PediatricRuleReviewStatus = "PENDING" | "APPROVED" | "REJECTED" | "DEPRECATED"

export type PediatricSourceReference = {
  id: string
  title: string
  organization?: string
  version?: string
  url: string
}

export const PEDIATRIC_SOURCE_REFERENCES = {
  RCUK_PALS_2025: {
    id: "RCUK_PALS_2025",
    title: "Paediatric advanced life support algorithm",
    organization: "Resuscitation Council UK",
    version: "2025",
    url: "https://www.resus.org.uk/sites/default/files/2025-12/Paediatric%20advanced%20life%20support%20algorithm%20Nov%202025%20V2.pdf",
  },
  RCUK_NORMAL_RANGES_2025: {
    id: "RCUK_NORMAL_RANGES_2025",
    title: "Normal ranges for physiological variables",
    organization: "Resuscitation Council UK",
    version: "2025",
    url: "https://www.resus.org.uk/cy/node/36439",
  },
  NICE_NG29: {
    id: "NICE_NG29",
    title: "Intravenous fluid therapy in children and young people in hospital",
    organization: "National Institute for Health and Care Excellence",
    version: "NG29",
    url: "https://www.nice.org.uk/guidance/ng29/chapter/Recommendations",
  },
  WHO_GROWTH: {
    id: "WHO_GROWTH",
    title: "Child growth standards and growth reference data",
    organization: "World Health Organization",
    version: "2006/2007",
    url: "https://www.who.int/news-room/questions-and-answers/item/child-growth-standards",
  },
  POVOC_EBERHART_2004: {
    id: "POVOC_EBERHART_2004",
    title: "A simplified risk score for postoperative vomiting in pediatric patients",
    version: "2004",
    url: "https://pubmed.ncbi.nlm.nih.gov/15562045/",
  },
  COLDS_LEE_2018: {
    id: "COLDS_LEE_2018",
    title: "Utility of the COLDS score in children with upper respiratory tract infection",
    version: "2018",
    url: "https://pubmed.ncbi.nlm.nih.gov/30281195/",
  },
  APAGBI_FASTING_2023: {
    id: "APAGBI_FASTING_2023",
    title: "Anaesthesia for beginners",
    organization: "Association of Paediatric Anaesthetists of Great Britain and Ireland",
    version: "2023",
    url: "https://www.apagbi.org.uk/images/information%20and%20resources/professional%20resources/anaesthesia-for-beginners--apa-guide-2023--v2.pdf",
  },
  MOSTELLER_BSA_1987: {
    id: "MOSTELLER_BSA_1987",
    title: "Simplified calculation of body-surface area",
    version: "1987",
    url: "https://pubmed.ncbi.nlm.nih.gov/3657876/",
  },
  CDC_GROWTH_CHARTS_2000: {
    id: "CDC_GROWTH_CHARTS_2000",
    title: "CDC 2000 growth-chart LMS data files",
    organization: "Centers for Disease Control and Prevention",
    version: "2000",
    url: "https://www.cdc.gov/growthcharts/cdc-data-files.htm",
  },
  MCLAREN_IBW_1972: {
    id: "MCLAREN_IBW_1972",
    title: "Weight/height classification of nutritional status",
    version: "1972",
    url: "https://doi.org/10.1016/S0140-6736(72)91324-4",
  },
  FLACC_MERKEL_1997: {
    id: "FLACC_MERKEL_1997",
    title: "The FLACC behavioral scale for scoring postoperative pain in young children",
    version: "1997",
    url: "https://pubmed.ncbi.nlm.nih.gov/9220806/",
  },
  PAED_SIKICH_2004: {
    id: "PAED_SIKICH_2004",
    title: "Development and psychometric evaluation of the Pediatric Anesthesia Emergence Delirium scale",
    version: "2004",
    url: "https://pubmed.ncbi.nlm.nih.gov/15114210/",
  },
} as const satisfies Record<string, PediatricSourceReference>

const DAYS_PER_YEAR = 365.2425
const DAYS_PER_MONTH = DAYS_PER_YEAR / 12
const PEDIATRIC_MAX_DAYS = 18 * DAYS_PER_YEAR

export type PediatricAgeInput = {
  value: number
  unit: PediatricAgeUnit
}

export type NormalizedPediatricAge = {
  value: number
  unit: PediatricAgeUnit
  approximateDays: number
  approximateMonths: number
  completedYears: number
  ageGroup: PediatricAgeGroup
}

export type PediatricAgeValidationIssue = {
  code: "INVALID_VALUE" | "AGE_OUTSIDE_PEDIATRIC_RANGE"
  severity: "ERROR" | "WARNING"
}
export function pediatricAgeToApproximateDays(value: number, unit: PediatricAgeUnit): number {
  if (unit === "DAYS") return value
  if (unit === "MONTHS") return value * DAYS_PER_MONTH
  return value * DAYS_PER_YEAR
}

export function isPediatricAge(input: Pick<PediatricAgeInput, "value" | "unit">): boolean {
  if (!Number.isFinite(input.value) || input.value < 0) return false
  return pediatricAgeToApproximateDays(input.value, input.unit) < PEDIATRIC_MAX_DAYS
}

export function pediatricAgeGroup(approximateDays: number): PediatricAgeGroup {
  if (approximateDays < 28) return "NEONATE"
  if (approximateDays < DAYS_PER_YEAR) return "INFANT"
  if (approximateDays < 3 * DAYS_PER_YEAR) return "TODDLER"
  if (approximateDays < 6 * DAYS_PER_YEAR) return "PRESCHOOL"
  if (approximateDays < 12 * DAYS_PER_YEAR) return "SCHOOL_AGE"
  return "ADOLESCENT"
}

export function normalizePediatricAge(input: PediatricAgeInput): NormalizedPediatricAge | null {
  if (!isPediatricAge(input)) return null
  const approximateDays = pediatricAgeToApproximateDays(input.value, input.unit)
  return {
    value: input.value,
    unit: input.unit,
    approximateDays,
    approximateMonths: approximateDays / DAYS_PER_MONTH,
    completedYears: Math.floor(approximateDays / DAYS_PER_YEAR),
    ageGroup: pediatricAgeGroup(approximateDays),
  }
}
export function validatePediatricAge(input: PediatricAgeInput): PediatricAgeValidationIssue[] {
  const issues: PediatricAgeValidationIssue[] = []
  if (!Number.isFinite(input.value) || input.value < 0) {
    issues.push({ code: "INVALID_VALUE", severity: "ERROR" })
    return issues
  }
  if (!isPediatricAge(input)) {
    issues.push({ code: "AGE_OUTSIDE_PEDIATRIC_RANGE", severity: "ERROR" })
  }
  return issues
}
export function validateClinicalModeAge(
  clinicalMode: ClinicalMode,
  age: Pick<PediatricAgeInput, "value" | "unit">,
): { valid: boolean; code?: "PEDIATRIC_MODE_REQUIRED" | "ADULT_MODE_REQUIRED" } {
  const pediatric = isPediatricAge(age)
  if (clinicalMode === "ADULT" && pediatric) {
    return { valid: false, code: "PEDIATRIC_MODE_REQUIRED" }
  }
  if (clinicalMode === "PEDIATRIC" && !pediatric) {
    return { valid: false, code: "ADULT_MODE_REQUIRED" }
  }
  return { valid: true }
}

export function requiresPediatricModeDecision(input: {
  clinicalMode?: ClinicalMode | null
  ageValue?: number | null
  ageUnit?: PediatricAgeUnit | null
  ageYears?: number | null
}): boolean {
  const value = input.ageValue ?? input.ageYears
  const unit = input.ageUnit ?? "YEARS"
  return input.clinicalMode !== "PEDIATRIC"
    && value != null
    && isPediatricAge({ value, unit })
}

export function displayPediatricAge(
  input: Pick<PediatricAgeInput, "value" | "unit">,
  locale: "en" | "bg" = "en",
): string {
  const labels = locale === "bg"
    ? { DAYS: "d", MONTHS: "mo", YEARS: "y" }
    : { DAYS: "days", MONTHS: "months", YEARS: "years" }
  return `${input.value} ${labels[input.unit]}`
}

export type PediatricVitalReference = {
  respiratoryRate: { lower: number; upper: number }
  heartRate: { lower: number; upper: number }
  systolicBp: { p5: number; p10: number; p50: number }
  meanArterialPressure: { p5: number; p10: number; p50: number }
  sourceId: "RCUK_NORMAL_RANGES_2025"
  rulesetVersion: string
  clamped: boolean
}

const VITAL_ANCHORS = [
  { months: 1, rrLower: 25, rrUpper: 60, hrLower: 110, hrUpper: 180, sbp5: 50, sbp10: 55, sbp50: 75, map5: 40, map10: 45, map50: 55 },
  { months: 12, rrLower: 20, rrUpper: 50, hrLower: 100, hrUpper: 170, sbp5: 70, sbp10: 75, sbp50: 95, map5: 50, map10: 55, map50: 70 },
  { months: 24, rrLower: 18, rrUpper: 40, hrLower: 90, hrUpper: 160, sbp5: 73, sbp10: 77, sbp50: 98, map5: 53, map10: 58, map50: 73 },
  { months: 60, rrLower: 17, rrUpper: 30, hrLower: 70, hrUpper: 140, sbp5: 75, sbp10: 80, sbp50: 100, map5: 55, map10: 60, map50: 75 },
  { months: 120, rrLower: 14, rrUpper: 25, hrLower: 60, hrUpper: 120, sbp5: 80, sbp10: 85, sbp50: 110, map5: 55, map10: 60, map50: 75 },
  { months: 216, rrLower: 12, rrUpper: 20, hrLower: 60, hrUpper: 100, sbp5: 90, sbp10: 105, sbp50: 120, map5: 60, map10: 65, map50: 75 },
] as const

type VitalAnchor = typeof VITAL_ANCHORS[number]
type InterpolatedVitalKey = Exclude<keyof VitalAnchor, "months">

function interpolateAnchor(months: number, key: InterpolatedVitalKey): number {
  const lower = [...VITAL_ANCHORS].reverse().find(anchor => anchor.months <= months) ?? VITAL_ANCHORS[0]
  const upper = VITAL_ANCHORS.find(anchor => anchor.months >= months) ?? VITAL_ANCHORS[VITAL_ANCHORS.length - 1]
  if (lower.months === upper.months) return lower[key]
  const fraction = (months - lower.months) / (upper.months - lower.months)
  return lower[key] + (upper[key] - lower[key]) * fraction
}

function roundedReference(months: number, key: InterpolatedVitalKey): number {
  return Math.round(interpolateAnchor(months, key))
}

export function getPediatricVitalReference(
  age: Pick<PediatricAgeInput, "value" | "unit">,
): PediatricVitalReference | null {
  if (!isPediatricAge(age)) return null
  const rawMonths = pediatricAgeToApproximateDays(age.value, age.unit) / DAYS_PER_MONTH
  const months = Math.min(216, Math.max(1, rawMonths))
  return {
    respiratoryRate: {
      lower: roundedReference(months, "rrLower"),
      upper: roundedReference(months, "rrUpper"),
    },
    heartRate: {
      lower: roundedReference(months, "hrLower"),
      upper: roundedReference(months, "hrUpper"),
    },
    systolicBp: {
      p5: roundedReference(months, "sbp5"),
      p10: roundedReference(months, "sbp10"),
      p50: roundedReference(months, "sbp50"),
    },
    meanArterialPressure: {
      p5: roundedReference(months, "map5"),
      p10: roundedReference(months, "map10"),
      p50: roundedReference(months, "map50"),
    },
    sourceId: "RCUK_NORMAL_RANGES_2025",
    rulesetVersion: PEDIATRIC_RULESET_VERSION,
    clamped: rawMonths < 1 || rawMonths > 216,
  }
}

export type PediatricVitalField = "RESPIRATORY_RATE" | "HEART_RATE" | "SYSTOLIC_BP" | "MAP"
export type PediatricVitalBand =
  | "BELOW_P5"
  | "P5_TO_P10"
  | "BELOW_REFERENCE"
  | "WITHIN_REFERENCE"
  | "ABOVE_REFERENCE"
  | "AT_OR_ABOVE_P10"

export function classifyPediatricVital(
  field: PediatricVitalField,
  value: number,
  age: Pick<PediatricAgeInput, "value" | "unit">,
): PediatricVitalBand | null {
  if (!Number.isFinite(value)) return null
  const reference = getPediatricVitalReference(age)
  if (!reference) return null
  if (field === "RESPIRATORY_RATE" || field === "HEART_RATE") {
    const range = field === "RESPIRATORY_RATE" ? reference.respiratoryRate : reference.heartRate
    if (value < range.lower) return "BELOW_REFERENCE"
    if (value > range.upper) return "ABOVE_REFERENCE"
    return "WITHIN_REFERENCE"
  }
  const range = field === "SYSTOLIC_BP" ? reference.systolicBp : reference.meanArterialPressure
  if (value < range.p5) return "BELOW_P5"
  if (value < range.p10) return "P5_TO_P10"
  return "AT_OR_ABOVE_P10"
}

export type PovocInput = {
  ageYears: number
  surgeryMinutes: number
  strabismusSurgery: boolean
  patientOrFamilyHistory: boolean
}

const POVOC_RISK_PERCENT = [9, 10, 30, 55, 70] as const

export function calculatePovoc(input: PovocInput): {
  score: number
  riskPercent: number
  factors: {
    surgeryAtLeast30Minutes: boolean
    ageAtLeast3Years: boolean
    strabismusSurgery: boolean
    patientOrFamilyHistory: boolean
  }
  sourceId: "POVOC_EBERHART_2004"
  rulesetVersion: string
} {
  const factors = {
    surgeryAtLeast30Minutes: input.surgeryMinutes >= 30,
    ageAtLeast3Years: input.ageYears >= 3,
    strabismusSurgery: input.strabismusSurgery,
    patientOrFamilyHistory: input.patientOrFamilyHistory,
  }
  const score = Object.values(factors).filter(Boolean).length
  return {
    score,
    riskPercent: POVOC_RISK_PERCENT[score],
    factors,
    sourceId: "POVOC_EBERHART_2004",
    rulesetVersion: PEDIATRIC_RULESET_VERSION,
  }
}

export type ColdsCurrentSymptoms = "NONE" | "MILD" | "MODERATE_OR_SEVERE"
export type ColdsOnset = "MORE_THAN_4_WEEKS" | "TWO_TO_4_WEEKS" | "LESS_THAN_2_WEEKS"
export type ColdsLungDisease = "NONE" | "MILD" | "MODERATE_OR_SEVERE"
export type ColdsAirwayDevice = "FACE_MASK_OR_NONE" | "SUPRAGLOTTIC" | "TRACHEAL_TUBE"
export type ColdsSurgery = "NON_AIRWAY" | "MINOR_AIRWAY" | "MAJOR_AIRWAY"

export type ColdsInput = {
  currentSymptoms: ColdsCurrentSymptoms
  onset: ColdsOnset
  lungDisease: ColdsLungDisease
  airwayDevice: ColdsAirwayDevice
  surgery: ColdsSurgery
}

const COLDS_POINTS = {
  currentSymptoms: { NONE: 1, MILD: 2, MODERATE_OR_SEVERE: 5 },
  onset: { MORE_THAN_4_WEEKS: 1, TWO_TO_4_WEEKS: 2, LESS_THAN_2_WEEKS: 5 },
  lungDisease: { NONE: 1, MILD: 2, MODERATE_OR_SEVERE: 5 },
  airwayDevice: { FACE_MASK_OR_NONE: 1, SUPRAGLOTTIC: 2, TRACHEAL_TUBE: 5 },
  surgery: { NON_AIRWAY: 1, MINOR_AIRWAY: 2, MAJOR_AIRWAY: 5 },
} as const

export function calculateColds(input: ColdsInput): {
  score: number
  componentScores: Record<keyof ColdsInput, number>
  sourceId: "COLDS_LEE_2018"
  rulesetVersion: string
  advisoryOnly: true
} {
  const componentScores = {
    currentSymptoms: COLDS_POINTS.currentSymptoms[input.currentSymptoms],
    onset: COLDS_POINTS.onset[input.onset],
    lungDisease: COLDS_POINTS.lungDisease[input.lungDisease],
    airwayDevice: COLDS_POINTS.airwayDevice[input.airwayDevice],
    surgery: COLDS_POINTS.surgery[input.surgery],
  }
  return {
    score: Object.values(componentScores).reduce((sum, value) => sum + value, 0),
    componentScores,
    sourceId: "COLDS_LEE_2018",
    rulesetVersion: PEDIATRIC_RULESET_VERSION,
    advisoryOnly: true,
  }
}

export type PediatricPainScale = "FLACC" | "FPS_R" | "NRS"

export function recommendPediatricPainScale(input: {
  ageYears: number
  canSelfReport: boolean
  canUseNumbers?: boolean
}): {
  scale: PediatricPainScale
  rationale: "BEHAVIORAL" | "FACES_SELF_REPORT" | "NUMERIC_SELF_REPORT"
} {
  if (!input.canSelfReport) return { scale: "FLACC", rationale: "BEHAVIORAL" }
  if (input.canUseNumbers === true || input.ageYears >= 8) {
    return { scale: "NRS", rationale: "NUMERIC_SELF_REPORT" }
  }
  return { scale: "FPS_R", rationale: "FACES_SELF_REPORT" }
}

export type PediatricFastingCategory =
  | "CLEAR_FLUIDS"
  | "BREAST_MILK"
  | "INFANT_FORMULA_UNDER_1_YEAR"
  | "SOLID_FOOD_OR_COW_MILK"

export type PediatricFastingPolicy = {
  id: string
  version: string
  sourceId: string
  minimumHours: Record<PediatricFastingCategory, number>
}

export const APAGBI_FASTING_POLICY_2023: PediatricFastingPolicy = {
  id: "APAGBI_FASTING",
  version: "2023",
  sourceId: "APAGBI_FASTING_2023",
  minimumHours: {
    CLEAR_FLUIDS: 1,
    BREAST_MILK: 3,
    INFANT_FORMULA_UNDER_1_YEAR: 4,
    SOLID_FOOD_OR_COW_MILK: 6,
  },
}

export function evaluatePediatricFasting(input: {
  category: PediatricFastingCategory
  lastIntakeAt: string | Date | null
  assessmentAt: string | Date
  policy?: PediatricFastingPolicy
}): {
  status: "MET" | "NOT_MET" | "UNKNOWN"
  elapsedHours: number | null
  requiredHours: number
  policyId: string
  policyVersion: string
} {
  const policy = input.policy ?? APAGBI_FASTING_POLICY_2023
  const requiredHours = policy.minimumHours[input.category]
  if (input.lastIntakeAt == null) {
    return {
      status: "UNKNOWN",
      elapsedHours: null,
      requiredHours,
      policyId: policy.id,
      policyVersion: policy.version,
    }
  }
  const lastIntake = new Date(input.lastIntakeAt).getTime()
  const assessment = new Date(input.assessmentAt).getTime()
  if (!Number.isFinite(lastIntake) || !Number.isFinite(assessment) || assessment < lastIntake) {
    return {
      status: "UNKNOWN",
      elapsedHours: null,
      requiredHours,
      policyId: policy.id,
      policyVersion: policy.version,
    }
  }
  const elapsedHours = (assessment - lastIntake) / 3_600_000
  return {
    status: elapsedHours >= requiredHours ? "MET" : "NOT_MET",
    elapsedHours,
    requiredHours,
    policyId: policy.id,
    policyVersion: policy.version,
  }
}
