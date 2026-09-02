import { NextResponse } from "next/server"

import { hospitalConfig } from "@/lib/hospital/config"
import { isHospitalDeployment } from "@/lib/hospital/deployment"
import { processDueEhrDeliveries } from "@/lib/hospital/ehr-delivery-worker"
import { bearerMatchesAnySecret, configuredSecretOverlap } from "@/lib/rotating-secret"

/**
 * What the delivery worker calls.
 *
 * The same shape as the Central delivery endpoint: there is no scheduler in the
 * appliance, so a worker container polls this and the work happens inside the
 * API. Nothing here is reachable from the clinical network.
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
  return NextResponse.json(await processDueEhrDeliveries(5))
}
