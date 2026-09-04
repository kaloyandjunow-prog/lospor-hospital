import "server-only"

import { createHash, X509Certificate } from "node:crypto"
import { readFile } from "node:fs/promises"
import { z } from "zod"
import { LAB_CATEGORIES, LAB_LIBRARY } from "@lospor/core/labs"
import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { logAuditInTransaction } from "@/lib/audit"
import { serializableTransaction } from "@/lib/account-lifecycle"
import { pediatricCapabilities } from "@/lib/pediatric-mode"
import { assessHospitalClinicalBaselines } from "./clinical-baseline-readiness"
import { countCasesAwaitingCentralExport } from "./central-status"
import { hospitalConfig, isCentralDeliveryConfigured } from "./config"
import { isHospitalDeployment } from "./deployment"
import { enrollHospital } from "./enrollment"
import {
  ehrTransportControlView,
  EhrTransportPolicyError,
  sealEhrTransportCredential,
} from "./ehr-transport-policy"
import {
  configuredExternalAiDefault,
  externalAiControlView,
  sealExternalAiCredential,
} from "./external-ai-policy"
import { patientIdentifierControlView } from "./patient-identifier-policy"
import {
  approveHospitalOmopExport,
  issueHospitalResearchGrant,
  listHospitalResearchControl,
  revokeHospitalResearchGrant,
  statusGrantRevokeSchema,
  statusOmopApprovalSchema,
  statusResearchGrantSchema,
} from "./research-control"

export {
  statusGrantRevokeSchema,
  statusOmopApprovalSchema,
  statusResearchGrantSchema,
}
export {
  approveHospitalOmopExport,
  issueHospitalResearchGrant,
  revokeHospitalResearchGrant,
}

export class HospitalControlPlaneError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = "HospitalControlPlaneError"
  }
}

const safeCentralUrl = z.string().url().max(2048).transform(value => {
  const url = new URL(value)
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new HospitalControlPlaneError("CENTRAL_ENDPOINT_INVALID")
  }
  return url.origin
})

export const centralTransportSchema = z.object({
  token: z.string().min(20).max(4096),
  centralBaseUrl: safeCentralUrl,
  siteCode: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/),
  siteName: z.string().trim().min(2).max(160),
  institutionId: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(10).max(1000),
}).strict()

export const centralClinicalPolicySchema = z.object({
  enabled: z.boolean(),
  includeRedactedText: z.boolean().default(true),
  redactionProfile: z.literal("bg-en-v1").default("bg-en-v1"),
  reason: z.string().trim().min(10).max(1000),
}).strict()

export const guidancePolicySchema = z.object({
  adultEnabled: z.boolean(),
  pediatricEnabled: z.boolean(),
  reason: z.string().trim().min(10).max(1000),
}).strict()

export const patientIdentifierPolicySchema = z.object({
  egnPermitted: z.boolean(),
  reason: z.string().trim().min(10).max(1000),
}).strict()

export const ehrTransportPolicySchema = z.object({
  // HL7 v2 is deliberately not offered. It remains in the database enum so a
  // site that once selected it still reads back correctly, but selecting it
  // now would configure a transport that refuses every message.
  transport: z.enum(["FOLDER", "FHIR"]).nullable(),
  reason: z.string().trim().min(10).max(1000),
}).strict()

/**
 * Where a network transport sends, and how it presents itself.
 *
 * Separate from the transport choice because these change for different
 * reasons and at different times: a site picks its transport once and adjusts
 * an endpoint or rotates a client id afterwards.
 *
 * Everything here is readable afterwards. Only the secret is sealed, and it is
 * set through the credential route.
 */
export const ehrTransportEndpointSchema = z.object({
  endpoint: z.string().trim().url().max(2048).nullable(),
  authMode: z.enum(["STATIC_BEARER", "OAUTH2_CLIENT_CREDENTIALS"]),
  tokenUrl: z.string().trim().url().max(2048).nullable(),
  clientId: z.string().trim().max(512).nullable(),
  scope: z.string().trim().max(512).nullable(),
  reason: z.string().trim().min(10).max(1000),
}).strict().refine(
  value => value.authMode !== "OAUTH2_CLIENT_CREDENTIALS" || Boolean(value.tokenUrl),
  { message: "OAUTH2_CLIENT_CREDENTIALS requires a token URL", path: ["tokenUrl"] },
)

export const ehrTransportCredentialSchema = z.object({
  credential: z.string().trim().min(1).max(4096),
  reason: z.string().trim().min(10).max(1000),
}).strict()

export const ehrTransportCredentialRemoveSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
}).strict()

export const externalAiPolicySchema = z.object({
  externalAiEnabled: z.boolean(),
  reason: z.string().trim().min(10).max(1000),
}).strict()

export const externalAiCredentialSchema = z.object({
  credential: z.string().trim().min(1).max(4096),
  reason: z.string().trim().min(10).max(1000),
}).strict()

export const externalAiCredentialRemoveSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
}).strict()

