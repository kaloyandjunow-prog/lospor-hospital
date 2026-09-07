import type { PreopFormInput } from "@/lib/preop-form-schema"
import type { ClinicalMode } from "@lospor/core/pediatric"

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

/**
 * Structured JSON wins only when it actually holds something. An empty
 * structured array is not "no legacy text to fall back to" -- it is what an
 * older record looks like before the structured field existed, and `??` does
 * not fall through on `[]`. Reading `diagToTags(json ?? legacyText)` directly
 * therefore showed an empty diagnosis list on a case whose legacy text field
 * still had the real answer in it.
 */
function structuredOrLegacyTags(json: unknown, legacyText: unknown): Tag[] {
  if (Array.isArray(json) && json.length > 0) return json as Tag[]
  return diagToTags(legacyText)
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

export function valuesFromServerPreop(
  p: ServerPreop,
  caseClinicalMode?: ClinicalMode | null,
): Partial<PreopFormInput> {
  const ulbt = p.upperLipBiteTest ?? p.ulbt
  return {
    clinicalMode: caseClinicalMode ?? p.clinicalMode ?? "ADULT",
    ageYears: p.ageYears ?? undefined,
    ageValue: p.ageValue ?? undefined,
    ageUnit: p.ageUnit ?? undefined,
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
    diagnoses: structuredOrLegacyTags(p.diagnosesJson, p.diagnosis),
    procedures: structuredOrLegacyTags(p.proceduresJson, p.plannedProcedure),
    highRiskSurgery: p.highRiskSurgery ?? false,
    // Unanswered, not derived. `!emergencySurgery` reads as elective the moment
    // emergency is unticked, which is not the same statement as "someone has
    // confirmed this case is elective" -- and it is not what a reopened case
    // with neither box ticked should silently become.
    elective: p.elective ?? false,
    emergencySurgery: p.emergencySurgery ?? false,
    comorbidities: diagToTags(p.comorbidities),
    currentMedications: commaToTags(p.currentMedications),
    allergies: p.allergies ?? null,
    latexAllergy: p.latexAllergy ?? null,
    allergyDetails: commaToTags(p.allergyDetails),
    familyAnesthesiaProblems: p.familyAnesthesiaProblems ?? null,
    familyAnesthesiaDetails: p.familyAnesthesiaDetails ?? undefined,
    unexplainedAnaesthesiaComplications: p.unexplainedAnaesthesiaComplications ?? null,
    malignantHyperthermiaHistory: p.malignantHyperthermiaHistory ?? null,
    dentalProsthetics: p.dentalProsthetics ?? null,
    looseTeeth: p.looseTeeth ?? null,
    smoking: p.smoking ?? null,
    substanceAbuse: p.substanceAbuse ?? null,
    bpSystolic: p.bpSystolic ?? undefined,
    bpDiastolic: p.bpDiastolic ?? undefined,
    heartRate: p.heartRate ?? undefined,
    heartArrhythmia: p.heartArrhythmia ?? null,
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
    retrognathia: p.retrognathia ?? null,
    prominentIncisors: p.prominentIncisors ?? null,
    facialHair: p.facialHair ?? null,
    // `difficultAirway` is the legacy column name and still worth reading, but
    // absent under either name means nobody has answered -- not "no history".
    difficultAirwayHistory: p.difficultAirwayHistory ?? p.difficultAirway ?? null,
    difficultAirwayNotes: p.difficultAirwayNotes ?? undefined,
    anticipatedDifficultAirway: p.anticipatedDifficultAirway ?? null,
    airwayUnobtainable: p.airwayUnobtainable ?? false,
    rcriIschemicHeart: p.rcriIschemicHeart ?? null,
    rcriCHF: p.rcriCHF ?? null,
    rcriCVD: p.rcriCVD ?? null,
    rcriInsulinDM: p.rcriInsulinDM ?? null,
    rcriCreatinine: p.rcriCreatinine ?? null,
    apfelPONVHistory: p.apfelPONVHistory ?? null,
    apfelPostopOpioids: p.apfelPostopOpioids ?? null,
    stopbangSnoring: p.stopbangSnoring ?? null,
    stopbangTired: p.stopbangTired ?? null,
    stopbangObserved: p.stopbangObserved ?? null,
    stopbangBP: p.stopbangBP ?? null,
    stopbangNeck: p.stopbangNeck ?? null,
    // Never invented. This mirrors the sex handling above and the reason is
    // the same: a reopened case whose ASA was never set must show unset, not
    // the class that happens to sort first.
    asaScore: p.asaScore ?? undefined,
    povocSurgeryAtLeast30Minutes: p.povocSurgeryAtLeast30Minutes ?? null,
    povocAgeAtLeast3Years: p.povocAgeAtLeast3Years ?? null,
    povocStrabismusSurgery: p.povocStrabismusSurgery ?? null,
    povocHistory: p.povocHistory ?? null,
    povocScore: p.povocScore ?? undefined,
    povocRiskPercent: p.povocRiskPercent ?? undefined,
    coldsApplicable: p.coldsApplicable ?? false,
    coldsScore: p.coldsScore ?? undefined,
    coldsCurrentSymptoms: p.coldsCurrentSymptoms ?? undefined,
    coldsOnset: p.coldsOnset ?? undefined,
    coldsLungDisease: p.coldsLungDisease ?? undefined,
    coldsAirwayDevice: p.coldsAirwayDevice ?? undefined,
    coldsSurgery: p.coldsSurgery ?? undefined,
    pediatricFasting: Array.isArray(p.pediatricFasting) ? p.pediatricFasting : [],
    // teamNotes and notes are two different fields the clinician can fill in
    // separately; falling back to one when the other is empty merges them and
    // shows a note under a heading nobody wrote it under.
    teamNotes: p.teamNotes ?? undefined,
    notes: p.notes ?? undefined,
    aiOptIn: p.aiOptIn ?? false,
    labResults: Array.isArray(p.labResults) ? p.labResults : [],
  }
}
