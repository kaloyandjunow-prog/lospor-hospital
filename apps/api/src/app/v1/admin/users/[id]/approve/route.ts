import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { requireRole } from "@/lib/access-control"
import { prisma } from "@/lib/prisma"
import { logAuditInTransaction } from "@/lib/audit"
import { corsHeaders } from "@/lib/cors"

const CORS = (req: NextRequest) => corsHeaders(req)

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: CORS(req) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!requireRole(user, ["ADMIN"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  const updated = await prisma.$transaction(async tx => {
    const approved = await tx.user.update({
      where: { id },
      data: { approvedAt: new Date() },
      select: { id: true, email: true, name: true },
    })
    await logAuditInTransaction(tx, user.id, "USER_APPROVE", id, {
      changedFields: ["approvedAt"],
    })
    return approved
  })
  return NextResponse.json(updated)
}
