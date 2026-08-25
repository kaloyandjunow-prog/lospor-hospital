import { describe, expect, it } from "vitest"
import {
  administratorMfaErrorKey,
  parseAdministratorMfaChallenge,
  parseAdministratorMfaSuccess,
  safeOtpAuthUri,
} from "./administrator-mfa-client"

const token = "a".repeat(43)
const manualKey = "A234567A234567A234567A234567A234"
const otpauthUri = `otpauth://totp/LOSPOR%3Aadmin%40example.test?secret=${manualKey}&issuer=LOSPOR&algorithm=SHA1&digits=6&period=30`
const recoveryCodes = Array.from(
  { length: 10 },
  (_, index) => `${String.fromCharCode(65 + index)}A23-4567-A234-567A`,
)

describe("administrator MFA client contracts", () => {
  it("accepts an exact enrollment continuation and derives its local expiry", () => {
    expect(parseAdministratorMfaChallenge({
      code: "MFA_ENROLLMENT_REQUIRED",
      mfa: {
        code: "MFA_ENROLLMENT_REQUIRED",
        challengeToken: token,
        expiresIn: 300,
        enrollmentRequired: true,
        manualKey,
        otpauthUri,
      },
    }, 1_000)).toEqual({
      code: "MFA_ENROLLMENT_REQUIRED",
      challengeToken: token,
      expiresIn: 300,
      expiresAt: 301_000,
      enrollmentRequired: true,
      manualKey,
      otpauthUri,
    })
  })

  it("also accepts the documented continuation without a duplicate nested code", () => {
    expect(parseAdministratorMfaChallenge({
      code: "MFA_REQUIRED",
      mfa: {
        challengeToken: token,
        expiresIn: 300,
        enrollmentRequired: false,
      },
    })).toEqual(expect.objectContaining({
      code: "MFA_REQUIRED",
      challengeToken: token,
      enrollmentRequired: false,
    }))
  })

  it("fails closed on contradictory, incomplete, or unsafe challenges", () => {
    expect(parseAdministratorMfaChallenge({
      code: "MFA_REQUIRED",
      mfa: { code: "MFA_REQUIRED", challengeToken: token, expiresIn: 300, enrollmentRequired: true },
    })).toBeNull()
    expect(parseAdministratorMfaChallenge({
      code: "MFA_ENROLLMENT_REQUIRED",
      mfa: { code: "MFA_ENROLLMENT_REQUIRED", challengeToken: token, expiresIn: 300, enrollmentRequired: true },
    })).toBeNull()
    expect(safeOtpAuthUri("javascript:alert(1)")).toBeUndefined()
    expect(safeOtpAuthUri("otpauth://hotp/example?secret=A234567A234567A")).toBeUndefined()
  })

  it("requires exactly ten unique recovery codes on first enrollment", () => {
    expect(parseAdministratorMfaSuccess({ user: { id: "admin" }, recoveryCodes }, true))
      .toEqual({ user: { id: "admin" }, recoveryCodes })
    expect(parseAdministratorMfaSuccess({ user: { id: "admin" }, recoveryCodes: recoveryCodes.slice(1) }, true))
      .toBeNull()
    expect(parseAdministratorMfaSuccess({ user: { id: "admin" }, recoveryCodes }, false))
      .toBeNull()
  })

  it("maps raw API failures only to localized safe copy", () => {
    expect(administratorMfaErrorKey(401)).toBe("mfa.invalidOrExpired")
    expect(administratorMfaErrorKey(409)).toBe("mfa.challengeEnded")
    expect(administratorMfaErrorKey(429)).toBe("mfa.rateLimited")
    expect(administratorMfaErrorKey(503)).toBe("mfa.unavailable")
  })
})
