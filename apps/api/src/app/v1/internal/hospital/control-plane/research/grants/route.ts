import { NextResponse } from "next/server"
import {
  issueHospitalResearchGrant,
  statusResearchGrantSchema,
} from "@/lib/hospital/control-plane"
import { prisma } from "@/lib/prisma"
import {
  ACCOUNT_CONTROL_HEADERS,
  authorizeAccountControl,
  boundedJson,
  controlPlaneError,
} from "@/lib/hospital/control-plane-http"

export async function POST(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    const input = statusResearchGrantSchema.parse(await boundedJson(request))
    const grant = await issueHospitalResearchGrant(prisma, input)
    return NextResponse.json({ id: grant.id, expiresAt: grant.expiresAt }, {
      status: 201,
      headers: ACCOUNT_CONTROL_HEADERS,
    })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
