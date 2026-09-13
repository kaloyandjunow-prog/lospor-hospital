import { isRecord, safeJsonParse } from "./util.js"

export type ResearchGrantInput = {
  userId: string
  institutionId: string | null
  allInstitutions: boolean
  purpose: string
  expiryDays: number
  supersedesGrantId: string | null
  canQuery: boolean
  canInspectCases: boolean
  canExportCsv: boolean
  canExportJson: boolean
  canExportOmop: boolean
  canShare: boolean
}

export type ControlPlaneView = {
  schemaVersion: 4
  pediatricMode: {
    enabled: boolean
    productionReady: boolean
    releaseReviewed: boolean
    rulesetVersion: string
    bundledRulesetVersion: string
    minimumClientVersion: string
    reviewedDoseProfilesRequired: boolean
  }
  research: {
    policy: { defaultExpiryDays: number; maximumExpiryDays: number }
    accounts: Array<{
      id: string
      email: string | null
      name: string
      institutionId: string | null
      accountKind: "CLINICAL" | "RESEARCH_ONLY"
      role: "MEMBER" | "HEAD_OF_DEPT" | "ADMIN" | "RESEARCHER"
    }>
    institutions: Array<{ id: string; name: string }>
    grants: Array<Omit<ResearchGrantInput, "expiryDays" | "supersedesGrantId"> & {
      id: string
      userName: string
      userEmail: string | null
      institutionName: string | null
      expiresAt: string | null
      revokedAt: string | null
      supersededAt: string | null
      supersededById: string | null
      active: boolean
      createdAt: string
    }>
    omopRequests: Array<{
      id: string
      requesterId: string
      requesterName: string
      requesterEmail: string | null
      name: string
      purpose: string | null
      format: "omop-csv" | "omop-json"
      grantId: string
      definitionHash: string
      snapshotHash: string
      snapshotCaseCount: number
      scopeInstitutionIds: string[]
      createdAt: string
    }>
  }
  central: {
    disabledByDefault: true
    pushOnly: true
    credentialsPresent: boolean
    endpoint: string | null
    siteId: string | null
    siteCode: string | null
    institutionId: string | null
    transportLocked: boolean
    transportConfigurationHash: string | null
    transportConfiguredAt: string | null
    clientCertificate: CertificateView | null
    caCertificate: CertificateView | null
    signingKeyId: string | null
    centralEncryptionKeyId: string | null
    receiptSigningKeyId: string | null
    compatibility: {
      localManifestVersion: string
      supportedManifestVersions: string[]
      compatible: boolean
      maximumUploadBytes: number | null
      multipartChunkBytes: number | null
    }
    enrolled: boolean
    enrolledAt: string | null
    lastCapabilitiesAt: string | null
    lastDeliveryAt: string | null
    nextSequence: number
    lastAcceptedBatchId: string | null
    policy: null | {
      enabled: boolean
      includeRedactedText: boolean
      redactionProfile: string
      approvedAt: string | null
    }
    casesAwaitingExport: number
    queuesByStatus: Record<string, number>
    batches: Array<{
      id: string
      sequence: number
      status: string
      cutoffFrom: string | null
      cutoffTo: string
      manifestHash: string | null
      ciphertextSha256: string | null
      receiptHash: string | null
      attemptCount: number
      nextAttemptAt: string | null
      errorCode: string | null
      createdAt: string
      generatedAt: string | null
      acceptedAt: string | null
      caseCount: number
    }>
  }
  guidance: {
    adultEnabled: boolean
    pediatricEnabled: boolean
    updatedAt: string | null
    baselines: {
      adult: ClinicalBaselineReadiness
      pediatric: ClinicalBaselineReadiness
    }
  }
  externalAi: {
    externalAiEnabled: boolean
    provider: "MISTRAL"
    credentialStored: boolean
    providerConfigured: boolean
    capability: "ENABLED" | "DISABLED_BY_DEPLOYMENT" | "PROVIDER_NOT_CONFIGURED"
    credentialConfiguredAt: string | null
    credentialChangedAt: string | null
    policyChangedAt: string | null
    updatedAt: string | null
  }
  patientIdentifier: {
    egnPermitted: boolean
    changeReasonRecorded: boolean
    changedAt: string | null
    updatedAt: string | null
  }
  ehrTransport: {
    transport: "FOLDER" | "FHIR" | "HL7V2" | null
    policyEnabled: boolean
    credentialStored: boolean
    providerConfigured: boolean
    capability: "ENABLED" | "DISABLED_BY_DEPLOYMENT" | "CREDENTIAL_NOT_CONFIGURED"
    /** Shown, never sealed — an operator has to see where clinical data goes. */
    endpoint: string | null
    authMode: "STATIC_BEARER" | "OAUTH2_CLIENT_CREDENTIALS"
    tokenUrl: string | null
    clientId: string | null
    scope: string | null
    /**
     * Which of the hospital's numberings each kind of patient number lives in.
     *
     * Null is an open question, not a default: until it is answered a patient
     * found by number is accepted without being checked, and the review screen
     * says so. The screen should say so too.
     */
    recordNumberSystem: string | null
    recordNumberSystemChangedAt: string | null
    nationalIdentifierSystem: string | null
    nationalIdentifierSystemChangedAt: string | null
    endpointChangedAt: string | null
    credentialConfiguredAt: string | null
    credentialChangedAt: string | null
    transportChangedAt: string | null
    /** Days staged EHR imports are kept before deletion (1 to 14). */
    stagingRetentionDays?: number
    stagingRetentionChangedAt?: string | null
    updatedAt: string | null
  }
  /**
   * What this hospital's laboratory codes mean, and what is still unanswered.
   *
   * `unmapped` is the work — codes that actually arrived and could not be
   * placed, busiest first. An empty list means finished rather than not
   * started, because a code we already understand never appears here.
   */
  ehrLabCodes: {
    unmapped: {
      system: string
      code: string
      reportedLabel: string | null
      seenCount: number
      lastSeenAt: string | null
    }[]
    mapped: {
      system: string
      code: string
      test: string
      reportedLabel: string | null
      assumedUnit: string | null
      seenCount: number
      lastSeenAt: string | null
      mappedAt: string
    }[]
    tests: { name: string; unit: string; category: string }[]
  }
}

