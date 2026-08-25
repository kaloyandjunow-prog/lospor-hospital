import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const migration = readFileSync(join(
  process.cwd(),
  "prisma/migrations/20260822190000_hospital_external_ai_policy/migration.sql",
), "utf8")

describe("Hospital external AI policy migration", () => {
  it("persists one default-enabled Mistral policy without inserting a row", () => {
    expect(migration).toContain('CREATE TABLE "HospitalExternalAiPolicy"')
    expect(migration).toContain('"externalAiEnabled" BOOLEAN NOT NULL DEFAULT true')
    expect(migration).toContain("HospitalExternalAiPolicy_singleton_check")
    expect(migration).toContain("CREATE TYPE \"ExternalAiProvider\" AS ENUM ('MISTRAL')")
    // Fresh-install choice belongs to bootstrap; an unconditional migration
    // insert would make a guided No choice impossible because bootstrap only
    // initializes an absent row.
    expect(migration).not.toMatch(/INSERT\s+INTO\s+"HospitalExternalAiPolicy"/i)
  })

  it("requires a complete versioned authenticated-encryption tuple", () => {
    expect(migration).toContain("HospitalExternalAiPolicy_sealed_tuple_check")
    for (const field of [
      "credentialCiphertext",
      "credentialNonce",
      "credentialAuthTag",
      "credentialKeyVersion",
      "credentialSealKeyFingerprint",
      "credentialConfiguredAt",
    ]) expect(migration).toContain(`"${field}"`)
    expect(migration).toContain('"credentialKeyVersion" = 1')
    expect(migration).toContain("'^sha256:[a-f0-9]{64}$'")
    expect(migration).toContain('"credentialChangedById" IS NOT NULL')
  })
})
