import { NextResponse } from "next/server"
import { z } from "zod"
import { getAuthUser } from "@/lib/mobile-auth"
import { logAuditInTransaction } from "@/lib/audit"
import { prisma } from "@/lib/prisma"
import { isHospitalDeployment } from "@/lib/hospital/deployment"
import {
  CENTRAL_ACTIVE_BATCH_STATES,
  projectCaseCentralExport,
  readCaseCentralExport,
} from "@/lib/hospital/case-central-export"
import {
  CaseWriteError,
  lockCaseForUpdate,
  withDirectTransaction,
} from "@/lib/clinical-transaction"

const schema = z.object({
  action: z.enum(["WITHDRAW", "RESEND"]),
  reasonNote: z.string().trim().max(500).nullable().optional(),
}).strict()

const RESPONSE_HEADERS = { "cache-control": "private, no-store, max-age=0" }

async function authorizedUser(request: Request) {
  const user = await getAuthUser(request)
  if (
    !isHospitalDeployment()
    || !user
    || user.accountKind !== "CLINICAL"
    || !user.role
    || !["ADMIN", "HEAD_OF_DEPT", "MEMBER"].includes(user.role)
  ) {
    return null
  }
  if (user.role === "HEAD_OF_DEPT" && !user.institutionId) return null
  return user
}

function caseScopeForCentralActor(
  user: { id: string; role?: string | null; institutionId?: string | null },
  id: string,
) {
  if (user.role === "ADMIN") return { id }
  if (user.role === "HEAD_OF_DEPT" && user.institutionId) {
    return { id, institutionId: user.institutionId }
  }
  // The creator keeps this one narrow delivery-governance authority after a
  // transfer. It does not use the ordinary read/write case scope and therefore
  // cannot accidentally restore editing, finalization, print or research power.
  return { id, createdById: user.id }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await authorizedUser(request)
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: RESPONSE_HEADERS })
  }
  const { id } = await context.params
  const view = await readCaseCentralExport(prisma, caseScopeForCentralActor(user, id))
  if (!view) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: RESPONSE_HEADERS })
  }
  return NextResponse.json(view, { headers: RESPONSE_HEADERS })
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await authorizedUser(request)
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: RESPONSE_HEADERS })
  }
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid Central delivery action" },
      { status: 400, headers: RESPONSE_HEADERS },
    )
  }
  const { id } = await context.params
  try {
    const view = await withDirectTransaction(async tx => {
      // Use the same transaction-scoped lock as batch reservation, and take it
      // first. A decision can therefore either win before a case is reserved,
      // or see the already-reserved delivery and stop truthfully; it can never
      // claim that an in-flight UPSERT was excluded.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('lospor-hospital-central-export'))`
      if (!await lockCaseForUpdate(tx, id)) {
        throw new CaseWriteError("CASE_NOT_FOUND", 404, "Case not found")
      }
      const record = await tx.case.findFirst({
        where: caseScopeForCentralActor(user, id),
        select: {
          id: true,
          centralExportControl: { select: { decision: true } },
          centralExportCheckpoint: { select: { lastAction: true } },
          centralDeliveryCases: {
            where: { batch: { status: { in: [...CENTRAL_ACTIVE_BATCH_STATES] } } },
            take: 1,
            select: { batchId: true },
          },
        },
      })
      if (!record) throw new CaseWriteError("CASE_NOT_FOUND", 404, "Case not found")
      if (record.centralDeliveryCases.length > 0) {
        throw new CaseWriteError(
          "CENTRAL_CASE_DELIVERY_IN_PROGRESS",
          409,
          "Wait for the current Central delivery result before changing this case",
        )
      }
      const wasExported = record.centralExportCheckpoint?.lastAction === "UPSERT"
      const wasWithdrawn = record.centralExportControl?.decision === "EXCLUDE"
        || record.centralExportControl?.decision === "WITHDRAWN"
        || record.centralExportCheckpoint?.lastAction === "WITHDRAW"
      if (parsed.data.action === "WITHDRAW" && !wasExported) {
        throw new CaseWriteError(
          "CENTRAL_CASE_NOT_EXPORTED",
          409,
          "Only a case accepted by Central can be withdrawn",
        )
      }
      if (parsed.data.action === "RESEND" && !wasWithdrawn) {
        throw new CaseWriteError(
          "CENTRAL_CASE_NOT_WITHDRAWN",
          409,
          "Only a withdrawn case can be sent again",
        )
      }
      const decision = parsed.data.action === "WITHDRAW"
        ? "WITHDRAW_REQUESTED" as const
        : "DEFAULT" as const
      await tx.caseCentralExportControl.upsert({
        where: { caseId: id },
        create: {
          caseId: id,
          decision,
          reasonCode: parsed.data.action === "WITHDRAW"
            ? "CLINICIAN_WITHDRAWAL"
            : "CLINICIAN_RESEND",
          reasonNote: parsed.data.reasonNote ?? null,
          decidedById: user.id,
        },
        update: {
          decision,
          reasonCode: parsed.data.action === "WITHDRAW"
            ? "CLINICIAN_WITHDRAWAL"
            : "CLINICIAN_RESEND",
          reasonNote: parsed.data.reasonNote ?? null,
          decidedById: user.id,
          decidedAt: new Date(),
        },
      })
      await logAuditInTransaction(tx, user.id, "CASE_CENTRAL_DELIVERY_ACTION", id, {
        action: parsed.data.action,
        reasonNoteRecorded: Boolean(parsed.data.reasonNote),
      })
      const current = await tx.case.findFirst({
        where: { id },
        select: {
          centralExportControl: {
            select: { decision: true, reasonCode: true, decidedAt: true },
          },
          centralExportCheckpoint: {
            select: { lastAction: true, acceptedAt: true },
          },
          centralExportRejection: { select: { errorCode: true } },
          centralDeliveryCases: {
            orderBy: { batch: { createdAt: "desc" } },
            take: 1,
            select: {
              action: true,
              batch: {
                select: { status: true, acceptedAt: true, errorCode: true },
              },
            },
          },
        },
      })
      if (!current) throw new CaseWriteError("CASE_NOT_FOUND", 404, "Case not found")
      return projectCaseCentralExport(current)
    })
    return NextResponse.json(view, { headers: RESPONSE_HEADERS })
  } catch (error) {
    if (error instanceof CaseWriteError) {
      return NextResponse.json({ error: error.message, code: error.code }, {
        status: error.status,
        headers: RESPONSE_HEADERS,
      })
    }
    throw error
  }
}

export const dynamic = "force-dynamic"
