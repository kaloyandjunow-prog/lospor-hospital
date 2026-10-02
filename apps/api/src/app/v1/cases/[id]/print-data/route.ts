import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { caseReadWhereForUser } from "@/lib/access-control"
import { verifyPrintTokenClaims } from "@/lib/print-token"
import { printableRecordFromSnapshot } from "@/lib/hospital/ehr-print-snapshot"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const queryToken = req.nextUrl.searchParams.get("print_token")
  const tokenClaims = queryToken
    ? await verifyPrintTokenClaims(queryToken, id)
    : null

  let where
  if (tokenClaims?.deliveryId && tokenClaims.finalizationId) {
    const delivery = await prisma.ehrDelivery.findFirst({
      where: {
        id: tokenClaims.deliveryId,
        caseId: id,
        finalizationId: tokenClaims.finalizationId,
        kind: "PROTOCOL",
        status: { in: ["SENDING", "SENT"] },
      },
      select: { finalizationId: true },
    })
    if (!delivery) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const finalization = await prisma.caseFinalization.findUnique({
      where: { id: delivery.finalizationId },
      select: { snapshotDocument: true },
    })
    if (!finalization) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const snapshot = (() => {
      try { return JSON.parse(finalization.snapshotDocument) as { institutionId?: string | null } }
      catch { return null }
    })()
    if (!snapshot) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const institution = snapshot.institutionId
      ? await prisma.institution.findUnique({
          where: { id: snapshot.institutionId },
          select: { name: true, city: true },
        })
      : null
    const record = printableRecordFromSnapshot(finalization.snapshotDocument, institution)
    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(record)
  }

  if (tokenClaims?.userId) {
    where = { id }
  } else {
    const user = await getAuthUser(req)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    where = caseReadWhereForUser(user, id)
  }

  const record = await prisma.case.findFirst({
    where,
    include: {
      preop: true,
      intraop: true,
      postop: true,
      institution: { select: { name: true, city: true } },
    },
  })
  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  return NextResponse.json(record)
}
