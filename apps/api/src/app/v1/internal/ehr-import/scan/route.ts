import { NextResponse } from "next/server"

import { hospitalConfig } from "@/lib/hospital/config"
import { isHospitalDeployment } from "@/lib/hospital/deployment"
import { ehrTransportAccess } from "@/lib/hospital/ehr-transport-policy"
import { scanEhrInbox } from "@/lib/hospital/ehr-inbox-folder"
import { prisma } from "@/lib/prisma"
import { bearerMatchesAnySecret, configuredSecretOverlap } from "@/lib/rotating-secret"

/**
 * Read whatever the hospital system has left in the inbox.
 *
 * Called by the adapter worker, on the same schedule as the outbound pass and
 * independently of it: a hospital that has stopped reading its outbox must not
 * stop us staging what it has already written.
 *
 * Nothing staged here reaches a case. It waits for a clinician.
 */

function authorized(request: Request): boolean {
  return bearerMatchesAnySecret(request, configuredSecretOverlap(
    hospitalConfig().HOSPITAL_WORKER_TOKEN,
    process.env.HOSPITAL_WORKER_TOKEN_PREVIOUS,
  ))
}

export async function POST(request: Request) {
  if (!isHospitalDeployment() || !authorized(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const access = await ehrTransportAccess()
  if (!access.enabled || access.transport !== "FOLDER") {
    // Not an error: a site with no adapter, or one on a transport that pulls
    // rather than watches a directory, simply has nothing to scan.
    return NextResponse.json({ scanned: 0, imported: 0, rejected: 0, skipped: 0 })
  }

  // A single-institution appliance: the installation row names it.
  const installation = await prisma.hospitalInstallation.findUnique({
    where: { id: "local" },
    select: { institutionId: true },
  })
  const institutionId = installation?.institutionId
  if (!institutionId) {
    return NextResponse.json({ scanned: 0, imported: 0, rejected: 0, skipped: 0 })
  }

  const results = await scanEhrInbox(prisma, { institutionId })
  return NextResponse.json({
    scanned: results.length,
    imported: results.filter(r => r.outcome === "imported").length,
    rejected: results.filter(r => r.outcome === "rejected").length,
    skipped: results.filter(r => r.outcome === "skipped").length,
  })
}
