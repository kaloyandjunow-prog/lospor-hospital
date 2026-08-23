import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
import { authenticationRateLimitKey, parseAuthenticationRequest } from "./authentication-identity"

const originalMode = process.env.LOSPOR_DEPLOYMENT_MODE
const originalAdministration = process.env.LOSPOR_ACCOUNT_ADMINISTRATION_ENABLED

afterEach(() => {
  if (originalMode === undefined) delete process.env.LOSPOR_DEPLOYMENT_MODE
  else process.env.LOSPOR_DEPLOYMENT_MODE = originalMode
  if (originalAdministration === undefined) delete process.env.LOSPOR_ACCOUNT_ADMINISTRATION_ENABLED
  else process.env.LOSPOR_ACCOUNT_ADMINISTRATION_ENABLED = originalAdministration
})

describe("deployment-aware authentication identity", () => {
  it("preserves the public email-only contract", () => {
    delete process.env.LOSPOR_DEPLOYMENT_MODE
    delete process.env.LOSPOR_ACCOUNT_ADMINISTRATION_ENABLED
    expect(parseAuthenticationRequest({ email: " Doctor@Example.TEST ", password: "secret" })).toEqual({
      identifier: { kind: "EMAIL", canonical: "doctor@example.test" },
      password: "secret",
    })
    expect(parseAuthenticationRequest({ username: "Doctor", password: "secret" })).toBeNull()
  })

  it("accepts only a strict canonical username in complete Hospital mode", () => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    process.env.LOSPOR_ACCOUNT_ADMINISTRATION_ENABLED = "true"
    expect(parseAuthenticationRequest({ username: "Clinician.One", password: "secret" })).toEqual({
      identifier: { kind: "USERNAME", canonical: "clinician.one" },
      password: "secret",
    })
    expect(parseAuthenticationRequest({ email: "contact@example.test", password: "secret" })).toBeNull()
    expect(parseAuthenticationRequest({ username: " Clinician.One ", password: "secret" })).toBeNull()
    expect(parseAuthenticationRequest({ username: "C/linician", password: "secret" })).toBeNull()
    expect(parseAuthenticationRequest({ username: "Клиницист", password: "secret" })).toBeNull()
  })

  it("fails closed for partial Hospital configuration", () => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    delete process.env.LOSPOR_ACCOUNT_ADMINISTRATION_ENABLED
    expect(parseAuthenticationRequest({ email: "doctor@example.test", password: "secret" })).toBeNull()
    expect(parseAuthenticationRequest({ username: "Doctor", password: "secret" })).toBeNull()
  })

  it("hashes and domain-separates rate-limit identities", () => {
    delete process.env.LOSPOR_DEPLOYMENT_MODE
    const publicKey = authenticationRateLimitKey({ kind: "EMAIL", canonical: "doctor@example.test" })
    expect(publicKey).toMatch(/^login-identity:v1:[0-9a-f]{64}$/)
    expect(publicKey).not.toContain("doctor")
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    process.env.LOSPOR_ACCOUNT_ADMINISTRATION_ENABLED = "true"
    const hospitalKey = authenticationRateLimitKey({ kind: "USERNAME", canonical: "doctor" })
    expect(hospitalKey).not.toBe(publicKey)
    expect(hospitalKey).not.toContain("doctor")
  })
})
