import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { requireRole } from "@/lib/access-control"
import { prisma } from "@/lib/prisma"
import { isCentralDeliveryConfigured } from "@/lib/hospital/config"
import { isHospitalDeployment } from "@/lib/hospital/deployment"
import { countCasesAwaitingCentralExport } from "@/lib/hospital/central-status"

export async function GET(request: Request) {
  const user = await getAuthUser(request)
  // Appliance-wide Central operational state is an administrator concern. A
  // department head's clinical scope does not authorize global infrastructure
  // history or installation metadata.
  if (!isHospitalDeployment() || !requireRole(user, ["ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const installation = await prisma.hospitalInstallation.findUnique({
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
  })
  const applianceInstitutionId = installation?.institutionId ?? null
  const [policy, batches, awaitingExport] = await Promise.all([
    applianceInstitutionId
      ? prisma.centralExportPolicy.findUnique({
          where: { institutionId: applianceInstitutionId },
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
    // Finalised, identified cases with revisions that do not yet have a signed
    // Central acceptance. Accepted unchanged cases are deliberately excluded.
    applianceInstitutionId ? countCasesAwaitingCentralExport(applianceInstitutionId) : 0,
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

