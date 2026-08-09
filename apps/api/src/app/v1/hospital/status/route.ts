import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { requireRole } from "@/lib/access-control"
import { prisma } from "@/lib/prisma"
import { isCentralDeliveryConfigured } from "@/lib/hospital/config"
import { isHospitalDeployment } from "@/lib/hospital/deployment"

export async function GET(request: Request) {
  const user = await getAuthUser(request)
  if (!isHospitalDeployment() || !requireRole(user, ["ADMIN", "HEAD_OF_DEPT"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const [installation, policy, batches, awaitingExport] = await Promise.all([
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
    // Finalised cases that would go into a batch. Before enrollment this is the
    // backlog waiting for a Central to exist: nothing is lost while a site runs
    // standalone, and the first batch after enrollment starts from the earliest
    // finalised case. Showing the number makes that visible instead of implied.
    user.institutionId
      ? prisma.case.count({
          where: {
            institutionId: user.institutionId,
            status: "COMPLETE",
            finalizedAt: { not: null },
            NOT: {
              centralExportControl: {
                decision: { in: ["EXCLUDE", "WITHDRAWN"] },
              },
            },
          },
        })
      : 0,
  ])

  const enrolled = Boolean(
    installation?.centralEnabled && installation.siteId && installation.centralBaseUrl,
  )

  return NextResponse.json({
    installation,
    policy,
    batches,
    central: {
      enrolled,
      // Whether the site *could* reach Central, as distinct from whether it has
      // enrolled. A standalone installation has neither, and that is normal.
      credentialsPresent: isCentralDeliveryConfigured(),
      exportPolicyApproved: Boolean(policy?.enabled && policy.approvedAt),
      casesAwaitingExport: awaitingExport,
    },
  })
}

