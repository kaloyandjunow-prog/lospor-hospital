import { describe, expect, it } from "vitest"
import {
  isValidHospitalUsername,
  loginRequestIdentifier,
} from "./login-identifier"

describe("login identifiers", () => {
  it.each([
    "abc",
    "Ivan.Petrov",
    "a_b-c.123",
    `A${"z".repeat(63)}`,
  ])("accepts a valid Hospital username: %s", username => {
    expect(isValidHospitalUsername(username)).toBe(true)
  })

  it.each([
    "ab",
    `A${"z".repeat(64)}`,
    "1doctor",
    ".doctor",
    "доктор",
    "doctor name",
    "doctor@example",
    "doctor/path",
    "doctor\\path",
    "doctor\nname",
    "doctor\u0000name",
  ])("rejects a disallowed Hospital username: %j", username => {
    expect(isValidHospitalUsername(username)).toBe(false)
  })

  it("preserves username case and emits no email fallback", () => {
    expect(loginRequestIdentifier({
      loginIdentifier: "USERNAME",
      value: "Ivan.Petrov",
    })).toEqual({ username: "Ivan.Petrov" })
  })

  it("retains the public email normalization contract", () => {
    expect(loginRequestIdentifier({
      loginIdentifier: "EMAIL",
      value: " Doctor@Example.COM ",
    })).toEqual({ email: "doctor@example.com" })
  })
})
