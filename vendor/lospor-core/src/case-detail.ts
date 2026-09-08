import type { CaseStatus } from "./case-status"
import type {
  ClinicalMode,
  PediatricAgeUnit,
  PediatricPainScale,
} from "./pediatric"

export type Sex = "MALE" | "FEMALE" | "OTHER" | "UNKNOWN"
export type BloodType = "A" | "B" | "AB" | "O"
export type RhFactor = "POSITIVE" | "NEGATIVE"
export type MallampatiClass = "I" | "II" | "III" | "IV"
export type NeckMobility = "FULL" | "LIMITED" | "FIXED"
export type UpperLipBiteTest = "CLASS_I" | "CLASS_II" | "CLASS_III"
export type CormackLehane = "I" | "IIa" | "IIb" | "III" | "IV"
export type ASAScore = "I" | "II" | "III" | "IV" | "V" | "VI"
export type Disposition = "WARD" | "PACU" | "ICU"
export type AirwayDevice = "FACE_MASK" | "LMA" | "ORAL_ETT" | "NASAL_ETT" | "SURGICAL_AIRWAY"
export type VolatileAgent = "SEVOFLURANE" | "DESFLURANE" | "ISOFLURANE"

export type ClinicalTagDto = {
  label: string
  code?: string
  sub?: string
  [key: string]: unknown
}

export type LabResultDto = {
  test: string
  value: string
  unit: string
  [key: string]: unknown
}

export type VascularAccessDto = {
  siteLabel: string
  size: string
  sizeUnit: string
  lumens?: string
  preexisting?: boolean
  [key: string]: unknown
}

export type IntraopKeyEventDto = {
  type: string
  name?: string
  dose?: number | string
  unit?: string
  infId?: string
  fluidId?: string
  rate?: number | string
  col?: number
  timestamp?: number | string
  [key: string]: unknown
}

export type IntraopKeyEventsDto = Record<string, unknown> & {
  log?: IntraopKeyEventDto[]
}

export type PediatricFastingDto = {
  category: string
  lastIntakeAt: string | null
  status?: "MET" | "NOT_MET" | "UNKNOWN"
  requiredHours?: number
  policyId: string
  policyVersion: string
}

export type CaseClinicalCalculationDto = {
  id: string
  kind: string
  inputs: Record<string, unknown>
  outputs: Record<string, unknown>
  ruleVersion: string
  sourceRefs: string[]
  acceptedBy: string | null
  acceptedAt: string | null
  createdAt: string
}

