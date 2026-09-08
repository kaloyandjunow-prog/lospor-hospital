/**
 * Wire contract between independent LOSPOR Hospital and Central products.
 *
 * Implementations remain outside this package. Keeping the contract pure lets
 * both products validate the same payload without sharing deployment code.
 */

export const EXCHANGE_SCHEMA = "lospor.exchange/v1" as const
export const RECEIPT_SCHEMA = "lospor.exchange-receipt/v1" as const
export const CAPABILITIES_SCHEMA = "lospor.exchange-capabilities/v1" as const
export const MANIFEST_VERSION = 1 as const
export const SUPPORTED_MANIFEST_VERSIONS = [1] as const
export const COMPATIBILITY_MONTHS = 24

export const OMOP_TABLES = [
  // CARE_SITE is a dimension, not a clinical event: one row per place, which
  // VISIT_OCCURRENCE then references by care_site_id. Sites previously wrote
  // the institution onto every visit as free text, which no OHDSI tool reads.
  "care_site",
  "person",
  "observation_period",
  "visit_occurrence",
  "condition_occurrence",
  "drug_exposure",
  "measurement",
  "procedure_occurrence",
  // An instrumented airway is a device left in the patient for the case, which
  // the CDM models as DEVICE_EXPOSURE rather than a procedure or an
  // observation. Sites emit it; Central declared no such table, so those rows
  // had nowhere to land.
  "device_exposure",
  "observation",
] as const

export type OmopTableName = typeof OMOP_TABLES[number]

/**
 * The columns each OMOP table carries on the wire, in CDM v5.4 order.
 *
 * Both products implement this independently: a site serialises these columns,
 * Central reads them. Neither side declared the set, and the two drifted — a
 * site began exporting a lab result's reference range and its qualitative
 * value, and Central's loader, which maps fields by name, had nowhere to put
 * them. The rows arrived, the row counts were right, and the values were
 * simply not there. No error, no warning.
 *
 * Declaring the set here makes that failure detectable from both ends. Adding
 * a column is a contract change, which is what it always was.
 */
export const OMOP_COLUMNS: Record<OmopTableName, readonly string[]> = {
  care_site: [
    "care_site_id", "care_site_name", "place_of_service_concept_id",
    "care_site_source_value",
  ],
  person: [
    "person_id", "gender_concept_id", "year_of_birth", "month_of_birth", "day_of_birth",
    "birth_datetime", "race_concept_id", "ethnicity_concept_id", "person_source_value",
    "gender_source_value",
  ],
  observation_period: [
    "observation_period_id", "person_id", "observation_period_start_date",
    "observation_period_end_date", "period_type_concept_id",
  ],
  visit_occurrence: [
    // Anaesthesia start and end are clock times, not just days: case duration,
    // turnover and first-case metrics are all unanswerable from a date alone.
    // The date columns stay for tools that only read those.
    "visit_occurrence_id", "person_id", "visit_concept_id",
    "visit_start_date", "visit_start_datetime", "visit_end_date", "visit_end_datetime",
    "visit_type_concept_id", "visit_source_value", "care_site_source_value", "care_site_id",
  ],
  condition_occurrence: [
    "condition_occurrence_id", "person_id", "condition_concept_id", "condition_start_date",
    "condition_type_concept_id", "condition_source_value", "visit_occurrence_id",
  ],
  drug_exposure: [
    "drug_exposure_id", "person_id", "drug_concept_id", "drug_exposure_start_date", "drug_exposure_end_date",
    "drug_type_concept_id", "drug_source_value", "drug_source_concept_id", "dose_value",
    "dose_unit_source_value", "route_source_value", "visit_occurrence_id",
  ],
  measurement: [
    "measurement_id", "person_id", "measurement_concept_id", "measurement_date",
    "measurement_datetime", "measurement_type_concept_id", "value_as_number",
    // A result that is a category rather than a number: an airway grade, or the
    // fact that a measurement was attempted and could not be obtained. Without
    // it both arrive carrying no value at all, which reads as "not measured" —
    // and a measurement nobody could take is a different clinical statement
    // from one nobody tried.
    "value_as_concept_id",
    "unit_concept_id",
    "unit_source_value", "measurement_source_value", "value_source_value",
    "range_low", "range_high", "visit_occurrence_id",
  ],
  procedure_occurrence: [
    "procedure_occurrence_id", "person_id", "procedure_concept_id", "procedure_date",
    // Set only where a procedure is also witnessed as a precise intraoperative
    // event; most rows are known to the day and leave it null.
    "procedure_datetime",
    "procedure_type_concept_id",
    // How the operation was performed -- urgency, for now. A qualifier on the
    // operation rather than an operation of its own.
    "modifier_concept_id", "modifier_source_value",
    "procedure_source_value", "visit_occurrence_id",
  ],
  device_exposure: [
    "device_exposure_id", "person_id", "device_concept_id",
    "device_exposure_start_date", "device_exposure_end_date",
    "device_type_concept_id", "device_source_value", "visit_occurrence_id",
  ],
  observation: [
    "observation_id", "person_id", "observation_concept_id", "observation_date",
    "observation_type_concept_id", "value_as_number", "value_as_string",
    // A coded answer where the vocabulary can state one -- a clinical yes or no
    // that no tool can read out of the string "true". MEASUREMENT gained this
    // in 2.3.0; OBSERVATION carries the same kind of answer and was missed.
    "value_as_concept_id",
    "observation_source_value", "visit_occurrence_id",
  ],
}

