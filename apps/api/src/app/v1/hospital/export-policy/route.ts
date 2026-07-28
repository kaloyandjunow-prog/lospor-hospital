import { NextResponse } from "next/server"
import { z } from "zod"
import { getAuthUser } from "@/lib/mobile-auth"
import { requireRole } from "@/lib/access-control"
import { logAudit } from "@/lib/audit"
import { prisma } from "@/lib/prisma"
import { isHospitalDeployment } from "@/lib/hospital/deployment"

const schema = z.object({
  enabled: z.boolean(),
  includeExactTimes: z.boolean().default(true),
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

