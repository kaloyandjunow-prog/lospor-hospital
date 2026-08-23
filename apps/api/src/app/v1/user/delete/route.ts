import { NextRequest, NextResponse } from "next/server"
import { AUTH_COOKIE_NAME, getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { revokeToken } from "@/lib/token-blocklist"
import { notePasswordChanged } from "@/lib/password-epoch"
import { logAuditInTransaction } from "@/lib/audit"
import { corsHeaders } from "@/lib/cors"
import {
  APPLIANCE_OPERATOR_MANAGED_MESSAGE,
  isDesignatedApplianceOperator,
} from "@/lib/hospital/appliance-operator"
import { applianceOperatorBlocksMutation } from "@/lib/hospital/appliance-operator-guard"

const CORS = (req: NextRequest) => corsHeaders(req)

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: CORS(req) })
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (applianceOperatorBlocksMutation(
    await isDesignatedApplianceOperator(user.id),
    "SELF_DELETE",
  )) {
    return NextResponse.json(
      { error: APPLIANCE_OPERATOR_MANAGED_MESSAGE, code: "APPLIANCE_OPERATOR_MANAGED" },
      { status: 409, headers: CORS(req) },
    )
  }

  // Bumping passwordChangedAt kills every token issued before now, not just the
  // one that made this request. Without it a deleted account kept full API
  // access from any other signed-in device until its token expired (up to 8 h).
  const now = new Date()
  await prisma.$transaction(async tx => {
    await tx.user.update({
      where: { id: user.id },
      data: { deletedAt: now, passwordChangedAt: now },
    })
    await logAuditInTransaction(tx, user.id, "ACCOUNT_DELETE_REQUEST", user.id, {
      changedFields: ["deletedAt", "passwordChangedAt"],
    })
  })
  notePasswordChanged(user.id, now)  // prime this instance's cache immediately

  if (user.jti) {
    await revokeToken(user.jti, new Date(Date.now() + 8 * 60 * 60 * 1000))
  }

  // Clears the web cookie — no-op for mobile bearer token clients
  const response = NextResponse.json({ ok: true })
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
  return response
}
