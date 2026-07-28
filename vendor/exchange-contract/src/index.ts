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
  "person",
  "observation_period",
  "visit_occurrence",
  "condition_occurrence",
  "drug_exposure",
  "measurement",
  "procedure_occurrence",
  "observation",
] as const

export type OmopTableName = typeof OMOP_TABLES[number]
export type CaseAction = "UPSERT" | "WITHDRAW"
export type QualityStatus = "PASS" | "WARNING" | "FAIL"

export type VersionSet = {
  hospital: string
  api: string
  core: string
  omopSource: string
  databaseSchema: string
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
      "conceptMap", "redactionProfile",
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
