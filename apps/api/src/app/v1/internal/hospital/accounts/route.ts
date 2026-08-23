import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import {
  createHospitalAccount,
  HospitalAccountError,
  hospitalAccountCreateSchema,
  listHospitalAccounts,
} from "@/lib/hospital/account-provisioning"
import {
  ACCOUNT_CONTROL_HEADERS,
  accountControlError,
  authorizeAccountControl,
  boundedJson,
  hospitalAccountAccessUrl,
} from "@/lib/hospital/account-control-http"

export async function GET(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    return NextResponse.json(await listHospitalAccounts(prisma), {
      headers: ACCOUNT_CONTROL_HEADERS,
    })
  } catch (error) {
    return accountControlError(error)
  }
}

export async function POST(request: Request) {
  const denied = await authorizeAccountControl(request)
  if (denied) return denied
  try {
    const input = hospitalAccountCreateSchema.parse(await boundedJson(request))
    const created = await createHospitalAccount(prisma, input)
    return NextResponse.json({
      account: {
        id: created.user.id,
        username: created.user.username,
        email: created.user.email,
        name: created.user.name,
        role: created.user.role,
        accountKind: created.user.accountKind,
        institutionId: created.user.institutionId,
        institutionName: created.institution.name,
      },
      oneTimeLink: {
        purpose: "ACTIVATION",
        url: hospitalAccountAccessUrl(created.token),
        expiresAt: created.expiresAt.toISOString(),
      },
    }, { status: 201, headers: ACCOUNT_CONTROL_HEADERS })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return accountControlError(new HospitalAccountError("INVALID_REQUEST"))
    }
    return accountControlError(error)
  }
}

export const dynamic = "force-dynamic"