export type CaseAction = "UPSERT" | "WITHDRAW"
export type QualityStatus = "PASS" | "WARNING" | "FAIL"

export type VersionSet = {
  hospital: string
  api: string
  core: string
  omopSource: string
  databaseSchema: string
  /**
   * Vintage of the LOSPOR data dictionary the batch was written against.
   *
   * Which vocabulary a site was using is not recoverable from the rows once
   * they are ingested, so it has to travel with the batch. Sites running
   * different dictionary vintages are expected and fine; a batch that will not
   * say which vintage it used is not, and is rejected with the rest of an
   * incomplete manifest.
   */
  dataDictionary: string
  conceptMap: string
  redactionProfile: string
}

export type SiteIdentity = {
  siteId: string
  siteCode: string
  institutionId: string
}

export type CaseRevision = {
  casePseudonym: string
  personPseudonym: string
  sourcePersonId: string
  sourceObservationPeriodId: string
  sourceVisitId: string
  action: CaseAction
  clinicalRevision: number
  eventRevision: number
  relationalRevision: number
  preopRevision: number | null
  intraopRevision: number | null
  postopRevision: number | null
  finalizedAt: string
  operationStartedAt: string | null
  exclusionReasonCode: string | null
}

export type TableManifest = {
  table: OmopTableName
  filename: string
  rowCount: number
  byteSize: number
  sha256: string
}

export type ExclusionSummary = {
  policyExcluded: number
  caseExcluded: number
  qualityRejected: number
  withdrawn: number
}

export type ExchangeManifestV1 = {
  schema: typeof EXCHANGE_SCHEMA
  manifestVersion: typeof MANIFEST_VERSION
  batchId: string
  sequence: number
  previousBatchId: string | null
  generatedAt: string
  cutoffFrom: string | null
  cutoffTo: string
  site: SiteIdentity
  versions: VersionSet
  qualityStatus: QualityStatus
  cases: CaseRevision[]
  tables: TableManifest[]
  exclusions: ExclusionSummary
  payloadSha256: string
}

export type EncryptionEnvelope = {
  algorithm: "AES-256-GCM"
  keyWrapAlgorithm: "RSA-OAEP-256"
  signatureAlgorithm: "Ed25519"
  centralKeyId: string
  siteSigningKeyId: string
  wrappedKeyBase64: string
  ivBase64: string
  authTagBase64: string
  ciphertextSha256: string
  ciphertextByteSize: number
  signatureBase64: string
}

export type ExchangeError = {
  code: string
  message: string
  retryable: boolean
  casePseudonym?: string
  table?: OmopTableName
  row?: number
}

export type ExchangeReceiptV1 = {
  schema: typeof RECEIPT_SCHEMA
  receiptId: string
  batchId: string
  siteId: string
  sequence: number
  status: "ACCEPTED" | "REJECTED"
  receivedAt: string
  committedAt: string | null
  payloadSha256: string
  acceptedCaseCount: number
  rejectedCaseCount: number
  tableRowCounts: Partial<Record<OmopTableName, number>>
  errors: ExchangeError[]
  centralVersion: string
  signatureBase64: string
  signingKeyId: string
}

export type ExchangeCapabilitiesV1 = {
  schema: typeof CAPABILITIES_SCHEMA
  centralVersion: string
  supportedManifestVersions: number[]
  minimumHospitalVersion: string | null
  maximumUploadBytes: number
  multipartChunkBytes: number
  acceptedOmopVersions: string[]
  centralEncryptionKeyId: string
  centralEncryptionPublicKeyPem: string
  receiptSigningKeyId: string
  receiptSigningPublicKeyPem: string
}

export type ManifestValidation =
  | { ok: true; manifest: ExchangeManifestV1 }
  | { ok: false; errors: string[] }

const HEX_64 = /^[a-f0-9]{64}$/i

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function iso(value: unknown): value is string {
  return text(value) && Number.isFinite(Date.parse(value))
}

