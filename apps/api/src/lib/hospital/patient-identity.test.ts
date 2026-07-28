import { randomBytes } from "node:crypto"
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

  it("encrypts identifiers with authenticated encryption", () => {
    const encrypted = encryptPatientIdentifier("000123-A", identityKey)
    expect(encrypted.ciphertext).not.toContain("000123-A")
    expect(decryptPatientIdentifier(encrypted, identityKey)).toBe("000123-A")
    expect(() => decryptPatientIdentifier(
      { ...encrypted, authTag: randomBytes(16).toString("base64") },
      identityKey,
    )).toThrow()
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
