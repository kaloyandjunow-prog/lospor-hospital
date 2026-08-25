import "server-only"

import { createHash, X509Certificate } from "node:crypto"
import { readFile } from "node:fs/promises"
import { z } from "zod"
import { MANIFEST_VERSION } from "@lospor/exchange-contract"
import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { logAuditInTransaction } from "@/lib/audit"
import { pediatricCapabilities } from "@/lib/pediatric-mode"
import { assessHospitalClinicalBaselines } from "./clinical-baseline-readiness"
import { countCasesAwaitingCentralExport } from "./central-status"
import { hospitalConfig, isCentralDeliveryConfigured } from "./config"
import { isHospitalDeployment } from "./deployment"
import { enrollHospital } from "./enrollment"
import {
  configuredExternalAiDefault,
  externalAiControlView,
  sealExternalAiCredential,
} from "./external-ai-policy"
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
  const [research, central, guidance, externalAi, baselines] = await Promise.all([
    listHospitalResearchControl(prisma),
    centralControlView(),
    currentGuidancePolicy(),
    externalAiControlView(prisma),
    assessHospitalClinicalBaselines(prisma),
  ])
  const pediatricMode = pediatricCapabilities()
  return {
    schemaVersion: 2,
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
  }
}
