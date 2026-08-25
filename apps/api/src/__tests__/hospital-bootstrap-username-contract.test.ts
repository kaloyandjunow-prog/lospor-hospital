import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const bootstrap = readFileSync(join(
  process.cwd(),
  "scripts/bootstrap-hospital-admin.ts",
), "utf8")

describe("Hospital first-administrator username bootstrap", () => {
  it("requires and validates an explicit username without deriving it", () => {
    expect(bootstrap).toContain('required("HOSPITAL_BOOTSTRAP_ADMIN_USERNAME")')
    expect(bootstrap).toContain("validateAndNormalizeUsername(usernameInput)")
    expect(bootstrap).toContain("usernameCanonical")
    expect(bootstrap).not.toMatch(/username\s*=.*email/i)
    expect(bootstrap).not.toMatch(/username\s*=.*\.id/i)
  })

  it("keeps the Status operator email separate from optional clinical contact email", () => {
    expect(bootstrap).toContain("HOSPITAL_BOOTSTRAP_ADMIN_CONTACT_EMAIL")
    expect(bootstrap).toContain("email: contactEmail")
    expect(bootstrap).toContain("where: { usernameCanonical }")
    expect(bootstrap).toContain("targetUserId: administratorId")
  })

  it("activates the account separately from optional email verification", () => {
    expect(bootstrap).toContain("activatedAt: now")
    expect(bootstrap).toContain("emailVerifiedAt: null")
  })
})