export type CaseDetailPreopDto = Record<string, unknown> & {
  id: string
  caseId: string
  ageYears: number | null
  ageValue?: number | null
  ageUnit?: PediatricAgeUnit | null
  ageApproxDays?: number | null
  sex: Sex
  heightCm: number | null
  weightKg: number | null
  bmi: number | null
  bodySurfaceAreaM2?: number | null
  bloodType: BloodType | null
  rhFactor: RhFactor | null
  diagnosis: string
  diagnosesJson: ClinicalTagDto[] | null
  plannedProcedure: string
  proceduresJson: ClinicalTagDto[] | null
  icdCode: string | null
  teamNotes: string | null
  comorbidities: ClinicalTagDto[] | null
  allergies: boolean
  allergyDetails: string | null
  latexAllergy: boolean
  currentMedications: string | null
  familyAnesthesiaProblems: boolean
  familyAnesthesiaDetails: string | null
  // The patient's own anaesthetic history, as distinct from the family history
  // above. Tri-state on purpose: null means nobody asked, which is not the same
  // clinical statement as a patient who answered no.
  unexplainedAnaesthesiaComplications: boolean | null
  malignantHyperthermiaHistory: boolean | null
  dentalProsthetics: boolean
  looseTeeth: boolean
  smoking: boolean
  substanceAbuse: boolean
  bpSystolic: number | null
  bpDiastolic: number | null
  heartRate: number | null
  heartArrhythmia: boolean
  spO2: number | null
  temperature: number | null
  respiratoryRate: number | null
  bpUnobtainable: boolean
  heartRateUnobtainable: boolean
  spO2Unobtainable: boolean
  temperatureUnobtainable: boolean
  respiratoryRateUnobtainable: boolean
  mallampati: MallampatiClass | null
  mouthOpeningCm: number | null
  thyromental: number | null
  neckMobility: NeckMobility | null
  upperLipBiteTest: UpperLipBiteTest | null
  retrognathia: boolean
  prominentIncisors: boolean
  facialHair: boolean
  difficultAirwayHistory: boolean
  // The anaesthetist's overall judgement before induction, kept separate from
  // the predictors above and from the cormackLehane grade actually found, so
  // prediction can be paired against outcome. Tri-state: null means no
  // judgement was recorded.
  anticipatedDifficultAirway: boolean | null
  difficultAirwayNotes: string | null
  cormackLehane: CormackLehane | null
  airwayUnobtainable: boolean
  asaScore: ASAScore | null
  elective: boolean
  emergencySurgery: boolean
  highRiskSurgery: boolean
  // Null means the question was never put to the patient, which is not the
  // same as a recorded "no". The columns became nullable in 1.0.0 and this
  // contract did not follow, so a null arrived typed as a boolean and every
  // consumer read an unasked criterion as answered.
  //
  // emergencySurgery and highRiskSurgery above stay binary on purpose: not
  // emergent means elective, and that is a property of the operation rather
  // than a question anyone asks.
  rcriIschemicHeart: boolean | null
  rcriCHF: boolean | null
  rcriCVD: boolean | null
  rcriInsulinDM: boolean | null
  rcriCreatinine: boolean | null
  rcriScore: number | null
  gutaScore: number | null
  apfelScore: number | null
  stopBangScore: number | null
  apfelPONVHistory: boolean | null
  apfelPostopOpioids: boolean | null
  stopbangSnoring: boolean | null
  stopbangTired: boolean | null
  stopbangObserved: boolean | null
  stopbangBP: boolean | null
  stopbangNeck: boolean | null
  povocScore?: number | null
  povocRiskPercent?: number | null
  povocSurgeryAtLeast30Minutes?: boolean
  povocAgeAtLeast3Years?: boolean
  povocStrabismusSurgery?: boolean
  povocHistory?: boolean
  coldsApplicable?: boolean
  coldsScore?: number | null
  coldsCurrentSymptoms?: string | null
  coldsOnset?: string | null
  coldsLungDisease?: string | null
  coldsAirwayDevice?: string | null
  coldsSurgery?: string | null
  pediatricFasting?: PediatricFastingDto[] | null
  labResults: LabResultDto[] | null
  aiOptIn: boolean
  createdAt: string
  updatedAt: string
  syncRevision: number
}

