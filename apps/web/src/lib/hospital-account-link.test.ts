import { describe, expect, it } from "vitest"
import { passwordLinkToken } from "./hospital-account-link"

describe("Hospital one-time password links", () => {
  it("reads an operator-issued token from the non-transmitted URL fragment", () => {
    expect(passwordLinkToken("", "#hospitalToken=fragment-secret"))
      .toBe("fragment-secret")
  })

  it("retains email reset query-link compatibility", () => {
    expect(passwordLinkToken("?token=email-secret", "")).toBe("email-secret")
  })

  it("prefers the Hospital fragment if both forms are present", () => {
    expect(passwordLinkToken("?token=email-secret", "#hospitalToken=hospital-secret"))
      .toBe("hospital-secret")
  })
})
