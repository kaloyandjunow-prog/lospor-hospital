export type ClinicalSection = "preop" | "intraop" | "postop"
export type ClinicalIssueSeverity = "error" | "warning"

export type ClinicalIssueCode =
  | "invalid_type"
  | "invalid_value"
  | "out_of_range"
  | "too_long"
  | "missing_age"
  | "missing_sex"
  | "missing_height"
  | "missing_weight"
  | "missing_diagnosis"
  | "missing_procedure"
  | "missing_blood_pressure"
  | "missing_heart_rate"
  | "missing_respiratory_rate"
  | "missing_airway"
  | "missing_asa"
  | "missing_preop"
  | "missing_intraop"
  | "missing_start_time"
  | "missing_end_time"
  | "missing_technique"
  | "missing_airway_documentation"
  | "missing_position"
  | "missing_monitoring"
  | "missing_vascular_access"
  | "missing_vitals"
  | "missing_medications"
  | "missing_fluids"
  | "missing_complication_documentation"
  | "invalid_intraop_times"
  | "missing_postop"
  | "missing_aldrete"
  | "missing_disposition"

export type ClinicalIssue = {
  code: ClinicalIssueCode
  path: string[]
  severity: ClinicalIssueSeverity
  min?: number
  max?: number
  allowed?: readonly string[]
}

export type ClinicalValidationResult = {
  valid: boolean
  issues: ClinicalIssue[]
}

export type ClinicalReadinessResult = ClinicalValidationResult & {
  blockers: ClinicalIssue[]
  warnings: ClinicalIssue[]
}

type NumberRule = { min: number; max: number; integer?: boolean }

const NUMBER_RULES: Record<ClinicalSection, Record<string, NumberRule>> = {
  preop: {
    ageYears: { min: 0, max: 149, integer: true },
    heightCm: { min: 30, max: 280 },
    weightKg: { min: 0.1, max: 700 },
    bmi: { min: 0, max: 500 },
    bpSystolic: { min: 40, max: 300, integer: true },
    bpDiastolic: { min: 20, max: 200, integer: true },
    heartRate: { min: 10, max: 350, integer: true },
    spO2: { min: 0, max: 100 },
    temperature: { min: 25, max: 45 },
    respiratoryRate: { min: 0, max: 100, integer: true },
    mouthOpeningCm: { min: 0, max: 10 },
    thyromental: { min: 0, max: 15 },
    rcriScore: { min: 0, max: 6, integer: true },
    gutaScore: { min: 0, max: 100 },
    apfelScore: { min: 0, max: 4, integer: true },
    stopBangScore: { min: 0, max: 8, integer: true },
  },
  intraop: {
    durationMinutes: { min: 0, max: 1440, integer: true },
    tubeSize: { min: 2, max: 12 },
    peepCmH2O: { min: 0, max: 40 },
    lmaSize: { min: 1, max: 5 },
    oralTubeSize: { min: 2, max: 10 },
    nasalTubeSize: { min: 2, max: 10 },
    dltSize: { min: 20, max: 50 },
    endobronchialSize: { min: 2, max: 10 },
    crystalloidsMl: { min: 0, max: 50_000, integer: true },
    colloidsMl: { min: 0, max: 20_000, integer: true },
    bloodMl: { min: 0, max: 20_000, integer: true },
    urineMl: { min: 0, max: 20_000, integer: true },
  },
  postop: {
    aldreteActivity: { min: 0, max: 2, integer: true },
    aldreteRespiration: { min: 0, max: 2, integer: true },
    aldreteCirculation: { min: 0, max: 2, integer: true },
    aldreteConsciousness: { min: 0, max: 2, integer: true },
    aldreteSpO2: { min: 0, max: 2, integer: true },
    aldreteTotal: { min: 0, max: 10, integer: true },
    recoveryBpSystolic: { min: 40, max: 300, integer: true },
    recoveryBpDiastolic: { min: 20, max: 200, integer: true },
    recoveryHeartRate: { min: 10, max: 350, integer: true },
    recoverySpO2: { min: 0, max: 100 },
    painScoreNRS: { min: 0, max: 10, integer: true },
    temperatureCelsius: { min: 25, max: 45 },
  },
}

export const CLINICAL_NUMBER_RULES: Readonly<Record<ClinicalSection, Readonly<Record<string, NumberRule>>>> = NUMBER_RULES

