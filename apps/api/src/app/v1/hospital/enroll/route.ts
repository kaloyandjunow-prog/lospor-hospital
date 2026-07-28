import { NextResponse } from "next/server"
import { z } from "zod"
import { getAuthUser } from "@/lib/mobile-auth"
import { requireRole } from "@/lib/access-control"
import { logAudit } from "@/lib/audit"
import { isHospitalDeployment } from "@/lib/hospital/deployment"
import { enrollHospital } from "@/lib/hospital/enrollment"

const schema = z.object({
  token: z.string().min(20),
  centralBaseUrl: z.string().url(),
  siteCode: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/),
  siteName: z.string().trim().min(2).max(160),
  institutionId: z.string().cuid().optional(),
})

export async function POST(request: Request) {
  const user = await getAuthUser(request)
  if (!isHospitalDeployment() || !requireRole(user, ["ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid enrollment request" }, { status: 400 })
  }
  const institutionId = parsed.data.institutionId ?? user.institutionId
  if (!institutionId) {
    return NextResponse.json({ error: "Administrator has no institution" }, { status: 400 })
  }
  try {
    const installation = await enrollHospital({ ...parsed.data, institutionId })
    await logAudit(user.id, "HOSPITAL_CENTRAL_ENROLL", installation.id, {
      siteId: installation.siteId,
      siteCode: installation.siteCode,
    })
    return NextResponse.json({
      siteId: installation.siteId,
      siteCode: installation.siteCode,
      centralBaseUrl: installation.centralBaseUrl,
      enrolledAt: installation.enrolledAt,
    }, { status: 201 })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Enrollment failed",
    }, { status: 422 })
  }
}

