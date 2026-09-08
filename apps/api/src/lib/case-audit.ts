import { createHash } from "node:crypto"
import type { PrismaClient, Prisma } from "@/generated/prisma/client"
import { queueEhrDeliveriesSafe } from "@/lib/hospital/ehr-delivery-hook"
import { emitStatusEvent } from "@/lib/hospital/status-events"

type Db = PrismaClient | Prisma.TransactionClient

// ── Theme D: per-field preop/postop change log ────────────────────────────────
// Called best-effort after the save transaction commits. Never throws.

const SKIP_FIELDS = new Set(["createdAt", "updatedAt", "id", "caseId", "preopId"])

function serialise(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}

export function writeFieldDiffsSafe(
  db: Db,
  caseId: string,
  section: "preop" | "postop",
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
  userId: string
): Promise<void> {
  return writeFieldDiffs(db, caseId, section, existing, incoming, userId)
    .catch(() => {
      console.error("[case-audit] CLINICAL_DATA_SYNC_FAILED field-audit")
      void emitStatusEvent("CLINICAL_DATA_SYNC_FAILED", { stage: "field-audit" })
    })
}

async function writeFieldDiffs(
  db: Db,
  caseId: string,
  section: "preop" | "postop",
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
  userId: string
): Promise<void> {
  const changes: { caseId: string; section: string; field: string; oldValue: string | null; newValue: string | null; userId: string }[] = []

  for (const [field, newVal] of Object.entries(incoming)) {
    if (SKIP_FIELDS.has(field)) continue
    if (newVal === undefined) continue
    const oldVal = existing[field]
    const oldStr = serialise(oldVal)
    const newStr = serialise(newVal)
    if (oldStr === newStr) continue
    changes.push({ caseId, section, field, oldValue: oldStr, newValue: newStr, userId })
  }

  if (changes.length === 0) return
  await db.caseFieldChange.createMany({ data: changes })
}

// ── Theme E: append-only finalization records ─────────────────────────────────
//
// Each finalization appends a row. Correcting a case after unfinalizing it adds
// a new one that supersedes the last; it never rewrites what was attested to
// before. The previous implementation upserted on a unique caseId, so
// finalize -> unfinalize -> edit -> finalize destroyed the original record while
// the model was still described as immutable.
//
// A database trigger rejects UPDATE and DELETE on this table, so the guarantee
// does not rest on every future caller remembering it.

export const FINALIZATION_SCHEMA_VERSION = "4.0.0"

export function writeSnapshotSafe(db: Db, caseId: string, finalizedById?: string): void {
  writeSnapshot(db, caseId, finalizedById)
    .catch(() => {
      console.error("[case-audit] CLINICAL_DATA_SYNC_FAILED snapshot")
      void emitStatusEvent("CLINICAL_DATA_SYNC_FAILED", { stage: "snapshot" })
    })
}

// Throwing version used by the finalize endpoint — caller must handle errors.
export async function writeSnapshotAsync(
  db: Db,
  caseId: string,
  finalizedById?: string,
  correctionReason?: string,
): Promise<void> {
  return writeSnapshot(db, caseId, finalizedById, correctionReason)
}

async function writeSnapshot(
  db: Db,
  caseId: string,
  finalizedById?: string,
  correctionReason?: string,
): Promise<void> {
  const c = await db.case.findUnique({ where: { id: caseId } })
  if (!c) return
  const preop = await db.preoperativeAssessment.findUnique({ where: { caseId } })
  const intraop = await db.intraoperativeRecord.findUnique({ where: { caseId } })
  const postop = await db.postoperativeRecord.findUnique({ where: { caseId } })
  const clinicalCalculations = await db.caseClinicalCalculation.findMany({ where: { caseId } })

  const document = { ...c, preop, intraop, postop, clinicalCalculations }
  // The hash covers exactly the bytes that get stored, so it can be recomputed
  // from the stored row later. Hashing before a JSONB round-trip would not:
  // JSONB does not preserve key order, so the document that came back would
  // never hash to the value recorded beside it.
  const snapshotDocument = JSON.stringify(document)
  const snapshotHash = createHash("sha256").update(snapshotDocument).digest("hex")

  // The previous record is read inside the caller's transaction, which has
  // already locked the parent case row, so two finalizations cannot pick the
  // same sequence. The unique index on (caseId, sequence) is the backstop.
  const previous = await db.caseFinalization.findFirst({
    where: { caseId },
    orderBy: { sequence: "desc" },
    select: { id: true, sequence: true },
  })

  const finalization = await db.caseFinalization.create({
    data: {
      caseId,
      sequence: (previous?.sequence ?? 0) + 1,
      schemaVersion: FINALIZATION_SCHEMA_VERSION,
      snapshotDocument,
      snapshotHash,
      ...(finalizedById ? { finalizedById } : {}),
      ...(correctionReason ? { correctionReason } : {}),
      ...(previous ? { supersedesFinalizationId: previous.id } : {}),
    },
    select: { id: true, sequence: true, finalizedAt: true },
  })

  // Hospital-only: queue what this finalization owes the hospital system.
  //
  // Deliberately best-effort. A site with no EHR adapter configured queues
  // nothing, and a fault in the adapter must never be able to fail a
  // finalization — the attested record is the thing that matters, and a
  // clinician who cannot finalize because an integration is misconfigured has
  // been given a worse problem than the one it solves.
  await queueEhrDeliveriesSafe(db, {
    caseId,
    institutionId: c.institutionId,
    finalizationId: finalization.id,
    sequence: finalization.sequence,
    finalizedAt: finalization.finalizedAt,
    supersedesFinalizationId: previous?.id ?? null,
    preop,
    intraop,
  })
}
