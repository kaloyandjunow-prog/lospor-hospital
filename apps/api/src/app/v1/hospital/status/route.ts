import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { requireRole } from "@/lib/access-control"
import { prisma } from "@/lib/prisma"
import { isHospitalDeployment } from "@/lib/hospital/deployment"

export async function GET(request: Request) {
  const user = await getAuthUser(request)
  if (!isHospitalDeployment() || !requireRole(user, ["ADMIN", "HEAD_OF_DEPT"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const [installation, policy, batches] = await Promise.all([
    prisma.hospitalInstallation.findUnique({
      where: { id: "local" },
      select: {
        siteId: true,
        siteCode: true,
        institutionId: true,
        centralBaseUrl: true,
        centralEnabled: true,
        nextSequence: true,
        lastAcceptedBatchId: true,
        enrolledAt: true,
        lastCapabilitiesAt: true,
        lastDeliveryAt: true,
      },
    }),
    user.institutionId
      ? prisma.centralExportPolicy.findUnique({
          where: { institutionId: user.institutionId },
        })
      : null,
    prisma.centralDeliveryBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        sequence: true,
        status: true,
        cutoffFrom: true,
        cutoffTo: true,
        attemptCount: true,
        errorCode: true,
        createdAt: true,
        generatedAt: true,
        acceptedAt: true,
        _count: { select: { cases: true } },
      },
    }),
  ])
  return NextResponse.json({ installation, policy, batches })
}

