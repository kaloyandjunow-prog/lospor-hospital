export const RESEARCH_API_VERSION = 1 as const
export const RESEARCH_MIN_CELL_SIZE = 5
export const RESEARCH_DEFAULT_PAGE_SIZE = 50
export const RESEARCH_MAX_PAGE_SIZE = 200

export const RESEARCH_CASE_STATUSES = [
  "DRAFT",
  "IN_PROGRESS",
  "AWAITING_REVIEW",
  "COMPLETE",
] as const

export const RESEARCH_METRIC_IDS = [
  "caseCount",
  "meanAgeYears",
  "meanBmi",
  "meanDurationMinutes",
  "emergencyRate",
  "highRiskRate",
  "complicationRate",
  "ponvRate",
  "meanAldrete",
  "meanPainScore",
  "mappingCoverage",
  "fieldCompleteness",
] as const

export const RESEARCH_DISTRIBUTION_IDS = [
  "sex",
  "asa",
  "status",
  "procedure",
  "diagnosis",
  "technique",
  "airway",
  "disposition",
  "complication",
] as const

export const RESEARCH_EXPORT_FORMATS = [
  "csv",
  "json",
  "omop-csv",
  "omop-json",
] as const

export type ResearchCaseStatus = typeof RESEARCH_CASE_STATUSES[number]
export type ResearchMetricId = typeof RESEARCH_METRIC_IDS[number]
export type ResearchDistributionId = typeof RESEARCH_DISTRIBUTION_IDS[number]
export type ResearchExportFormat = typeof RESEARCH_EXPORT_FORMATS[number]
export type ResearchSourceKind = "LOSPOR" | "OMOP"
export type ResearchScopeKind = "OWN" | "INSTITUTION" | "GRANT" | "ALL"
export type ResearchCohortVisibility = "PRIVATE" | "INSTITUTION"
export type ResearchExportStatus = "PENDING" | "RUNNING" | "COMPLETE" | "FAILED"
export type ResearchDataAction = "query" | "inspectCases" | "export" | "exportOmop"

export type ResearchScopeSummary = {
  kind: ResearchScopeKind
  institutionIds: string[]
  institutionLabels: string[]
}

export type ResearchCountDisclosure = {
  value: number | null
  lowerBound: number
  upperBound: number | null
  exact: boolean
  suppressed: boolean
}

export type ResearchNumberRange = { min?: number; max?: number }
export type ResearchDateRange = { from?: string; to?: string }

export type ResearchCohortFilters = {
  statuses?: ResearchCaseStatus[]
  finalized?: ResearchDateRange
  ageYears?: ResearchNumberRange
  bmi?: ResearchNumberRange
  durationMinutes?: ResearchNumberRange
  aldreteTotal?: ResearchNumberRange
  painScore?: ResearchNumberRange
  sex?: string[]
  asa?: string[]
  emergency?: boolean
  highRisk?: boolean
  ponv?: boolean
  diagnosisCodes?: string[]
  diagnosisText?: string
  comorbidityCodes?: string[]
  comorbidityText?: string
  procedureCodes?: string[]
  procedureText?: string
  procedureGroups?: string[]
  techniques?: string[]
  positions?: string[]
  airwayDevices?: string[]
  monitoring?: string[]
  medications?: string[]
  atcCodes?: string[]
  complications?: string[]
  dispositions?: string[]
  mappingStatuses?: string[]
  minimumCompleteness?: number
}

export type ResearchCohortDefinition = {
  version: typeof RESEARCH_API_VERSION
  filters: ResearchCohortFilters
}

export type ResearchPaginationRequest = { skip?: number; take?: number }
export type ResearchPagination = {
  total: number
  skip: number
  take: number
  hasMore: boolean
}

export type ResearchQueryRequest = {
  cohort: ResearchCohortDefinition
  savedCohortId?: string
  pagination?: ResearchPaginationRequest
  metrics?: ResearchMetricId[]
  distributions?: ResearchDistributionId[]
  sort?: {
    field: "finalizedAt" | "ageYears" | "durationMinutes" | "asa"
    direction: "asc" | "desc"
  }
}

export type ResearchMetric = {
  id: ResearchMetricId
  value: number | null
  numerator?: number | null
  denominator?: number | null
  unit?: "count" | "percent" | "years" | "kg/m2" | "minutes" | "score"
  suppressed: boolean
}

