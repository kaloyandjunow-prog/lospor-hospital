import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const migration = readFileSync(join(
  process.cwd(),
  "prisma/migrations/20260823130000_hospital_username_identity/migration.sql",
), "utf8")

describe("Hospital username identity migration", () => {
  it("preserves existing activation while separating it from email verification", () => {
    expect(migration).toMatch(/SET "activatedAt" = "emailVerifiedAt"/)
    expect(migration).toContain('ALTER COLUMN "email" DROP NOT NULL')
    expect(migration).toContain('CHECK ("usernameCanonical" IS NOT NULL OR "deletedAt" IS NOT NULL)')
    expect(migration).toContain("requires an empty User table or explicit username migration")
  })

  it("keeps append-only ownership history with one active canonical claim", () => {
    expect(migration).toContain('CREATE TABLE "HospitalUsernameReservation"')
    expect(migration).toContain('"HospitalUsernameReservation_active_username_key"')
    expect(migration).toContain('WHERE "releasedAt" IS NULL')
    expect(migration).toContain('ON DELETE RESTRICT')
    expect(migration).toContain('INSERT INTO "HospitalUsernameReservation"')
  })

  it("enforces paired case-preserving and case-insensitive unique usernames", () => {
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "User_usernameCanonical_key"')
    expect(migration).toContain('CONSTRAINT "User_username_pair"')
    expect(migration).toContain('CONSTRAINT "User_username_format"')
    expect(migration).toContain('lower("username") = "usernameCanonical"')
    expect(migration).toContain("^[A-Za-z][A-Za-z0-9._-]{2,63}$")
  })

  it("can follow the deliberately imported owner identity migration", () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "username"')
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS "User_login_identity_present"')
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS "User_username_pair"')
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS "User_username_format"')
  })

  it("does not delete, anonymize, or rewrite case ownership", () => {
    expect(migration).not.toMatch(/DELETE\s+FROM/i)
    expect(migration).not.toMatch(/UPDATE\s+"Case"/i)
    expect(migration).not.toMatch(/DROP\s+TABLE/i)
  })
})