export const centralRetrySchema = z.object({
  reason: z.string().trim().min(10).max(1000),
}).strict()

type Database = PrismaClient | Prisma.TransactionClient

async function operatorActor(db: Database = prisma) {
  const installation = await db.hospitalInstallation.findUnique({
    where: { id: "local" },
    select: {
      applianceOperator: {
        select: { id: true, role: true, deletedAt: true, activatedAt: true },
      },
    },
  })
  const actor = installation?.applianceOperator
  // activatedAt, not emailVerifiedAt: the appliance operator is a Hospital
  // account, which never has emailVerifiedAt set (see the User model comment).
  // Checking that field here refused every real operator unconditionally.
  if (!actor || actor.role !== "ADMIN" || actor.deletedAt || !actor.activatedAt) {
    throw new HospitalControlPlaneError("APPLIANCE_OPERATOR_UNAVAILABLE")
  }
  return actor
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex")
}

async function certificateView(path: string | undefined) {
  if (!path) return null
  try {
    const cert = new X509Certificate(await readFile(path))
    return {
      fingerprintSha256: cert.fingerprint256.replaceAll(":", "").toLowerCase(),
      validFrom: new Date(cert.validFrom).toISOString(),
      validTo: new Date(cert.validTo).toISOString(),
    }
  } catch {
    return null
  }
}

function configuredGuidanceDefault(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase()
  return value !== "false" && value !== "no" && value !== "0"
}

export async function currentGuidancePolicy() {
  // The serverless/public-demo behavior remains the upstream always-on policy.
  // It neither reads nor exposes an appliance runtime choice.
  if (!isHospitalDeployment()) {
    return {
      id: "public-demo",
      adultEnabled: true,
      pediatricEnabled: true,
      changedById: null,
      changeReason: null,
      createdAt: null,
      updatedAt: null,
    }
  }
  const stored = await prisma.clinicalGuidancePolicy.findUnique({ where: { id: "local" } })
  return stored ?? {
    id: "local",
    adultEnabled: configuredGuidanceDefault("HOSPITAL_ADULT_GUIDANCE_DEFAULT"),
    pediatricEnabled: configuredGuidanceDefault("HOSPITAL_PEDIATRIC_GUIDANCE_DEFAULT"),
    changedById: null,
    changeReason: null,
    createdAt: null,
    updatedAt: null,
  }
}

export async function setGuidancePolicy(input: z.infer<typeof guidancePolicySchema>) {
  const parsed = guidancePolicySchema.parse(input)
  return prisma.$transaction(async tx => {
    const actor = await operatorActor(tx)
    const policy = await tx.clinicalGuidancePolicy.upsert({
      where: { id: "local" },
      create: {
        id: "local",
        adultEnabled: parsed.adultEnabled,
        pediatricEnabled: parsed.pediatricEnabled,
        changedById: actor.id,
        changeReason: parsed.reason,
      },
      update: {
        adultEnabled: parsed.adultEnabled,
        pediatricEnabled: parsed.pediatricEnabled,
        changedById: actor.id,
        changeReason: parsed.reason,
      },
    })
    await logAuditInTransaction(tx, actor.id, "HOSPITAL_GUIDANCE_POLICY_UPDATE", policy.id, {
      adultEnabled: policy.adultEnabled,
      pediatricEnabled: policy.pediatricEnabled,
      reasonRecorded: Boolean(parsed.reason),
      prospectiveOnly: true,
    })
    return policy
  })
}

/**
 * ЕГН governs whether this site records a national identifier at all -- a
 * heavier, harder-to-reverse commitment than the feature toggles the other
 * control-plane policies carry (guidance, external AI). Status's session
 * check already proves the browser sending this request is still
 * authenticated; the extra Serializable isolation here is not about that --
 * it is about two operators racing to flip the same singleton row, which the
 * default read-committed isolation the sibling setters use would let both
 * "succeed" against a value that was already stale by the time either wrote.
 */
export async function setPatientIdentifierPolicy(
  input: z.infer<typeof patientIdentifierPolicySchema>,
) {
  const parsed = patientIdentifierPolicySchema.parse(input)
  return prisma.$transaction(async tx => {
    const actor = await operatorActor(tx)
    const now = new Date()
    const policy = await tx.hospitalPatientIdentifierPolicy.upsert({
      where: { id: "local" },
      create: {
        id: "local",
        egnPermitted: parsed.egnPermitted,
        changedAt: now,
        changedById: actor.id,
        changeReason: parsed.reason,
      },
      update: {
        egnPermitted: parsed.egnPermitted,
        changedAt: now,
        changedById: actor.id,
        changeReason: parsed.reason,
      },
    })
    await logAuditInTransaction(tx, actor.id, "HOSPITAL_PATIENT_IDENTIFIER_POLICY_UPDATE", policy.id, {
      egnPermitted: policy.egnPermitted,
      reasonRecorded: Boolean(parsed.reason),
    })
    return policy
  }, serializableTransaction)
}