const ENUM_RULES: Record<ClinicalSection, Record<string, readonly string[]>> = {
  preop: {
    sex: ["MALE", "FEMALE", "OTHER", "UNKNOWN"],
    bloodType: ["A", "B", "AB", "O"],
    rhFactor: ["POSITIVE", "NEGATIVE"],
    mallampati: ["I", "II", "III", "IV"],
    neckMobility: ["FULL", "LIMITED", "FIXED"],
    upperLipBiteTest: ["CLASS_I", "CLASS_II", "CLASS_III"],
    cormackLehane: ["I", "IIa", "IIb", "III", "IV"],
    asaScore: ["I", "II", "III", "IV", "V", "VI"],
  },
  intraop: {
    airwayDevice: ["FACE_MASK", "LMA", "ORAL_ETT", "NASAL_ETT", "SURGICAL_AIRWAY"],
    volatileAgent: ["SEVOFLURANE", "DESFLURANE", "ISOFLURANE"],
    plexusBlock: [
      "AXILLARY", "INTERSCALENE", "SUPRACLAVICULAR", "INFRACLAVICULAR",
      "FEMORAL", "SCIATIC", "POPLITEAL", "TAP", "ERECTOR_SPINAE",
    ],
    cvkSite: ["INTERNAL_JUGULAR", "EXTERNAL_JUGULAR", "SUBCLAVIAN", "FEMORAL"],
    arterialLineSite: ["RADIAL", "DORSALIS_PEDIS", "FEMORAL", "BRACHIAL"],
    cormackLehane: ["I", "IIa", "IIb", "III", "IV"],
  },
  postop: {
    disposition: POSTOP_DISPOSITIONS,
  },
}

export const CLINICAL_ENUM_RULES: Readonly<Record<ClinicalSection, Readonly<Record<string, readonly string[]>>>> = ENUM_RULES

const STRING_MAX: Record<ClinicalSection, Record<string, number>> = {
  preop: {
    diagnosis: 1000,
    plannedProcedure: 1000,
    icdCode: 20,
    teamNotes: 500,
    physicalExamReport: 500,
    notes: 2000,
    familyAnesthesiaDetails: 500,
    difficultAirwayNotes: 500,
  },
  intraop: {
    airwayNotes: 2000,
    dltType: 50,
    dltSide: 20,
    premedicationEvening: 500,
    premedicationMorning: 500,
    bloodProductsNote: 1000,
    complications: 2000,
  },
  postop: {
    complications: 2000,
    dispositionNotes: 1000,
  },
}

export const CLINICAL_STRING_LIMITS: Readonly<Record<ClinicalSection, Readonly<Record<string, number>>>> = STRING_MAX

const BOOLEAN_FIELDS: Record<ClinicalSection, Set<string>> = {
  preop: new Set([
    "aiOptIn", "allergies", "latexAllergy", "familyAnesthesiaProblems",
    "dentalProsthetics", "looseTeeth", "smoking", "substanceAbuse",
    "heartArrhythmia", "bpUnobtainable", "heartRateUnobtainable",
    "spO2Unobtainable", "temperatureUnobtainable",
    "respiratoryRateUnobtainable", "retrognathia", "prominentIncisors",
    "facialHair", "difficultAirwayHistory", "airwayUnobtainable",
    "elective", "emergencySurgery",
  ]),
  intraop: new Set([
    "cuffed", "ippv", "jetVentilation", "fob", "oralCuffed", "nasalCuffed",
    "ecg", "urinaryCatheter", "stomachTube", "spO2Monitor", "invasiveBP",
    "cvpMonitor", "bglMonitor", "bloodGasMonitor", "neuroMonitor", "nbpMonitor",
    "etco2Monitor", "tempMonitor", "paCatheter", "tee", "bis",
    "entropyMonitor", "nirsMonitor", "evokedPotentials", "tofMonitor",
  ]),
  postop: new Set([
    "ponv", "recoveryBpUnobtainable", "recoveryHeartRateUnobtainable",
    "recoverySpO2Unobtainable", "recoveryTemperatureUnobtainable",
  ]),
}

function issue(
  code: ClinicalIssueCode,
  path: string,
  extra: Partial<ClinicalIssue> = {},
): ClinicalIssue {
  return { code, path: [path], severity: "error", ...extra }
}

function readinessResult(issues: ClinicalIssue[]): ClinicalReadinessResult {
  const blockers = issues.filter(candidate => candidate.severity === "error")
  const warnings = issues.filter(candidate => candidate.severity === "warning")
  return { valid: blockers.length === 0, issues, blockers, warnings }
}

