import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { HospitalAccountError } from "@/lib/hospital/account-provisioning"
import { hospitalUsernameRenameSchema, renameHospitalUsername } from "@/lib/hospital/account-authority"
import {
  ACCOUNT_CONTROL_HEADERS,
  accountControlError,
  authorizeAccountControl,
  boundedJson,
  hospitalAccountAccessUrl,
} from "@/lib/hospital/account-control-http"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    const { id } = await params
    const input = hospitalUsernameRenameSchema.parse(await boundedJson(request))
    const result = await renameHospitalUsername(prisma, id, input)
    return NextResponse.json({
      account: result.account,
      oneTimeLink: {
        purpose: "RECOVERY",
        url: hospitalAccountAccessUrl(result.token),
        expiresAt: result.expiresAt.toISOString(),
      },
    }, { headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    if (error instanceof z.ZodError) return accountControlError(new HospitalAccountError("INVALID_REQUEST"))
    return accountControlError(error)
  }
}

export const dynamic = "force-dynamic"
