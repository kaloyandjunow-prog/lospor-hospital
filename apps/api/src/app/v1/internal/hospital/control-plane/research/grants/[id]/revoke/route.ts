import { NextResponse } from "next/server"
import {
  revokeHospitalResearchGrant,
  statusGrantRevokeSchema,
} from "@/lib/hospital/control-plane"
import {
  ACCOUNT_CONTROL_HEADERS,
  authorizeAccountControl,
  boundedJson,
  controlPlaneError,
} from "@/lib/hospital/control-plane-http"
import { prisma } from "@/lib/prisma"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    const { id } = await params
    const input = statusGrantRevokeSchema.parse(await boundedJson(request))
    await revokeHospitalResearchGrant(prisma, id, input.reason)
    return NextResponse.json({ ok: true }, { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return controlPlaneError(error)
  }
}

export const dynamic = "force-dynamic"
