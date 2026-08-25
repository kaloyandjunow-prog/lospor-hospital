import { NextResponse } from "next/server"
import { hospitalConfig } from "@/lib/hospital/config"
import {
  cleanAcceptedArtifacts,
  processAvailableCentralDeliveries,
} from "@/lib/hospital/delivery-worker"
import { isHospitalDeployment } from "@/lib/hospital/deployment"
import { bearerMatchesAnySecret, configuredSecretOverlap } from "@/lib/rotating-secret"

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
  const processed = await processAvailableCentralDeliveries(5)
  const cleaned = await cleanAcceptedArtifacts()
  return NextResponse.json({ processed, cleaned })
}