/**
 * Which transport, if any, this site uses to receive proposed EHR values.
 * A transport change always invalidates whatever credential was stored:
 * FOLDER and "no transport" need none at all (the sealed-tuple/transport
 * CHECK forbids storing one), and a credential sealed for FHIR cannot open
 * under HL7v2 even if both happen to be present, because sealing binds the
 * ciphertext to the transport it was sealed for. Clearing it here rather
 * than leaving it to be discovered as an unreadable credential later keeps
 * the stored state honest with what the policy actually says.
 */
export async function setEhrTransportPolicy(input: z.infer<typeof ehrTransportPolicySchema>) {
  const parsed = ehrTransportPolicySchema.parse(input)
  return prisma.$transaction(async tx => {
    const actor = await operatorActor(tx)
    const existing = await tx.hospitalEhrTransportPolicy.findUnique({ where: { id: "local" } })
    const previousTransport = existing?.transport ?? null
    const transportChanged = previousTransport !== parsed.transport
    const now = new Date()
    const policy = await tx.hospitalEhrTransportPolicy.upsert({
      where: { id: "local" },
      create: {
        id: "local",
        transport: parsed.transport,
        transportChangedAt: now,
        transportChangedById: actor.id,
        transportChangeReason: parsed.reason,
      },
      update: {
        transport: parsed.transport,
        transportChangedAt: now,
        transportChangedById: actor.id,
        transportChangeReason: parsed.reason,
        ...(transportChanged ? {
          credentialCiphertext: null,
          credentialNonce: null,
          credentialAuthTag: null,
          credentialKeyVersion: null,
          credentialSealKeyFingerprint: null,
          credentialConfiguredAt: null,
          credentialChangedAt: now,
          credentialChangedById: actor.id,
        } : {}),
      },
    })
    await logAuditInTransaction(tx, actor.id, "HOSPITAL_EHR_TRANSPORT_POLICY_UPDATE", policy.id, {
      transport: policy.transport,
      previousTransport,
      reasonRecorded: Boolean(parsed.reason),
      credentialCleared: transportChanged && Boolean(existing?.credentialCiphertext),
    })
    return policy
  })
}

/**
 * Set where a network transport sends, and how it presents itself.
 *
 * Changing the endpoint clears the stored credential. A secret issued by one
 * server is not a secret at another, and carrying it across would either fail
 * confusingly or, far worse, succeed — sending one hospital's clinical data to
 * a server belonging to somebody else.
 */
export async function setEhrTransportEndpoint(
  input: z.infer<typeof ehrTransportEndpointSchema>,
) {
  const parsed = ehrTransportEndpointSchema.parse(input)
  return prisma.$transaction(async tx => {
    const actor = await operatorActor(tx)
    const existing = await tx.hospitalEhrTransportPolicy.findUnique({ where: { id: "local" } })
    const endpointChanged = (existing?.endpoint ?? null) !== parsed.endpoint
    const now = new Date()

    const shared = {
      endpoint: parsed.endpoint,
      endpointChangedAt: now,
      endpointChangedById: actor.id,
      authMode: parsed.authMode,
      tokenUrl: parsed.tokenUrl,
      clientId: parsed.clientId,
      scope: parsed.scope,
    }

    const policy = await tx.hospitalEhrTransportPolicy.upsert({
      where: { id: "local" },
      create: { id: "local", ...shared },
      update: {
        ...shared,
        ...(endpointChanged && existing?.credentialCiphertext ? {
          credentialCiphertext: null,
          credentialNonce: null,
          credentialAuthTag: null,
          credentialKeyVersion: null,
          credentialSealKeyFingerprint: null,
          credentialConfiguredAt: null,
          credentialChangedAt: now,
          credentialChangedById: actor.id,
        } : {}),
      },
    })

    await logAuditInTransaction(tx, actor.id, "HOSPITAL_EHR_TRANSPORT_POLICY_UPDATE", policy.id, {
      endpointConfigured: Boolean(parsed.endpoint),
      endpointChanged,
      authMode: parsed.authMode,
      reasonRecorded: Boolean(parsed.reason),
      credentialCleared: endpointChanged && Boolean(existing?.credentialCiphertext),
    })
    return policy
  })
}