export type ResearchDistributionBucket = {
  key: string
  label: string
  labelEn?: string
  labelBg?: string | null
  count: number | null
  percent: number | null
  suppressed: boolean
}

export type ResearchDistribution = {
  id: ResearchDistributionId
  buckets: ResearchDistributionBucket[]
}

export type ResearchCaseSummary = {
  id: string
  researchId: string
  status: ResearchCaseStatus
  period: string | null
  ageYears: number | null
  sex: string | null
  asa: string | null
  diagnosis: string | null
  diagnosisCode: string | null
  diagnosisLabelEn?: string | null
  diagnosisLabelBg?: string | null
  procedure: string | null
  procedureCode: string | null
  procedureLabelEn?: string | null
  procedureLabelBg?: string | null
  durationMinutes: number | null
  technique: string[]
  disposition: string | null
  complications: number
  completeness: number
}

export type ResearchTimelineEvent = {
  id: string
  minute: number | null
  type: string
  code?: string | null
  label: string
  labelEn?: string
  labelBg?: string | null
  value?: string | number | null
  unit?: string | null
}

export type ResearchMappedTerm = {
  code: string | null
  label: string
  labelEn?: string
  labelBg?: string | null
  mappingStatus: string
}

export type ResearchCaseDetail = ResearchCaseSummary & {
  demographics: Record<string, string | number | boolean | null>
  diagnoses: ResearchMappedTerm[]
  comorbidities: ResearchMappedTerm[]
  procedures: Array<ResearchMappedTerm & { group: string | null }>
  medications: ResearchMappedTerm[]
  labs: Array<{
    code: string | null
    label: string
    labelEn?: string
    labelBg?: string | null
    value: string | number | null
    unit: string | null
    flag: string | null
    mappingStatus: string
  }>
  intraoperative: Record<string, string | number | boolean | string[] | null>
  postoperative: Record<string, string | number | boolean | string[] | null>
  timeline: ResearchTimelineEvent[]
  quality: {
    snapshotPresent: boolean
    finalized: boolean
    fieldCompleteness: number
    warnings: string[]
  }
}

export type ResearchQueryResponse = {
  apiVersion: typeof RESEARCH_API_VERSION
  source: ResearchSourceKind
  cohort: ResearchCohortDefinition
  matchingCases: number | null
  matchingCaseCount: ResearchCountDisclosure
  metrics: ResearchMetric[]
  distributions: ResearchDistribution[]
  /** @deprecated Aggregate queries never return case rows. */
  cases: ResearchCaseSummary[]
  /** @deprecated Use the inspection-authorized case query endpoint. */
  pagination: ResearchPagination | null
  generatedAt: string
}

export type ResearchCaseQueryResponse = {
  apiVersion: typeof RESEARCH_API_VERSION
  source: ResearchSourceKind
  cohort: ResearchCohortDefinition
  matchingCases: number
  cases: ResearchCaseSummary[]
  pagination: ResearchPagination
  generatedAt: string
}

export type ResearchComparisonRequest = {
  left: ResearchCohortDefinition
  right: ResearchCohortDefinition
  metrics?: ResearchMetricId[]
}

export type ResearchComparisonMetric = {
  id: ResearchMetricId
  left: ResearchMetric
  right: ResearchMetric
  absoluteDifference: number | null
  relativeDifferencePercent: number | null
}

export type ResearchComparisonResponse = {
  leftCount: number | null
  rightCount: number | null
  leftCaseCount: ResearchCountDisclosure
  rightCaseCount: ResearchCountDisclosure
  metrics: ResearchComparisonMetric[]
  generatedAt: string
}

export type ResearchBenchmarkInterval = "month" | "quarter" | "year"
export type ResearchBenchmarkRequest = {
  cohort: ResearchCohortDefinition
  interval: ResearchBenchmarkInterval
  metric: ResearchMetricId
  compareWithPreviousPeriod?: boolean
  institutionIds?: string[]
}

export type ResearchBenchmarkPoint = {
  period: string
  institutionId?: string
  institutionLabel?: string
  value: number | null
  caseCount: number | null
  caseCountDisclosure: ResearchCountDisclosure
  previousValue: number | null
  absoluteChange: number | null
  relativeChangePercent: number | null
  suppressed: boolean
}

export type ResearchBenchmarkResponse = {
  metric: ResearchMetricId
  interval: ResearchBenchmarkInterval
  points: ResearchBenchmarkPoint[]
  generatedAt: string
}

