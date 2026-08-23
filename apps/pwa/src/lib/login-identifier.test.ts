import { describe, expect, it } from "vitest"
import { isValidHospitalUsername, loginRequestIdentifier } from "./login-identifier"

describe("Hospital PWA login identifier", () => {
  it.each(["Ivan.Petrov_2", "a-b", "Mixed.CASE"])("accepts %s", value => {
    expect(isValidHospitalUsername(value)).toBe(true)
  })
  it.each(["ab", "Ivan Petrov", "ivan@example", "ivan/petrov", "ivan\\petrov", "Иван", "Ａbc", "a\u0000b"])("rejects %j", value => {
    expect(isValidHospitalUsername(value)).toBe(false)
  })
  it("preserves username case and normalizes only public email", () => {
    expect(loginRequestIdentifier({ loginIdentifier: "USERNAME", value: "Ivan.Petrov" }))
      .toEqual({ username: "Ivan.Petrov" })
    expect(loginRequestIdentifier({ loginIdentifier: "EMAIL", value: " Doctor@Example.COM " }))
      .toEqual({ email: "doctor@example.com" })
  })
})
