import { describe, expect, it } from "vitest"
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  matchingTotpStep,
  normalizeRecoveryCode,
  recoveryCodeHash,
  totpCode,
  totpUri,
} from "./mfa.js"

describe("Status RFC 6238 and recovery primitives", () => {
  it("matches the RFC 6238 SHA-1 test secret at known timestamps", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
    expect(totpCode(secret, 59_000)).toBe("287082")
    expect(totpCode(secret, 1_111_111_109_000)).toBe("081804")
    expect(matchingTotpStep(secret, "287082", 59_000)).toBe(1)
    expect(matchingTotpStep(secret, "000000", 59_000)).toBeNull()
  })

  it("encrypts the seed with generation-bound AES-256-GCM", () => {
    const key = Buffer.alloc(32, 7)
    const ciphertext = encryptTotpSecret("GEZDGNBVGY3TQOJQ", key, 4)
    expect(ciphertext).not.toContain("GEZDGNBVGY3TQOJQ")
    expect(decryptTotpSecret(ciphertext, key, 4)).toBe("GEZDGNBVGY3TQOJQ")
    expect(() => decryptTotpSecret(ciphertext, Buffer.alloc(32, 8), 4)).toThrow()
    expect(() => decryptTotpSecret(ciphertext, key, 5)).toThrow()
  })

  it("creates exactly ten unique human-readable recovery codes and stable bound hashes", () => {
    const codes = generateRecoveryCodes()
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    expect(codes.every(code => /^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){3}$/.test(code))).toBe(true)
    const normalized = normalizeRecoveryCode(codes[0]!.toLowerCase().replaceAll("-", " "))
    expect(normalized).toBe(codes[0]!.replaceAll("-", ""))
    expect(recoveryCodeHash(3, "Admin@Hospital.test", codes[0]!)).toBe(
      recoveryCodeHash(3, "admin@hospital.test", normalized!),
    )
    expect(recoveryCodeHash(4, "admin@hospital.test", codes[0]!)).not.toBe(
      recoveryCodeHash(3, "admin@hospital.test", codes[0]!),
    )
  })

  it("builds a standards-compatible otpauth URI without translating its protocol fields", () => {
    const uri = new URL(totpUri("admin@hospital.test", "GEZDGNBVGY3TQOJQ"))
    expect(uri.protocol).toBe("otpauth:")
    expect(uri.hostname).toBe("totp")
    expect(uri.searchParams.get("issuer")).toBe("LOSPOR Hospital")
    expect(uri.searchParams.get("algorithm")).toBe("SHA1")
    expect(uri.searchParams.get("digits")).toBe("6")
    expect(uri.searchParams.get("period")).toBe("30")
  })
})
