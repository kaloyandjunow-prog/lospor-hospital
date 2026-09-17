import { NextResponse } from "next/server"

import { isHospitalDeployment } from "@/lib/hospital/deployment"
import { purgeEhrStaging } from "@/lib/hospital/ehr-retention"
import { bearerMatchesAnySecret, configuredSecretOverlap } from "@/lib/rotating-secret"

/**
 * Delete EHR staging data past its retention window.
 *
 * Called by the delivery worker with the daily retention job, which runs
 * whether or not an EHR transport is configured: data staged before an adapter
 * was switched off still has to go. A failure answers 500, which the worker
 * reports to Status as a failed retention run.
 */

function authorized(request: Request): boolean {
  const secrets = configuredSecretOverlap(process.env.CRON_SECRET, process.env.CRON_SECRET_PREVIOUS)
  return secrets.length > 0 && bearerMatchesAnySecret(request, secrets)
}

export async function POST(request: Request) {
  if (!isHospitalDeployment() || !authorized(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  try {
    const result = await purgeEhrStaging()
    return NextResponse.json({ ok: true, ...result })
  } catch {
    // Counts only; never a path, identifier or clinical content.
    return NextResponse.json({ error: "EHR staging purge failed", code: "EHR_STAGING_PURGE_FAILED" }, { status: 500 })
  }
}

export const dynamic = "force-dynamic"
