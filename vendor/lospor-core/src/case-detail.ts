import type { CaseStatus } from "./case-status"

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
export type CVKSite = "INTERNAL_JUGULAR" | "EXTERNAL_JUGULAR" | "SUBCLAVIAN" | "FEMORAL"
export type ArterialLineSite = "RADIAL" | "DORSALIS_PEDIS" | "FEMORAL" | "BRACHIAL"
export type PlexusBlock =
  | "AXILLARY"
  | "INTERSCALENE"
  | "SUPRACLAVICULAR"
  | "INFRACLAVICULAR"
  | "FEMORAL"
  | "SCIATIC"
  | "POPLITEAL"
  | "TAP"
  | "ERECTOR_SPINAE"

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

export type CaseDetailPreopDto = Record<string, unknown> & {
  id: string
  caseId: string
  ageYears: number | null
  sex: Sex
  heightCm: number | null
  weightKg: number | null
  bmi: number | null
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
  difficultAirwayNotes: string | null
  cormackLehane: CormackLehane | null
  airwayUnobtainable: boolean
  asaScore: ASAScore | null
  elective: boolean
  emergencySurgery: boolean
  highRiskSurgery: boolean
  rcriIschemicHeart: boolean
  rcriCHF: boolean
  rcriCVD: boolean
  rcriInsulinDM: boolean
  rcriCreatinine: boolean
  rcriScore: number | null
  gutaScore: number | null
  apfelScore: number | null
  stopBangScore: number | null
  apfelPONVHistory: boolean
  apfelPostopOpioids: boolean
  stopbangSnoring: boolean
  stopbangTired: boolean
  stopbangObserved: boolean
  stopbangBP: boolean
  stopbangNeck: boolean
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
  plexusBlock: PlexusBlock | null
  cvkSite: CVKSite | null
  arterialLineSite: ArterialLineSite | null
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
  vascularAccesses: VascularAccessDto[] | null
  premedicationEvening: string | null
  premedicationMorning: string | null
  drugsAdministered: unknown
  crystalloidsMl: number | null
  colloidsMl: number | null
  bloodMl: number | null
  bloodProductsNote: string | null
  urineMl: number | null
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
  institutionId: string | null
  status: CaseStatus
  finalizedAt: string | null
  createdAt: string
  updatedAt: string
  preop: CaseDetailPreopDto | null
  intraop: CaseDetailIntraopDto | null
  postop: CaseDetailPostopDto | null
  institution: { name: string; city: string } | null
  intraopUpdatedAt?: string | null
  intraopRevision?: number | null
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
