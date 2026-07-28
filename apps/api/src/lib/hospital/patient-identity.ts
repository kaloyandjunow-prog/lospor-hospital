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

export function patientIdentifierHash(
  institutionId: string,
  normalizedIdentifier: string,
  keyBase64 = process.env.HOSPITAL_PATIENT_HMAC_KEY,
): string {
  const key = keyFromBase64("HOSPITAL_PATIENT_HMAC_KEY", keyBase64)
  return createHmac("sha256", key)
    .update(institutionId)
    .update("\0")
    .update(normalizedIdentifier)
    .digest("hex")
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

export function encryptPatientIdentifier(
  normalizedIdentifier: string,
  keyBase64 = process.env.HOSPITAL_PATIENT_ENCRYPTION_KEY,
): EncryptedPatientIdentifier {
  const key = keyFromBase64("HOSPITAL_PATIENT_ENCRYPTION_KEY", keyBase64)
  const nonce = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, nonce)
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
  keyBase64 = process.env.HOSPITAL_PATIENT_ENCRYPTION_KEY,
): string {
  const key = keyFromBase64("HOSPITAL_PATIENT_ENCRYPTION_KEY", keyBase64)
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(encrypted.nonce, "base64"),
  )
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"))
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8")
}

