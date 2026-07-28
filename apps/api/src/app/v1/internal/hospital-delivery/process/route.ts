import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { hospitalConfig } from "@/lib/hospital/config"
import {
  cleanAcceptedArtifacts,
  processAvailableCentralDeliveries,
} from "@/lib/hospital/delivery-worker"
import { isHospitalDeployment } from "@/lib/hospital/deployment"

function authorized(request: Request): boolean {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const expected = hospitalConfig().HOSPITAL_WORKER_TOKEN
  if (!supplied || supplied.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
}

export async function POST(request: Request) {
  if (!isHospitalDeployment() || !authorized(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const processed = await processAvailableCentralDeliveries(5)
  const cleaned = await cleanAcceptedArtifacts()
  return NextResponse.json({ processed, cleaned })
}