function validatePatch(section: ClinicalSection, patch: Record<string, unknown>): ClinicalValidationResult {
  const issues: ClinicalIssue[] = []
  for (const [field, rule] of Object.entries(NUMBER_RULES[section])) {
    const raw = patch[field]
    if (raw === undefined || raw === null || raw === "") continue
    const value = typeof raw === "number" ? raw : Number(raw)
    if (!Number.isFinite(value)) {
      issues.push(issue("invalid_type", field))
      continue
    }
    const normalized = rule.integer ? Math.round(value) : value
    if (normalized < rule.min || normalized > rule.max) {
      issues.push(issue("out_of_range", field, { min: rule.min, max: rule.max }))
    }
  }
  for (const [field, allowed] of Object.entries(ENUM_RULES[section])) {
    const value = patch[field]
    if (value === undefined || value === null || value === "") continue
    if (typeof value !== "string" || !allowed.includes(value)) {
      issues.push(issue("invalid_value", field, { allowed }))
    }
  }
  for (const [field, max] of Object.entries(STRING_MAX[section])) {
    const value = patch[field]
    if (value === undefined || value === null) continue
    if (typeof value !== "string") issues.push(issue("invalid_type", field))
    else if (value.length > max) issues.push(issue("too_long", field, { max }))
  }
  for (const field of BOOLEAN_FIELDS[section]) {
    const value = patch[field]
    if (value !== undefined && value !== null && typeof value !== "boolean") {
      issues.push(issue("invalid_type", field))
    }
  }
  return { valid: issues.length === 0, issues }
}

export const validatePreopPatch = (patch: Record<string, unknown>) => validatePatch("preop", patch)
export const validateIntraopPatch = (patch: Record<string, unknown>) => validatePatch("intraop", patch)
export const validatePostopPatch = (patch: Record<string, unknown>) => validatePatch("postop", patch)

function isFilledNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value)
}

function isNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

function wallClockMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null
  const match = value.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

function hasInvalidIntraopOrder(intraop: Record<string, unknown>): boolean {
  if (intraop.startedAt && intraop.endedAt) {
    const startedAt = Date.parse(String(intraop.startedAt))
    const endedAt = Date.parse(String(intraop.endedAt))
    return Number.isFinite(startedAt) && Number.isFinite(endedAt) && startedAt >= endedAt
  }
  const storedInstant = (value: unknown): number | null => {
    if (value instanceof Date) {
      const timestamp = value.getTime()
      return Number.isFinite(timestamp) ? timestamp : null
    }
    if (typeof value !== "string" || !value.includes("T")) return null
    const timestamp = Date.parse(value)
    return Number.isFinite(timestamp) ? timestamp : null
  }
  const storedStart = storedInstant(intraop.startTime)
  const storedEnd = storedInstant(intraop.endTime)
  if (storedStart != null && storedEnd != null) return storedStart >= storedEnd

  const start = wallClockMinutes(intraop.startTime)
  const end = wallClockMinutes(intraop.endTime)
  if (start == null || end == null) return false
  if (start === end) return true
  return intraop.endTimeNextDay !== true && end < start
}

export function evaluatePreopReadiness(preop: Record<string, unknown> | null | undefined): ClinicalValidationResult {
  if (!preop) return { valid: false, issues: [issue("missing_preop", "preop")] }
  const issues: ClinicalIssue[] = []
  if (!isFilledNumber(preop.ageYears)) issues.push(issue("missing_age", "ageYears"))
  if (preop.sex == null || preop.sex === "" || preop.sex === "UNKNOWN") issues.push(issue("missing_sex", "sex"))
  if (!isFilledNumber(preop.heightCm)) issues.push(issue("missing_height", "heightCm"))
  if (!isFilledNumber(preop.weightKg)) issues.push(issue("missing_weight", "weightKg"))
  if (!isNonEmptyArray(preop.diagnoses) && !String(preop.diagnosis ?? "").trim()) {
    issues.push(issue("missing_diagnosis", "diagnoses"))
  }
  if (!isNonEmptyArray(preop.procedures) && !String(preop.plannedProcedure ?? "").trim()) {
    issues.push(issue("missing_procedure", "procedures"))
  }
  if (
    preop.bpUnobtainable !== true
    && (!isFilledNumber(preop.bpSystolic) || !isFilledNumber(preop.bpDiastolic))
  ) {
    issues.push(issue("missing_blood_pressure", "bpSystolic"))
  }
  if (preop.heartRateUnobtainable !== true && !isFilledNumber(preop.heartRate)) {
    issues.push(issue("missing_heart_rate", "heartRate"))
  }
  if (preop.respiratoryRateUnobtainable !== true && !isFilledNumber(preop.respiratoryRate)) {
    issues.push(issue("missing_respiratory_rate", "respiratoryRate"))
  }
  if (preop.airwayUnobtainable !== true && !preop.mallampati) {
    issues.push(issue("missing_airway", "mallampati"))
  }
  if (!preop.asaScore) issues.push(issue("missing_asa", "asaScore"))
  return { valid: issues.length === 0, issues }
}