export type ResearchQualityField = {
  section: string
  field: string
  present: number | null
  absent: number | null
  notApplicable: number | null
  completeness: number | null
  suppressed: boolean
}

export type ResearchQualityMapping = {
  domain: string
  mapped: number | null
  sourceOnly: number | null
  unmapped: number | null
  coverage: number | null
  suppressed: boolean
}

export type ResearchQualityResponse = {
  totalCases: number | null
  totalCaseCount: ResearchCountDisclosure
  finalizedCases: number | null
  snapshotCoverage: number | null
  relationalDriftCases: number | null
  impossibleTimelineCases: number | null
  suppressed: boolean
  fields: ResearchQualityField[]
  mappings: ResearchQualityMapping[]
  generatedAt: string
}

export type SavedResearchCohort = {
  id: string
  name: string
  description: string | null
  visibility: ResearchCohortVisibility
  definition: ResearchCohortDefinition
  ownerId: string
  institutionId: string | null
  createdAt: string
  updatedAt: string
  lastRunAt: string | null
}

export type ResearchExportRecord = {
  id: string
  name: string
  format: ResearchExportFormat
  status: ResearchExportStatus
  definition: ResearchCohortDefinition
  rowCount: number | null
  checksum: string | null
  error: string | null
  filename: string | null
  asOf: string | null
  definitionHash: string | null
  snapshotHash: string | null
  matchingCases: number | null
  sourceCommit: string | null
  contentType: string | null
  byteSize: number | null
  sourceVersion: string | null
  generatedAt: string | null
  revisionManifestVersion: number
  expiresAt: string | null
  artifactAvailable: boolean
  legacy: boolean
  createdAt: string
  completedAt: string | null
}

export type ResearchPermissionSet = {
  query: boolean
  inspectCases: boolean
  compare: boolean
  benchmark: boolean
  savePrivateCohorts: boolean
  shareInstitutionCohorts: boolean
  export: boolean
  exportOmop: boolean
  manageAccess: boolean
}

export type ResearchMetadata = {
  apiVersion: typeof RESEARCH_API_VERSION
  source: ResearchSourceKind
  sourceLabel: string
  sourceVersion: string
  generatedAt: string
  dataFreshnessAt: string | null
  /** @deprecated Compatibility alias for scopes.query. */
  scope: ResearchScopeSummary
  scopes: Record<ResearchDataAction, ResearchScopeSummary>
  permissions: ResearchPermissionSet
  suppressionThreshold: number
  defaultCohort: ResearchCohortDefinition
  supportedMetrics: ResearchMetricId[]
  supportedDistributions: ResearchDistributionId[]
  supportedExports: ResearchExportFormat[]
}

function cleanStrings(values: string[] | undefined): string[] | undefined {
  if (!values) return undefined
  const cleaned = [...new Set(values.map(value => value.trim()).filter(Boolean))]
  return cleaned.length ? cleaned : undefined
}

function cleanText(value: string | undefined): string | undefined {
  const cleaned = value?.trim()
  return cleaned || undefined
}

function cleanRange(range: ResearchNumberRange | undefined): ResearchNumberRange | undefined {
  if (!range) return undefined
  const min = Number.isFinite(range.min) ? range.min : undefined
  const max = Number.isFinite(range.max) ? range.max : undefined
  if (min === undefined && max === undefined) return undefined
  return min !== undefined && max !== undefined && min > max
    ? { min: max, max: min }
    : { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) }
}

