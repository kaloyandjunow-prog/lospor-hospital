import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { corsHeaders } from "@/lib/cors"
import { CURRENT_TERMS_VERSION } from "@lospor/core/account"
import { logAuditInTransaction } from "@/lib/audit"

const CORS = (req: NextRequest) => corsHeaders(req)

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: CORS(req) })
}

export async function PATCH(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await prisma.$transaction(async tx => {
    await tx.user.update({
      where: { id: user.id },
      data: { acceptedTermsAt: new Date(), termsVersion: CURRENT_TERMS_VERSION },
    })
    await logAuditInTransaction(tx, user.id, "LEGAL_ACCEPTANCE_RECORD", user.id, {
      documentTypes: ["TERMS"],
      termsVersion: CURRENT_TERMS_VERSION,
      changedFields: ["acceptedTermsAt", "termsVersion"],
    })
  })

  return NextResponse.json({ ok: true })
}