export async function replaceEhrTransportCredential(
  input: z.infer<typeof ehrTransportCredentialSchema>,
) {
  const parsed = ehrTransportCredentialSchema.parse(input)
  return prisma.$transaction(async tx => {
    const actor = await operatorActor(tx)
    const existing = await tx.hospitalEhrTransportPolicy.findUnique({ where: { id: "local" } })
    const transport = existing?.transport ?? null
    // Unlike Mistral, there is no fixed single provider to seal against:
    // which transport a credential binds to can only be read from the
    // stored policy, so (unlike replaceExternalAiCredential) sealing happens
    // after that read rather than before the transaction opens. The
    // plaintext still never reaches Prisma, audit metadata, errors or the
    // returned value.
    if (transport !== "FHIR") {
      throw new HospitalControlPlaneError("EHR_TRANSPORT_NOT_CREDENTIALED")
    }
    const sealed = sealEhrTransportCredential(transport, parsed.credential)
    const now = new Date()
    const policy = await tx.hospitalEhrTransportPolicy.update({
      where: { id: "local" },
      data: {
        credentialCiphertext: sealed.ciphertext,
        credentialNonce: sealed.nonce,
        credentialAuthTag: sealed.authTag,
        credentialKeyVersion: sealed.keyVersion,
        credentialSealKeyFingerprint: sealed.sealKeyFingerprint,
        credentialConfiguredAt: now,
        credentialChangedAt: now,
        credentialChangedById: actor.id,
      },
    })
    await logAuditInTransaction(tx, actor.id, "HOSPITAL_EHR_TRANSPORT_CREDENTIAL_REPLACE", policy.id, {
      transport,
      configured: true,
      reasonRecorded: Boolean(parsed.reason),
    })
    return {
      transport,
      credentialConfigured: true as const,
      credentialConfiguredAt: policy.credentialConfiguredAt,
    }
  })
}

export async function removeEhrTransportCredential(
  input: z.infer<typeof ehrTransportCredentialRemoveSchema>,
) {
  const parsed = ehrTransportCredentialRemoveSchema.parse(input)
  return prisma.$transaction(async tx => {
    const actor = await operatorActor(tx)
    const existing = await tx.hospitalEhrTransportPolicy.findUnique({ where: { id: "local" } })
    const wasConfigured = Boolean(existing?.credentialCiphertext
      && existing.credentialNonce && existing.credentialAuthTag
      && existing.credentialKeyVersion && existing.credentialSealKeyFingerprint
      && existing.credentialConfiguredAt)
    const now = new Date()
    const policy = await tx.hospitalEhrTransportPolicy.upsert({
      where: { id: "local" },
      create: {
        id: "local",
        credentialChangedAt: now,
        credentialChangedById: actor.id,
      },
      update: {
        credentialCiphertext: null,
        credentialNonce: null,
        credentialAuthTag: null,
        credentialKeyVersion: null,
        credentialSealKeyFingerprint: null,
        credentialConfiguredAt: null,
        credentialChangedAt: now,
        credentialChangedById: actor.id,
      },
    })
    await logAuditInTransaction(tx, actor.id, "HOSPITAL_EHR_TRANSPORT_CREDENTIAL_REMOVE", policy.id, {
      transport: policy.transport,
      configured: false,
      wasConfigured,
      reasonRecorded: Boolean(parsed.reason),
    })
    return {
      transport: policy.transport,
      credentialConfigured: false as const,
      credentialConfiguredAt: null,
    }
  })
}

export async function setExternalAiPolicy(input: z.infer<typeof externalAiPolicySchema>) {
  const parsed = externalAiPolicySchema.parse(input)
  return prisma.$transaction(async tx => {
    const actor = await operatorActor(tx)
    const now = new Date()
    const policy = await tx.hospitalExternalAiPolicy.upsert({
      where: { id: "local" },
      create: {
        id: "local",
        externalAiEnabled: parsed.externalAiEnabled,
        policyChangedAt: now,
        policyChangedById: actor.id,
        policyChangeReason: parsed.reason,
      },
      update: {
        externalAiEnabled: parsed.externalAiEnabled,
        policyChangedAt: now,
        policyChangedById: actor.id,
        policyChangeReason: parsed.reason,
      },
    })
    await logAuditInTransaction(tx, actor.id, "HOSPITAL_EXTERNAL_AI_POLICY_UPDATE", policy.id, {
      externalAiEnabled: policy.externalAiEnabled,
      provider: policy.provider,
      reasonRecorded: Boolean(parsed.reason),
    })
    return policy
  })
}

export async function replaceExternalAiCredential(
  input: z.infer<typeof externalAiCredentialSchema>,
) {
  const parsed = externalAiCredentialSchema.parse(input)
  // Seal before opening the transaction. The plaintext is never passed to
  // Prisma, audit metadata, errors or the returned value.
  const sealed = sealExternalAiCredential(parsed.credential)
  return prisma.$transaction(async tx => {
    const actor = await operatorActor(tx)
    const now = new Date()
    const policy = await tx.hospitalExternalAiPolicy.upsert({
      where: { id: "local" },
      create: {
        id: "local",
        externalAiEnabled: configuredExternalAiDefault(),
        credentialCiphertext: sealed.ciphertext,
        credentialNonce: sealed.nonce,
        credentialAuthTag: sealed.authTag,
        credentialKeyVersion: sealed.keyVersion,
        credentialSealKeyFingerprint: sealed.sealKeyFingerprint,
        credentialConfiguredAt: now,
        credentialChangedAt: now,
        credentialChangedById: actor.id,
      },
      update: {
        credentialCiphertext: sealed.ciphertext,
        credentialNonce: sealed.nonce,
        credentialAuthTag: sealed.authTag,
        credentialKeyVersion: sealed.keyVersion,
        credentialSealKeyFingerprint: sealed.sealKeyFingerprint,
        credentialConfiguredAt: now,
        credentialChangedAt: now,
        credentialChangedById: actor.id,
      },
    })
    await logAuditInTransaction(tx, actor.id, "HOSPITAL_EXTERNAL_AI_CREDENTIAL_REPLACE", policy.id, {
      provider: policy.provider,
      configured: true,
      reasonRecorded: Boolean(parsed.reason),
    })
    return {
      provider: policy.provider,
      credentialConfigured: true as const,
      credentialConfiguredAt: policy.credentialConfiguredAt,
    }
  })
}

