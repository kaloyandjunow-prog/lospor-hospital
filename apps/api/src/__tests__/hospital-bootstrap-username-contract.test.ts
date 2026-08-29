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
  // The guided installer labels this field optional and the approved identity
  // model keeps it so. A retained install log showed "email is required", but
  // that came from the separate Status operator-credential pipeline; making the
  // clinical contact email mandatory on that evidence would break the model
  // rather than fix anything.
  it("leaves the clinical contact email genuinely optional", () => {
    expect(bootstrap).not.toContain('required("HOSPITAL_BOOTSTRAP_ADMIN_CONTACT_EMAIL")')
    // Blank and whitespace collapse to null, never to an empty-string address.
    expect(bootstrap).toContain("contactEmailRaw?.trim()")
    expect(bootstrap).toContain(": null")
    expect(bootstrap).toMatch(/contactEmail\s*=\s*contactEmailRaw\?\.trim\(\)/)
  })

  it("is asked for as an optional value by the guided installer", () => {
    const guided = readFileSync(join(process.cwd(), "../../scripts/install-guided.sh"), "utf8")
    expect(guided).toContain("ask_optional_value HOSPITAL_BOOTSTRAP_ADMIN_CONTACT_EMAIL")
    expect(guided).not.toContain("ask_value HOSPITAL_BOOTSTRAP_ADMIN_CONTACT_EMAIL")
  })
})
