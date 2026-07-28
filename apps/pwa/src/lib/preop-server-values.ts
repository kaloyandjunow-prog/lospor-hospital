import type { PreopFormInput } from "@/lib/preop-form-schema"

type Tag = { label: string; code?: string; sub?: string; inn?: string; atcCode?: string }

type ServerPreopFormBase = Partial<Omit<
  PreopFormInput,
  // `sex` is re-declared below: the database enum is wider than the form's.
  // Intersecting would narrow it back, so it has to be omitted here first.
  "sex" | "diagnoses" | "procedures" | "comorbidities" | "currentMedications" | "allergyDetails" | "upperLipBiteTest"
>>

export type ServerPreop = ServerPreopFormBase & {
  // The database enum is wider than the form's: it also carries UNKNOWN for
  // "not recorded", which the form deliberately has no option for — it maps to
  // an unselected control so the clinician has to answer.
  sex?: "MALE" | "FEMALE" | "OTHER" | "UNKNOWN"
  diagnosesJson?: unknown
  diagnoses?: unknown
  diagnosis?: unknown
  proceduresJson?: unknown
  procedures?: unknown
  plannedProcedure?: unknown
  comorbidities?: unknown
  currentMedications?: unknown
  allergyDetails?: unknown
  upperLipBiteTest?: unknown
  ulbt?: unknown
  age?: number
  weight?: number
  height?: number
  difficultAirway?: boolean
  updatedAt?: string
  syncRevision?: number
}

export function commaToTags(value: unknown): Tag[] {
  if (Array.isArray(value)) return value
  if (typeof value !== "string" || !value.trim()) return []
  const trimmed = value.trim()
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed
    } catch {}
  }
  return value.split(",").map((s) => s.trim()).filter(Boolean).map((label) => ({ label }))
}

export function diagToTags(value: unknown): Tag[] {
  if (Array.isArray(value)) return value
  if (typeof value !== "string" || !value.trim()) return []
  return value.split(";").map((s) => s.trim()).filter(Boolean).map((label) => ({ label }))
}

function upperLipBiteClass(value: unknown) {
  return value === "CLASS_I" || value === "CLASS_II" || value === "CLASS_III"
    ? value as "CLASS_I" | "CLASS_II" | "CLASS_III"
    : value === "I"
      ? "CLASS_I"
      : value === "II"
        ? "CLASS_II"
        : value === "III"
          ? "CLASS_III"
          : undefined
}

export function valuesFromServerPreop(p: ServerPreop): Partial<PreopFormInput> {
  const ulbt = p.upperLipBiteTest ?? p.ulbt

  return {
    ageYears: p.ageYears ?? undefined,
    // Leave it unselected when the server has no real answer. Defaulting to
    // MALE meant reopening a case silently asserted a sex nobody recorded, and
    // the clinician could submit it without ever seeing the question.
    // UNKNOWN is the server's explicit "not recorded" and maps to the same
    // blank state, so the required-field check makes the user choose.
    sex: p.sex && p.sex !== "UNKNOWN" ? p.sex : undefined,
    heightCm: p.heightCm ?? undefined,
    weightKg: p.weightKg ?? undefined,
    bloodType: p.bloodType ?? undefined,
    rhFactor: p.rhFactor ?? undefined,
    diagnoses: diagToTags(p.diagnosesJson ?? p.diagnosis),
    procedures: diagToTags(p.proceduresJson ?? p.plannedProcedure),
    highRiskSurgery: p.highRiskSurgery ?? false,
    elective: p.elective ?? !p.emergencySurgery,
    emergencySurgery: p.emergencySurgery ?? false,
    comorbidities: diagToTags(p.comorbidities),
    currentMedications: commaToTags(p.currentMedications),
    allergies: p.allergies ?? false,
    latexAllergy: p.latexAllergy ?? false,
    allergyDetails: commaToTags(p.allergyDetails),
    familyAnesthesiaProblems: p.familyAnesthesiaProblems ?? false,
    familyAnesthesiaDetails: p.familyAnesthesiaDetails ?? undefined,
    dentalProsthetics: p.dentalProsthetics ?? false,
    looseTeeth: p.looseTeeth ?? false,
    smoking: p.smoking ?? false,
    substanceAbuse: p.substanceAbuse ?? false,
    bpSystolic: p.bpSystolic ?? undefined,
    bpDiastolic: p.bpDiastolic ?? undefined,
    heartRate: p.heartRate ?? undefined,
    heartArrhythmia: p.heartArrhythmia ?? false,
    spO2: p.spO2 ?? undefined,
    temperature: p.temperature ?? undefined,
    respiratoryRate: p.respiratoryRate ?? undefined,
    bpUnobtainable: p.bpUnobtainable ?? false,
    heartRateUnobtainable: p.heartRateUnobtainable ?? false,
    spO2Unobtainable: p.spO2Unobtainable ?? false,
    temperatureUnobtainable: p.temperatureUnobtainable ?? false,
    respiratoryRateUnobtainable: p.respiratoryRateUnobtainable ?? false,
    physicalExamReport: p.physicalExamReport ?? undefined,
    mallampati: p.mallampati ?? undefined,
    mouthOpeningCm: p.mouthOpeningCm ?? undefined,
    thyromental: p.thyromental ?? undefined,
    neckMobility: p.neckMobility ?? undefined,
    upperLipBiteTest: upperLipBiteClass(ulbt),
    cormackLehane: p.cormackLehane ?? undefined,
    retrognathia: p.retrognathia ?? false,
    prominentIncisors: p.prominentIncisors ?? false,
    facialHair: p.facialHair ?? false,
    difficultAirwayHistory: p.difficultAirwayHistory ?? p.difficultAirway ?? false,
    difficultAirwayNotes: p.difficultAirwayNotes ?? undefined,
    airwayUnobtainable: p.airwayUnobtainable ?? false,
    rcriIschemicHeart: p.rcriIschemicHeart ?? false,
    rcriCHF: p.rcriCHF ?? false,
    rcriCVD: p.rcriCVD ?? false,
    rcriInsulinDM: p.rcriInsulinDM ?? false,
    rcriCreatinine: p.rcriCreatinine ?? false,
    apfelPONVHistory: p.apfelPONVHistory ?? false,
    apfelPostopOpioids: p.apfelPostopOpioids ?? false,
    stopbangSnoring: p.stopbangSnoring ?? false,
    stopbangTired: p.stopbangTired ?? false,
    stopbangObserved: p.stopbangObserved ?? false,
    stopbangBP: p.stopbangBP ?? false,
    stopbangNeck: p.stopbangNeck ?? false,
    asaScore: p.asaScore ?? "I",
    teamNotes: p.teamNotes ?? p.notes ?? undefined,
    notes: p.notes ?? undefined,
    aiOptIn: p.aiOptIn ?? false,
    labResults: Array.isArray(p.labResults) ? p.labResults : [],
  }
}
