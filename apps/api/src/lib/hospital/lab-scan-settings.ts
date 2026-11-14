import "server-only"
import { z } from "zod"
import { LAB_LIBRARY } from "@lospor/core/labs"
import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import {
  EMPTY_LAB_SCAN_LOCAL,
  LAB_SCAN_LOCAL_LIMITS,
  labScanLocalProblems,
  type LabScanLocal,
} from "@/lib/lab-scan-prompt"

/**
 * The lab scan's local settings (Hospital 1.9.1), kept on the external-AI
 * policy row and set in Status: the names this hospital's laboratory prints,
 * each tied to a lab library entry, and a short note.
 *
 * What may be set is upstream's LabScanLocal and its limits; the released
 * prompt, its rules and the shape of the answer are not settable here. Both
 * settings are added after the rules, and a printed name in the table goes to
 * its entry in code, whatever the model chose.
 */

type Database = PrismaClient | Prisma.TransactionClient

const aliasSchema = z.object({
  printed: z.string().trim().min(1).max(LAB_SCAN_LOCAL_LIMITS.printed),
  test: z.string().min(1).max(200),
}).strict()

const localFields = {
  aliases: z.array(aliasSchema).max(LAB_SCAN_LOCAL_LIMITS.aliases),
  instructions: z.string().max(LAB_SCAN_LOCAL_LIMITS.instructions),
}

function refuseUnusable(local: LabScanLocal, ctx: z.RefinementCtx) {
  for (const problem of labScanLocalProblems(local)) {
    ctx.addIssue({ code: "custom", message: problem.kind, path: "index" in problem ? ["aliases", problem.index] : [] })
  }
}

export const labScanSettingsSchema = z.object({
  ...localFields,
  reason: z.string().trim().min(10).max(1000),
}).strict().superRefine((value, ctx) => refuseUnusable(value, ctx))

/** A test scan in Status: an image and the settings as they stand in the form, saved or not. */
export const labScanTestSchema = z.object({
  ...localFields,
  imageBase64: z.string().min(1).max(Math.ceil(10_485_760 * 4 / 3)),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
}).strict().superRefine((value, ctx) => refuseUnusable(value, ctx))

/**
 * The stored settings as the scan uses them. A row written by hand or by an
 * older release that no longer passes the checks is not used at all, rather
 * than in part: the scan then runs exactly as released.
 */
export function labScanLocalFrom(policy: { labScanAliases?: unknown; labScanInstructions?: string | null } | null | undefined): LabScanLocal {
  const parsed = z.object(localFields).safeParse({
    aliases: Array.isArray(policy?.labScanAliases) ? policy.labScanAliases : [],
    instructions: policy?.labScanInstructions ?? "",
  })
  if (!parsed.success || labScanLocalProblems(parsed.data).length > 0) return EMPTY_LAB_SCAN_LOCAL
  return parsed.data
}

export async function storedLabScanLocal(db: Database = prisma): Promise<LabScanLocal> {
  const policy = await db.hospitalExternalAiPolicy.findUnique({
    where: { id: "local" },
    select: { labScanAliases: true, labScanInstructions: true },
  })
  return labScanLocalFrom(policy)
}

/** What Status shows and offers: the settings, the limits and the library names a printed name may point to. */
export function labScanControlView(policy: { labScanAliases?: unknown; labScanInstructions?: string | null; labScanChangedAt?: Date | null } | null | undefined) {
  const local = labScanLocalFrom(policy)
  return {
    aliases: local.aliases,
    instructions: local.instructions,
    changedAt: policy?.labScanChangedAt?.toISOString() ?? null,
    limits: { ...LAB_SCAN_LOCAL_LIMITS },
    libraryNames: LAB_LIBRARY.map(test => test.name),
  }
}
