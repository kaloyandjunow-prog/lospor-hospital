import { NextResponse } from "next/server"
import { z } from "zod"
import { getAuthUser } from "@/lib/mobile-auth"
import { requireRole } from "@/lib/access-control"
import { logAudit } from "@/lib/audit"
import { prisma } from "@/lib/prisma"
import { isHospitalDeployment } from "@/lib/hospital/deployment"

const schema = z.object({
  decision: z.enum(["DEFAULT", "INCLUDE", "EXCLUDE", "WITHDRAW_REQUESTED"]),
  reasonCode: z.string().trim().max(80).nullable().optional(),
  reasonNote: z.string().trim().max(500).nullable().optional(),
})

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser(request)
  if (!isHospitalDeployment() ||
      !requireRole(user, ["ADMIN", "HEAD_OF_DEPT"]) ||
      !user.institutionId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid export decision" }, { status: 400 })
  }
  const { id } = await context.params
  const record = await prisma.case.findFirst({
    where: { id, institutionId: user.institutionId },
    select: { id: true, centralExportCheckpoint: { select: { caseId: true } } },
  })
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (parsed.data.decision === "WITHDRAW_REQUESTED" &&
      !record.centralExportCheckpoint) {
    return NextResponse.json({
      error: "A case that has not been exported can be excluded instead of withdrawn",
    }, { status: 409 })
  }
  const control = await prisma.caseCentralExportControl.upsert({
    where: { caseId: id },
    create: {
      caseId: id,
      ...parsed.data,
      decidedById: user.id,
    },
    update: {
      ...parsed.data,
      decidedById: user.id,
      decidedAt: new Date(),
    },
  })
  await logAudit(user.id, "CASE_CENTRAL_EXPORT_DECISION", id, {
    decision: control.decision,
    reasonCode: control.reasonCode,
  })
  return NextResponse.json(control)
}

