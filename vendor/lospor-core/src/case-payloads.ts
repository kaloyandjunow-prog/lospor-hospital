import { derivePreopScores } from "./preop-payload"
import {
  normalizePediatricAge,
  type PediatricAgeUnit,
} from "./pediatric"

export type CanonicalPatch = Record<string, unknown>

export type LabelledClinicalItem = {
  label: string
  code?: string
  sub?: string
  system?: string
  inn?: string
  atcCode?: string
  dose?: string
  route?: string
  frequency?: string
}

const NUMBER_FIELDS = {
  preop: new Set([
    "ageYears", "ageValue",
    "heightCm", "weightKg", "bmi", "bodySurfaceAreaM2", "bpSystolic", "bpDiastolic",
    "heartRate", "spO2", "temperature", "respiratoryRate", "mouthOpeningCm",
    "thyromental", "rcriScore", "gutaScore", "apfelScore", "stopBangScore",
    "povocScore", "povocRiskPercent", "coldsScore",
  ]),
  intraop: new Set([
    "durationMinutes", "tubeSize", "peepCmH2O", "lmaSize", "oralTubeSize",
    "nasalTubeSize", "dltSize", "endobronchialSize", "crystalloidsMl",
    "colloidsMl", "bloodMl", "urineMl", "bloodLossMl",
  ]),
  postop: new Set([
    "aldreteActivity", "aldreteRespiration", "aldreteCirculation",
    "aldreteConsciousness", "aldreteSpO2", "aldreteTotal",
    "recoveryBpSystolic", "recoveryBpDiastolic", "recoveryHeartRate",
    "recoverySpO2", "painScoreNRS", "pediatricPainScore", "paedScore",
    "temperatureCelsius",
  ]),
}

function copyDefined(input: Record<string, unknown>): CanonicalPatch {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}

function normalizeNumbers(
  section: keyof typeof NUMBER_FIELDS,
  patch: CanonicalPatch,
): CanonicalPatch {
  const normalized = { ...patch }
  for (const field of NUMBER_FIELDS[section]) {
    const value = normalized[field]
    if (value === "" || value === null) {
      normalized[field] = null
    } else if (value !== undefined && typeof value !== "number") {
      const number = Number(value)
      if (Number.isFinite(number)) normalized[field] = number
    }
  }
  return normalized
}

function labels(items: unknown): string {
  if (!Array.isArray(items)) return ""
  return items
    .map(item => item && typeof item === "object" ? String((item as { label?: unknown }).label ?? "") : "")
    .filter(Boolean)
    .join("; ")
}

function alias(
  patch: CanonicalPatch,
  canonical: string,
  legacy: string,
  transform: (value: unknown) => unknown = value => value,
): void {
  if (patch[canonical] === undefined && patch[legacy] !== undefined) {
    patch[canonical] = transform(patch[legacy])
  }
  delete patch[legacy]
}

export function canonicalizePreopPatch(input: Record<string, unknown>): CanonicalPatch {
  const patch = normalizeNumbers("preop", copyDefined(input))
  alias(patch, "upperLipBiteTest", "ulbt", value => {
    if (value === "I") return "CLASS_I"
    if (value === "II") return "CLASS_II"
    if (value === "III") return "CLASS_III"
    return value
  })
  alias(patch, "difficultAirwayHistory", "difficultAirway")
  alias(patch, "familyAnesthesiaProblems", "familyProblems")
  alias(patch, "familyAnesthesiaDetails", "familyProblemNotes")

  if (patch.ageValue != null && typeof patch.ageUnit === "string") {
    const age = normalizePediatricAge({
      value: Number(patch.ageValue),
      unit: patch.ageUnit as PediatricAgeUnit,
    })
    if (age) patch.ageYears = age.completedYears
  }
  // Remove maturity keys from early-v8 local drafts and queued patches.
  for (const field of [
    "prematurityStatus",
    "gestationalAgeAtBirthDays",
    "postmenstrualAgeAtCaseDays",
    "maturityCalculationVersion",
    "gestationalAgeWeeks",
    "postmenstrualAgeWeeks",
  ]) {
    delete patch[field]
  }
  if (patch.diagnoses !== undefined) {
    patch.diagnosis = labels(patch.diagnoses)
    const first = Array.isArray(patch.diagnoses) ? patch.diagnoses[0] : null
    if (first && typeof first === "object") {
      const item = first as { sub?: unknown; code?: unknown }
      patch.icdCode = item.sub ?? item.code ?? null
    } else {
      patch.icdCode = null
    }
  }
  if (patch.procedures !== undefined) patch.plannedProcedure = labels(patch.procedures)

  if (patch.allergies === false) patch.allergyDetails = []
  if (patch.familyAnesthesiaProblems === false) patch.familyAnesthesiaDetails = null
  if (patch.difficultAirwayHistory === false) patch.difficultAirwayNotes = null
  return patch
}

