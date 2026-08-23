import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { requireRole } from "@/lib/access-control"
import { prisma } from "@/lib/prisma"
import { isHospitalDeployment } from "@/lib/hospital/deployment"

const RESPONSE_HEADERS = { "cache-control": "private, no-store, max-age=0" }

export async function GET(request: Request) {
  const user = await getAuthUser(request)
  // Batch history is appliance-wide infrastructure state. HOD authority is
  // intentionally per case and institution; it does not reveal global queue
  // history or transport outcomes.
  if (!isHospitalDeployment() || !requireRole(user, ["ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, {
      status: 403,
      headers: RESPONSE_HEADERS,
    })
  }
  const batches = await prisma.centralDeliveryBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
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
  })
  return NextResponse.json(batches, { headers: RESPONSE_HEADERS })
}

/**
 * Delivery remains push-only and worker-driven. A clinical ADMIN session must
 * not become an unaudited infrastructure trigger; Status exposes the bounded,
 * reauthenticated retry operation for an already recorded failed batch.
 */
export async function POST(_request: Request) {
  return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, {
    status: 404,
    headers: { "cache-control": "private, no-store, max-age=0" },
  })
}

export const dynamic = "force-dynamic"