type ClinicalBaselineProfileCounts = {
  drug: number
  infusion: number
  fluid: number
  total: number
}

type ClinicalBaselineIdentity = {
  presetId: string
  key: string
  version: number
  digestSha256: string
  ruleCount: number
  profileCounts: ClinicalBaselineProfileCounts
}

export type ClinicalBaselineReadiness = {
  mode: "ADULT" | "PEDIATRIC"
  baselineReady: boolean
  reasonCode:
    | "READY"
    | "SELECTION_MISSING"
    | "IDENTITY_MISMATCH"
    | "VERSION_MISMATCH"
    | "NOT_PUBLISHED"
    | "RULE_COUNT_MISMATCH"
    | "RULES_INVALID"
    | "PROFILE_COUNT_MISMATCH"
    | "DIGEST_MISMATCH"
  expected: ClinicalBaselineIdentity
  selected: null | (Omit<ClinicalBaselineIdentity, "digestSha256" | "profileCounts"> & {
    status: "DRAFT" | "PUBLISHED" | "RETIRED"
    digestSha256: string | null
    profileCounts: ClinicalBaselineProfileCounts | null
  })
}

type CertificateView = {
  fingerprintSha256: string
  validFrom: string
  validTo: string
}

export interface ControlPlanePort {
  get(): Promise<ControlPlaneView>
  issueGrant(input: ResearchGrantInput): Promise<void>
  revokeGrant(id: string, reason: string): Promise<void>
  approveOmop(id: string, reason: string): Promise<void>
  configureCentral(input: {
    token: string
    centralBaseUrl: string
    siteCode: string
    siteName: string
    institutionId: string
    reason: string
  }): Promise<void>
  setCentralPolicy(input: {
    enabled: boolean
    includeRedactedText: boolean
    redactionProfile: "bg-en-v1"
    reason: string
  }): Promise<void>
  retryCentralBatch(id: string, reason: string): Promise<void>
  setGuidance(input: {
    adultEnabled: boolean
    pediatricEnabled: boolean
    reason: string
  }): Promise<void>
  setExternalAiPolicy(input: {
    externalAiEnabled: boolean
    reason: string
  }): Promise<void>
  replaceExternalAiCredential(input: {
    credential: string
    reason: string
  }): Promise<void>
  removeExternalAiCredential(reason: string): Promise<void>
  setPatientIdentifierPolicy(input: {
    egnPermitted: boolean
    reason: string
  }): Promise<void>
  setEhrTransportPolicy(input: {
    transport: "FOLDER" | "FHIR" | "HL7V2" | null
    reason: string
  }): Promise<void>
  /** How many days staged EHR imports are kept before they are deleted. */
  setEhrStagingRetention(input: { days: number; reason: string }): Promise<void>
  /**
   * Where a network transport sends, and how it presents itself.
   *
   * The route has existed since the transport did and nothing in Status ever
   * called it, so a site could choose FHIR and store a credential and then had
   * nowhere to say where to send. Changing any of these clears the stored
   * secret -- a bearer token is not a client secret, and a secret issued for
   * one authorisation server does not belong at another.
   */
  setEhrTransportEndpoint(input: {
    endpoint: string | null
    authMode: "STATIC_BEARER" | "OAUTH2_CLIENT_CREDENTIALS"
    tokenUrl: string | null
    clientId: string | null
    scope: string | null
    reason: string
  }): Promise<void>
  /**
   * Which of the hospital's numberings its record numbers and ЕГН live in.
   *
   * Either field, or both. Omitting one leaves it as it was rather than
   * clearing it, so setting the record number does not silently unconfigure
   * ЕГН.
   */
  setEhrIdentifierSystems(input: {
    recordNumberSystem?: string | null
    nationalIdentifierSystem?: string | null
    reason: string
  }): Promise<void>
  /**
   * Ask the configured server what it is, and which numberings a real
   * response carries.
   *
   * Read-only and stores nothing. Nobody can recall an OID; an operator shown
   * the three systems that actually came back recognises their own admission
   * number at once. The identifier looked up is not stored or echoed back --
   * only the systems it was found under.
   */
  discoverEhrTransport(input: { identifier?: string }): Promise<{
    capabilities: unknown
    identifierSystems: string[]
    patientFound: boolean | null
    probeErrorCode: string | null
  }>
  replaceEhrTransportCredential(input: {
    credential: string
    reason: string
  }): Promise<void>
  removeEhrTransportCredential(reason: string): Promise<void>
  /**
   * Point one of the hospital's laboratory codes at one of ours, or unmap it.
   *
   * No reason and no password, unlike everything above it: an operator works
   * through dozens of these in a sitting, and a wrong mapping is visible on the
   * review screen and reversible in a click. It is audited either way.
   */
  mapEhrLabCode(input: {
    system: string
    code: string
    test: string
    assumedUnit: string | null
  }): Promise<void>
  unmapEhrLabCode(input: { system: string; code: string }): Promise<void>
}