export async function removeExternalAiCredential(
  input: z.infer<typeof externalAiCredentialRemoveSchema>,
) {
  const parsed = externalAiCredentialRemoveSchema.parse(input)
  return prisma.$transaction(async tx => {
    const actor = await operatorActor(tx)
    const existing = await tx.hospitalExternalAiPolicy.findUnique({ where: { id: "local" } })
    const wasConfigured = Boolean(existing?.credentialCiphertext
      && existing.credentialNonce && existing.credentialAuthTag
      && existing.credentialKeyVersion && existing.credentialSealKeyFingerprint
      && existing.credentialConfiguredAt)
    const now = new Date()
    const policy = await tx.hospitalExternalAiPolicy.upsert({
      where: { id: "local" },
      create: {
        id: "local",
        externalAiEnabled: configuredExternalAiDefault(),
        credentialChangedAt: now,
        credentialChangedById: actor.id,
      },
      update: {
        credentialCiphertext: null,
        credentialNonce: null,
        credentialAuthTag: null,
        credentialKeyVersion: null,
        credentialSealKeyFingerprint: null,
        credentialConfiguredAt: null,
        credentialChangedAt: now,
        credentialChangedById: actor.id,
      },
    })
    await logAuditInTransaction(tx, actor.id, "HOSPITAL_EXTERNAL_AI_CREDENTIAL_REMOVE", policy.id, {
      provider: policy.provider,
      configured: false,
      wasConfigured,
      reasonRecorded: Boolean(parsed.reason),
    })
    return {
      provider: policy.provider,
      credentialConfigured: false as const,
      credentialConfiguredAt: null,
    }
  })
}

export async function configureCentralTransport(input: z.infer<typeof centralTransportSchema>) {
  const parsed = centralTransportSchema.parse(input)
  const actor = await operatorActor()
  const config = hospitalConfig()
  const [clientCertificate, caCertificate] = await Promise.all([
    certificateView(config.HOSPITAL_MTLS_CERT_FILE),
    certificateView(config.HOSPITAL_MTLS_CA_FILE),
  ])
  if (!clientCertificate || !caCertificate || !isCentralDeliveryConfigured()) {
    throw new HospitalControlPlaneError("CENTRAL_CERTIFICATES_NOT_READY")
  }
  const configurationHash = sha256(JSON.stringify({
    version: 1,
    centralBaseUrl: parsed.centralBaseUrl,
    siteCode: parsed.siteCode.trim().toUpperCase(),
    siteName: parsed.siteName,
    institutionId: parsed.institutionId,
    clientCertificateFingerprintSha256: clientCertificate.fingerprintSha256,
    caCertificateFingerprintSha256: caCertificate.fingerprintSha256,
  }))
  return enrollHospital({
    token: parsed.token,
    centralBaseUrl: parsed.centralBaseUrl,
    siteCode: parsed.siteCode,
    siteName: parsed.siteName,
    institutionId: parsed.institutionId,
  }, {
    actorId: actor.id,
    reason: parsed.reason,
    configurationHash,
  })
}

export async function setCentralClinicalPolicy(
  input: z.infer<typeof centralClinicalPolicySchema>,
) {
  const parsed = centralClinicalPolicySchema.parse(input)
  return prisma.$transaction(async tx => {
    const actor = await operatorActor(tx)
    const installation = await tx.hospitalInstallation.findUnique({ where: { id: "local" } })
    if (!installation?.institutionId || !installation.centralEnabled
      || !installation.siteId || !installation.transportConfigurationHash) {
      throw new HospitalControlPlaneError("CENTRAL_TRANSPORT_NOT_LOCKED")
    }
    const policy = await tx.centralExportPolicy.upsert({
      where: { institutionId: installation.institutionId },
      create: {
        institutionId: installation.institutionId,
        enabled: parsed.enabled,
        includeRedactedText: parsed.includeRedactedText,
        redactionProfile: parsed.redactionProfile,
        approvedById: parsed.enabled ? actor.id : null,
        approvedAt: parsed.enabled ? new Date() : null,
      },
      update: {
        enabled: parsed.enabled,
        includeRedactedText: parsed.includeRedactedText,
        redactionProfile: parsed.redactionProfile,
        approvedById: parsed.enabled ? actor.id : null,
        approvedAt: parsed.enabled ? new Date() : null,
      },
    })
    await logAuditInTransaction(tx, actor.id, "HOSPITAL_CENTRAL_CLINICAL_POLICY_UPDATE", policy.id, {
      enabled: policy.enabled,
      includeRedactedText: policy.includeRedactedText,
      redactionProfile: policy.redactionProfile,
      transportConfigurationHash: installation.transportConfigurationHash,
      reasonRecorded: Boolean(parsed.reason),
    })
    return policy
  })
}

