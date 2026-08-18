import { NextResponse } from "next/server"
import { z } from "zod"
import { getAuthUser } from "@/lib/mobile-auth"
import { requireRole } from "@/lib/access-control"
import { logAudit } from "@/lib/audit"
import { prisma } from "@/lib/prisma"
import { isHospitalDeployment } from "@/lib/hospital/deployment"

// includeExactTimes is gone rather than defaulted. It was accepted here,
// stored and audit-logged, and read by nothing, so an administrator could
// switch it off and every timestamp still left at full precision. Rather than
// invent a blurring rule -- rounding drug times destroys the intervals an
// anaesthesia register exists to record -- the control is withdrawn. Sites that
// previously sent it are unaffected: it never did anything, and the field is
// now ignored rather than rejected.
const schema = z.object({
  enabled: z.boolean(),
  includeRedactedText: z.boolean().default(true),
  redactionProfile: z.string().trim().min(1).max(80).default("bg-en-v1"),
})

export async function GET(request: Request) {
  const user = await getAuthUser(request)
  if (!isHospitalDeployment() ||
      !requireRole(user, ["ADMIN", "HEAD_OF_DEPT"]) ||
      !user.institutionId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const policy = await prisma.centralExportPolicy.findUnique({
    where: { institutionId: user.institutionId },
  })
  return NextResponse.json(policy)
}

export async function PUT(request: Request) {
  const user = await getAuthUser(request)
  if (!isHospitalDeployment() || !requireRole(user, ["ADMIN"]) || !user.institutionId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid export policy" }, { status: 400 })
  }
  const policy = await prisma.centralExportPolicy.upsert({
    where: { institutionId: user.institutionId },
    create: {
      institutionId: user.institutionId,
      ...parsed.data,
      approvedById: parsed.data.enabled ? user.id : null,
      approvedAt: parsed.data.enabled ? new Date() : null,
    },
    update: {
      ...parsed.data,
      approvedById: parsed.data.enabled ? user.id : null,
      approvedAt: parsed.data.enabled ? new Date() : null,
    },
  })
  await logAudit(user.id, "CENTRAL_EXPORT_POLICY_UPDATE", policy.id, {
    enabled: policy.enabled,
    redactionProfile: policy.redactionProfile,
  })
  return NextResponse.json(policy)
}

