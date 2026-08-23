import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { requireRole } from "@/lib/access-control"
import { prisma } from "@/lib/prisma"
import { isHospitalDeployment } from "@/lib/hospital/deployment"

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

/**
 * Clinical-export approval is an appliance lock, not ordinary clinical RBAC.
 * It moved to the independent Status control plane in 1.2.0 so every change
 * has a fresh operator-password proof and an audit row in the same database
 * transaction as the policy mutation. Keep the read-only compatibility GET,
 * but make the former ADMIN mutation indistinguishable from an absent route.
 */
export async function PUT(_request: Request) {
  return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, {
    status: 404,
    headers: { "cache-control": "private, no-store, max-age=0" },
  })
}

export const dynamic = "force-dynamic"