export async function retryCentralBatch(batchId: string, reason: string) {
  const parsed = centralRetrySchema.parse({ reason })
  return prisma.$transaction(async tx => {
    const actor = await operatorActor(tx)
    const installation = await tx.hospitalInstallation.findUnique({
      where: { id: "local" },
      select: {
        institutionId: true,
        centralEnabled: true,
        siteId: true,
        transportConfigurationHash: true,
        transportConfiguredAt: true,
        transportConfiguredById: true,
      },
    })
    if (!installation?.institutionId || !installation.centralEnabled
      || !installation.siteId || !installation.transportConfigurationHash
      || !installation.transportConfiguredAt || !installation.transportConfiguredById) {
      throw new HospitalControlPlaneError("CENTRAL_TRANSPORT_NOT_LOCKED")
    }
    const policy = await tx.centralExportPolicy.findUnique({
      where: { institutionId: installation.institutionId },
      select: { enabled: true, approvedAt: true },
    })
    if (!policy?.enabled || !policy.approvedAt) {
      throw new HospitalControlPlaneError("CENTRAL_CLINICAL_EXPORT_NOT_ENABLED")
    }
    const batch = await tx.centralDeliveryBatch.findUnique({ where: { id: batchId } })
    if (!batch) throw new HospitalControlPlaneError("CENTRAL_BATCH_NOT_FOUND")
    if (batch.status !== "RETRY" && batch.status !== "REJECTED") {
      throw new HospitalControlPlaneError("CENTRAL_BATCH_NOT_RETRYABLE")
    }
    const retried = await tx.centralDeliveryBatch.update({
      where: { id: batch.id },
      data: {
        status: "RETRY",
        nextAttemptAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    })
    await logAuditInTransaction(tx, actor.id, "HOSPITAL_CENTRAL_BATCH_RETRY", batch.id, {
      sequence: batch.sequence,
      priorStatus: batch.status,
      errorCode: batch.errorCode,
      reasonRecorded: Boolean(parsed.reason),
    })
    return retried
  })
}

export async function centralControlView() {
  const config = hospitalConfig()
  const installation = await prisma.hospitalInstallation.findUnique({
    where: { id: "local" },
    select: {
      siteId: true,
      siteCode: true,
      institutionId: true,
      centralBaseUrl: true,
      centralEnabled: true,
      signingKeyId: true,
      centralEncryptionKeyId: true,
      receiptSigningKeyId: true,
      supportedManifestVersions: true,
      maximumUploadBytes: true,
      multipartChunkBytes: true,
      nextSequence: true,
      lastAcceptedBatchId: true,
      enrolledAt: true,
      lastCapabilitiesAt: true,
      lastDeliveryAt: true,
      transportConfigurationHash: true,
      transportConfiguredAt: true,
      // Used only to prove that the transport lock has complete actor
      // evidence. The actor identifier itself is deliberately not returned to
      // Status.
      transportConfiguredById: true,
    },
  })
  const [clientCertificate, caCertificate, policy, batches, queueCounts, awaiting] = await Promise.all([
    certificateView(config.HOSPITAL_MTLS_CERT_FILE),
    certificateView(config.HOSPITAL_MTLS_CA_FILE),
    installation?.institutionId
      ? prisma.centralExportPolicy.findUnique({ where: { institutionId: installation.institutionId } })
      : null,
    prisma.centralDeliveryBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        sequence: true,
        status: true,
        cutoffFrom: true,
        cutoffTo: true,
        manifestHash: true,
        ciphertextSha256: true,
        receiptHash: true,
        attemptCount: true,
        nextAttemptAt: true,
        errorCode: true,
        createdAt: true,
        generatedAt: true,
        acceptedAt: true,
        _count: { select: { cases: true } },
      },
    }),
    prisma.centralDeliveryBatch.groupBy({ by: ["status"], _count: { _all: true } }),
    installation?.institutionId
      ? countCasesAwaitingCentralExport(installation.institutionId)
      : 0,
  ])
  let endpoint: string | null = null
  if (installation?.centralBaseUrl) {
    try {
      endpoint = new URL(installation.centralBaseUrl).origin
    } catch {
      endpoint = null
    }
  }
  const supported = Array.isArray(installation?.supportedManifestVersions)
    ? installation.supportedManifestVersions.flatMap(item =>
      typeof item === "number" || typeof item === "string" ? [String(item)] : [])
    : []
  // Dynamic, not a static top-level import: @lospor/exchange-contract is
  // ESM-only (its package.json exports carry no "require" condition), and
  // this module is also loaded by standalone tsx scripts (e.g.
  // bootstrap-hospital-admin.ts) that Node resolves as CommonJS, since
  // apps/api's own package.json carries no "type": "module". A static
  // import there fails to resolve; dynamic import() always uses ESM
  // resolution regardless of the caller's module type.
  const { MANIFEST_VERSION } = await import("@lospor/exchange-contract")
  return {
    disabledByDefault: true,
    pushOnly: true,
    credentialsPresent: isCentralDeliveryConfigured(),
    endpoint,
    siteId: installation?.siteId ?? null,
    siteCode: installation?.siteCode ?? null,
    institutionId: installation?.institutionId ?? null,
    transportLocked: Boolean(
      installation?.transportConfigurationHash
      && installation.transportConfiguredAt
      && installation.transportConfiguredById,
    ),
    transportConfigurationHash: installation?.transportConfigurationHash ?? null,
    transportConfiguredAt: installation?.transportConfiguredAt?.toISOString() ?? null,
    clientCertificate,
    caCertificate,
    signingKeyId: installation?.signingKeyId ?? null,
    centralEncryptionKeyId: installation?.centralEncryptionKeyId ?? null,
    receiptSigningKeyId: installation?.receiptSigningKeyId ?? null,
    compatibility: {
      localManifestVersion: String(MANIFEST_VERSION),
      supportedManifestVersions: supported,
      compatible: supported.includes(String(MANIFEST_VERSION)),
      maximumUploadBytes: installation?.maximumUploadBytes ?? null,
      multipartChunkBytes: installation?.multipartChunkBytes ?? null,
    },
    enrolled: Boolean(installation?.centralEnabled && installation.siteId),
    enrolledAt: installation?.enrolledAt?.toISOString() ?? null,
    lastCapabilitiesAt: installation?.lastCapabilitiesAt?.toISOString() ?? null,
    lastDeliveryAt: installation?.lastDeliveryAt?.toISOString() ?? null,
    nextSequence: installation?.nextSequence ?? 1,
    lastAcceptedBatchId: installation?.lastAcceptedBatchId ?? null,
    policy: policy ? {
      enabled: policy.enabled,
      includeRedactedText: policy.includeRedactedText,
      redactionProfile: policy.redactionProfile,
      approvedAt: policy.approvedAt?.toISOString() ?? null,
    } : null,
    casesAwaitingExport: awaiting,
    queuesByStatus: Object.fromEntries(queueCounts.map(row => [row.status, row._count._all])),
    batches: batches.map(batch => ({
      ...batch,
      cutoffFrom: batch.cutoffFrom?.toISOString() ?? null,
      cutoffTo: batch.cutoffTo.toISOString(),
      nextAttemptAt: batch.nextAttemptAt?.toISOString() ?? null,
      createdAt: batch.createdAt.toISOString(),
      generatedAt: batch.generatedAt?.toISOString() ?? null,
      acceptedAt: batch.acceptedAt?.toISOString() ?? null,
      caseCount: batch._count.cases,
      _count: undefined,
    })),
  }
}

