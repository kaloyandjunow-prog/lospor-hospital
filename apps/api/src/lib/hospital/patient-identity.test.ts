import { createCipheriv, randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  caseExportPseudonym,
  decryptPatientIdentifier,
  encryptPatientIdentifier,
  maskPatientIdentifier,
  normalizePatientIdentifier,
  patientExportPseudonym,
  patientIdentifierHash,
} from "./patient-identity"

const identityKey = randomBytes(32).toString("base64")
const pseudonymKey = randomBytes(32).toString("base64")

/**
 * A version 1 ciphertext: AES-256-GCM with no additional authenticated data,
 * exactly as rows already on an appliance were written. Reproduced here rather
 * than kept as a code path, so nothing can accidentally write one again.
 */
function legacyEncrypt(value: string, keyBase64: string) {
  const nonce = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyBase64, "base64"), nonce)
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  }
}

describe("hospital patient identity", () => {
  it("normalizes equivalent identifiers without removing leading zeroes", () => {
    expect(normalizePatientIdentifier("  00 ab  12 ")).toBe("00 AB 12")
    expect(normalizePatientIdentifier("００ab")).toBe("00AB")
  })

  it("links equal identifiers only inside the same institution", () => {
    const normalized = normalizePatientIdentifier("000123-A")
    expect(patientIdentifierHash("hospital-a", normalized, identityKey))
      .toBe(patientIdentifierHash("hospital-a", "000123-A", identityKey))
    expect(patientIdentifierHash("hospital-a", normalized, identityKey))
      .not.toBe(patientIdentifierHash("hospital-b", normalized, identityKey))
  })

  const binding = { institutionId: "hospital-a", identifierHash: "hash-a" }

  it("encrypts identifiers with authenticated encryption", () => {
    const encrypted = encryptPatientIdentifier("000123-A", binding, identityKey)
    expect(encrypted.ciphertext).not.toContain("000123-A")
    expect(decryptPatientIdentifier(encrypted, { binding }, identityKey)).toBe("000123-A")
    expect(() => decryptPatientIdentifier(
      { ...encrypted, authTag: randomBytes(16).toString("base64") },
      { binding },
      identityKey,
    )).toThrow()
  })

  it("refuses a ciphertext moved onto another institution's link", () => {
    // GCM authenticates the ciphertext but not where it is stored, so without
    // this binding one row's encrypted identifier could be copied onto another
    // institution's row and would decrypt cleanly under the wrong identity.
    const encrypted = encryptPatientIdentifier("000123-A", binding, identityKey)
    expect(() => decryptPatientIdentifier(
      encrypted,
      { binding: { ...binding, institutionId: "hospital-b" } },
      identityKey,
    )).toThrow()
    expect(() => decryptPatientIdentifier(
      encrypted,
      { binding: { ...binding, identifierHash: "hash-b" } },
      identityKey,
    )).toThrow()
  })

  it("still reads rows written before the binding existed", () => {
    // Re-encrypting them would mean decrypting every patient identifier on the
    // appliance in order to write it back, which is a larger exposure than the
    // one the binding closes. Old rows keep keyVersion 1 and keep working.
    const legacy = legacyEncrypt("000123-A", identityKey)
    expect(decryptPatientIdentifier(legacy, { keyVersion: 1 }, identityKey))
      .toBe("000123-A")
  })

  it("will not read a bound row without being told the binding", () => {
    const encrypted = encryptPatientIdentifier("000123-A", binding, identityKey)
    expect(() => decryptPatientIdentifier(encrypted, { keyVersion: 2 }, identityKey))
      .toThrow(/binding is required/)
  })

  it("uses separate stable person and case pseudonym namespaces", () => {
    const person = patientExportPseudonym("hospital-a", "hash", pseudonymKey)
    expect(person).toHaveLength(64)
    expect(person).not.toBe(caseExportPseudonym("hospital-a", "hash", pseudonymKey))
  })

  it("returns a useful masked reference", () => {
    expect(maskPatientIdentifier("00012345")).toBe("00****45")
  })
})
