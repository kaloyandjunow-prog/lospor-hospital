import "server-only"

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"
import { readFileSync } from "node:fs"
import type { EhrImportTransport, Prisma, PrismaClient } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { isHospitalDeployment } from "./deployment"

const SEAL_KEY_BYTES = 32
const NONCE_BYTES = 12
const AUTH_TAG_BYTES = 16
/** Only these two transports reach outside the appliance; FOLDER needs no secret. */
/**
 * Which transports need a credential sealed for them.
 *
 * Folder drop reaches a mounted volume and has nothing to authenticate to.
 * HL7 v2 is not here because it is not implemented: the enum value survives so
 * a stored policy from a future release reads back, but nothing accepts it as
 * an input.
 */
function isCredentialedTransport(transport: EhrImportTransport): transport is "FHIR" {
  return transport === "FHIR"
}

export const EHR_TRANSPORT_CREDENTIAL_KEY_VERSION = 1

type Database = PrismaClient | Prisma.TransactionClient

export type SealedEhrTransportCredential = {
  ciphertext: string
  nonce: string
  authTag: string
  keyVersion: number
  sealKeyFingerprint: string
}

export type EhrTransportUnavailableReason =
  | "DISABLED_BY_DEPLOYMENT"
  | "CREDENTIAL_NOT_CONFIGURED"
  /**
   * A credential is stored but nobody has said where to send. Its own reason
   * rather than a flavour of the one above: an operator who sees "credential
   * not configured" goes and re-enters a password that was never the problem.
   */
  | "ENDPOINT_NOT_CONFIGURED"

export type EhrTransportCapabilityState = {
  enabled: boolean
  reason: EhrTransportUnavailableReason | null
  transport: EhrImportTransport | null
  policyEnabled: boolean
  credentialStored: boolean
  providerConfigured: boolean
}

export type EhrTransportAccess =
  | { enabled: true; transport: "FOLDER" }
  | {
      enabled: true
      transport: "FHIR"
      /** The static token, or the client secret when authMode is OAuth2. */
      credential: string
      endpoint: string | null
      authMode: "STATIC_BEARER" | "OAUTH2_CLIENT_CREDENTIALS"
      tokenUrl: string | null
      clientId: string | null
      scope: string | null
      /**
       * Which numbering this hospital's record numbers live in.
       *
       * Null until a site says. A patient search on value alone can return one
       * clean match belonging to a different numbering, and without this there
       * is nothing to check that against.
       */
      recordNumberSystem: string | null
      /**
       * Which system this hospital's ЕГН values live in, when it holds them.
       * Outbound only: it labels the patient on a delivered record so the
       * receiving system can match it.
       */
      nationalIdentifierSystem: string | null
    }
  | { enabled: false; transport: EhrImportTransport | null; reason: EhrTransportUnavailableReason }

export class EhrTransportPolicyError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = "EhrTransportPolicyError"
  }
}

function sealKeyFile(path = process.env.HOSPITAL_EHR_TRANSPORT_SEAL_KEY_FILE): string {
  if (!path?.trim()) {
    throw new EhrTransportPolicyError("EHR_TRANSPORT_SEAL_KEY_UNAVAILABLE")
  }
  return path
}

/**
 * The file contains canonical base64 for exactly 32 random bytes, the same
 * strict representation external-ai-policy.ts uses -- it keeps fingerprints
 * stable across install, backup and restore and rejects a truncated or
 * accidentally replaced secret early. A dedicated file, not the external-AI
 * seal key: the two credential domains are unrelated, and sharing a key
 * would mean a single leaked file compromises both.
 */