export async function hospitalControlPlaneView() {
  const [research, central, guidance, externalAi, baselines, patientIdentifier, ehrTransport, ehrLabCodes] = await Promise.all([
    listHospitalResearchControl(prisma),
    centralControlView(),
    currentGuidancePolicy(),
    externalAiControlView(prisma),
    assessHospitalClinicalBaselines(prisma),
    patientIdentifierControlView(prisma),
    ehrTransportControlView(prisma),
    ehrLabCodeMapView(),
  ])
  const pediatricMode = pediatricCapabilities()
  return {
    schemaVersion: 4,
    pediatricMode: {
      ...pediatricMode,
      // This legacy field is now live database truth, not the bundled Core
      // review constant. The release review remains a separate safe fact.
      productionReady: baselines.pediatric.baselineReady,
      releaseReviewed: pediatricMode.productionReady,
      bundledRulesetVersion: pediatricMode.rulesetVersion,
    },
    research,
    central,
    guidance: {
      adultEnabled: guidance.adultEnabled,
      pediatricEnabled: guidance.pediatricEnabled,
      updatedAt: guidance.updatedAt?.toISOString() ?? null,
      baselines,
    },
    externalAi,
    patientIdentifier,
    ehrTransport,
    ehrLabCodes,
  }
}

/**
 * Point one of this hospital's laboratory codes at one of our tests.
 *
 * Unlike the policies above, this is not password-gated per change, and the
 * difference is deliberate. Those decide whether a whole capability is on, or
 * where clinical data is sent; this says what `ХГБ` means. An operator works
 * through dozens of codes in a sitting, and a screen that demanded a password
 * and a written reason for each one would be abandoned halfway, leaving a site
 * half-mapped — which is worse than the risk it was guarding against, because a
 * wrong mapping is visible on the review screen and reversible in a click.
 *
 * It is still audited, and the audit records both sides, so "why is potassium
 * appearing under sodium" has an answer.
 */
export const ehrLabCodeMapSchema = z.object({
  system: z.string().trim().max(512).default(""),
  code: z.string().trim().min(1).max(512),
  test: z.string().trim().min(1).max(200),
  /** Only for a feed that omits units entirely; never overrides a stated one. */
  assumedUnit: z.string().trim().max(64).nullable().default(null),
}).strict()

