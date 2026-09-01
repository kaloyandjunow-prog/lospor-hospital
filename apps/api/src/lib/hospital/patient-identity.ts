import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto"

const KEY_BYTES = 32

export type EncryptedPatientIdentifier = {
  ciphertext: string
  nonce: string
  authTag: string
}

function keyFromBase64(name: string, value: string | undefined): Buffer {
  if (!value) throw new Error(`${name} is required`)
  const key = Buffer.from(value, "base64")
  if (key.length !== KEY_BYTES) {
    throw new Error(`${name} must be a base64-encoded ${KEY_BYTES}-byte key`)
  }
  return key
}

export function normalizePatientIdentifier(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleUpperCase("bg")
}

export function maskPatientIdentifier(value: string): string {
  const normalized = normalizePatientIdentifier(value)
  if (normalized.length <= 2) return "*".repeat(normalized.length)
  if (normalized.length <= 4) {
    return `${normalized[0]}${"*".repeat(normalized.length - 2)}${normalized.at(-1)}`
  }
  return `${normalized.slice(0, 2)}${"*".repeat(Math.min(8, normalized.length - 4))}${normalized.slice(-2)}`
}

/** The numbering space an identifier belongs to. */
export type PatientIdentifierTypeName = "IZ" | "EGN"

/**
 * Version 1 hashed institution and identifier only.
 *
 * A record number and a national identifier can be the same digits, and under
 * version 1 they produce the same digest — two different patients arriving at
 * one row. Version 2 mixes the type in so the two spaces cannot meet.
 *
 * Rows written under version 1 keep it. Rehashing them would mean decrypting
 * every stored patient identifier on the appliance in order to write it back,
 * which is a larger exposure than the collision it closes — the same reasoning
 * that left PATIENT_IDENTIFIER_KEY_VERSION 1 rows alone. The lookup carries a
 * legacy path for them instead, and it only ever applies to record numbers,
 * since ЕГН has never been storable.
 */
export const PATIENT_IDENTIFIER_HASH_VERSION = 2

export function patientIdentifierHash(
  institutionId: string,
  normalizedIdentifier: string,
  options: { identifierType?: PatientIdentifierTypeName; hashVersion?: number } = {},
  keyBase64 = process.env.HOSPITAL_PATIENT_HMAC_KEY,
): string {
  const key = keyFromBase64("HOSPITAL_PATIENT_HMAC_KEY", keyBase64)
  const hashVersion = options.hashVersion ?? PATIENT_IDENTIFIER_HASH_VERSION
  const hmac = createHmac("sha256", key).update(institutionId).update("\0")
  if (hashVersion >= PATIENT_IDENTIFIER_HASH_VERSION) {
    hmac.update(options.identifierType ?? "IZ").update("\0")
  }
  return hmac.update(normalizedIdentifier).digest("hex")
}

export function patientExportPseudonym(
  institutionId: string,
  identifierHash: string,
  keyBase64 = process.env.HOSPITAL_EXPORT_PSEUDONYM_KEY,
): string {
  const key = keyFromBase64("HOSPITAL_EXPORT_PSEUDONYM_KEY", keyBase64)
  return createHmac("sha256", key)
    .update("person")
    .update("\0")
    .update(institutionId)
    .update("\0")
    .update(identifierHash)
    .digest("hex")
}

export function caseExportPseudonym(
  institutionId: string,
  caseId: string,
  keyBase64 = process.env.HOSPITAL_EXPORT_PSEUDONYM_KEY,
): string {
  const key = keyFromBase64("HOSPITAL_EXPORT_PSEUDONYM_KEY", keyBase64)
  return createHmac("sha256", key)
    .update("case")
    .update("\0")
    .update(institutionId)
    .update("\0")
    .update(caseId)
    .digest("hex")
}

/**
 * Which row a patient ciphertext belongs to.
 *
 * GCM authenticates the ciphertext but says nothing about where it is stored,
 * so one row's encrypted identifier could be copied over another institution's
 * row and would still decrypt cleanly to a real identifier under the wrong
 * identity. Binding the institution and the identifier hash as additional
 * authenticated data makes that detectable: moved ciphertext fails its tag.
 *
 * The hash is already institution-bound, being HMAC'd with institutionId, so
 * this also ties the two halves of a PatientLink row to each other.
 */
export type PatientIdentifierBinding = {
  institutionId: string
  identifierHash: string
}

/**
 * Version 1 wrote no additional authenticated data.
 *
 * Existing rows carry keyVersion 1 and have to keep decrypting, so the binding
 * applies from version 2 onward rather than by rewriting what is already
 * stored. Re-encrypting would mean decrypting every patient identifier on the
 * appliance in order to write it back, which is a larger exposure than the one
 * it closes.
 */
export const PATIENT_IDENTIFIER_KEY_VERSION = 2

function additionalData(binding: PatientIdentifierBinding): Buffer {
  return Buffer.from(`${binding.institutionId}\0${binding.identifierHash}`, "utf8")
}

export function encryptPatientIdentifier(
  normalizedIdentifier: string,
  binding: PatientIdentifierBinding,
  keyBase64 = process.env.HOSPITAL_PATIENT_ENCRYPTION_KEY,
): EncryptedPatientIdentifier {
  const key = keyFromBase64("HOSPITAL_PATIENT_ENCRYPTION_KEY", keyBase64)
  const nonce = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, nonce)
  cipher.setAAD(additionalData(binding))
  const ciphertext = Buffer.concat([
    cipher.update(normalizedIdentifier, "utf8"),
    cipher.final(),
  ])
  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  }
}

export function decryptPatientIdentifier(
  encrypted: EncryptedPatientIdentifier,
  options: { keyVersion?: number; binding?: PatientIdentifierBinding } = {},
  keyBase64 = process.env.HOSPITAL_PATIENT_ENCRYPTION_KEY,
): string {
  const key = keyFromBase64("HOSPITAL_PATIENT_ENCRYPTION_KEY", keyBase64)
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(encrypted.nonce, "base64"),
  )
  // Version 1 rows were written without a binding, and applying one on read
  // would make every one of them fail to decrypt.
  const keyVersion = options.keyVersion ?? PATIENT_IDENTIFIER_KEY_VERSION
  if (keyVersion >= PATIENT_IDENTIFIER_KEY_VERSION) {
    if (!options.binding) {
      throw new Error("Patient identifier binding is required from key version 2")
    }
    decipher.setAAD(additionalData(options.binding))
  }
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"))
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8")
}

