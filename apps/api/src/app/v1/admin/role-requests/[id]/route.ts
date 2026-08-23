import { NextRequest, NextResponse } from "next/server"
import { canHaveHeadOfDepartment } from "@/lib/institutions"
import { getAuthUser } from "@/lib/mobile-auth"
import { requireRole } from "@/lib/access-control"
import { prisma } from "@/lib/prisma"
import { invalidateAccountState } from "@/lib/password-epoch"
import { z } from "zod"
import { corsHeaders } from "@/lib/cors"
import { logAuditInTransaction } from "@/lib/audit"

const schema = z.object({ action: z.enum(["approve", "reject"]) })

const CORS = (req: NextRequest) => corsHeaders(req)

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: CORS(req) })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!requireRole(user, ["ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const { action } = schema.parse(await req.json())

  const result = await prisma.$transaction(async tx => {
    const roleRequest = await tx.roleRequest.findUnique({ where: { id } })
    if (!roleRequest) return { kind: "not-found" as const }
    if (action === "approve") {
      // See canHaveHeadOfDepartment: "Без институция" is not a department.
      const target = await tx.user.findUnique({
        where: { id: roleRequest.userId },
        select: { institutionId: true },
      })
      if (!canHaveHeadOfDepartment(target?.institutionId)) {
        return { kind: "invalid-institution" as const }
      }
      await tx.user.update({
        where: { id: roleRequest.userId },
        data: { role: "HEAD_OF_DEPT" },
      })
    }
    const updated = await tx.roleRequest.update({
      where: { id },
      data: { status: action === "approve" ? "APPROVED" : "REJECTED", resolvedAt: new Date() },
    })
    await logAuditInTransaction(
      tx,
      user.id,
      action === "approve" ? "HOD_ROLE_REQUEST_APPROVE" : "HOD_ROLE_REQUEST_REJECT",
      roleRequest.userId,
      { requestId: id, requestedRole: "HEAD_OF_DEPT" },
    )
    return { kind: "ok" as const, updated, targetUserId: roleRequest.userId }
  })
  if (result.kind === "not-found") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (result.kind === "invalid-institution") {
    return NextResponse.json(
      { error: "This user's institution cannot have a head of department" },
      { status: 422 },
    )
  }
  if (action === "approve") {
    // Role is read live per request from a short-lived cache — drop the entry
    // so the promotion is effective immediately rather than within the TTL.
    invalidateAccountState(result.targetUserId)
  }
  return NextResponse.json(result.updated)
}
