import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const migration = readFileSync(join(
  process.cwd(),
  "prisma/migrations/20260822170000_hospital_account_control/migration.sql",
), "utf8")

describe("Hospital account-control migration", () => {
  it("stores only token digests and enforces one terminal state", () => {
    expect(migration).toContain('"tokenHash" TEXT NOT NULL')
    expect(migration).toContain("HospitalAccountAccessToken_tokenHash_format_check")
    expect(migration).toContain("HospitalAccountAccessToken_terminal_state_check")
    expect(migration).not.toMatch(/"token"\s+TEXT/)
  })

  it("stages AccountKind without losing legacy research classification", () => {
    expect(migration).toContain("CREATE TYPE \"AccountKind\"")
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "accountKind"')
    expect(migration).toContain("WHERE \"role\" = 'RESEARCHER'")
  })
})
