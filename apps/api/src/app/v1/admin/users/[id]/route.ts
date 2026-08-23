import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { requireRole } from "@/lib/access-control"
import { prisma } from "@/lib/prisma"
import { invalidateAccountState, notePasswordChanged } from "@/lib/password-epoch"
import { logAuditInTransaction } from "@/lib/audit"
import { RETENTION_DAYS } from "@/lib/purge-deleted"
import { corsHeaders } from "@/lib/cors"
import {
  APPLIANCE_OPERATOR_MANAGED_MESSAGE,
  isDesignatedApplianceOperator,
} from "@/lib/hospital/appliance-operator"
import { applianceOperatorBlocksMutation } from "@/lib/hospital/appliance-operator-guard"

const CORS = (req: NextRequest) => corsHeaders(req)

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: CORS(req) })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  void req
  void params
  // Clinical identity and role supervision is intentionally absent from the
  // clinical application. Status uses the private Hospital account-control
  // bearer and PATCH /v1/internal/hospital/accounts/:id/role instead.
  return NextResponse.json({ error: "Not found" }, { status: 404 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!requireRole(user, ["ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  if (id === user.id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 })
  }
  if (applianceOperatorBlocksMutation(
    await isDesignatedApplianceOperator(id),
    "ADMIN_DELETE",
  )) {
    return NextResponse.json(
      { error: APPLIANCE_OPERATOR_MANAGED_MESSAGE, code: "APPLIANCE_OPERATOR_MANAGED" },
      { status: 409 },
    )
  }

  // Soft-delete, exactly as an account deleting itself does.
  //
  // This was `prisma.user.delete()`. Case.user declares no onDelete, so Prisma
  // defaults to Restrict: deleting any clinician who holds a case raised a
  // foreign-key error, and with no try/catch it surfaced as an unhandled 500.
  // The endpoint therefore worked only for accounts with no clinical record,
  // which is the population it least needs to exist for.
  //
  // Where it did succeed it cascaded through nine relations, including
  // ResearchAccessGrant, ResearchCohort and ResearchExport -- destroying the
  // record of what the account had been permitted to see, at the moment someone
  // was most likely to want it.
  //
  // Marking the account deleted hands it to the retention job, which anonymises
  // it after RETENTION_DAYS. Until then the deletion is reversible, and the
  // clinical records the account authored keep their author.
  const now = new Date()
  const removed = await prisma.$transaction(async tx => {
    const updated = await tx.user.update({
      where: { id },
      // Bumping passwordChangedAt kills every token issued before now, not just
      // the session that happens to be open. Without it a deleted account keeps
      // full API access from any other signed-in device until its token
      // expires.
      data: { deletedAt: now, passwordChangedAt: now },
      select: { id: true, deletedAt: true },
    })
    await logAuditInTransaction(tx, user.id, "ADMIN_ACCOUNT_DELETE", id, {
      retentionDays: RETENTION_DAYS,
    })
    return updated
  })
  // Prime this instance's cache so the revocation takes effect without waiting
  // for the next read.
  notePasswordChanged(id, now)
  invalidateAccountState(id)

  return NextResponse.json({ ok: true, deletedAt: removed.deletedAt })
}