export const ehrLabCodeUnmapSchema = z.object({
  system: z.string().trim().max(512).default(""),
  code: z.string().trim().min(1).max(512),
}).strict()

export async function setEhrLabCodeMapping(input: z.infer<typeof ehrLabCodeMapSchema>) {
  const parsed = ehrLabCodeMapSchema.parse(input)
  return prisma.$transaction(async tx => {
    const actor = await operatorActor(tx)
    const now = new Date()
    // Checked against the library rather than trusted: it is code, not a table,
    // so nothing at the database level can stop a name that does not exist.
    if (!LAB_LIBRARY.some(test => test.name === parsed.test)) {
      throw new EhrTransportPolicyError("INVALID_CONTROL_REQUEST")
    }
    const previous = await tx.hospitalEhrLabCodeMap.findUnique({
      where: { system_code: { system: parsed.system, code: parsed.code } },
      select: { test: true },
    })
    const row = await tx.hospitalEhrLabCodeMap.upsert({
      where: { system_code: { system: parsed.system, code: parsed.code } },
      create: {
        system: parsed.system,
        code: parsed.code,
        test: parsed.test,
        assumedUnit: parsed.assumedUnit,
        mappedAt: now,
        mappedById: actor.id,
      },
      update: {
        test: parsed.test,
        assumedUnit: parsed.assumedUnit,
        mappedAt: now,
        mappedById: actor.id,
      },
    })
    await logAuditInTransaction(tx, actor.id, "HOSPITAL_EHR_LAB_CODE_MAP", row.id, {
      system: parsed.system,
      code: parsed.code,
      test: parsed.test,
      // Both sides, so a later "why is this result under that test" is
      // answerable without guessing which change did it.
      previousTest: previous?.test || null,
      assumedUnit: parsed.assumedUnit,
    })
    return { system: row.system, code: row.code, test: row.test, mappedAt: row.mappedAt.toISOString() }
  })
}

/**
 * Undo a mapping without forgetting the code.
 *
 * The row survives, holding its count and the laboratory's own name for it, so
 * the code returns to the screen as a question rather than vanishing and being
 * rediscovered the next time a result arrives.
 */
export async function clearEhrLabCodeMapping(input: z.infer<typeof ehrLabCodeUnmapSchema>) {
  const parsed = ehrLabCodeUnmapSchema.parse(input)
  return prisma.$transaction(async tx => {
    const actor = await operatorActor(tx)
    const existing = await tx.hospitalEhrLabCodeMap.findUnique({
      where: { system_code: { system: parsed.system, code: parsed.code } },
      select: { id: true, test: true },
    })
    if (!existing) throw new EhrTransportPolicyError("INVALID_CONTROL_REQUEST")
    await tx.hospitalEhrLabCodeMap.update({
      where: { id: existing.id },
      data: { test: "", assumedUnit: null, mappedAt: new Date(), mappedById: actor.id },
    })
    await logAuditInTransaction(tx, actor.id, "HOSPITAL_EHR_LAB_CODE_UNMAP", existing.id, {
      system: parsed.system,
      code: parsed.code,
      previousTest: existing.test,
    })
    return { system: parsed.system, code: parsed.code }
  })
}

/**
 * What the mapping screen renders.
 *
 * Three lists, and the split is the design. `unmapped` is the work — codes that
 * have actually arrived and could not be placed, busiest first, so an operator
 * spends their attention where results are actually flowing. `mapped` is what
 * they have already decided, so it can be checked and revised. `tests` is what
 * they may choose from, grouped as the clinical form groups them, because
 * sixty-six names in one flat list is a scroll and the same names under
 * Haematology and Blood gas is a place someone finds haemoglobin in a second.
 *
 * A site that has not integrated yet sees an empty first list, which is honest:
 * there is nothing to map until something has arrived.
 */
export async function ehrLabCodeMapView() {
  const [unmapped, mapped] = await Promise.all([
    prisma.hospitalEhrLabCodeMap.findMany({
      where: { test: "" },
      orderBy: [{ seenCount: "desc" }, { lastSeenAt: "desc" }],
      take: 200,
      select: { system: true, code: true, reportedLabel: true, seenCount: true, lastSeenAt: true },
    }),
    prisma.hospitalEhrLabCodeMap.findMany({
      where: { test: { not: "" } },
      orderBy: [{ test: "asc" }, { code: "asc" }],
      select: {
        system: true, code: true, test: true, reportedLabel: true,
        assumedUnit: true, seenCount: true, lastSeenAt: true, mappedAt: true,
      },
    }),
  ])
  return {
    unmapped: unmapped.map(row => ({
      ...row,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    })),
    mapped: mapped.map(row => ({
      ...row,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      mappedAt: row.mappedAt.toISOString(),
    })),
    tests: LAB_CATEGORIES.flatMap(category =>
      category.tests.map(test => ({ name: test.name, unit: test.unit, category: category.label }))),
  }
}
