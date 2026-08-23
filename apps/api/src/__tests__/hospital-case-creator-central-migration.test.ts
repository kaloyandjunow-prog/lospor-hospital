import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const migration = readFileSync(join(
  process.cwd(),
  "prisma/migrations/20260823120000_hospital_case_creator_central_delivery/migration.sql",
), "utf8")
const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8")

describe("Hospital immutable case creator migration", () => {
  it("backfills from the earliest accepted transfer without deleting a clinical record", () => {
    expect(migration).toContain('ALTER TABLE "Case" ADD COLUMN "createdById" TEXT')
    expect(migration).toContain('t."status" = \'ACCEPTED\'')
    expect(migration).toMatch(/ORDER BY COALESCE\(t\."resolvedAt", t\."createdAt"\) ASC[\s\S]*?t\."id" ASC/)
    expect(migration).toContain('c."userId"')
    expect(migration).toContain('ALTER TABLE "Case" ALTER COLUMN "createdById" SET NOT NULL')
    expect(migration).not.toMatch(/DELETE\s+FROM\s+"Case"/i)
  })

  it("moves offline idempotency to creator scope and preserves duplicate cases", () => {
    expect(migration).toContain('PARTITION BY "createdById", "clientDraftId"')
    expect(migration).toContain('SET "clientDraftId" = NULL')
    expect(migration).toContain('DROP INDEX "Case_userId_clientDraftId_key"')
    expect(migration).toContain('CREATE UNIQUE INDEX "Case_createdById_clientDraftId_key"')
    expect(migration).not.toMatch(/DELETE\s+FROM/i)
  })

  it("enforces immutable creator attribution in PostgreSQL and Prisma", () => {
    expect(migration).toContain('CONSTRAINT "Case_createdById_fkey"')
    expect(migration).toContain('ON DELETE RESTRICT ON UPDATE CASCADE')
    expect(migration).toContain("CASE_CREATOR_IMMUTABLE")
    expect(migration).toContain('CREATE TRIGGER "Case_creator_immutable"')
    expect(schema).toContain('casesCreated                    Case[]')
    expect(schema).toContain('@relation("CaseCreator")')
    expect(schema).toContain('@@unique([createdById, clientDraftId])')
  })
})