export class ControlPlaneClientError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = "ControlPlaneClientError"
  }
}

const text = (value: unknown, maximum = 4096): value is string =>
  typeof value === "string" && value.length <= maximum
const nullableText = (value: unknown, maximum = 4096): value is string | null =>
  value === null || text(value, maximum)
const iso = (value: unknown): value is string => text(value, 64) && Number.isFinite(Date.parse(value))
const nullableIso = (value: unknown): value is string | null => value === null || iso(value)
const finiteInteger = (value: unknown, maximum = 1_000_000_000): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maximum
const hash = (value: unknown): value is string => text(value, 64) && /^[a-f0-9]{64}$/.test(value)
const nullableHash = (value: unknown): value is string | null => value === null || hash(value)

function certificate(value: unknown): CertificateView | null | false {
  if (value === null) return null
  if (!isRecord(value) || !hash(value.fingerprintSha256)
    || !iso(value.validFrom) || !iso(value.validTo)) return false
  return value as CertificateView
}

function clinicalProfileCounts(value: unknown): ClinicalBaselineProfileCounts | null {
  if (!isRecord(value)
    || !finiteInteger(value.drug, 100_000)
    || !finiteInteger(value.infusion, 100_000)
    || !finiteInteger(value.fluid, 100_000)
    || !finiteInteger(value.total, 100_000)
    || value.total !== value.drug + value.infusion + value.fluid) return null
  return value as ClinicalBaselineProfileCounts
}

