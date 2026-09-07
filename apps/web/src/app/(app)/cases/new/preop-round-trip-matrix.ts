import type { CaseDetail } from "@/types/case-detail"

/**
 * The preoperative round-trip matrix: every stored field, one distinct value.
 *
 * Data, not behaviour — kept beside the test rather than inside it because it
 * is a hundred lines of table that says what the database holds, and the test
 * that walks it is thirty lines that say what must survive the round trip.
 * Reading either is easier without the other in the way.
 */

export const NEVER_PERSISTED: Record<string, string> = {
  patientFirstName: "GDPR: identity is printed by hand, never stored",
  patientLastName:  "GDPR: identity is printed by hand, never stored",
  patientId:        "GDPR: identity is printed by hand, never stored",
}

export type RoundTrip = {
  /** Columns on the stored preop record. */
  db?: Record<string, unknown>
  /** Fields carried on the case record rather than the preop record. */
  record?: Partial<CaseDetail>
  /** The value the form must receive, and hand back on the next save. */
  form: unknown
}

const FASTING_ROW = {
  category: "CLEAR_FLUIDS",
  lastIntakeAt: "2026-08-01T04:00:00.000Z",
  status: "MET",
  requiredHours: 2,
  policyId: "esaic-2022",
  policyVersion: "1",
}

// Every field carries a distinct value so a mis-wired mapping cannot pass by
// coincidence, and every boolean is `true` so a dropped one reads back false.
// Clinical coherence is deliberately not the point: this is one synthetic
// record that exercises every column at once.

/** Fields stored and restored under the same name, unchanged. */
function rows(spec: Record<string, unknown>): Record<string, RoundTrip> {
  return Object.fromEntries(
    Object.entries(spec).map(([field, value]) => [field, { db: { [field]: value }, form: value }]),
  )
}
const flags = (...fields: string[]) =>
  rows(Object.fromEntries(fields.map(field => [field, true])))

export const MATRIX: Record<string, RoundTrip> = {
  clinicalMode: { record: { clinicalMode: "PEDIATRIC" }, form: "PEDIATRIC" },

  // ageYears is 0 on purpose — a neonate is 0 years old.
  ...rows({
    ageYears: 0, ageValue: 9, ageUnit: "MONTHS", sex: "FEMALE",
    heightCm: 71.5, weightKg: 8.4, bloodType: "AB", rhFactor: "NEGATIVE",
    teamNotes: "Two surgeons scrubbed",
    comorbidities: [{ label: "Asthma" }],
    familyAnesthesiaDetails: "Aunt — suspected MH",
    rcriScore: 3, apfelScore: 2, stopBangScore: 5,
    coldsCurrentSymptoms: "MILD", coldsOnset: "TWO_TO_4_WEEKS",
    coldsLungDisease: "MODERATE_OR_SEVERE", coldsAirwayDevice: "SUPRAGLOTTIC",
    coldsSurgery: "MINOR_AIRWAY", pediatricFasting: [FASTING_ROW],
    bpSystolic: 96, bpDiastolic: 54, heartRate: 128, spO2: 97,
    temperature: 36.8, respiratoryRate: 24,
    mallampati: "III", mouthOpeningCm: 2.5, thyromental: 5.5,
    neckMobility: "LIMITED", upperLipBiteTest: "CLASS_II",
    difficultAirwayNotes: "Grade III at last GA", cormackLehane: "IIb",
    asaScore: "III",
    physicalExamReport: "Chest clear, no added sounds",
    notes: "Parents consented in writing",
    labResults: [{ test: "Hb", value: "11.2", unit: "g/dL" }],
  }),

  ...flags(
    "highRiskSurgery", "elective", "emergencySurgery", "aiOptIn",
    "allergies", "latexAllergy", "familyAnesthesiaProblems",
    "unexplainedAnaesthesiaComplications", "malignantHyperthermiaHistory",
    "dentalProsthetics", "looseTeeth", "smoking", "substanceAbuse",
    // Score inputs — the boxes the clinician ticked, not the derived totals
    "apfelPONVHistory", "apfelPostopOpioids",
    "stopbangSnoring", "stopbangTired", "stopbangObserved", "stopbangBP", "stopbangNeck",
    "rcriIschemicHeart", "rcriCHF", "rcriCVD", "rcriInsulinDM", "rcriCreatinine",
    "povocSurgeryAtLeast30Minutes", "povocStrabismusSurgery", "povocHistory",
    "coldsApplicable", "heartArrhythmia",
    "retrognathia", "prominentIncisors", "facialHair", "difficultAirwayHistory",
    "anticipatedDifficultAirway",
    // "Unable to obtain" — a recorded refusal to record
    "bpUnobtainable", "heartRateUnobtainable", "spO2Unobtainable",
    "temperatureUnobtainable", "respiratoryRateUnobtainable", "airwayUnobtainable",
  ),

  // Renamed or reshaped between the record and the form
  diagnoses: {
    db: { diagnosesJson: [{ label: "Acute appendicitis" }], diagnosis: "Acute appendicitis" },
    form: [{ label: "Acute appendicitis" }],
  },
  procedures: {
    db: { proceduresJson: [{ label: "Appendectomy" }], plannedProcedure: "Appendectomy" },
    form: [{ label: "Appendectomy" }],
  },
  allergyDetails: {
    db: { allergyDetails: JSON.stringify([{ label: "Penicillin" }]) },
    form: [{ label: "Penicillin" }],
  },
  currentMedications: {
    db: { currentMedications: JSON.stringify([{ label: "Salbutamol" }]) },
    form: [{ label: "Salbutamol" }],
  },
}

export function matrixRecord(baseRecord: () => CaseDetail): CaseDetail {
  const preop: Record<string, unknown> = {
    id: "preop-1",
    caseId: "case-1",
    updatedAt: "2026-08-01T06:00:00.000Z",
    syncRevision: 4,
  }
  let record = baseRecord()
  for (const entry of Object.values(MATRIX)) {
    Object.assign(preop, entry.db ?? {})
    record = { ...record, ...(entry.record ?? {}) }
  }
  return { ...record, preop: preop as unknown as CaseDetail["preop"] }
}
