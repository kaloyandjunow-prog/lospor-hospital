import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { clinicalRuleKey } from "@lospor/core/clinical-rules"
import {
  createLosporAdultV2Draft,
  createLosporPediatricV2Draft,
} from "@lospor/core/platform-clinical-drafts"
import type { Prisma } from "@/generated/prisma/client"

vi.mock("server-only", () => ({}))

const runPostgres = process.env.LOSPOR_POSTGRES_INTEGRATION === "true"

class RollBackReadinessFixture extends Error {}

describe.skipIf(!runPostgres)("Hospital clinical baseline readiness in PostgreSQL", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let assess: typeof import("@/lib/hospital/clinical-baseline-readiness").assessSelectedHospitalClinicalBaseline

  beforeAll(async () => {
    ;({ prisma } = await import("@/lib/prisma"))
    ;({ assessSelectedHospitalClinicalBaseline: assess } = await import(
      "@/lib/hospital/clinical-baseline-readiness"
    ))
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  it("reads committed selection/content truth and rolls every synthetic state back", async () => {
    const before = await prisma.platformClinicalPresetSelection.findMany({
      orderBy: { clinicalMode: "asc" },
      select: { clinicalMode: true, presetId: true, selectedById: true, selectedAt: true },
    })
    let reachedRollback = false
    try {
      await prisma.$transaction(async tx => {
        // The canonical IDs are deliberately exact, so serialize this fixture
        // if multiple PostgreSQL suites share one database.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(12002026)`
        const now = new Date("2026-08-23T09:00:00.000Z")

        // Prove a tampered publication is caught before ever publishing the
        // real baseline under the same id. Once published, a rule can never
        // be mutated again (reject_published_clinical_rule_mutation below),
        // so this has to run first, inside its own savepoint, and be rolled
        // back before the real pediatric publication that follows.
        {
          const pediatricDraft = createLosporPediatricV2Draft()
          const tamperedRules = pediatricDraft.rules.map((rule, index) => ({
            ruleKey: clinicalRuleKey(rule.payload),
            ruleVersion: `${pediatricDraft.key}.v${pediatricDraft.version}.readiness-postgres`,
            payload: rule.payload as Prisma.InputJsonValue,
            sourceRefs: (index === 0 ? ["postgres-readiness-drift"] : rule.sourceRefs) as Prisma.InputJsonValue,
          }))
          await tx.$executeRaw`SAVEPOINT digest_mismatch_check`
          await tx.clinicalPreset.create({
            data: {
              id: pediatricDraft.id,
              key: pediatricDraft.key,
              name: pediatricDraft.name,
              description: pediatricDraft.description,
              clinicalMode: pediatricDraft.clinicalMode,
              scope: "PLATFORM",
              ownerInstitutionId: null,
              ownerUserId: null,
              version: pediatricDraft.version,
              status: "DRAFT",
              rules: { create: tamperedRules },
            },
          })
          await tx.clinicalRulesetPublicationEvidence.create({
            data: {
              presetId: pediatricDraft.id,
              contentSha256: "0".repeat(64),
              diffSha256: "1".repeat(64),
              exactDiff: {},
            },
          })
          await tx.clinicalPreset.update({
            where: { id: pediatricDraft.id },
            data: { status: "PUBLISHED", publishedAt: now },
          })
          await tx.platformClinicalPresetSelection.upsert({
            where: { clinicalMode: "PEDIATRIC" },
            create: { clinicalMode: "PEDIATRIC", presetId: pediatricDraft.id, selectedAt: now },
            update: { presetId: pediatricDraft.id, selectedAt: now },
          })
          await expect(assess("PEDIATRIC", tx)).resolves.toMatchObject({
            baselineReady: false,
            reasonCode: "DIGEST_MISMATCH",
          })
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT digest_mismatch_check`
          await tx.$executeRaw`RELEASE SAVEPOINT digest_mismatch_check`
        }

        for (const draft of [createLosporAdultV2Draft(), createLosporPediatricV2Draft()]) {
          const rules = draft.rules.map(rule => ({
            ruleKey: clinicalRuleKey(rule.payload),
            ruleVersion: `${draft.key}.v${draft.version}.readiness-postgres`,
            payload: rule.payload as Prisma.InputJsonValue,
            sourceRefs: rule.sourceRefs as Prisma.InputJsonValue,
          }))
          // A published preset can no longer be created (or reverted to)
          // DRAFT directly, and once published its metadata is immutable --
          // both enforced by protect_published_clinical_preset() -- so this
          // must land as DRAFT, record publication evidence, then transition
          // to PUBLISHED, mirroring bundled-baseline-provisioner.ts's own
          // sequence rather than the single-step upsert this predates.
          await tx.clinicalPreset.create({
            data: {
              id: draft.id,
              key: draft.key,
              name: draft.name,
              description: draft.description,
              clinicalMode: draft.clinicalMode,
              scope: "PLATFORM",
              ownerInstitutionId: null,
              ownerUserId: null,
              version: draft.version,
              status: "DRAFT",
              rules: { create: rules },
            },
          })
          await tx.clinicalRulesetPublicationEvidence.create({
            data: {
              presetId: draft.id,
              contentSha256: "0".repeat(64),
              diffSha256: "1".repeat(64),
              exactDiff: {},
            },
          })
          await tx.clinicalPreset.update({
            where: { id: draft.id },
            data: { status: "PUBLISHED", publishedAt: now },
          })
          await tx.platformClinicalPresetSelection.upsert({
            where: { clinicalMode: draft.clinicalMode },
            create: {
              clinicalMode: draft.clinicalMode,
              presetId: draft.id,
              selectedAt: now,
            },
            update: { presetId: draft.id, selectedAt: now },
          })
        }

        await expect(assess("ADULT", tx)).resolves.toMatchObject({
          baselineReady: true,
          reasonCode: "READY",
          selected: { presetId: "lospor-adults-v2", status: "PUBLISHED" },
        })
        await expect(assess("PEDIATRIC", tx)).resolves.toMatchObject({
          baselineReady: true,
          reasonCode: "READY",
          selected: { presetId: "lospor-pediatrics-v2", status: "PUBLISHED" },
        })

        // Once published, a preset can move to RETIRED or back to PUBLISHED,
        // but never back to DRAFT -- the same trigger that requires evidence
        // for the original publication forbids re-entering it.
        await tx.clinicalPreset.update({
          where: { id: "lospor-pediatrics-v2" },
          data: { status: "RETIRED" },
        })
        await expect(assess("PEDIATRIC", tx)).resolves.toMatchObject({
          baselineReady: false,
          reasonCode: "NOT_PUBLISHED",
        })
        await tx.clinicalPreset.update({
          where: { id: "lospor-pediatrics-v2" },
          data: { status: "PUBLISHED" },
        })

        await tx.platformClinicalPresetSelection.delete({ where: { clinicalMode: "ADULT" } })
        await expect(assess("ADULT", tx)).resolves.toMatchObject({
          baselineReady: false,
          reasonCode: "SELECTION_MISSING",
          selected: null,
        })

        reachedRollback = true
        throw new RollBackReadinessFixture()
      }, { timeout: 120_000 })
    } catch (error) {
      if (!(error instanceof RollBackReadinessFixture)) throw error
    }
    expect(reachedRollback).toBe(true)
    await expect(prisma.platformClinicalPresetSelection.findMany({
      orderBy: { clinicalMode: "asc" },
      select: { clinicalMode: true, presetId: true, selectedById: true, selectedAt: true },
    })).resolves.toEqual(before)
  }, 130_000)
})