function sameClinicalProfileCounts(
  left: ClinicalBaselineProfileCounts,
  right: ClinicalBaselineProfileCounts,
): boolean {
  return left.drug === right.drug
    && left.infusion === right.infusion
    && left.fluid === right.fluid
    && left.total === right.total
}

const BASELINE_REASONS = [
  "READY",
  "SELECTION_MISSING",
  "IDENTITY_MISMATCH",
  "VERSION_MISMATCH",
  "NOT_PUBLISHED",
  "RULE_COUNT_MISMATCH",
  "RULES_INVALID",
  "PROFILE_COUNT_MISMATCH",
  "DIGEST_MISMATCH",
] as const

function clinicalBaseline(
  value: unknown,
  mode: "ADULT" | "PEDIATRIC",
): ClinicalBaselineReadiness | null {
  if (!isRecord(value) || value.mode !== mode || typeof value.baselineReady !== "boolean"
    || !BASELINE_REASONS.includes(value.reasonCode as typeof BASELINE_REASONS[number])
    || !isRecord(value.expected)) return null
  const expected = value.expected
  const expectedCounts = clinicalProfileCounts(expected.profileCounts)
  if (!text(expected.presetId, 128) || !text(expected.key, 128)
    || !finiteInteger(expected.version, 10_000) || !hash(expected.digestSha256)
    || !finiteInteger(expected.ruleCount, 100_000) || !expectedCounts
    || expected.ruleCount !== expectedCounts.total) return null
  if (value.baselineReady !== (value.reasonCode === "READY")) return null
  if (value.selected === null) {
    return value.reasonCode === "SELECTION_MISSING"
      ? value as unknown as ClinicalBaselineReadiness
      : null
  }
  if (value.reasonCode === "SELECTION_MISSING" || !isRecord(value.selected)) return null
  const selected = value.selected
  const selectedCounts = selected.profileCounts === null
    ? null
    : clinicalProfileCounts(selected.profileCounts)
  if (!text(selected.presetId, 128) || !text(selected.key, 128)
    || !finiteInteger(selected.version, 10_000) || !finiteInteger(selected.ruleCount, 100_000)
    || !["DRAFT", "PUBLISHED", "RETIRED"].includes(String(selected.status))
    || !nullableHash(selected.digestSha256)
    || (selected.profileCounts !== null && !selectedCounts)) return null
  if (value.reasonCode === "READY" && (
    selected.status !== "PUBLISHED"
    || selected.presetId !== expected.presetId
    || selected.key !== expected.key
    || selected.version !== expected.version
    || selected.ruleCount !== expected.ruleCount
    || selected.digestSha256 !== expected.digestSha256
    || !selectedCounts
    || !sameClinicalProfileCounts(selectedCounts, expectedCounts)
  )) return null
  return value as unknown as ClinicalBaselineReadiness
}