export function readEhrTransportSealKey(
  path = process.env.HOSPITAL_EHR_TRANSPORT_SEAL_KEY_FILE,
): Buffer {
  let encoded: string
  try {
    encoded = readFileSync(sealKeyFile(path), "utf8").trim()
  } catch (error) {
    if (error instanceof EhrTransportPolicyError) throw error
    throw new EhrTransportPolicyError("EHR_TRANSPORT_SEAL_KEY_UNAVAILABLE")
  }
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
    throw new EhrTransportPolicyError("EHR_TRANSPORT_SEAL_KEY_INVALID")
  }
  const key = Buffer.from(encoded, "base64")
  if (key.length !== SEAL_KEY_BYTES || key.toString("base64") !== encoded) {
    throw new EhrTransportPolicyError("EHR_TRANSPORT_SEAL_KEY_INVALID")
  }
  return key
}

/** Non-secret restore compatibility evidence; the bytes themselves never leave the API. */
export function ehrTransportSealKeyFingerprint(
  path = process.env.HOSPITAL_EHR_TRANSPORT_SEAL_KEY_FILE,
): string {
  return ehrTransportSealKeyFingerprintForKey(readEhrTransportSealKey(path))
}

export function ehrTransportSealKeyFingerprintForKey(key: Buffer): string {
  if (key.length !== SEAL_KEY_BYTES) {
    throw new EhrTransportPolicyError("EHR_TRANSPORT_SEAL_KEY_INVALID")
  }
  return `sha256:${createHash("sha256").update(key).digest("hex")}`
}

/**
 * AAD binds the ciphertext to the transport it was sealed for, on top of
 * binding to the singleton row the way external-ai-policy.ts's AAD does. A
 * site that switches from FHIR to HL7v2 must reseal rather than have the old
 * ciphertext silently reinterpreted under the new transport's credential
 * shape.
 */
function credentialAad(transport: "FHIR"): Buffer {
  return Buffer.from(`local\0${transport}\0v1`, "utf8")
}

export function sealEhrTransportCredential(
  transport: "FHIR",
  credential: string,
  key = readEhrTransportSealKey(),
): SealedEhrTransportCredential {
  if (!credential) throw new EhrTransportPolicyError("EHR_TRANSPORT_CREDENTIAL_REQUIRED")
  if (key.length !== SEAL_KEY_BYTES) {
    throw new EhrTransportPolicyError("EHR_TRANSPORT_SEAL_KEY_INVALID")
  }
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv("aes-256-gcm", key, nonce)
  cipher.setAAD(credentialAad(transport))
  const ciphertext = Buffer.concat([
    cipher.update(credential, "utf8"),
    cipher.final(),
  ])
  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: EHR_TRANSPORT_CREDENTIAL_KEY_VERSION,
    sealKeyFingerprint: ehrTransportSealKeyFingerprintForKey(key),
  }
}

export function openEhrTransportCredential(
  transport: "FHIR",
  sealed: SealedEhrTransportCredential,
  key = readEhrTransportSealKey(),
): string {
  if (sealed.keyVersion !== EHR_TRANSPORT_CREDENTIAL_KEY_VERSION) {
    throw new EhrTransportPolicyError("EHR_TRANSPORT_CREDENTIAL_UNREADABLE")
  }
  try {
    const nonce = Buffer.from(sealed.nonce, "base64")
    const authTag = Buffer.from(sealed.authTag, "base64")
    if (key.length !== SEAL_KEY_BYTES || nonce.length !== NONCE_BYTES
      || authTag.length !== AUTH_TAG_BYTES) {
      throw new Error("invalid sealed tuple")
    }
    const decipher = createDecipheriv("aes-256-gcm", key, nonce)
    decipher.setAAD(credentialAad(transport))
    decipher.setAuthTag(authTag)
    const credential = Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8")
    if (!credential) throw new Error("empty credential")
    return credential
  } catch {
    throw new EhrTransportPolicyError("EHR_TRANSPORT_CREDENTIAL_UNREADABLE")
  }
}

type StoredPolicy = Awaited<ReturnType<typeof storedEhrTransportPolicy>>

