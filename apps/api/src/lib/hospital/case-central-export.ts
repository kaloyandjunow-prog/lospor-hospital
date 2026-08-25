import type { Prisma, PrismaClient } from "@/generated/prisma/client"

type Db = PrismaClient | Prisma.TransactionClient

export const CASE_CENTRAL_EXPORT_STATES = [
  "NEVER_EXPORTED",
  "QUEUED",
  "ACCEPTED",
  "WITHDRAWAL_PENDING",
  "WITHDRAWN",
  "REJECTED",
] as const

export type CaseCentralExportState = typeof CASE_CENTRAL_EXPORT_STATES[number]

export const CENTRAL_ACTIVE_BATCH_STATES = [
  "PENDING",
  "GENERATING",
  "READY",
  "UPLOADING",
  "AWAITING_RECEIPT",
  "RETRY",
] as const

const ACTIVE_BATCH_STATES = new Set<string>(CENTRAL_ACTIVE_BATCH_STATES)

type CentralExportRecord = {
  centralExportControl: {
    decision: "DEFAULT" | "INCLUDE" | "EXCLUDE" | "WITHDRAW_REQUESTED" | "WITHDRAWN"
    decidedAt: Date
  } | null
  centralExportCheckpoint: {
    lastAction: string
    acceptedAt: Date
  } | null
  centralExportRejection: {
    errorCode: string
  } | null
  centralDeliveryCases: Array<{
    action: string
    batch: {
      status: string
      acceptedAt: Date | null
      errorCode: string | null
    }
  }>
}

function safeErrorCode(value: string | null | undefined): string | null {
  if (!value) return null
  return /^[A-Z0-9_]{1,80}$/.test(value) ? value : "CENTRAL_REJECTED"
}

function safeAction(value: string | null | undefined): "UPSERT" | "WITHDRAW" | null {
  return value === "UPSERT" || value === "WITHDRAW" ? value : null
}

export function projectCaseCentralExport(record: CentralExportRecord) {
  const control = record.centralExportControl
  const checkpoint = record.centralExportCheckpoint
  const rejection = record.centralExportRejection
  const latest = record.centralDeliveryCases[0] ?? null
  const latestStatus = latest?.batch.status ?? null

  let state: CaseCentralExportState = "NEVER_EXPORTED"
  if (
    control?.decision === "EXCLUDE"
    || control?.decision === "WITHDRAWN"
    || checkpoint?.lastAction === "WITHDRAW"
  ) {
    state = "WITHDRAWN"
  } else if (latestStatus === "REJECTED" || rejection) {
    state = "REJECTED"
  } else if (control?.decision === "WITHDRAW_REQUESTED") {
    state = "WITHDRAWAL_PENDING"
  } else if (latestStatus && ACTIVE_BATCH_STATES.has(latestStatus)) {
    state = "QUEUED"
  } else if (checkpoint?.lastAction === "UPSERT") {
    state = "ACCEPTED"
  }

  return {
    schemaVersion: 2 as const,
    state,
    decidedAt: control?.decidedAt.toISOString() ?? null,
    lastBatch: latest ? {
      status: latest.batch.status,
      action: safeAction(latest.action),
      acceptedAt: latest.batch.acceptedAt?.toISOString() ?? null,
      errorCode: safeErrorCode(
        latest.batch.errorCode ?? (latestStatus === "REJECTED" ? rejection?.errorCode : null),
      ),
    } : null,
    canWithdraw: checkpoint?.lastAction === "UPSERT"
      && control?.decision !== "EXCLUDE"
      && control?.decision !== "WITHDRAW_REQUESTED"
      && control?.decision !== "WITHDRAWN",
    canResend: (
      control?.decision === "EXCLUDE"
      || control?.decision === "WITHDRAWN"
      || checkpoint?.lastAction === "WITHDRAW"
    ) && control?.decision !== "WITHDRAW_REQUESTED",
  }
}

export async function readCaseCentralExport(
  db: Db,
  where: Prisma.CaseWhereInput,
) {
  const record = await db.case.findFirst({
    where,
    select: {
      centralExportControl: {
        select: { decision: true, decidedAt: true },
      },
      centralExportCheckpoint: {
        select: { lastAction: true, acceptedAt: true },
      },
      centralExportRejection: {
        select: { errorCode: true },
      },
      centralDeliveryCases: {
        orderBy: { batch: { createdAt: "desc" } },
        take: 1,
        select: {
          action: true,
          batch: {
            select: {
              status: true,
              acceptedAt: true,
              errorCode: true,
            },
          },
        },
      },
    },
  })
  return record ? projectCaseCentralExport(record) : null
}

/**
 * Which cases an actor may govern the Central delivery of.
 *
 * The authority follows the attestation, not the draft. Withdrawing a case
 * retracts what somebody put their name to, so it belongs to the clinician who
 * finalized it. A clinician who started a case and handed it on holds nothing
 * here; ordinary read and print on the record itself are a separate question.
 *
 * "Finalized it" means the current finalization. A case can be finalized,
 * unfinalized, corrected and finalized again, and each of those appends a row
 * that supersedes the previous one instead of rewriting it, so a case has as
 * many finalization rows as it has had attestations. The open end of that chain
 * -- the row nothing supersedes -- is the one that stands now, and its author is
 * the only Member who may act. That is the same row as the highest `sequence`,
 * and it is identified by the chain rather than by the number because the chain
 * is what the writer maintains and an immutability trigger protects; a filter on
 * "nothing supersedes this" needs no correlated maximum to express.
 *
 * `finalizedById` is null on rows carried over from CaseSnapshot, which never
 * recorded who attested. Those name nobody, so they match nobody: the filter
 * compares against the actor's id and a null finalizer therefore grants no
 * authority rather than falling back to the creator.
 */
export function centralDeliveryCaseScope(user: {
  id: string
  role?: string | null
  institutionId?: string | null
}): Prisma.CaseWhereInput | null {
  if (user.role === "ADMIN") return {}
  if (user.role === "HEAD_OF_DEPT") {
    return user.institutionId ? { institutionId: user.institutionId } : null
  }
  if (user.role === "MEMBER") {
    return {
      finalizations: {
        some: { finalizedById: user.id, supersededBy: { is: null } },
      },
    }
  }
  return null
}