function parseView(value: unknown): ControlPlaneView | null {
  if (!isRecord(value) || value.schemaVersion !== 4
    || !isRecord(value.pediatricMode)
    || !isRecord(value.research) || !isRecord(value.central)
    || !isRecord(value.guidance) || !isRecord(value.externalAi)
    || !isRecord(value.patientIdentifier) || !isRecord(value.ehrTransport)) return null
  if (typeof value.pediatricMode.enabled !== "boolean"
    || typeof value.pediatricMode.productionReady !== "boolean"
    || typeof value.pediatricMode.releaseReviewed !== "boolean"
    || !text(value.pediatricMode.rulesetVersion, 128)
    || !text(value.pediatricMode.bundledRulesetVersion, 128)
    || value.pediatricMode.bundledRulesetVersion !== value.pediatricMode.rulesetVersion
    || !text(value.pediatricMode.minimumClientVersion, 64)
    || typeof value.pediatricMode.reviewedDoseProfilesRequired !== "boolean") return null
  const research = value.research
  if (!isRecord(research.policy)
    || !finiteInteger(research.policy.defaultExpiryDays, 365)
    || !finiteInteger(research.policy.maximumExpiryDays, 365)
    || !Array.isArray(research.accounts) || !Array.isArray(research.institutions)
    || !Array.isArray(research.grants) || !Array.isArray(research.omopRequests)) return null
  for (const account of research.accounts) {
    if (!isRecord(account) || !text(account.id, 128) || !nullableText(account.email, 254)
      || !text(account.name, 512) || !nullableText(account.institutionId, 128)
      || (account.accountKind !== "CLINICAL" && account.accountKind !== "RESEARCH_ONLY")
      || !["MEMBER", "HEAD_OF_DEPT", "ADMIN", "RESEARCHER"].includes(String(account.role))) return null
  }
  for (const institution of research.institutions) {
    if (!isRecord(institution) || !text(institution.id, 128) || !text(institution.name, 512)) return null
  }
  for (const grant of research.grants) {
    if (!isRecord(grant) || !text(grant.id, 128) || !text(grant.userId, 128)
      || !text(grant.userName, 512) || !nullableText(grant.userEmail, 254)
      || !nullableText(grant.institutionId, 128) || !nullableText(grant.institutionName, 512)
      || typeof grant.allInstitutions !== "boolean" || !text(grant.purpose, 500)
      || !["canQuery", "canInspectCases", "canExportCsv", "canExportJson", "canExportOmop", "canShare", "active"]
        .every(key => typeof grant[key] === "boolean")
      || !nullableIso(grant.expiresAt) || !nullableIso(grant.revokedAt)
      || !nullableIso(grant.supersededAt) || !nullableText(grant.supersededById, 128)
      || !iso(grant.createdAt)) return null
  }
  for (const request of research.omopRequests) {
    if (!isRecord(request) || !text(request.id, 128) || !text(request.requesterId, 128)
      || !text(request.requesterName, 512) || !nullableText(request.requesterEmail, 254)
      || !text(request.name, 120) || !nullableText(request.purpose, 500)
      || (request.format !== "omop-csv" && request.format !== "omop-json")
      || !text(request.grantId, 128) || !hash(request.definitionHash)
      || !hash(request.snapshotHash) || !finiteInteger(request.snapshotCaseCount)
      || !Array.isArray(request.scopeInstitutionIds)
      || !request.scopeInstitutionIds.every(item => text(item, 128))
      || !iso(request.createdAt)) return null
  }

  const central = value.central
  const clientCertificate = certificate(central.clientCertificate)
  const caCertificate = certificate(central.caCertificate)
  if (central.disabledByDefault !== true || central.pushOnly !== true
    || typeof central.credentialsPresent !== "boolean" || !nullableText(central.endpoint, 2048)
    || !nullableText(central.siteId, 128) || !nullableText(central.siteCode, 64)
    || !nullableText(central.institutionId, 128) || typeof central.transportLocked !== "boolean"
    || !nullableHash(central.transportConfigurationHash) || !nullableIso(central.transportConfiguredAt)
    || clientCertificate === false || caCertificate === false
    || !nullableText(central.signingKeyId, 256)
    || !nullableText(central.centralEncryptionKeyId, 256)
    || !nullableText(central.receiptSigningKeyId, 256)
    || !isRecord(central.compatibility) || !text(central.compatibility.localManifestVersion, 64)
    || !Array.isArray(central.compatibility.supportedManifestVersions)
    || !central.compatibility.supportedManifestVersions.every(item => text(item, 64))
    || typeof central.compatibility.compatible !== "boolean"
    || !(central.compatibility.maximumUploadBytes === null || finiteInteger(central.compatibility.maximumUploadBytes))
    || !(central.compatibility.multipartChunkBytes === null || finiteInteger(central.compatibility.multipartChunkBytes))
    || typeof central.enrolled !== "boolean" || !nullableIso(central.enrolledAt)
    || !nullableIso(central.lastCapabilitiesAt) || !nullableIso(central.lastDeliveryAt)
    || !finiteInteger(central.nextSequence) || !nullableText(central.lastAcceptedBatchId, 128)
    || !finiteInteger(central.casesAwaitingExport) || !isRecord(central.queuesByStatus)
    || !Object.values(central.queuesByStatus).every(item => finiteInteger(item))
    || !Array.isArray(central.batches)) return null
  if (central.policy !== null && (!isRecord(central.policy)
    || typeof central.policy.enabled !== "boolean"
    || typeof central.policy.includeRedactedText !== "boolean"
    || !text(central.policy.redactionProfile, 80) || !nullableIso(central.policy.approvedAt))) return null
  for (const batch of central.batches) {
    if (!isRecord(batch) || !text(batch.id, 128) || !finiteInteger(batch.sequence)
      || !text(batch.status, 64) || !nullableIso(batch.cutoffFrom) || !iso(batch.cutoffTo)
      || !nullableHash(batch.manifestHash) || !nullableHash(batch.ciphertextSha256)
      || !nullableHash(batch.receiptHash) || !finiteInteger(batch.attemptCount)
      || !nullableIso(batch.nextAttemptAt) || !nullableText(batch.errorCode, 128)
      || !iso(batch.createdAt) || !nullableIso(batch.generatedAt)
      || !nullableIso(batch.acceptedAt) || !finiteInteger(batch.caseCount)) return null
  }
  const guidance = value.guidance
  if (typeof guidance.adultEnabled !== "boolean"
    || typeof guidance.pediatricEnabled !== "boolean"
    || !nullableIso(guidance.updatedAt)
    || !isRecord(guidance.baselines)) return null
  const adultBaseline = clinicalBaseline(guidance.baselines.adult, "ADULT")
  const pediatricBaseline = clinicalBaseline(guidance.baselines.pediatric, "PEDIATRIC")
  if (!adultBaseline || !pediatricBaseline
    || value.pediatricMode.productionReady !== pediatricBaseline.baselineReady) return null
  if (typeof value.externalAi.externalAiEnabled !== "boolean"
    || value.externalAi.provider !== "MISTRAL"
    || typeof value.externalAi.credentialStored !== "boolean"
    || typeof value.externalAi.providerConfigured !== "boolean"
    || !["ENABLED", "DISABLED_BY_DEPLOYMENT", "PROVIDER_NOT_CONFIGURED"]
      .includes(String(value.externalAi.capability))
    || !nullableIso(value.externalAi.credentialConfiguredAt)
    || !nullableIso(value.externalAi.credentialChangedAt)
    || !nullableIso(value.externalAi.policyChangedAt)
    || !nullableIso(value.externalAi.updatedAt)) return null
  if (typeof value.patientIdentifier.egnPermitted !== "boolean"
    || typeof value.patientIdentifier.changeReasonRecorded !== "boolean"
    || !nullableIso(value.patientIdentifier.changedAt)
    || !nullableIso(value.patientIdentifier.updatedAt)) return null
  const ehrTransportValue = value.ehrTransport.transport
  if (!(ehrTransportValue === null || ["FOLDER", "FHIR", "HL7V2"].includes(String(ehrTransportValue)))
    || typeof value.ehrTransport.policyEnabled !== "boolean"
    || typeof value.ehrTransport.credentialStored !== "boolean"
    || typeof value.ehrTransport.providerConfigured !== "boolean"
    || !["ENABLED", "DISABLED_BY_DEPLOYMENT", "CREDENTIAL_NOT_CONFIGURED"]
      .includes(String(value.ehrTransport.capability))
    || !["STATIC_BEARER", "OAUTH2_CLIENT_CREDENTIALS"]
      .includes(String(value.ehrTransport.authMode))
    || !nullableIso(value.ehrTransport.endpointChangedAt)
    || !nullableIso(value.ehrTransport.credentialConfiguredAt)
    || !nullableIso(value.ehrTransport.credentialChangedAt)
    || !nullableIso(value.ehrTransport.transportChangedAt)
    || !(value.ehrTransport.stagingRetentionDays === undefined
      || (Number.isInteger(value.ehrTransport.stagingRetentionDays)
        && Number(value.ehrTransport.stagingRetentionDays) >= 1 && Number(value.ehrTransport.stagingRetentionDays) <= 14))
    || !(value.ehrTransport.stagingRetentionChangedAt === undefined || nullableIso(value.ehrTransport.stagingRetentionChangedAt))
    || !nullableIso(value.ehrTransport.updatedAt)) return null
  if (!ehrLabCodesShape(value.ehrLabCodes)) return null
  return value as unknown as ControlPlaneView
}

