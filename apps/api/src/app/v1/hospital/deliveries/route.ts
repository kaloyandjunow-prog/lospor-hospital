import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { requireRole } from "@/lib/access-control"
import { prisma } from "@/lib/prisma"
import { isHospitalDeployment } from "@/lib/hospital/deployment"
import { processOneCentralDelivery } from "@/lib/hospital/delivery-worker"

export async function GET(request: Request) {
  const user = await getAuthUser(request)
  if (!isHospitalDeployment() || !requireRole(user, ["ADMIN", "HEAD_OF_DEPT"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
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
      errorMessage: true,
      createdAt: true,
      generatedAt: true,
      acceptedAt: true,
      _count: { select: { cases: true } },
    },
  })
  return NextResponse.json(batches)
}

export async function POST(request: Request) {
  const user = await getAuthUser(request)
  if (!isHospitalDeployment() || !requireRole(user, ["ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const processed = await processOneCentralDelivery()
  return NextResponse.json({ processed }, { status: processed ? 202 : 200 })
}