export type CaseDetailIntraopDto = Record<string, unknown> & {
  id: string
  caseId: string
  monthYear: string | null
  durationMinutes: number | null
  startTime: string | null
  endTime: string | null
  startedAt?: string | null
  endedAt?: string | null
  timezone?: string | null
  positions: string[] | null
  techniques: string[] | null
  airwayDevice: AirwayDevice | null
  tubeSize: number | null
  cuffed: boolean | null
  peepCmH2O: number | null
  ippv: boolean
  jetVentilation: boolean
  /**
   * Why this case has no airway device of its own.
   *
   * presentsIntubated: arrived with a tube somebody else placed.
   * airwayNotApplicable: no airway intervention at all.
   *
   * Optional because rows written before these columns existed carry neither,
   * and a case that predates them says nothing rather than asserting false.
   */
  presentsIntubated?: boolean
  airwayNotApplicable?: boolean
  fob: boolean
  airwayTools: string[] | null
  airwayNotes: string | null
  cormackLehane: CormackLehane | null
  airwayDevices: string[] | null
  ventilationModes: string[] | null
  lmaSize: number | null
  oralTubeSize: number | null
  oralCuffed: boolean | null
  nasalTubeSize: number | null
  nasalCuffed: boolean | null
  dltType: string | null
  dltSide: string | null
  dltSize: number | null
  endobronchialSize: number | null
  volatileAgent: VolatileAgent | null
  ecg: boolean
  urinaryCatheter: boolean
  stomachTube: boolean
  spO2Monitor: boolean
  invasiveBP: boolean
  cvpMonitor: boolean
  bglMonitor: boolean
  bloodGasMonitor: boolean
  neuroMonitor: boolean
  nbpMonitor: boolean
  etco2Monitor: boolean
  tempMonitor: boolean
  paCatheter: boolean
  tee: boolean
  bis: boolean
  entropyMonitor: boolean
  nirsMonitor: boolean
  evokedPotentials: boolean
  tofMonitor: boolean
  /**
   * What the monitor read, for the three modalities that carry a number.
   *
   * Each is null unless its flag above is set, and is cleared when the flag is
   * unset -- a reading from a monitor the same record says was not used is a
   * contradiction, not data. Optional because rows written before these columns
   * existed carry none, and those cases say nothing rather than asserting zero.
   *
   * cvpMmHg is always mmHg regardless of the unit the clinician typed in.
   */
  bisValue?: number | null
  tofRatio?: number | null
  cvpMmHg?: number | null
  vascularAccesses: VascularAccessDto[] | null
  premedicationEvening: string | null
  premedicationMorning: string | null
  drugsAdministered: unknown
  crystalloidsMl: number | null
  colloidsMl: number | null
  bloodMl: number | null
  bloodProductsNote: string | null
  urineMl: number | null
  bloodLossMl: number | null
  timeSeriesData: unknown
  keyEvents: IntraopKeyEventsDto | null
  complications: string | null
  createdAt: string
  updatedAt: string
  syncRevision: number
}

export type CaseDetailPostopDto = Record<string, unknown> & {
  id: string
  caseId: string
  aldreteActivity: number | null
  aldreteRespiration: number | null
  aldreteCirculation: number | null
  aldreteConsciousness: number | null
  aldreteSpO2: number | null
  aldreteTotal: number | null
  recoveryBpSystolic: number | null
  recoveryBpDiastolic: number | null
  recoveryHeartRate: number | null
  recoverySpO2: number | null
  painScoreNRS: number | null
  pediatricPainScale?: PediatricPainScale | null
  pediatricPainScore?: number | null
  paedScore?: number | null
  ponv: boolean
  temperatureCelsius: number | null
  recoveryBpUnobtainable: boolean
  recoveryHeartRateUnobtainable: boolean
  recoverySpO2Unobtainable: boolean
  recoveryTemperatureUnobtainable: boolean
  complications: string | null
  disposition: Disposition | null
  dispositionNotes: string | null
  handoverItems: string[] | null
  createdAt: string
  updatedAt: string
  syncRevision: number
}

export type CaseDetailDto = {
  id: string
  caseCode: string | null
  notes: string | null
  userId: string
  /** Immutable author; `userId` remains the current clinical assignee. */
  createdById: string
  institutionId: string | null
  status: CaseStatus
  clinicalMode?: ClinicalMode
  clinicalRulesVersion?: string | null
  /**
   * When status first became AWAITING_REVIEW, set once and never touched by a
   * later edit that keeps it there. The server anchor the pending-close
   * countdown reads, so it means the same thing to every client on every
   * route into this case.
   */
  awaitingReviewAt?: string | null
  finalizedAt: string | null
  createdAt: string
  updatedAt: string
  preop: CaseDetailPreopDto | null
  intraop: CaseDetailIntraopDto | null
  postop: CaseDetailPostopDto | null
  institution: { name: string; city: string } | null
  intraopUpdatedAt?: string | null
  intraopRevision?: number | null
  pediatricModeDecisionRequired?: boolean
  clinicalCalculations?: CaseClinicalCalculationDto[]
  capabilities: CaseAccessCapabilities
}

export type CaseAccessCapabilities = {
  canRead: boolean
  canWrite: boolean
  isCreator: boolean
  isAssignee: boolean
}

export type CaseDetailPreop = CaseDetailPreopDto
export type CaseDetailIntraop = CaseDetailIntraopDto
export type CaseDetailPostop = CaseDetailPostopDto
export type CaseDetail = CaseDetailDto

export type Serialized<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T
