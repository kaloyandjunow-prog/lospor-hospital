import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { reissueHospitalActivation } from "@/lib/hospital/account-provisioning"
import {
  ACCOUNT_CONTROL_HEADERS,
  accountControlError,
  authorizeAccountControl,
  hospitalAccountAccessUrl,
} from "@/lib/hospital/account-control-http"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    const { id } = await params
    const result = await reissueHospitalActivation(prisma, id)
    return NextResponse.json({
      oneTimeLink: {
        purpose: "ACTIVATION",
        url: hospitalAccountAccessUrl(result.token),
        expiresAt: result.expiresAt.toISOString(),
      },
    }, { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    return accountControlError(error)
  }
}

export const dynamic = "force-dynamic"