export function normalizeResearchCohort(
  input?: Partial<ResearchCohortDefinition> | null,
): ResearchCohortDefinition {
  const filters = input?.filters ?? {}
  return {
    version: RESEARCH_API_VERSION,
    filters: {
      statuses: filters.statuses?.length
        ? [...new Set(filters.statuses)].filter(status => RESEARCH_CASE_STATUSES.includes(status))
        : ["COMPLETE"],
      finalized: filters.finalized?.from || filters.finalized?.to
        ? {
            ...(cleanText(filters.finalized.from) ? { from: cleanText(filters.finalized.from) } : {}),
            ...(cleanText(filters.finalized.to) ? { to: cleanText(filters.finalized.to) } : {}),
          }
        : undefined,
      ageYears: cleanRange(filters.ageYears),
      bmi: cleanRange(filters.bmi),
      durationMinutes: cleanRange(filters.durationMinutes),
      aldreteTotal: cleanRange(filters.aldreteTotal),
      painScore: cleanRange(filters.painScore),
      sex: cleanStrings(filters.sex),
      asa: cleanStrings(filters.asa),
      emergency: filters.emergency,
      highRisk: filters.highRisk,
      ponv: filters.ponv,
      diagnosisCodes: cleanStrings(filters.diagnosisCodes),
      diagnosisText: cleanText(filters.diagnosisText),
      comorbidityCodes: cleanStrings(filters.comorbidityCodes),
      comorbidityText: cleanText(filters.comorbidityText),
      procedureCodes: cleanStrings(filters.procedureCodes),
      procedureText: cleanText(filters.procedureText),
      procedureGroups: cleanStrings(filters.procedureGroups),
      techniques: cleanStrings(filters.techniques),
      positions: cleanStrings(filters.positions),
      airwayDevices: cleanStrings(filters.airwayDevices),
      monitoring: cleanStrings(filters.monitoring),
      medications: cleanStrings(filters.medications),
      atcCodes: cleanStrings(filters.atcCodes),
      complications: cleanStrings(filters.complications),
      dispositions: cleanStrings(filters.dispositions),
      mappingStatuses: cleanStrings(filters.mappingStatuses),
      minimumCompleteness: Number.isFinite(filters.minimumCompleteness)
        ? Math.min(100, Math.max(0, filters.minimumCompleteness ?? 0))
        : undefined,
    },
  }
}

export function normalizeResearchPagination(
  input?: ResearchPaginationRequest | null,
): Required<ResearchPaginationRequest> {
  const skip = Number.isFinite(input?.skip) ? Math.max(0, Math.floor(input?.skip ?? 0)) : 0
  const take = Number.isFinite(input?.take)
    ? Math.min(RESEARCH_MAX_PAGE_SIZE, Math.max(1, Math.floor(input?.take ?? RESEARCH_DEFAULT_PAGE_SIZE)))
    : RESEARCH_DEFAULT_PAGE_SIZE
  return { skip, take }
}

export function shouldSuppressResearchCell(
  count: number,
  threshold = RESEARCH_MIN_CELL_SIZE,
): boolean {
  return count > 0 && count < threshold
}

export function shouldSuppressResearchBinary(
  numerator: number,
  denominator: number,
  threshold = RESEARCH_MIN_CELL_SIZE,
): boolean {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return false
  }
  const positive = Math.max(0, Math.min(denominator, numerator))
  const negative = denominator - positive
  return denominator < threshold ||
    shouldSuppressResearchCell(positive, threshold) ||
    shouldSuppressResearchCell(negative, threshold)
}

export function discloseResearchCount(
  count: number,
  allowExact = false,
): ResearchCountDisclosure {
  const normalized = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  if (allowExact || normalized === 0) {
    return {
      value: normalized,
      lowerBound: normalized,
      upperBound: normalized,
      exact: true,
      suppressed: false,
    }
  }
  if (normalized < RESEARCH_MIN_CELL_SIZE) {
    return {
      value: null,
      lowerBound: 1,
      upperBound: RESEARCH_MIN_CELL_SIZE - 1,
      exact: false,
      suppressed: true,
    }
  }

  let width: number
  if (normalized < 10) width = 5
  else if (normalized < 100) width = 10
  else if (normalized < 1000) width = 50
  else width = 100
  const lowerBound = Math.floor(normalized / width) * width
  return {
    value: null,
    lowerBound,
    upperBound: lowerBound + width - 1,
    exact: false,
    suppressed: false,
  }
}

export function researchPercent(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null
  return Math.round((numerator / denominator) * 1000) / 10
}

export function makeResearchPagination(
  total: number,
  request?: ResearchPaginationRequest,
): ResearchPagination {
  const { skip, take } = normalizeResearchPagination(request)
  return { total, skip, take, hasMore: skip + take < total }
}

export function activeResearchFilterCount(definition: ResearchCohortDefinition): number {
  const normalized = normalizeResearchCohort(definition)
  return Object.entries(normalized.filters).filter(([key, value]) => {
    if (key === "statuses" && Array.isArray(value) && value.length === 1 && value[0] === "COMPLETE") {
      return false
    }
    if (Array.isArray(value)) return value.length > 0
    if (value && typeof value === "object") return Object.values(value).some(item => item !== undefined)
    return value !== undefined
  }).length
}
