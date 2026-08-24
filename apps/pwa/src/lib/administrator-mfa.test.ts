import { describe, expect, it } from "vitest"
import {
  administratorMfaErrorKey,
  parseAdministratorMfaChallenge,
  parseAdministratorMfaCompletion,
  safeOtpAuthUri,
} from "./administrator-mfa"

const token = "a".repeat(43)
const manualKey = "A234567A234567A234567A234567A234"
const otpauthUri = `otpauth://totp/LOSPOR%3Aadmin%40example.test?secret=${manualKey}&issuer=LOSPOR&algorithm=SHA1&digits=6&period=30`
const recoveryCodes = Array.from(
  { length: 10 },
  (_, index) => `${String.fromCharCode(65 + index)}A23-4567-A234-567A`,
)

describe("administrator MFA mobile contracts", () => {
  it("accepts an exact enrollment continuation and derives local expiry", () => {
    expect(parseAdministratorMfaChallenge({
      code: "MFA_ENROLLMENT_REQUIRED",
      mfa: {
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

  it("rejects contradictory challenges and unsafe authenticator links", () => {
    expect(parseAdministratorMfaChallenge({
      code: "MFA_REQUIRED",
      mfa: { challengeToken: token, expiresIn: 300, enrollmentRequired: true },
    })).toBeNull()
    expect(safeOtpAuthUri("javascript:alert(1)")).toBeUndefined()
    expect(safeOtpAuthUri("otpauth://hotp/example?secret=A234567A234567A")).toBeUndefined()
  })

  it("validates PWA cookie and native bearer completions separately", () => {
    expect(parseAdministratorMfaCompletion({ user: { id: "admin" } }, "PWA", false))
      .toEqual({})
    expect(parseAdministratorMfaCompletion({
      access_token: "jwt",
      token_type: "Bearer",
      expires_in: 28_800,
    }, "NATIVE", false)).toEqual({ accessToken: "jwt" })
    expect(parseAdministratorMfaCompletion({ user: { id: "admin" } }, "NATIVE", false))
      .toBeNull()
  })

  it("requires exactly ten unique one-use recovery codes at enrollment", () => {
    expect(parseAdministratorMfaCompletion({
      user: { id: "admin" },
      recoveryCodes,
    }, "PWA", true)).toEqual({ recoveryCodes })
    expect(parseAdministratorMfaCompletion({
      user: { id: "admin" },
      recoveryCodes: recoveryCodes.slice(1),
    }, "PWA", true)).toBeNull()
  })

  it("maps raw failures to localized safe-copy keys", () => {
    expect(administratorMfaErrorKey(401)).toBe("mfaInvalidOrExpired")
    expect(administratorMfaErrorKey(409)).toBe("mfaChallengeEnded")
    expect(administratorMfaErrorKey(429)).toBe("mfaRateLimited")
    expect(administratorMfaErrorKey(503)).toBe("mfaUnavailable")
  })
})