/**
 * Validated like everything else here rather than trusted.
 *
 * Status renders whatever this returns into a form whose values become a
 * mapping, so a malformed list is not a display bug — it is an operator being
 * offered a choice that writes something unintended. The lists may be empty;
 * every site's are, on its first day.
 */
function ehrLabCodesShape(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (!Array.isArray(value.unmapped) || !Array.isArray(value.mapped) || !Array.isArray(value.tests)) {
    return false
  }
  const codeShape = (row: unknown, mapped: boolean): boolean => {
    if (!isRecord(row)) return false
    if (typeof row.system !== "string" || !text(row.code, 512)) return false
    if (!(row.reportedLabel === null || text(row.reportedLabel, 512))) return false
    if (!finiteInteger(row.seenCount, 1_000_000_000)) return false
    if (!nullableIso(row.lastSeenAt)) return false
    if (!mapped) return true
    return Boolean(text(row.test, 200))
      && (row.assumedUnit === null || Boolean(text(row.assumedUnit, 64)))
      && typeof row.mappedAt === "string"
  }
  return value.unmapped.every(row => codeShape(row, false))
    && value.mapped.every(row => codeShape(row, true))
    && value.tests.every(row => isRecord(row)
      && Boolean(text(row.name, 200))
      && typeof row.unit === "string"
      && Boolean(text(row.category, 200)))
}

