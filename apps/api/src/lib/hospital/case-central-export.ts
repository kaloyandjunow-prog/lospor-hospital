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