export function evaluateIntraopReadiness(
  intraop: Record<string, unknown> | null | undefined,
): ClinicalReadinessResult {
  const issues: ClinicalIssue[] = []
  if (!intraop || (!intraop.startedAt && !intraop.startTime)) {
    issues.push(issue("missing_start_time", "intraop.startedAt"))
  }
  if (!intraop || (!intraop.endedAt && !intraop.endTime)) {
    issues.push(issue("missing_end_time", "intraop.endedAt"))
  }
  if (!isNonEmptyArray(intraop?.techniques)) {
    issues.push(issue("missing_technique", "intraop.techniques"))
  }
  if (
    intraop
    && (intraop.startedAt || intraop.startTime)
    && (intraop.endedAt || intraop.endTime)
    && hasInvalidIntraopOrder(intraop)
  ) {
    issues.push(issue("invalid_intraop_times", "intraop.endTime"))
  }

  if (intraop) {
    const warning = (code: ClinicalIssueCode, path: string) =>
      issues.push(issue(code, path, { severity: "warning" }))
    const timetableData = (
      intraop.timetableData
      && typeof intraop.timetableData === "object"
      && !Array.isArray(intraop.timetableData)
    ) ? intraop.timetableData as Record<string, unknown> : {}
    const projectedKeyEvents = (
      intraop.keyEvents
      && typeof intraop.keyEvents === "object"
      && !Array.isArray(intraop.keyEvents)
    ) ? intraop.keyEvents as Record<string, unknown> : {}
    const timetable = Object.keys(timetableData).length > 0
      ? timetableData
      : projectedKeyEvents
    const keyEvents = Array.isArray(intraop.keyEvents)
      ? intraop.keyEvents
      : Array.isArray(projectedKeyEvents.log) ? projectedKeyEvents.log : []
    const eventTypes = new Set(keyEvents.flatMap(event =>
      event && typeof event === "object" && typeof (event as { type?: unknown }).type === "string"
        ? [(event as { type: string }).type]
        : [],
    ))
    const hasArray = (key: string) =>
      isNonEmptyArray(intraop[key]) || isNonEmptyArray(timetable[key])
    const hasAirway = hasArray("airwayDevices")
      || hasArray("ventilationModes")
      || typeof intraop.airwayDevice === "string"
    const hasMonitoring = [
      "ecg", "spO2Monitor", "nbpMonitor", "etco2Monitor", "tempMonitor",
      "invasiveBP", "cvpMonitor", "paCatheter", "tee", "bis",
      "entropyMonitor", "nirsMonitor", "evokedPotentials", "tofMonitor",
      "bglMonitor", "bloodGasMonitor", "urinaryCatheter", "stomachTube",
    ].some(field => intraop[field] === true)
    const hasVitals = hasArray("vitals")
      || isNonEmptyArray(intraop.timeSeriesData)
      || eventTypes.has("vital")
    const hasMedication = hasArray("drugs")
      || hasArray("infusions")
      || hasArray("agents")
      || isNonEmptyArray(intraop.drugsAdministered)
      || ["drug", "infusion_start", "agent_start"].some(type => eventTypes.has(type))
    const hasFluids = hasArray("fluids")
      || ["fluid_start", "fluid_bolus"].some(type => eventTypes.has(type))
      || ["crystalloidsMl", "colloidsMl", "bloodMl"].some(field =>
        typeof intraop[field] === "number" && Number(intraop[field]) > 0,
      )
    if (!hasAirway) warning("missing_airway_documentation", "intraop.airwayDevices")
    if (!hasArray("positions")) warning("missing_position", "intraop.positions")
    if (!hasMonitoring) warning("missing_monitoring", "intraop.monitoring")
    if (!hasArray("vascularAccesses")) warning("missing_vascular_access", "intraop.vascularAccesses")
    if (!hasVitals) warning("missing_vitals", "intraop.vitals")
    if (!hasMedication) warning("missing_medications", "intraop.medications")
    if (!hasFluids) warning("missing_fluids", "intraop.fluids")
    if (!String(intraop.complications ?? "").trim()) {
      warning("missing_complication_documentation", "intraop.complications")
    }
  }
  return readinessResult(issues)
}