function revision(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

export function isOmopTable(value: unknown): value is OmopTableName {
  return typeof value === "string" && (OMOP_TABLES as readonly string[]).includes(value)
}

export function validateManifest(value: unknown): ManifestValidation {
  const errors: string[] = []
  if (!object(value)) return { ok: false, errors: ["manifest must be an object"] }
  if (value.schema !== EXCHANGE_SCHEMA) errors.push("unsupported schema")
  if (value.manifestVersion !== MANIFEST_VERSION) errors.push("unsupported manifestVersion")
  if (!text(value.batchId)) errors.push("batchId is required")
  if (!Number.isSafeInteger(value.sequence) || Number(value.sequence) < 1) {
    errors.push("sequence must be a positive integer")
  }
  if (value.previousBatchId !== null && !text(value.previousBatchId)) {
    errors.push("previousBatchId must be null or a non-empty string")
  }
  if (!iso(value.generatedAt)) errors.push("generatedAt must be an ISO date")
  if (value.cutoffFrom !== null && !iso(value.cutoffFrom)) {
    errors.push("cutoffFrom must be null or an ISO date")
  }
  if (!iso(value.cutoffTo)) errors.push("cutoffTo must be an ISO date")
  if (!object(value.site) || !text(value.site.siteId) ||
      !text(value.site.siteCode) || !text(value.site.institutionId)) {
    errors.push("site identity is incomplete")
  }
  if (!object(value.versions)) {
    errors.push("versions are required")
  } else {
    for (const field of [
      "hospital", "api", "core", "omopSource", "databaseSchema",
      "dataDictionary", "conceptMap", "redactionProfile",
    ]) {
      if (!text(value.versions[field])) errors.push(`versions.${field} is required`)
    }
  }
  if (!["PASS", "WARNING", "FAIL"].includes(String(value.qualityStatus))) {
    errors.push("qualityStatus is invalid")
  }
  if (!Array.isArray(value.cases)) {
    errors.push("cases must be an array")
  } else {
    const seen = new Set<string>()
    value.cases.forEach((item, index) => {
      if (!object(item)) {
        errors.push(`cases[${index}] must be an object`)
        return
      }
      for (const field of [
        "casePseudonym", "personPseudonym", "sourcePersonId",
        "sourceObservationPeriodId", "sourceVisitId",
      ]) {
        if (!text(item[field])) errors.push(`cases[${index}].${field} is required`)
      }
      if (!["UPSERT", "WITHDRAW"].includes(String(item.action))) {
        errors.push(`cases[${index}].action is invalid`)
      }
      for (const field of ["clinicalRevision", "eventRevision", "relationalRevision"]) {
        if (!revision(item[field])) errors.push(`cases[${index}].${field} is invalid`)
      }
      for (const field of ["preopRevision", "intraopRevision", "postopRevision"]) {
        if (item[field] !== null && !revision(item[field])) {
          errors.push(`cases[${index}].${field} is invalid`)
        }
      }
      if (!iso(item.finalizedAt)) errors.push(`cases[${index}].finalizedAt is invalid`)
      if (item.operationStartedAt !== null && !iso(item.operationStartedAt)) {
        errors.push(`cases[${index}].operationStartedAt is invalid`)
      }
      const key = `${String(item.casePseudonym)}:${String(item.action)}`
      if (seen.has(key)) errors.push(`cases[${index}] duplicates a case action`)
      seen.add(key)
    })
  }
  if (!Array.isArray(value.tables)) {
    errors.push("tables must be an array")
  } else {
    const seen = new Set<string>()
    value.tables.forEach((item, index) => {
      if (!object(item)) {
        errors.push(`tables[${index}] must be an object`)
        return
      }
      if (!isOmopTable(item.table)) errors.push(`tables[${index}].table is invalid`)
      if (!text(item.filename)) errors.push(`tables[${index}].filename is required`)
      if (!revision(item.rowCount)) errors.push(`tables[${index}].rowCount is invalid`)
      if (!revision(item.byteSize)) errors.push(`tables[${index}].byteSize is invalid`)
      if (!text(item.sha256) || !HEX_64.test(item.sha256)) {
        errors.push(`tables[${index}].sha256 is invalid`)
      }
      if (seen.has(String(item.table))) errors.push(`tables[${index}] duplicates a table`)
      seen.add(String(item.table))
    })
  }
  if (!object(value.exclusions)) {
    errors.push("exclusions are required")
  } else {
    for (const field of ["policyExcluded", "caseExcluded", "qualityRejected", "withdrawn"]) {
      if (!revision(value.exclusions[field])) errors.push(`exclusions.${field} is invalid`)
    }
  }
  if (!text(value.payloadSha256) || !HEX_64.test(value.payloadSha256)) {
    errors.push("payloadSha256 is invalid")
  }
  return errors.length
    ? { ok: false, errors }
    : { ok: true, manifest: value as ExchangeManifestV1 }
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort()
    .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`
}

export function signatureInput(
  manifest: ExchangeManifestV1,
  envelope: Omit<EncryptionEnvelope, "signatureBase64">,
): string {
  return canonicalJson({ manifest, envelope })
}

export function compareSequence(
  expected: number,
  actual: number,
): "EXPECTED" | "DUPLICATE" | "GAP" {
  if (actual === expected) return "EXPECTED"
  return actual < expected ? "DUPLICATE" : "GAP"
}