export function buildCanonicalPreopFormPayload(input: Record<string, unknown>): CanonicalPatch {
  const patch = canonicalizePreopPatch(input)
  const scores = derivePreopScores(patch)
  return { ...patch, ...scores }
}

export function canonicalizeIntraopPatch(input: Record<string, unknown>): CanonicalPatch {
  const patch = normalizeNumbers("intraop", copyDefined(input))
  alias(patch, "timeSeriesData", "vitals")
  alias(patch, "keyEvents", "timetableData")

  if (patch.airwayTools !== undefined || patch.fob !== undefined) {
    const tools = Array.isArray(patch.airwayTools) ? [...patch.airwayTools] : []
    if (patch.fob === true && !tools.includes("FOB")) tools.push("FOB")
    patch.airwayTools = tools
  }
  delete patch.fob

  if (Array.isArray(patch.airwayDevices)) {
    const valid = new Set(["FACE_MASK", "LMA", "ORAL_ETT", "NASAL_ETT", "SURGICAL_AIRWAY"])
    patch.airwayDevice = patch.airwayDevices.find(value => valid.has(String(value))) ?? null
  }
  if (Array.isArray(patch.ventilationModes)) {
    patch.ippv = patch.ventilationModes.some(mode => !["Spontaneous", "Jet"].includes(String(mode)))
    patch.jetVentilation = patch.ventilationModes.includes("Jet")
  }
  return patch
}

const ALDRETE_ALIASES = {
  aldreteActivity: "activityScore",
  aldreteRespiration: "respirationScore",
  aldreteCirculation: "circulationScore",
  aldreteConsciousness: "consciousnessScore",
  aldreteSpO2: "spO2Score",
} as const

export function canonicalizePostopPatch(input: Record<string, unknown>): CanonicalPatch {
  const patch = copyDefined(input)
  for (const [canonical, legacy] of Object.entries(ALDRETE_ALIASES)) {
    alias(patch, canonical, legacy)
  }
  alias(patch, "temperatureCelsius", "temperaturePostop")
  const normalized = normalizeNumbers("postop", patch)

  // A total is only meaningful once every component has been assessed. This
  // used to fire as soon as *any* component was present and count the rest as
  // zero, so touching one field wrote a total describing a patient nobody had
  // looked at — and zero across the board is the worst score the scale has.
  const aldreteFields = Object.keys(ALDRETE_ALIASES)
  const aldreteValues = aldreteFields.map(field => Number(normalized[field]))
  if (aldreteValues.every(value => Number.isFinite(value))) {
    normalized.aldreteTotal = aldreteValues.reduce((total, value) => total + value, 0)
  } else if (aldreteFields.some(field => normalized[field] !== undefined)) {
    // A component changed but the set is still incomplete: clear any total left
    // from an earlier save rather than leaving a stale one that now disagrees.
    normalized.aldreteTotal = null
  }

  const permitsHandover = normalized.disposition === "WARD" || normalized.disposition === "PACU"
  if (normalized.disposition !== undefined && !permitsHandover) {
    normalized.handoverItems = []
    normalized.dispositionNotes = null
  }
  return normalized
}