type Fetch = typeof globalThis.fetch

export class ControlPlaneClient implements ControlPlanePort {
  private readonly baseUrl: string | null

  constructor(
    url: string | null,
    private readonly bearer: string | null,
    private readonly timeoutMs: number,
    private readonly fetchImpl: Fetch = globalThis.fetch,
  ) {
    this.baseUrl = url?.replace(/\/$/, "") ?? null
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    if (!this.baseUrl || !this.bearer) throw new ControlPlaneClientError("CONTROL_NOT_CONFIGURED")
    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${this.bearer}`,
          ...(init.body ? { "content-type": "application/json" } : {}),
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch {
      throw new ControlPlaneClientError("CONTROL_UNAVAILABLE")
    }
    const body = await response.text()
    if (Buffer.byteLength(body, "utf8") > 2_097_152) {
      throw new ControlPlaneClientError("CONTROL_INVALID_RESPONSE")
    }
    const value = safeJsonParse(body)
    if (!response.ok) {
      const code = isRecord(value) && text(value.code, 128) && /^[A-Z0-9_]+$/.test(value.code)
        ? value.code : "CONTROL_FAILED"
      throw new ControlPlaneClientError(code)
    }
    return value
  }

  async get(): Promise<ControlPlaneView> {
    const parsed = parseView(await this.request(""))
    if (!parsed) throw new ControlPlaneClientError("CONTROL_INVALID_RESPONSE")
    return parsed
  }

  private async mutate(path: string, body: unknown, method = "POST"): Promise<void> {
    await this.request(path, { method, body: JSON.stringify(body) })
  }

  issueGrant(input: ResearchGrantInput): Promise<void> {
    return this.mutate("/research/grants", input)
  }
  revokeGrant(id: string, reason: string): Promise<void> {
    return this.mutate(`/research/grants/${encodeURIComponent(id)}/revoke`, { reason })
  }
  approveOmop(id: string, reason: string): Promise<void> {
    return this.mutate(`/research/omop/${encodeURIComponent(id)}/approve`, { reason })
  }
  configureCentral(input: Parameters<ControlPlanePort["configureCentral"]>[0]): Promise<void> {
    return this.mutate("/central/transport", input)
  }
  setCentralPolicy(input: Parameters<ControlPlanePort["setCentralPolicy"]>[0]): Promise<void> {
    return this.mutate("/central/policy", input)
  }
  retryCentralBatch(id: string, reason: string): Promise<void> {
    return this.mutate(`/central/batches/${encodeURIComponent(id)}/retry`, { reason })
  }
  setGuidance(input: Parameters<ControlPlanePort["setGuidance"]>[0]): Promise<void> {
    return this.mutate("/guidance", input)
  }
  setExternalAiPolicy(input: Parameters<ControlPlanePort["setExternalAiPolicy"]>[0]): Promise<void> {
    return this.mutate("/external-ai/policy", input)
  }
  replaceExternalAiCredential(
    input: Parameters<ControlPlanePort["replaceExternalAiCredential"]>[0],
  ): Promise<void> {
    return this.mutate("/external-ai/credential", input)
  }
  removeExternalAiCredential(reason: string): Promise<void> {
    return this.mutate("/external-ai/credential", { reason }, "DELETE")
  }
  setPatientIdentifierPolicy(
    input: Parameters<ControlPlanePort["setPatientIdentifierPolicy"]>[0],
  ): Promise<void> {
    return this.mutate("/patient-identifier", input)
  }
  setEhrTransportPolicy(
    input: Parameters<ControlPlanePort["setEhrTransportPolicy"]>[0],
  ): Promise<void> {
    return this.mutate("/ehr-transport/policy", input)
  }
  setEhrStagingRetention(
    input: Parameters<ControlPlanePort["setEhrStagingRetention"]>[0],
  ): Promise<void> {
    return this.mutate("/ehr-transport/retention", input)
  }
  setEhrTransportEndpoint(
    input: Parameters<ControlPlanePort["setEhrTransportEndpoint"]>[0],
  ): Promise<void> {
    return this.mutate("/ehr-transport/endpoint", input)
  }
  setEhrIdentifierSystems(
    input: Parameters<ControlPlanePort["setEhrIdentifierSystems"]>[0],
  ): Promise<void> {
    return this.mutate("/ehr-transport/identifier-systems", input)
  }
  async discoverEhrTransport(
    input: Parameters<ControlPlanePort["discoverEhrTransport"]>[0],
  ): ReturnType<ControlPlanePort["discoverEhrTransport"]> {
    const value = await this.request("/ehr-transport/discover", {
      method: "POST",
      body: JSON.stringify(input),
    })
    const record = isRecord(value) ? value : {}
    return {
      capabilities: record.capabilities ?? null,
      // Filtered rather than trusted: this is a list drawn from a hospital
      // server's response and it goes on screen for an operator to choose from.
      identifierSystems: Array.isArray(record.identifierSystems)
        ? record.identifierSystems.filter((entry): entry is string => typeof entry === "string")
        : [],
      patientFound: typeof record.patientFound === "boolean" ? record.patientFound : null,
      probeErrorCode: typeof record.probeErrorCode === "string" ? record.probeErrorCode : null,
    }
  }
  replaceEhrTransportCredential(
    input: Parameters<ControlPlanePort["replaceEhrTransportCredential"]>[0],
  ): Promise<void> {
    return this.mutate("/ehr-transport/credential", input)
  }
  removeEhrTransportCredential(reason: string): Promise<void> {
    return this.mutate("/ehr-transport/credential", { reason }, "DELETE")
  }
  mapEhrLabCode(input: Parameters<ControlPlanePort["mapEhrLabCode"]>[0]): Promise<void> {
    return this.mutate("/ehr-lab-codes", { action: "map", ...input })
  }
  unmapEhrLabCode(input: Parameters<ControlPlanePort["unmapEhrLabCode"]>[0]): Promise<void> {
    return this.mutate("/ehr-lab-codes", { action: "unmap", ...input })
  }
}
