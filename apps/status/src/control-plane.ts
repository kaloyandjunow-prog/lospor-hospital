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
  schemaVersion: 3
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
      email: string
      name: string
      institutionId: string | null
      accountKind: "CLINICAL" | "RESEARCH_ONLY"
      role: "MEMBER" | "HEAD_OF_DEPT" | "ADMIN" | "RESEARCHER"
    }>
    institutions: Array<{ id: string; name: string }>
    grants: Array<Omit<ResearchGrantInput, "expiryDays" | "supersedesGrantId"> & {
      id: string
      userName: string
      userEmail: string
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
      requesterEmail: string
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
  if (!isRecord(value) || value.schemaVersion !== 3
    || !isRecord(value.pediatricMode)
    || !isRecord(value.research) || !isRecord(value.central)
    || !isRecord(value.guidance) || !isRecord(value.externalAi)
    || !isRecord(value.patientIdentifier)) return null
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
    if (!isRecord(account) || !text(account.id, 128) || !text(account.email, 254)
      || !text(account.name, 512) || !nullableText(account.institutionId, 128)
      || (account.accountKind !== "CLINICAL" && account.accountKind !== "RESEARCH_ONLY")
      || !["MEMBER", "HEAD_OF_DEPT", "ADMIN", "RESEARCHER"].includes(String(account.role))) return null
  }
  for (const institution of research.institutions) {
    if (!isRecord(institution) || !text(institution.id, 128) || !text(institution.name, 512)) return null
  }
  for (const grant of research.grants) {
    if (!isRecord(grant) || !text(grant.id, 128) || !text(grant.userId, 128)
      || !text(grant.userName, 512) || !text(grant.userEmail, 254)
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
      || !text(request.requesterName, 512) || !text(request.requesterEmail, 254)
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
  return value as unknown as ControlPlaneView
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
}