export function evaluatePostopReadiness(postop: Record<string, unknown> | null | undefined): ClinicalValidationResult {
  if (!postop) return { valid: false, issues: [issue("missing_postop", "postop")] }
  const issues: ClinicalIssue[] = []
  const hasAldrete = ALDRETE_FIELDS.some(field => postop[field] != null)
  if (!hasAldrete) issues.push(issue("missing_aldrete", "postop.aldreteActivity"))
  if (!postop.disposition) issues.push(issue("missing_disposition", "postop.disposition"))
  return { valid: issues.length === 0, issues }
}

export type CaseReadinessInput = {
  preop?: Record<string, unknown> | null
  intraop?: Record<string, unknown> | null
  postop?: Record<string, unknown> | null
}

export function evaluateCaseFinalization(input: CaseReadinessInput): ClinicalValidationResult {
  const issues: ClinicalIssue[] = []
  if (!input.preop) {
    issues.push(issue("missing_preop", "preop"))
  }
  issues.push(...evaluateIntraopReadiness(input.intraop).issues)
  issues.push(...evaluatePostopReadiness(input.postop).issues)
  return { valid: issues.every(candidate => candidate.severity !== "error"), issues }
}

export const PREOP_SECTIONS = [
  "demographics",
  "case_details",
  "medical_history",
  "current_medications",
  "anamnesis",
  "physical_exam",
  "airway",
  "labs",
  "risk_scores",
] as const

export type PreopSection = (typeof PREOP_SECTIONS)[number]
export type SectionCompletion = "empty" | "incomplete" | "complete" | "optional"

export function evaluatePreopSectionCompletion(
  preop: Record<string, unknown> | null | undefined,
): Record<PreopSection, SectionCompletion> {
  const value = preop ?? {}
  const filled = (...fields: string[]) => fields.some(field => {
    const candidate = value[field]
    return candidate !== undefined
      && candidate !== null
      && candidate !== ""
      && (!Array.isArray(candidate) || candidate.length > 0)
  })
  const demographicsComplete = isFilledNumber(value.ageYears)
    && typeof value.sex === "string"
    && value.sex !== "UNKNOWN"
    && isFilledNumber(value.heightCm)
    && isFilledNumber(value.weightKg)
  const caseComplete = (
    isNonEmptyArray(value.diagnoses) || Boolean(String(value.diagnosis ?? "").trim())
  ) && (
    isNonEmptyArray(value.procedures) || Boolean(String(value.plannedProcedure ?? "").trim())
  )
  const physicalComplete = (
    value.bpUnobtainable === true
    || (isFilledNumber(value.bpSystolic) && isFilledNumber(value.bpDiastolic))
  ) && (
    value.heartRateUnobtainable === true || isFilledNumber(value.heartRate)
  ) && (
    value.respiratoryRateUnobtainable === true || isFilledNumber(value.respiratoryRate)
  )
  const airwayComplete = value.airwayUnobtainable === true || Boolean(value.mallampati)
  return {
    demographics: demographicsComplete
      ? "complete"
      : filled("ageYears", "sex", "heightCm", "weightKg") ? "incomplete" : "empty",
    case_details: caseComplete
      ? "complete"
      : filled("diagnoses", "diagnosis", "procedures", "plannedProcedure") ? "incomplete" : "empty",
    medical_history: filled("comorbidities", "allergies", "smoking", "substanceAbuse") ? "complete" : "optional",
    current_medications: filled("currentMedications") ? "complete" : "optional",
    anamnesis: filled(
      "familyAnesthesiaProblems", "dentalProsthetics", "looseTeeth", "difficultAirwayHistory",
    ) ? "complete" : "optional",
    physical_exam: physicalComplete
      ? "complete"
      : filled("bpSystolic", "bpDiastolic", "heartRate", "respiratoryRate") ? "incomplete" : "empty",
    airway: airwayComplete
      ? "complete"
      : filled("mallampati", "mouthOpeningCm", "thyromental", "neckMobility") ? "incomplete" : "empty",
    labs: filled("labResults") ? "complete" : "optional",
    risk_scores: value.asaScore ? "complete" : "incomplete",
  }
}
import { ALDRETE_FIELDS, POSTOP_DISPOSITIONS } from "./postop"
