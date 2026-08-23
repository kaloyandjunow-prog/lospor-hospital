import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("Hospital authentication entrypoint inventory", () => {
  it.each([
    "src/app/v1/auth/session/route.ts",
    "src/app/v1/auth/token/route.ts",
  ])("routes %s through the deployment-selected identity parser", path => {
    const route = source(path)
    expect(route).toContain("parseAuthenticationRequest")
    expect(route).toContain("authenticationRateLimitKey")
    expect(route).toContain("AUTHENTICATION_DEPLOYMENT_UNAVAILABLE")
    expect(route).not.toContain("normalizeEmail")
    expect(route).not.toContain("emailSchema")
  })

  it("looks up usernameCanonical and rejects Hospital contact-email fallback", () => {
    const credentials = source("src/lib/credentials.ts")
    expect(credentials).toContain("{ usernameCanonical: identifier.canonical }")
    expect(credentials).toContain('identifier.kind === "EMAIL" && user.usernameCanonical !== null')
    expect(credentials).toContain('identifier.kind === "EMAIL" ? !user.emailVerifiedAt : !user.activatedAt')
  })

  it.each([
    "src/app/v1/auth/register/route.ts",
    "src/app/v1/auth/password-reset/request/route.ts",
    "src/app/v1/auth/verify-email/resend/route.ts",
  ])("keeps the email workflow %s gated off in Hospital mode", path => {
    const route = source(path)
    expect(route).toContain("isHospitalDeployment")
  })

  it("preserves bearer logout revocation and password-epoch validation", () => {
    expect(source("src/app/v1/auth/logout/route.ts")).toContain("revokeToken")
    expect(source("src/app/v1/auth/session/route.ts")).toContain("revokeToken")
    expect(source("src/lib/mobile-auth.ts")).toContain("resolveAccount")
  })

  it("keeps pending-state checks identifier-free", () => {
    const pending = source("src/app/v1/auth/check-pending/route.ts")
    expect(pending).not.toContain("emailSchema")
    expect(pending).not.toContain("usernameCanonical")
  })
})
