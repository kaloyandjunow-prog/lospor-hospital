import "server-only"

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"
import { readFileSync } from "node:fs"
import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { isHospitalDeployment } from "./deployment"

const SEAL_KEY_BYTES = 32
const NONCE_BYTES = 12
const AUTH_TAG_BYTES = 16
const PROVIDER = "MISTRAL" as const
const CREDENTIAL_AAD = Buffer.from("local\0MISTRAL\0v1", "utf8")

export const EXTERNAL_AI_CREDENTIAL_KEY_VERSION = 1

type Database = PrismaClient | Prisma.TransactionClient

export type SealedExternalAiCredential = {
  ciphertext: string
  nonce: string
  authTag: string
  keyVersion: number
  sealKeyFingerprint: string
}

export type ExternalAiUnavailableReason =
  | "DISABLED_BY_DEPLOYMENT"
  | "PROVIDER_NOT_CONFIGURED"

export type ExternalAiCapabilityState = {
  enabled: boolean
  reason: ExternalAiUnavailableReason | null
  provider: typeof PROVIDER
  policyEnabled: boolean
  credentialStored: boolean
  providerConfigured: boolean
}

export type ExternalAiProviderAccess =
  | {
    enabled: true
    provider: typeof PROVIDER
    apiKey: string
  }
  | {
    enabled: false
    provider: typeof PROVIDER
    reason: ExternalAiUnavailableReason
  }

export class ExternalAiPolicyError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = "ExternalAiPolicyError"
  }
}

export function configuredExternalAiDefault(): boolean {
  const value = process.env.HOSPITAL_EXTERNAL_AI_DEFAULT?.trim().toLowerCase()
  return value !== "false" && value !== "no" && value !== "0"
}

function sealKeyFile(path = process.env.HOSPITAL_EXTERNAL_AI_SEAL_KEY_FILE): string {
  if (!path?.trim()) {
    throw new ExternalAiPolicyError("EXTERNAL_AI_SEAL_KEY_UNAVAILABLE")
  }
  return path
}

/**
 * The file contains canonical base64 for exactly 32 random bytes. Keeping the
 * representation strict makes fingerprints stable across install, backup and
 * restore and rejects a truncated or accidentally replaced secret early.
 */
export function readExternalAiSealKey(
  path = process.env.HOSPITAL_EXTERNAL_AI_SEAL_KEY_FILE,
): Buffer {
  let encoded: string
  try {
    encoded = readFileSync(sealKeyFile(path), "utf8").trim()
  } catch (error) {
    if (error instanceof ExternalAiPolicyError) throw error
    throw new ExternalAiPolicyError("EXTERNAL_AI_SEAL_KEY_UNAVAILABLE")
  }
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
    throw new ExternalAiPolicyError("EXTERNAL_AI_SEAL_KEY_INVALID")
  }
  const key = Buffer.from(encoded, "base64")
  if (key.length !== SEAL_KEY_BYTES || key.toString("base64") !== encoded) {
    throw new ExternalAiPolicyError("EXTERNAL_AI_SEAL_KEY_INVALID")
  }
  return key
}

/** Non-secret restore compatibility evidence; the bytes themselves never leave the API. */
export function externalAiSealKeyFingerprint(
  path = process.env.HOSPITAL_EXTERNAL_AI_SEAL_KEY_FILE,
): string {
  return externalAiSealKeyFingerprintForKey(readExternalAiSealKey(path))
}

export function externalAiSealKeyFingerprintForKey(key: Buffer): string {
  if (key.length !== SEAL_KEY_BYTES) {
    throw new ExternalAiPolicyError("EXTERNAL_AI_SEAL_KEY_INVALID")
  }
  return `sha256:${createHash("sha256").update(key).digest("hex")}`
}

export function sealExternalAiCredential(
  credential: string,
  key = readExternalAiSealKey(),
): SealedExternalAiCredential {
  if (!credential) throw new ExternalAiPolicyError("EXTERNAL_AI_CREDENTIAL_REQUIRED")
  if (key.length !== SEAL_KEY_BYTES) {
    throw new ExternalAiPolicyError("EXTERNAL_AI_SEAL_KEY_INVALID")
  }
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv("aes-256-gcm", key, nonce)
  cipher.setAAD(CREDENTIAL_AAD)
  const ciphertext = Buffer.concat([
    cipher.update(credential, "utf8"),
    cipher.final(),
  ])
  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: EXTERNAL_AI_CREDENTIAL_KEY_VERSION,
    sealKeyFingerprint: externalAiSealKeyFingerprintForKey(key),
  }
}

export function openExternalAiCredential(
  sealed: SealedExternalAiCredential,
  key = readExternalAiSealKey(),
): string {
  if (sealed.keyVersion !== EXTERNAL_AI_CREDENTIAL_KEY_VERSION) {
    throw new ExternalAiPolicyError("EXTERNAL_AI_CREDENTIAL_UNREADABLE")
  }
  try {
    const nonce = Buffer.from(sealed.nonce, "base64")
    const authTag = Buffer.from(sealed.authTag, "base64")
    if (key.length !== SEAL_KEY_BYTES || nonce.length !== NONCE_BYTES
      || authTag.length !== AUTH_TAG_BYTES) {
      throw new Error("invalid sealed tuple")
    }
    const decipher = createDecipheriv("aes-256-gcm", key, nonce)
    decipher.setAAD(CREDENTIAL_AAD)
    decipher.setAuthTag(authTag)
    const credential = Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8")
    if (!credential) throw new Error("empty credential")
    return credential
  } catch {
    throw new ExternalAiPolicyError("EXTERNAL_AI_CREDENTIAL_UNREADABLE")
  }
}

