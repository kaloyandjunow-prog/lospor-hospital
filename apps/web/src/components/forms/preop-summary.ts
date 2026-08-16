/**
 * The slice of the preoperative assessment the intraoperative screen shows.
 *
 * A read-only summary, not a form shape: the intraop record must never write
 * back to preop, so nothing here is required and nothing here is edited.
 */
export type PreopSummary = {
  clinicalMode?: "ADULT" | "PEDIATRIC"
  asaScore?: string | null
  ageYears?: number | null
  ageValue?: number | null
  ageUnit?: "DAYS" | "MONTHS" | "YEARS" | null
  heightCm?: number | null; weightKg?: number | null; sex?: string | null
  bmi?: number | null
  bpSystolic?: number | null; bpDiastolic?: number | null
  heartRate?: number | null;  spO2?: number | null
  mallampati?: string | null
  neckMobility?: string | null
  mouthOpeningCm?: number | null
  cormackLehane?: string | null
  // Null where the preop question was never asked, which is not the same claim
  // as a recorded "no". Anything that renders these must say so rather than
  // reassuring the anaesthetist that the airway history is clear.
  difficultAirwayHistory?: boolean | null
  allergies?: boolean | null
  allergyDetails?: { label: string }[]
  comorbidities?: { label: string }[]
  currentMedications?: { label: string; atcCode?: string }[]
  labResults?: { test: string; value: string; unit: string }[]
  diagnosis?: string | null
  plannedProcedure?: string | null
  emergencySurgery?: boolean | null
}
