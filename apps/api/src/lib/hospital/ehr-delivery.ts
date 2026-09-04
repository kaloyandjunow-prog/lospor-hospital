import "server-only"

import { FINALIZE_UNDO_WINDOW_MS } from "@/lib/constants"
import type { Prisma } from "@/generated/prisma/client"
import type { EhrDeliveryKind } from "@/generated/prisma/enums"

/**
 * Queue what a finalized case owes the hospital system, and decide when it may
 * go.
 *
 * There is no scheduler in the appliance, so "wait until later" is a WHERE
 * predicate rather than a job: a worker polls and asks for whatever is due.
 * Nothing here talks to a hospital system — that is the transport's work, and
 * keeping the decision separate from the sending is what lets folder drop,
 * FHIR and HL7 v2 share one queue.
 */

export type EhrDeliveryClient = Pick<Prisma.TransactionClient, "ehrDelivery">

/**
 * A case can be unfinalized and edited for FINALIZE_UNDO_WINDOW_MS, so nothing
 * may leave before that window closes.
 *
 * Central already works this way and the reason is worth repeating: a case
 * finalized at 09:00 reached Central at 09:01 and was undone at 09:10, while
 * still inside the permitted window, leaving Central holding a finalized
 * version the hospital no longer had. Nothing detected the divergence.
 *
 * The two conditions are complementary, which is what makes this complete
 * rather than merely narrower: unfinalize refuses once the window has elapsed,
 * and delivery refuses until it has, so no case is ever both sendable and
 * undoable. That is why there is no withdrawal message to design — the
 * situation it would recover from cannot arise.
 */
export function deliverAfterFor(finalizedAt: Date): Date {
  return new Date(finalizedAt.getTime() + FINALIZE_UNDO_WINDOW_MS)
}

/**
 * Which messages a finalization owes.
 *
 * The protocol always. Safety findings only when there is something to warn
 * about — an empty safety message on every finalized case is how a hospital
 * learns to filter the channel, and then the one that matters is filtered too.
 */
export function deliveriesFor(input: { hasSafetyFindings: boolean }): EhrDeliveryKind[] {
  return input.hasSafetyFindings
    ? (["PROTOCOL", "SAFETY_FINDINGS"] as EhrDeliveryKind[])
    : (["PROTOCOL"] as EhrDeliveryKind[])
}

/**
 * Queue a finalization's messages, superseding whatever the previous one left
 * behind.
 *
 * A correction does not edit the queued message: it queues a new one that
 * supersedes it. If the earlier message was already sent, the new one is a
 * correction the hospital receives; if it was still waiting, the earlier one is
 * marked SUPERSEDED and never goes at all. Either way what was sent stays
 * reconstructable, which is the same reason CaseFinalization is append-only.
 */
export async function queueFinalizationDeliveries(
  client: EhrDeliveryClient,
  input: {
    institutionId: string
    caseId: string
    finalizationId: string
    sequence: number
    finalizedAt: Date
    // HL7 v2 stays in the enum so a policy row written before it was withdrawn
    // still reads back, but nothing accepts it as an input any more.
    transport: "FOLDER" | "FHIR" | "HL7V2"
    hasSafetyFindings: boolean
    supersedesFinalizationId?: string | null
  },
): Promise<{ queued: EhrDeliveryKind[]; superseded: number }> {
  const deliverAfter = deliverAfterFor(input.finalizedAt)
  const kinds = deliveriesFor(input)

  // Anything still waiting from the finalization this one replaces will never
  // be sent: it describes a version that no longer exists.
  let superseded = 0
  if (input.supersedesFinalizationId) {
    superseded = (await client.ehrDelivery.updateMany({
      where: {
        finalizationId: input.supersedesFinalizationId,
        status: { in: ["PENDING"] },
      },
      data: { status: "SUPERSEDED" },
    })).count
  }

  const queued: EhrDeliveryKind[] = []
  for (const kind of kinds) {
    // Idempotent on (finalizationId, kind): finalizing is retried by clients,
    // and a retry must not become a second message the hospital files twice.
    const existing = await client.ehrDelivery.findUnique({
      where: { finalizationId_kind: { finalizationId: input.finalizationId, kind } },
      select: { id: true },
    })
    if (existing) continue

    await client.ehrDelivery.create({
      data: {
        institutionId: input.institutionId,
        caseId: input.caseId,
        finalizationId: input.finalizationId,
        sequence: input.sequence,
        kind,
        deliverAfter,
        transport: input.transport,
      },
    })
    queued.push(kind)
  }

  return { queued, superseded }
}

/**
 * Queue a start or end signal.
 *
 * Fire and forget, and deliberately not held: these describe a moment rather
 * than a finalized record, so there is no undo window to wait out. Whether the
 * hospital system ingests them silently or raises a prompt is its business, and
 * nothing here waits on or changes behaviour because of the answer.
 */
export async function queueCaseSignal(
  client: EhrDeliveryClient,
  input: {
    institutionId: string
    caseId: string
    kind: "CASE_START" | "CASE_END"
    at: Date
    // HL7 v2 stays in the enum so a policy row written before it was withdrawn
    // still reads back, but nothing accepts it as an input any more.
    transport: "FOLDER" | "FHIR" | "HL7V2"
  },
): Promise<{ queued: boolean }> {
  // A signal has no finalization, so the idempotency key is the case and the
  // moment it describes — a case starts once.
  const finalizationId = `signal:${input.caseId}:${input.kind}`
  const existing = await client.ehrDelivery.findUnique({
    where: { finalizationId_kind: { finalizationId, kind: input.kind } },
    select: { id: true },
  })
  if (existing) return { queued: false }

  await client.ehrDelivery.create({
    data: {
      institutionId: input.institutionId,
      caseId: input.caseId,
      finalizationId,
      sequence: 0,
      kind: input.kind,
      deliverAfter: input.at,
      transport: input.transport,
    },
  })
  return { queued: true }
}