type StoredPolicy = Awaited<ReturnType<typeof storedExternalAiPolicy>>

function completeSealedCredential(policy: NonNullable<StoredPolicy>): SealedExternalAiCredential | null {
  if (policy.credentialCiphertext === null || policy.credentialNonce === null
    || policy.credentialAuthTag === null || policy.credentialKeyVersion === null
    || policy.credentialSealKeyFingerprint === null) return null
  return {
    ciphertext: policy.credentialCiphertext,
    nonce: policy.credentialNonce,
    authTag: policy.credentialAuthTag,
    keyVersion: policy.credentialKeyVersion,
    sealKeyFingerprint: policy.credentialSealKeyFingerprint,
  }
}

export function storedExternalAiPolicy(db: Database = prisma) {
  return db.hospitalExternalAiPolicy.findUnique({ where: { id: "local" } })
}

function stateFromPolicy(policy: StoredPolicy): ExternalAiCapabilityState {
  const policyEnabled = policy?.externalAiEnabled ?? configuredExternalAiDefault()
  const sealed = policy ? completeSealedCredential(policy) : null
  if (!policyEnabled) {
    return {
      enabled: false,
      reason: "DISABLED_BY_DEPLOYMENT",
      provider: PROVIDER,
      policyEnabled,
      credentialStored: Boolean(sealed),
      providerConfigured: false,
    }
  }
  if (!sealed) {
    return {
      enabled: false,
      reason: "PROVIDER_NOT_CONFIGURED",
      provider: PROVIDER,
      policyEnabled,
      credentialStored: false,
      providerConfigured: false,
    }
  }
  try {
    if (externalAiSealKeyFingerprint() !== sealed.sealKeyFingerprint) {
      throw new Error("seal key mismatch")
    }
    return {
      enabled: true,
      reason: null,
      provider: PROVIDER,
      policyEnabled,
      credentialStored: true,
      providerConfigured: true,
    }
  } catch {
    return {
      enabled: false,
      reason: "PROVIDER_NOT_CONFIGURED",
      provider: PROVIDER,
      policyEnabled,
      credentialStored: true,
      providerConfigured: false,
    }
  }
}

export async function externalAiCapabilityState(
  db: Database = prisma,
): Promise<ExternalAiCapabilityState> {
  if (!isHospitalDeployment()) {
    const configured = Boolean(process.env.MISTRAL_API_KEY)
    return {
      enabled: configured,
      reason: configured ? null : "PROVIDER_NOT_CONFIGURED",
      provider: PROVIDER,
      policyEnabled: true,
      credentialStored: configured,
      providerConfigured: configured,
    }
  }
  return stateFromPolicy(await storedExternalAiPolicy(db))
}

/**
 * Recheck and open immediately before provider egress. Route handlers call
 * externalAiCapabilityState before reading clinical input, then call this
 * after validation so plaintext exists only for the provider request.
 * Hospital mode never falls back to MISTRAL_API_KEY.
 */
export async function externalAiProviderAccess(
  db: Database = prisma,
): Promise<ExternalAiProviderAccess> {
  if (!isHospitalDeployment()) {
    const apiKey = process.env.MISTRAL_API_KEY
    return apiKey
      ? { enabled: true, provider: PROVIDER, apiKey }
      : { enabled: false, provider: PROVIDER, reason: "PROVIDER_NOT_CONFIGURED" }
  }
  const policy = await storedExternalAiPolicy(db)
  if (!(policy?.externalAiEnabled ?? configuredExternalAiDefault())) {
    return { enabled: false, provider: PROVIDER, reason: "DISABLED_BY_DEPLOYMENT" }
  }
  const sealed = policy ? completeSealedCredential(policy) : null
  if (!sealed) {
    return { enabled: false, provider: PROVIDER, reason: "PROVIDER_NOT_CONFIGURED" }
  }
  try {
    const key = readExternalAiSealKey()
    if (externalAiSealKeyFingerprintForKey(key) !== sealed.sealKeyFingerprint) {
      throw new ExternalAiPolicyError("EXTERNAL_AI_CREDENTIAL_UNREADABLE")
    }
    return {
      enabled: true,
      provider: PROVIDER,
      apiKey: openExternalAiCredential(sealed, key),
    }
  } catch {
    return { enabled: false, provider: PROVIDER, reason: "PROVIDER_NOT_CONFIGURED" }
  }
}

export async function externalAiControlView(db: Database = prisma) {
  const policy = await storedExternalAiPolicy(db)
  const state = isHospitalDeployment()
    ? stateFromPolicy(policy)
    : await externalAiCapabilityState(db)
  return {
    externalAiEnabled: state.policyEnabled,
    provider: state.provider,
    credentialStored: state.credentialStored,
    providerConfigured: state.providerConfigured,
    capability: state.enabled ? "ENABLED" as const : state.reason,
    credentialConfiguredAt: policy?.credentialConfiguredAt?.toISOString() ?? null,
    credentialChangedAt: policy?.credentialChangedAt?.toISOString() ?? null,
    policyChangedAt: policy?.policyChangedAt?.toISOString() ?? null,
    updatedAt: policy?.updatedAt?.toISOString() ?? null,
  }
}
