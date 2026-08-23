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
        for (const draft of [createLosporAdultV2Draft(), createLosporPediatricV2Draft()]) {
          const rules = draft.rules.map(rule => ({
            ruleKey: clinicalRuleKey(rule.payload),
            ruleVersion: `${draft.key}.v${draft.version}.readiness-postgres`,
            payload: rule.payload as Prisma.InputJsonValue,
            sourceRefs: rule.sourceRefs as Prisma.InputJsonValue,
          }))
          await tx.clinicalPreset.upsert({
            where: { id: draft.id },
            create: {
              id: draft.id,
              key: draft.key,
              name: draft.name,
              description: draft.description,
              clinicalMode: draft.clinicalMode,
              scope: "PLATFORM",
              ownerInstitutionId: null,
              ownerUserId: null,
              version: draft.version,
              status: "PUBLISHED",
              publishedAt: now,
              rules: { create: rules },
            },
            update: {
              key: draft.key,
              name: draft.name,
              description: draft.description,
              clinicalMode: draft.clinicalMode,
              scope: "PLATFORM",
              ownerInstitutionId: null,
              ownerUserId: null,
              version: draft.version,
              status: "PUBLISHED",
              publishedAt: now,
              rules: { deleteMany: {}, create: rules },
            },
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

        await tx.clinicalPreset.update({
          where: { id: "lospor-pediatrics-v2" },
          data: { status: "DRAFT" },
        })
        await expect(assess("PEDIATRIC", tx)).resolves.toMatchObject({
          baselineReady: false,
          reasonCode: "NOT_PUBLISHED",
        })
        await tx.clinicalPreset.update({
          where: { id: "lospor-pediatrics-v2" },
          data: { status: "PUBLISHED" },
        })

        const changedRule = await tx.clinicalPresetRule.findFirstOrThrow({
          where: { presetId: "lospor-pediatrics-v2" },
          orderBy: { ruleKey: "asc" },
          select: { id: true, sourceRefs: true },
        })
        await tx.clinicalPresetRule.update({
          where: { id: changedRule.id },
          data: { sourceRefs: ["postgres-readiness-drift"] },
        })
        await expect(assess("PEDIATRIC", tx)).resolves.toMatchObject({
          baselineReady: false,
          reasonCode: "DIGEST_MISMATCH",
        })
        await tx.clinicalPresetRule.update({
          where: { id: changedRule.id },
          data: { sourceRefs: changedRule.sourceRefs as Prisma.InputJsonValue },
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
