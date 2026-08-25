import { describe, expect, it } from "vitest"
import {
  apiErrorCode,
  loginErrorKey,
  passwordResetErrorKey,
  registrationErrorKey,
} from "./public-api-errors"

describe("localized public API error mapping", () => {
  it("reads flat and nested stable codes without exposing server prose", () => {
    expect(apiErrorCode({ code: "CLINICAL_APP_FORBIDDEN" })).toBe("CLINICAL_APP_FORBIDDEN")
    expect(apiErrorCode({ error: { code: "EMAIL_NOT_VERIFIED", message: "raw" } })).toBe("EMAIL_NOT_VERIFIED")
  })

  it("handles the clinical-app boundary explicitly", () => {
    expect(loginErrorKey(403, { code: "CLINICAL_APP_FORBIDDEN" }))
      .toBe("auth.clinicalAppForbidden")
  })

  it("maps status fallbacks to shipped message keys", () => {
    expect(loginErrorKey(429, {})).toBe("auth.rateLimited")
    expect(registrationErrorKey(409, {})).toBe("auth.emailRegistered")
    expect(passwordResetErrorKey(500, { error: "internal details" }))
      .toBe("auth.passwordResetFailed")
  })

  it("does not expose legal-manifest mismatch details", () => {
    expect(registrationErrorKey(422, {
      code: "LEGAL_ACCEPTANCE_MISMATCH",
      details: { activeHash: "internal" },
    })).toBe("auth.legalDocumentsUnavailable")
  })
})