/**
 * What a worker may send right now.
 *
 * Ordered oldest first so a backlog drains in the order it happened rather than
 * newest-first, which would leave the oldest message permanently starved — the
 * failure Central's delivery had.
 */
export async function dueEhrDeliveries(
  client: EhrDeliveryClient,
  input: { now?: Date; limit?: number } = {},
): Promise<{ id: string; caseId: string; kind: EhrDeliveryKind }[]> {
  const now = input.now ?? new Date()
  const rows = await client.ehrDelivery.findMany({
    where: {
      status: "PENDING",
      deliverAfter: { lte: now },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: [{ deliverAfter: "asc" }, { id: "asc" }],
    take: input.limit ?? 20,
    select: { id: true, caseId: true, kind: true },
  })
  return rows.map(row => ({
    id: String(row.id),
    caseId: String(row.caseId),
    kind: row.kind as EhrDeliveryKind,
  }))
}

/** How long a claim is held before another worker may take it. */
export const EHR_DELIVERY_LEASE_MS = 5 * 60_000

/** How long to wait after a failure, doubling, capped. */
export function retryDelayMs(attemptCount: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, attemptCount - 1), 60 * 60_000)
}

/**
 * Claim one due delivery for a worker.
 *
 * A lease rather than a status flip, so a worker that dies mid-send does not
 * strand the message forever: the claim expires and another worker picks it up.
 * The cost of that is a message the hospital may receive twice, which is why
 * every payload carries its finalization id — a receiver can recognise a
 * repeat, and a repeated protocol is a far better failure than one that never
 * arrives.
 */
export async function claimNextEhrDelivery(
  client: EhrDeliveryClient,
  input: { worker: string; now?: Date },
): Promise<{ id: string; caseId: string; kind: EhrDeliveryKind; finalizationId: string; attemptCount: number } | null> {
  const now = input.now ?? new Date()

  const candidate = await client.ehrDelivery.findFirst({
    where: {
      status: "PENDING",
      deliverAfter: { lte: now },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      AND: [{ OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }] }],
    },
    orderBy: [{ deliverAfter: "asc" }, { id: "asc" }],
    select: { id: true, caseId: true, kind: true, finalizationId: true, attemptCount: true },
  })
  if (!candidate) return null

  // Compare-and-set on the lease: two workers racing for the same row means
  // exactly one wins, and the loser simply asks again.
  const claimed = await client.ehrDelivery.updateMany({
    where: {
      id: String(candidate.id),
      status: "PENDING",
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
    },
    data: {
      status: "SENDING",
      leaseOwner: input.worker,
      leaseExpiresAt: new Date(now.getTime() + EHR_DELIVERY_LEASE_MS),
      attemptCount: Number(candidate.attemptCount) + 1,
    },
  })
  if (claimed.count === 0) return null

  return {
    id: String(candidate.id),
    caseId: String(candidate.caseId),
    kind: candidate.kind as EhrDeliveryKind,
    finalizationId: String(candidate.finalizationId),
    attemptCount: Number(candidate.attemptCount) + 1,
  }
}

/** How many attempts before a delivery is given up on. */
export const EHR_DELIVERY_MAX_ATTEMPTS = 8

/**
 * Record what happened to a claimed delivery.
 *
 * A transport reports `permanent` for a refusal that retrying cannot fix — a
 * message the hospital rejected as malformed, an endpoint that does not exist.
 * Anything else is retried with a widening delay, and a message that has
 * exhausted its attempts stops rather than hammering an endpoint forever. That
 * was a real defect in Central delivery: permanent errors retried indefinitely.
 */
export async function completeEhrDelivery(
  client: EhrDeliveryClient,
  input: {
    id: string
    outcome: "sent" | "failed"
    permanent?: boolean
    errorCode?: string
    now?: Date
  },
): Promise<{ status: "SENT" | "FAILED" | "PENDING" }> {
  const now = input.now ?? new Date()

  if (input.outcome === "sent") {
    await client.ehrDelivery.updateMany({
      where: { id: input.id },
      data: { status: "SENT", sentAt: now, leaseOwner: null, leaseExpiresAt: null, errorCode: null },
    })
    return { status: "SENT" }
  }

  const row = await client.ehrDelivery.findFirst({
    where: { id: input.id },
    select: { attemptCount: true },
  })
  const attempts = Number(row?.attemptCount ?? 1)
  const exhausted = attempts >= EHR_DELIVERY_MAX_ATTEMPTS

  if (input.permanent || exhausted) {
    await client.ehrDelivery.updateMany({
      where: { id: input.id },
      data: {
        status: "FAILED",
        leaseOwner: null,
        leaseExpiresAt: null,
        errorCode: input.errorCode ?? (exhausted ? "ATTEMPTS_EXHAUSTED" : "PERMANENT"),
      },
    })
    return { status: "FAILED" }
  }

  await client.ehrDelivery.updateMany({
    where: { id: input.id },
    data: {
      status: "PENDING",
      leaseOwner: null,
      leaseExpiresAt: null,
      nextAttemptAt: new Date(now.getTime() + retryDelayMs(attempts)),
      errorCode: input.errorCode ?? null,
    },
  })
  return { status: "PENDING" }
}