function completeSealedCredential(policy: NonNullable<StoredPolicy>): SealedEhrTransportCredential | null {
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

export function storedEhrTransportPolicy(db: Database = prisma) {
  return db.hospitalEhrTransportPolicy.findUnique({ where: { id: "local" } })
}

function stateFromPolicy(policy: StoredPolicy): EhrTransportCapabilityState {
  const transport = policy?.transport ?? null
  const policyEnabled = transport !== null
  if (!policyEnabled) {
    return {
      enabled: false,
      reason: "DISABLED_BY_DEPLOYMENT",
      transport: null,
      policyEnabled: false,
      credentialStored: false,
      providerConfigured: false,
    }
  }
  // A watched directory has no secret: a FOLDER site is fully configured the
  // moment the transport is chosen. Reporting it as "credential missing"
  // would make every air-gapped site that will never touch FHIR or HL7v2
  // look permanently broken.
  if (!isCredentialedTransport(transport)) {
    return {
      enabled: true,
      reason: null,
      transport,
      policyEnabled: true,
      credentialStored: false,
      providerConfigured: true,
    }
  }
  const sealed = policy ? completeSealedCredential(policy) : null
  if (!sealed) {
    return {
      enabled: false,
      reason: "CREDENTIAL_NOT_CONFIGURED",
      transport,
      policyEnabled: true,
      credentialStored: false,
      providerConfigured: false,
    }
  }
  try {
    if (ehrTransportSealKeyFingerprint() !== sealed.sealKeyFingerprint) {
      throw new Error("seal key mismatch")
    }
    // A credential proves who we are, not where to send. Reporting this
    // configuration as working let the delivery worker claim a queued message
    // and permanently fail it for having no endpoint -- and nothing revives a
    // FAILED delivery, so the record was destroyed rather than held. Saying
    // "not configured" here is what keeps the message in the queue until an
    // operator fills the field in.
    if (transport === "FHIR" && !policy?.endpoint?.trim()) {
      return {
        enabled: false,
        reason: "ENDPOINT_NOT_CONFIGURED",
        transport,
        policyEnabled: true,
        credentialStored: true,
        providerConfigured: false,
      }
    }
    return {
      enabled: true,
      reason: null,
      transport,
      policyEnabled: true,
      credentialStored: true,
      providerConfigured: true,
    }
  } catch {
    return {
      enabled: false,
      reason: "CREDENTIAL_NOT_CONFIGURED",
      transport,
      policyEnabled: true,
      credentialStored: true,
      providerConfigured: false,
    }
  }
}

export async function ehrTransportCapabilityState(
  db: Database = prisma,
): Promise<EhrTransportCapabilityState> {
  // EHR import is a Hospital-only clinical adapter; the public/serverless
  // demo has no hospital system to receive proposed values from.
  if (!isHospitalDeployment()) {
    return {
      enabled: false,
      reason: "DISABLED_BY_DEPLOYMENT",
      transport: null,
      policyEnabled: false,
      credentialStored: false,
      providerConfigured: false,
    }
  }
  return stateFromPolicy(await storedEhrTransportPolicy(db))
}

/**
 * Recheck and open immediately before transport egress. Callers read
 * ehrTransportCapabilityState before accepting or processing a message, then
 * call this right before the outbound FHIR/HL7v2 call (or the FOLDER poll)
 * so plaintext exists only for that one operation.
 */
export async function ehrTransportAccess(db: Database = prisma): Promise<EhrTransportAccess> {
  if (!isHospitalDeployment()) {
    return { enabled: false, transport: null, reason: "DISABLED_BY_DEPLOYMENT" }
  }
  const policy = await storedEhrTransportPolicy(db)
  const transport = policy?.transport ?? null
  if (!transport) {
    return { enabled: false, transport: null, reason: "DISABLED_BY_DEPLOYMENT" }
  }
  if (!isCredentialedTransport(transport)) {
    return { enabled: true, transport: "FOLDER" }
  }
  const sealed = policy ? completeSealedCredential(policy) : null
  if (!sealed) {
    return { enabled: false, transport, reason: "CREDENTIAL_NOT_CONFIGURED" }
  }
  try {
    const key = readEhrTransportSealKey()
    if (ehrTransportSealKeyFingerprintForKey(key) !== sealed.sealKeyFingerprint) {
      throw new EhrTransportPolicyError("EHR_TRANSPORT_CREDENTIAL_UNREADABLE")
    }
    // A credential says who we are; it does not say where to send. This is the
    // check the delivery worker relies on -- without it the worker claimed a
    // queued message, found no endpoint, and failed it permanently, which means
    // destroyed: nothing revives a FAILED delivery, and re-finalising the same
    // case will not re-queue one. Refusing here keeps the message in the queue
    // until an operator configures the address.
    //
    // After the seal key check, not before: a credential that cannot be opened
    // is the more serious condition, and an operator told "no endpoint" would
    // configure one and still be unable to send.
    if (transport === "FHIR" && !policy?.endpoint?.trim()) {
      return { enabled: false, transport, reason: "ENDPOINT_NOT_CONFIGURED" }
    }
    return {
      enabled: true,
      transport,
      credential: openEhrTransportCredential(transport, sealed, key),
      // Read in the clear beside the sealed credential: an operator has to be
      // able to see where clinical data goes, and how this appliance presents
      // itself, without unsealing anything.
      endpoint: policy?.endpoint ?? null,
      authMode: (policy?.authMode ?? "STATIC_BEARER") as "STATIC_BEARER" | "OAUTH2_CLIENT_CREDENTIALS",
      tokenUrl: policy?.tokenUrl ?? null,
      clientId: policy?.clientId ?? null,
      scope: policy?.scope ?? null,
      recordNumberSystem: policy?.recordNumberSystem ?? null,
      nationalIdentifierSystem: policy?.nationalIdentifierSystem ?? null,
    }
  } catch {
    return { enabled: false, transport, reason: "CREDENTIAL_NOT_CONFIGURED" }
  }
}

export async function ehrTransportControlView(db: Database = prisma) {
  const policy = await storedEhrTransportPolicy(db)
  const state = isHospitalDeployment()
    ? stateFromPolicy(policy)
    : await ehrTransportCapabilityState(db)
  return {
    transport: state.transport,
    policyEnabled: state.policyEnabled,
    credentialStored: state.credentialStored,
    providerConfigured: state.providerConfigured,
    capability: state.enabled ? "ENABLED" as const : state.reason,
    // Shown, not sealed. "Which server is this appliance sending clinical data
    // to, and how does it present itself" is the first thing anyone reviewing
    // an integration asks, and it should not take the seal key to answer.
    endpoint: policy?.endpoint ?? null,
    authMode: policy?.authMode ?? "STATIC_BEARER",
    tokenUrl: policy?.tokenUrl ?? null,
    clientId: policy?.clientId ?? null,
    scope: policy?.scope ?? null,
    // Which numbering the record number lives in. Null reads as a question
    // still open rather than a setting left at its default: until it is
    // answered every imported identity is accepted unverified, and the screen
    // should say so.
    recordNumberSystem: policy?.recordNumberSystem ?? null,
    recordNumberSystemChangedAt: policy?.recordNumberSystemChangedAt?.toISOString() ?? null,
    // The ЕГН numbering, separately configured because it is separately true:
    // a hospital's admission numbering and the national register are different
    // things, and a site may hold one and not the other. Null leaves ЕГН
    // matches unverified and outgoing records labelled with LOSPOR's own OID.
    nationalIdentifierSystem: policy?.nationalIdentifierSystem ?? null,
    nationalIdentifierSystemChangedAt: policy?.nationalIdentifierSystemChangedAt?.toISOString() ?? null,
    endpointChangedAt: policy?.endpointChangedAt?.toISOString() ?? null,
    credentialConfiguredAt: policy?.credentialConfiguredAt?.toISOString() ?? null,
    credentialChangedAt: policy?.credentialChangedAt?.toISOString() ?? null,
    transportChangedAt: policy?.transportChangedAt?.toISOString() ?? null,
    updatedAt: policy?.updatedAt?.toISOString() ?? null,
  }
}
